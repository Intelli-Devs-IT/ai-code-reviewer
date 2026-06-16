"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const llm_huggingface_1 = require("./llm.huggingface");
const load_config_1 = require("./load-config");
const extractScopedPatch_1 = require("./helpers/extractScopedPatch");
const util_helpers_1 = require("./helpers/util.helpers");
const riskLabels_1 = require("./helpers/riskLabels");
const ast_function_extractor_1 = require("./utils/ast-function-extractor");
const functionReviewTargets_1 = require("./helpers/functionReviewTargets");
const reviewOutput_1 = require("./helpers/reviewOutput");
const summaryComment_1 = require("./helpers/summaryComment");
/* =======================
   Helpers: file filtering
   ======================= */
function isCodeFile(filename) {
    return (filename.endsWith(".ts") ||
        filename.endsWith(".js") ||
        filename.endsWith(".tsx") ||
        filename.endsWith(".jsx"));
}
function isTestFile(filename) {
    return filename.includes(".spec.") || filename.includes(".test.");
}
function shouldIgnoreFile(filename) {
    const ignoredPaths = ["node_modules/", "dist/", "build/"];
    const ignoredFiles = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];
    return (ignoredPaths.some((p) => filename.startsWith(p)) ||
        ignoredFiles.includes(filename));
}
/* =======================
   Helpers: score review confidence
   ======================= */
function scoreReviewConfidence(review) {
    let score = 0;
    const length = review.length;
    const lines = review.split("\n");
    // 1️⃣ Length signal
    if (length > 400)
        score += 25;
    else if (length > 200)
        score += 15;
    else if (length > 100)
        score += 5;
    // 2️⃣ Structure signal
    const bulletLines = lines.filter((l) => l.trim().startsWith("-") || l.trim().startsWith("•"));
    if (bulletLines.length >= 3)
        score += 20;
    else if (bulletLines.length >= 1)
        score += 10;
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
    const actionHits = actionWords.filter((w) => review.toLowerCase().includes(w)).length;
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
    const codeHits = codeTerms.filter((w) => review.toLowerCase().includes(w)).length;
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
    const hedgeHits = hedging.filter((w) => review.toLowerCase().includes(w)).length;
    score -= hedgeHits * 10;
    return Math.max(0, Math.min(100, score));
}
function determineRiskLevel(confidenceScores, reviews) {
    if (confidenceScores.length === 0)
        return "low";
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
    const hasRedFlags = reviews.some((text) => redFlags.some((flag) => text.includes(flag)));
    if (maxConfidence >= 70 && hasRedFlags)
        return "high";
    if (maxConfidence >= 55)
        return "medium";
    return "low";
}
/* =======================
   Helpers: diff parsing
   ======================= */
function extractLineNumbersFromPatch(patch, maxCommentsPerFile = 3) {
    const lines = patch.split("\n");
    const commentLines = [];
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
        if (!inHunk)
            continue;
        // Increment line counter for new file
        if (!line.startsWith("-")) {
            newLineNumber++;
        }
        // Added code line (ignore empty / import-only lines)
        if (line.startsWith("+") &&
            !line.startsWith("+++") &&
            line.trim().length > 2 &&
            !line.includes("import ")) {
            commentLines.push(newLineNumber);
        }
    }
    // De-duplicate & limit
    return Array.from(new Set(commentLines)).slice(0, maxCommentsPerFile);
}
/* =======================
   Helpers: ensure label exists
   ======================= */
async function ensureLabel(octokit, owner, repo, name, color, description) {
    try {
        await octokit.rest.issues.getLabel({
            owner,
            repo,
            name,
        });
    }
    catch {
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
async function getExistingInlineComments(octokit, owner, repo, pullNumber) {
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
async function getExistingSummaryComment(octokit, owner, repo, issueNumber) {
    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
        owner,
        repo,
        issue_number: issueNumber,
        per_page: 100,
    });
    return comments.find((c) => c.body?.includes(summaryComment_1.SUMMARY_MARKER));
}
async function upsertSummaryComment(octokit, owner, repo, issueNumber, body) {
    const existingSummary = await getExistingSummaryComment(octokit, owner, repo, issueNumber);
    if (existingSummary) {
        await octokit.rest.issues.updateComment({
            owner,
            repo,
            comment_id: existingSummary.id,
            body,
        });
        core.info("Updated AI review summary comment");
    }
    else {
        await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body,
        });
        core.info("Created AI review summary comment");
    }
}
async function getFileSourceFromRef(octokit, owner, repo, path, ref) {
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
    }
    catch (error) {
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
        if (!token)
            throw new Error("GITHUB_TOKEN is missing");
        const octokit = github.getOctokit(token);
        /* =======================
           Load configuration
           ======================= */
        const config = await (0, load_config_1.loadConfig)(octokit, owner, repo, pr.head.ref);
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
        const llm = hfKey ? new llm_huggingface_1.HuggingFaceLLM(hfKey) : null;
        if (!llm) {
            core.warning("HF_API_KEY not set. AI reviews disabled.");
            return;
        }
        /* =======================
           Fetch existing inline comments
           ======================= */
        const existingInlineComments = await getExistingInlineComments(octokit, owner, repo, pr.number);
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
            .filter((file) => (0, load_config_1.fileMatchesConfig)(file.filename, config))
            .slice(0, config.max_files);
        core.info(`Reviewing ${codeFiles.length} code files`);
        const reviewedFunctionKeys = new Set();
        const reviewedScopedLines = new Set();
        const reviewedFilePaths = new Set();
        const summaryFindings = [];
        let latestSummaryConfidence = 0;
        let latestSummaryRisk = "low";
        /* =======================
           Review each file
           ======================= */
        for (const file of codeFiles) {
            const lines = extractLineNumbersFromPatch(file.patch);
            if (lines.length === 0)
                continue;
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
            let review = null;
            const confidenceScores = [];
            const combinedReviewText = [];
            try {
                const rawReview = await llm.reviewDiff(prompt);
                review = (0, reviewOutput_1.cleanModelOutput)(rawReview);
            }
            catch {
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
            summaryFindings.push((0, summaryComment_1.formatSummaryFinding)(file.filename, review));
            const labelMap = {
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
            await ensureLabel(octokit, owner, repo, selected.name, selected.color, selected.description);
            const riskLabels = Object.values(labelMap).map((label) => label.name);
            await (0, riskLabels_1.applyRiskLabel)(octokit, owner, repo, pr.number, selected.name, riskLabels, core);
            core.info(`Applied risk label: ${selected.name}`);
            /* =======================
               Post inline comments
               ======================= */
            for (const file of codeFiles) {
                if (!file.patch)
                    continue;
                const changedLines = (0, util_helpers_1.getChangedLines)(file.patch);
                if (changedLines.length === 0)
                    continue;
                const sourceCode = await getFileSourceFromRef(octokit, owner, repo, file.filename, commitSha);
                if (sourceCode === null) {
                    continue;
                }
                const extractedFunctions = (0, ast_function_extractor_1.extractFunctionsFromSource)(sourceCode, file.filename);
                const functionTargets = (0, functionReviewTargets_1.getFunctionReviewTargets)(file.filename, extractedFunctions, changedLines, reviewedFunctionKeys);
                if (!(0, functionReviewTargets_1.shouldUseScopedReviewFallback)(extractedFunctions)) {
                    for (const target of functionTargets) {
                        reviewedFilePaths.add(file.filename);
                        core.debug(`Posting inline comment for ${file.filename} at line ${target.commentLine}`);
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
                            const cleaned = (0, reviewOutput_1.prepareReviewForScoring)(raw);
                            if (!cleaned) {
                                continue;
                            }
                            const confidence = scoreReviewConfidence(cleaned);
                            if (confidence < 20) {
                                core.info(`Skipping low-confidence review for ${file.filename}:${target.commentLine}`);
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
                            core.info(`Posted inline comment for ${file.filename}:${target.commentLine}`);
                        }
                        catch (error) {
                            core.warning(`Failed to post inline comment for ${file.filename}: ${error}`);
                        }
                    }
                    continue;
                }
                // Pick the first changed line to comment on
                const targetLine = changedLines[0];
                // Skip if already reviewed
                const scopedReviewKey = `${file.filename}:${targetLine}`;
                if (reviewedScopedLines.has(scopedReviewKey))
                    continue;
                reviewedScopedLines.add(scopedReviewKey);
                core.debug(`Posting inline comment for ${file.filename} at line ${targetLine}`);
                const scopedPatch = (0, extractScopedPatch_1.extractScopedPatch)(file.patch, targetLine);
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
                    const cleaned = (0, reviewOutput_1.prepareReviewForScoring)(raw);
                    if (!cleaned) {
                        continue;
                    }
                    const confidence = scoreReviewConfidence(cleaned);
                    if (confidence < 20) {
                        core.info(`Skipping low-confidence review for ${file.filename}:${targetLine}`);
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
                }
                catch (error) {
                    core.warning(`Failed to post inline comment for ${file.filename}: ${error}`);
                }
            }
            const prLabels = pr.labels?.map((l) => l.name) ?? [];
            const hasOverride = prLabels.includes(OVERRIDE_LABEL);
            if (risk === "high" && !hasOverride) {
                if (summaryFindings.length > 0) {
                    await upsertSummaryComment(octokit, owner, repo, pr.number, (0, summaryComment_1.buildSummaryBody)({
                        confidence: latestSummaryConfidence,
                        risk: latestSummaryRisk,
                        reviewedFilePaths,
                        summaryFindings,
                    }));
                }
                core.setFailed("🚨 AI review detected HIGH-RISK issues. Add 'ai-review: override' to bypass.");
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
        await upsertSummaryComment(octokit, owner, repo, pr.number, (0, summaryComment_1.buildSummaryBody)({
            confidence: latestSummaryConfidence,
            risk: latestSummaryRisk,
            reviewedFilePaths,
            summaryFindings,
        }));
    }
    catch (error) {
        core.setFailed(error.message);
    }
}
run();
