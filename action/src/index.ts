import * as core from "@actions/core";
import * as github from "@actions/github";
import { HuggingFaceLLM } from "./llm.huggingface";
import { loadConfig, fileMatchesConfig } from "./load-config";
import { findFunctionStartLine } from "./helpers/findFunctionStartLine";

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
   Helpers: clean model output
   ======================= */

function cleanModelOutput(text: string): string {
  if (!text) return text;

  // Remove <think>...</think> blocks (DeepSeek / reasoning models)
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s+|\s+$/g, "")
    .trim();
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
const SUMMARY_MARKER = "<!-- ai-code-reviewer-FB:summary -->";

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
      const summaryFindings: string[] = [];
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

      core.info(`Confidence score for ${file.filename}: ${confidence}`);

      // if (confidence < MIN_CONFIDENCE_SCORE) {
      //   core.info(`Skipping low-confidence review for ${file.filename}`);
      //   continue;
      // }

      summaryFindings.push(`### ${file.filename}\n${review}`);

      /* =======================
         Post summary comment
         ======================= */

      if (summaryFindings.length === 0) {
        core.info("No summary findings to post");
        return;
      }

      const summaryBody = `
${SUMMARY_MARKER}
🤖 **AI Code Review Summary**
_Confidence: ${confidence}/100_
${risk === "high" ? "**🚨 HIGH RISK ISSUES DETECTED 🚨**" : ""}

**Files reviewed:** ${summaryFindings.length}

${summaryFindings.join("\n\n")}
`;

      const existingSummary = await getExistingSummaryComment(
        octokit,
        owner,
        repo,
        pr.number
      );

      if (existingSummary) {
        await octokit.rest.issues.updateComment({
          owner,
          repo,
          comment_id: existingSummary.id,
          body: summaryBody,
        });

        core.info("Updated AI review summary comment");
      } else {
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: pr.number,
          body: summaryBody,
        });

        core.info("Created AI review summary comment");
      }

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

      // // Remove old AI labels
      // await octokit.rest.issues.removeAllLabels({
      //   owner,
      //   repo,
      //   issue_number: pr.number,
      // });
      const existingLabels: string[] = pr.labels?.map((l: any) => l.name) ?? [];

      const aiLabels: string[] = existingLabels.filter((l) =>
        l.startsWith("ai-review:")
      );

      if (aiLabels.length > 0) {
        await Promise.all(
          aiLabels.map(async (label) => {
            await octokit.rest.issues.removeLabel({
              owner,
              repo,
              issue_number: pr.number,
              name: label,
            });
          })
        );
      }

      // Add new label
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pr.number,
        labels: [selected.name],
      });

      core.info(`Applied risk label: ${selected.name}`);

      /* =======================
         Post inline comments
         ======================= */

      for (const line of lines) {
        const anchorLine = findFunctionStartLine(file.patch!, line);
        const scopedPatch = extractScopedPatch(file.patch!, anchorLine);
        const prompt = `
You are an expert code reviewer.

Review ONLY the change below.
If you suggest a change, include ONE GitHub suggestion block.
Rules:
- Include at most ONE **suggestion** block.
- If multiple issues exist, suggest the most impactful one.
- Do NOT explain inside the suggestion block.
- Explanations go outside the block.
- If no change is needed, say "No change required".

File: ${file.filename}
Anchor line: ${anchorLine}

Diff:
${scopedPatch}
`;

        const raw = await llm.reviewDiff(prompt);
        const review = cleanModelOutput(raw!);
        if (!anchorLine) {
          core.info(
            `Could not determine anchor line for ${file.filename}:${line}`
          );
          continue;
        }
        const marker = `<!-- ai-code-reviewer:file=${file.filename}:line=${anchorLine} -->`;
        const alreadyExists = existingInlineComments.some((comment: any) =>
          comment.body?.includes(marker)
        );

        if (alreadyExists) {
          core.info(
            `Skipping duplicate inline comment for ${file.filename}:${anchorLine}`
          );
          continue;
        }

        await octokit.rest.pulls.createReviewComment({
          owner,
          repo,
          pull_number: pr.number,
          commit_id: commitSha,
          path: file.filename,
          line: anchorLine,
          side: "RIGHT",
          body: `
${marker}
🤖 **AI Suggestion**
_Confidence: ${confidence}/100_

${review}
`,
        });

        core.info(`Posted inline review for ${file.filename} at line ${line}`);
      }

      const prLabels = pr.labels?.map((l: any) => l.name) ?? [];
      const hasOverride = prLabels.includes(OVERRIDE_LABEL);

      if (risk === "high" && !hasOverride) {
        core.setFailed(
          "🚨 AI review detected HIGH-RISK issues. Add 'ai-review: override' to bypass."
        );
        return;
      }

      if (risk === "high" && hasOverride) {
        core.warning("⚠️ High-risk PR overridden by maintainer label.");
      }
    }
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

run();
