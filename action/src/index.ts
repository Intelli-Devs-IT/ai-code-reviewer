import * as core from "@actions/core";
import * as github from "@actions/github";
import { HuggingFaceLLM } from "./llm.huggingface";
import { loadConfig, fileMatchesConfig } from "./load-config";
import { findFunctionStartLine } from "./helpers/findFunctionStartLine";
import { extractScopedPatch } from "./helpers/extractScopedPatch";
import { getChangedLines } from "./helpers/util.helpers";
import { applyRiskLabel } from "./helpers/riskLabels";
import { extractFunctionsFromSource } from "./utils/ast-function-extractor";
import {
  getFunctionReviewTargets,
  shouldUseScopedReviewFallback,
} from "./helpers/functionReviewTargets";
import {
  cleanModelOutput,
  prepareReviewForScoring,
} from "./helpers/reviewOutput";
import {
  buildSummaryBody,
  formatSummaryFinding,
  SUMMARY_MARKER,
} from "./helpers/summaryComment";

/* =======================
   Helpers: file filtering
   ======================= */

function isCodeFile(filename: string): boolean {
  return (
    filename.endsWith(".ts") ||
    filename.endsWith(".js") ||
    filename.endsWith(".tsx") ||
    filename.endsWith(".jsx")
  );
}

function isTestFile(filename: string): boolean {
  return filename.includes(".spec.") || filename.includes(".test.");
}

function shouldIgnoreFile(filename: string): boolean {
  const ignoredPaths = ["node_modules/", "dist/", "build/"];
  const ignoredFiles = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];

  return (
    ignoredPaths.some((p) => filename.startsWith(p)) ||
    ignoredFiles.includes(filename)
  );
}

/* =======================
   Helpers: score review confidence
   ======================= */
function scoreReviewConfidence(review: string): number {
  let score = 0;

  const length = review.length;
  const lines = review.split("\n");

  // 1️⃣ Length signal
  if (length > 400) score += 25;
  else if (length > 200) score += 15;
  else if (length > 100) score += 5;

  // 2️⃣ Structure signal
  const bulletLines = lines.filter(
    (l) => l.trim().startsWith("-") || l.trim().startsWith("•")
  );
  if (bulletLines.length >= 3) score += 20;
  else if (bulletLines.length >= 1) score += 10;

  // 3️⃣ Action verbs
  const actionWords = [
    "extract",
    "rename",
    "remove",
    "avoid",
    "add",
    "validate",
    "handle",
    "simplify",
    "refactor",
    "guard",
    "cache",
    "memoize",
    "split",
  ];

  const actionHits = actionWords.filter((w) =>
    review.toLowerCase().includes(w)
  ).length;

  score += Math.min(actionHits * 5, 20);

  // 4️⃣ Specificity (code-related terms)
  const codeTerms = [
    "function",
    "variable",
    "method",
    "loop",
    "async",
    "promise",
    "null",
    "undefined",
    "type",
    "interface",
    "error",
  ];

  const codeHits = codeTerms.filter((w) =>
    review.toLowerCase().includes(w)
  ).length;

  score += Math.min(codeHits * 3, 15);

  // 5️⃣ Penalize hedging
  const hedging = [
    "might",
    "maybe",
    "possibly",
    "unclear",
    "not sure",
    "hard to tell",
  ];

  const hedgeHits = hedging.filter((w) =>
    review.toLowerCase().includes(w)
  ).length;

  score -= hedgeHits * 10;

  return Math.max(0, Math.min(100, score));
}

/* =======================
   Helpers: determine risk level
   ======================= */
type RiskLevel = "low" | "medium" | "high";

function determineRiskLevel(
  confidenceScores: number[],
  reviews: string[]
): RiskLevel {
  if (confidenceScores.length === 0) return "low";

  const maxConfidence = Math.max(...confidenceScores);

  const redFlags = [
    "security",
    "race condition",
    "leak",
    "authentication",
    "authorization",
    "sql",
    "injection",
    "token",
    "crypto",
  ];

  const hasRedFlags = reviews.some((text) =>
    redFlags.some((flag) => text.includes(flag))
  );

  if (maxConfidence >= 70 && hasRedFlags) return "high";
  if (maxConfidence >= 55) return "medium";
  return "low";
}

/* =======================
   Helpers: diff parsing
   ======================= */

function extractLineNumbersFromPatch(
  patch: string,
  maxCommentsPerFile = 3
): number[] {
  const lines = patch.split("\n");
  const commentLines: number[] = [];

  let newLineNumber = 0;
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      const match = line.match(/\+(\d+)/);
      if (match) {
        newLineNumber = parseInt(match[1], 10) - 1;
        inHunk = true;
      }
      continue;
    }

    if (!inHunk) continue;

    // Increment line counter for new file
    if (!line.startsWith("-")) {
      newLineNumber++;
    }

    // Added code line (ignore empty / import-only lines)
    if (
      line.startsWith("+") &&
      !line.startsWith("+++") &&
      line.trim().length > 2 &&
      !line.includes("import ")
    ) {
      commentLines.push(newLineNumber);
    }
  }

  // De-duplicate & limit
  return Array.from(new Set(commentLines)).slice(0, maxCommentsPerFile);
}

/* =======================
   Helpers: ensure label exists
   ======================= */

async function ensureLabel(
  octokit: any,
  owner: string,
  repo: string,
  name: string,
  color: string,
  description: string
) {
  try {
    await octokit.rest.issues.getLabel({
      owner,
      repo,
      name,
    });
  } catch {
    await octokit.rest.issues.createLabel({
      owner,
      repo,
      name,
      color,
      description,
    });
  }
}

/* =======================
   Helpers: fetch existing inline comments
   ======================= */
async function getExistingInlineComments(
  octokit: any,
  owner: string,
  repo: string,
  pullNumber: number
) {
  return await octokit.paginate(octokit.rest.pulls.listReviewComments, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });
}

/* =======================
   Helpers: fetch existing summary comment
   ======================= */
async function getExistingSummaryComment(
  octokit: any,
  owner: string,
  repo: string,
  issueNumber: number
) {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  return comments.find((c: any) => c.body?.includes(SUMMARY_MARKER));
}

async function upsertSummaryComment(
  octokit: any,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<void> {
  const existingSummary = await getExistingSummaryComment(
    octokit,
    owner,
    repo,
    issueNumber
  );

  if (existingSummary) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existingSummary.id,
      body,
    });

    core.info("Updated AI review summary comment");
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });

    core.info("Created AI review summary comment");
  }
}

async function getFileSourceFromRef(
  octokit: any,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if (Array.isArray(data) || !("content" in data)) {
      return null;
    }

    if (data.encoding !== "base64") {
      return null;
    }

    return Buffer.from(data.content, "base64").toString("utf8");
  } catch (error) {
    core.warning(`Failed to fetch full source for ${path}: ${error}`);
    return null;
  }
}

/* =======================
   Main Action
   ======================= */

async function run() {
  try {
    const context = github.context;

    if (!context.payload.pull_request) {
      core.info("Not a pull request event. Skipping.");
      return;
    }

    const pr = context.payload.pull_request;
    const { owner, repo } = context.repo;
    const commitSha = pr.head.sha;

    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN is missing");

    const octokit = github.getOctokit(token);

    /* =======================
       Load configuration
       ======================= */
    const config = await loadConfig(octokit, owner, repo, pr.head.ref);
    const MIN_CONFIDENCE_SCORE = config.min_confidence || 45;
    const OVERRIDE_LABEL = "ai-review: override";

    if (!config.enabled) {
      core.info("AI reviewer disabled via config");
      return;
    }
    /* =======================
       Init LLM (optional)
       ======================= */

    const hfKey = process.env.HF_API_KEY;
    const llm = hfKey ? new HuggingFaceLLM(hfKey) : null;

    if (!llm) {
      core.warning("HF_API_KEY not set. AI reviews disabled.");
      return;
    }

    /* =======================
       Fetch existing inline comments
       ======================= */

    const existingInlineComments = await getExistingInlineComments(
      octokit,
      owner,
      repo,
      pr.number
    );

    /* =======================
       Fetch PR files
       ======================= */

    const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: pr.number,
      per_page: 100,
    });

    // const codeFiles = files.filter((file) => {
    //   if (!file.patch) return false;
    //   if (!isCodeFile(file.filename)) return false;
    //   if (isTestFile(file.filename)) return false;
    //   if (shouldIgnoreFile(file.filename)) return false;
    //   return true;
    // });

    const codeFiles = files
      .filter((file) => file.patch)
      .filter((file) => fileMatchesConfig(file.filename, config))
      .slice(0, config.max_files);

    core.info(`Reviewing ${codeFiles.length} code files`);
    const reviewedFunctionKeys = new Set<string>();
    const reviewedScopedLines = new Set<string>();
    const reviewedFilePaths = new Set<string>();
    const summaryFindings: string[] = [];
    let latestSummaryConfidence = 0;
    let latestSummaryRisk: RiskLevel = "low";

    /* =======================
       Review each file
       ======================= */

    for (const file of codeFiles) {
      const lines = extractLineNumbersFromPatch(file.patch!);
      if (lines.length === 0) continue;

      const prompt = `
You are an expert code reviewer.

Rules:
- When suggesting a code change, ALWAYS include a GitHub suggestion block.
- Suggestions must be directly copyable.
- Do NOT explain inside the suggestion block.
- Explanations go outside the block.
- If no change is needed, say "No change required".

Format:
- Short explanation (1–2 lines)
- GitHub suggestion block

Review this diff carefully and suggest improvements.

File: ${file.filename}

Diff:
${file.patch}
`;

      let review: string | null = null;
      const confidenceScores: number[] = [];
      const combinedReviewText: string[] = [];

      try {
        const rawReview = await llm.reviewDiff(prompt);
        review = cleanModelOutput(rawReview!);
      } catch {
        core.warning(`AI review failed for ${file.filename}`);
        continue;
      }

      const confidence = scoreReviewConfidence(review);
      confidenceScores.push(confidence);
      combinedReviewText.push(review.toLowerCase());
      const risk = determineRiskLevel(confidenceScores, combinedReviewText);
      latestSummaryConfidence = confidence;
      latestSummaryRisk = risk;

      core.info(`Confidence score for ${file.filename}: ${confidence}`);

      // if (confidence < MIN_CONFIDENCE_SCORE) {
      //   core.info(`Skipping low-confidence review for ${file.filename}`);
      //   continue;
      // }

      summaryFindings.push(formatSummaryFinding(file.filename, review));

      /* =======================
          Determine risk level
         ======================= */
      interface LabelConfig {
        name: string;
        color: string;
        description: string;
      }

      const labelMap: Record<RiskLevel, LabelConfig> = {
        low: {
          name: "ai-review: low-risk",
          color: "2da44e",
          description: "AI review found no significant risks",
        },
        medium: {
          name: "ai-review: medium-risk",
          color: "d29922",
          description: "AI review found potential issues worth checking",
        },
        high: {
          name: "ai-review: high-risk",
          color: "cf222e",
          description: "AI review found high-risk or security-related concerns",
        },
      };

      const selected = labelMap[risk];

      // Ensure label exists

      await ensureLabel(
        octokit,
        owner,
        repo,
        selected.name,
        selected.color,
        selected.description
      );

      const riskLabels = Object.values(labelMap).map((label) => label.name);

      await applyRiskLabel(
        octokit,
        owner,
        repo,
        pr.number,
        selected.name,
        riskLabels,
        core
      );

      core.info(`Applied risk label: ${selected.name}`);

      /* =======================
         Post inline comments
         ======================= */
      for (const file of codeFiles) {
        if (!file.patch) continue;

        const changedLines = getChangedLines(file.patch);
        if (changedLines.length === 0) continue;

        const sourceCode = await getFileSourceFromRef(
          octokit,
          owner,
          repo,
          file.filename,
          commitSha
        );

        if (sourceCode === null) {
          continue;
        }

        const extractedFunctions = extractFunctionsFromSource(
          sourceCode,
          file.filename
        );
        const functionTargets = getFunctionReviewTargets(
          file.filename,
          extractedFunctions,
          changedLines,
          reviewedFunctionKeys
        );

        if (!shouldUseScopedReviewFallback(extractedFunctions)) {
          for (const target of functionTargets) {
            reviewedFilePaths.add(file.filename);

            core.debug(
              `Posting inline comment for ${file.filename} at line ${target.commentLine}`
            );

            const prompt = `
You are a senior code reviewer.

Review ONLY the changed function below.

Rules:
- Focus only on meaningful issues: real bugs, security vulnerabilities, authentication or authorization mistakes, unsafe data handling, null or undefined edge cases, broken async behavior, incorrect error handling, race conditions, data loss risks, incorrect business logic, or serious maintainability issues that can cause bugs.
- Avoid comments about formatting, naming preference, minor style choices, harmless refactoring, subjective readability, missing comments, or generic "add tests" advice unless a specific bug risk exists.
- Do not review unchanged code, unrelated code, or code outside this function.
- If there is no meaningful issue, return exactly: NO_REVIEW
- Do not include more than one issue.
- Pick only the most impactful issue.
- Keep the explanation short.
- Include a GitHub suggestion block only when the exact replacement code is obvious and safe.
- Do not include a suggestion block for vague advice.
- Do not include a suggestion block if the fix requires changing code outside the reviewed function.
- Do not include multiple suggestion blocks.
- Do not mention being an AI.
- Do not include chain-of-thought.
- Do not output <think> sections.

Use this output format for valid reviews:

ISSUE:
Short explanation of the problem.

IMPACT:
Short explanation of why it matters.

SUGGESTION:
Optional GitHub suggestion block only if safe and exact.

Changed function:

\`\`\`ts
${target.fn.text}
\`\`\`

Relevant patch:

\`\`\`diff
${file.patch}
\`\`\`
`;

            try {
              const raw = await llm.reviewDiff(prompt);
              const cleaned = prepareReviewForScoring(raw!);

              if (!cleaned) {
                continue;
              }

              const confidence = scoreReviewConfidence(cleaned);
              if (confidence < 20) {
                core.info(
                  `Skipping low-confidence review for ${file.filename}:${target.commentLine}`
                );
                continue;
              }

              await octokit.rest.pulls.createReviewComment({
                owner,
                repo,
                pull_number: pr.number,
                commit_id: commitSha,
                path: file.filename,
                side: "RIGHT",
                line: target.commentLine,
                body: `🤖 **AI Suggestion** (Confidence: ${confidence}/100)\n\n${cleaned}`,
              });

              core.info(
                `Posted inline comment for ${file.filename}:${target.commentLine}`
              );
            } catch (error) {
              core.warning(
                `Failed to post inline comment for ${file.filename}: ${error}`
              );
            }
          }

          continue;
        }

        // Pick the first changed line to comment on
        const targetLine = changedLines[0];

        // Skip if already reviewed
        const scopedReviewKey = `${file.filename}:${targetLine}`;
        if (reviewedScopedLines.has(scopedReviewKey)) continue;
        reviewedScopedLines.add(scopedReviewKey);

        core.debug(
          `Posting inline comment for ${file.filename} at line ${targetLine}`
        );

        const scopedPatch = extractScopedPatch(file.patch, targetLine);
        core.debug(`Scoped Patch:\n${scopedPatch}`);
        reviewedFilePaths.add(file.filename);

        const prompt = `
You are a senior code reviewer.

Rules:
- Focus only on meaningful issues: real bugs, security vulnerabilities, authentication or authorization mistakes, unsafe data handling, null or undefined edge cases, broken async behavior, incorrect error handling, race conditions, data loss risks, incorrect business logic, or serious maintainability issues that can cause bugs.
- Avoid comments about formatting, naming preference, minor style choices, harmless refactoring, subjective readability, missing comments, or generic "add tests" advice unless a specific bug risk exists.
- Do not review unchanged code, unrelated code, or code outside this scoped diff.
- If there is no meaningful issue, return exactly: NO_REVIEW
- Do not include more than one issue.
- Pick only the most impactful issue.
- Keep the explanation short.
- Include a GitHub suggestion block only when the exact replacement code is obvious and safe.
- Do not include a suggestion block for vague advice.
- Do not include a suggestion block if the fix requires changing code outside the reviewed scope.
- Do not include multiple suggestion blocks.
- Do not mention being an AI.
- Do not include chain-of-thought.
- Do not output <think> sections.

Use this output format for valid reviews:

ISSUE:
Short explanation of the problem.

IMPACT:
Short explanation of why it matters.

SUGGESTION:
Optional GitHub suggestion block only if safe and exact.

Review ONLY the code below carefully and suggest improvements.

File: ${file.filename}
Review starting at line: ${targetLine}

Diff:
${scopedPatch}
`;

        try {
          const raw = await llm.reviewDiff(prompt);
          const cleaned = prepareReviewForScoring(raw!);

          if (!cleaned) {
            continue;
          }

          const confidence = scoreReviewConfidence(cleaned);
          if (confidence < 20) {
            core.info(
              `Skipping low-confidence review for ${file.filename}:${targetLine}`
            );
            continue;
          }

          await octokit.rest.pulls.createReviewComment({
            owner,
            repo,
            pull_number: pr.number,
            commit_id: commitSha,
            path: file.filename,
            side: "RIGHT",
            line: targetLine,
            body: `🤖 **AI Suggestion** (Confidence: ${confidence}/100)\n\n${cleaned}`,
          });

          core.info(`Posted inline comment for ${file.filename}:${targetLine}`);
        } catch (error) {
          core.warning(
            `Failed to post inline comment for ${file.filename}: ${error}`
          );
        }
      }

      const prLabels = pr.labels?.map((l: any) => l.name) ?? [];
      const hasOverride = prLabels.includes(OVERRIDE_LABEL);

      if (risk === "high" && !hasOverride) {
        if (summaryFindings.length > 0) {
          await upsertSummaryComment(
            octokit,
            owner,
            repo,
            pr.number,
            buildSummaryBody({
              confidence: latestSummaryConfidence,
              risk: latestSummaryRisk,
              reviewedFilePaths,
              summaryFindings,
            })
          );
        }

        core.setFailed(
          "🚨 AI review detected HIGH-RISK issues. Add 'ai-review: override' to bypass."
        );
        return;
      }

      if (risk === "high" && hasOverride) {
        core.warning("⚠️ High-risk PR overridden by maintainer label.");
      }
    }

    if (summaryFindings.length === 0) {
      core.info("No summary findings to post");
      return;
    }

    await upsertSummaryComment(
      octokit,
      owner,
      repo,
      pr.number,
      buildSummaryBody({
        confidence: latestSummaryConfidence,
        risk: latestSummaryRisk,
        reviewedFilePaths,
        summaryFindings,
      })
    );
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

run();
