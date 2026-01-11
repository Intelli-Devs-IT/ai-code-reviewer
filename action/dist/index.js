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
   Helpers: clean model output
   ======================= */
function cleanModelOutput(text) {
    if (!text)
        return text;
    // Remove <think>...</think> blocks (DeepSeek / reasoning models)
    return text
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/^\s+|\s+$/g, "")
        .trim();
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
const SUMMARY_MARKER = "<!-- ai-code-reviewer-FB:summary -->";
async function getExistingSummaryComment(octokit, owner, repo, issueNumber) {
    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
        owner,
        repo,
        issue_number: issueNumber,
        per_page: 100,
    });
    return comments.find((c) => c.body?.includes(SUMMARY_MARKER));
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
        /* =======================
           Review each file
           ======================= */
        for (const file of codeFiles) {
            const lines = extractLineNumbersFromPatch(file.patch);
            if (lines.length === 0)
                continue;
            const prompt = `
You are an expert code reviewer.
Review the following Git diff and give concise, actionable feedback.
Use bullet points. Do not repeat the code.

File: ${file.filename}

Diff:
${file.patch}
`;
            let review = null;
            const summaryFindings = [];
            const confidenceScores = [];
            const combinedReviewText = [];
            try {
                const rawReview = await llm.reviewDiff(prompt);
                review = cleanModelOutput(rawReview);
            }
            catch {
                core.warning(`AI review failed for ${file.filename}`);
                continue;
            }
            const confidence = scoreReviewConfidence(review);
            confidenceScores.push(confidence);
            combinedReviewText.push(review.toLowerCase());
            const risk = determineRiskLevel(confidenceScores, combinedReviewText);
            core.info(`Confidence score for ${file.filename}: ${confidence}`);
            if (confidence < MIN_CONFIDENCE_SCORE) {
                core.info(`Skipping low-confidence review for ${file.filename}`);
                continue;
            }
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
            const existingSummary = await getExistingSummaryComment(octokit, owner, repo, pr.number);
            if (existingSummary) {
                await octokit.rest.issues.updateComment({
                    owner,
                    repo,
                    comment_id: existingSummary.id,
                    body: summaryBody,
                });
                core.info("Updated AI review summary comment");
            }
            else {
                await octokit.rest.issues.createComment({
                    owner,
                    repo,
                    issue_number: pr.number,
                    body: summaryBody,
                });
                core.info("Created AI review summary comment");
            }
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
            // // Remove old AI labels
            // await octokit.rest.issues.removeAllLabels({
            //   owner,
            //   repo,
            //   issue_number: pr.number,
            // });
            const existingLabels = pr.labels?.map((l) => l.name) ?? [];
            const aiLabels = existingLabels.filter((l) => l.startsWith("ai-review:"));
            if (aiLabels.length > 0) {
                await Promise.all(aiLabels.map(async (label) => {
                    await octokit.rest.issues.removeLabel({
                        owner,
                        repo,
                        issue_number: pr.number,
                        name: label,
                    });
                }));
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
                const marker = `<!-- ai-code-reviewer-FB:file=${file.filename}:line=${line} -->`;
                const alreadyExists = existingInlineComments.some((comment) => comment.body?.includes(marker));
                if (alreadyExists) {
                    core.info(`Skipping duplicate inline comment for ${file.filename}:${line}`);
                    continue;
                }
                await octokit.rest.pulls.createReviewComment({
                    owner,
                    repo,
                    pull_number: pr.number,
                    commit_id: commitSha,
                    path: file.filename,
                    line,
                    side: "RIGHT",
                    body: `
${marker}
🤖 **AI Code Review**
_Confidence: ${confidence}/100_

${review}
`,
                });
                core.info(`Posted inline review for ${file.filename} at line ${line}`);
            }
            if (risk === "high") {
                core.setFailed("🚨 AI review detected HIGH-RISK issues. Please address them before merging.");
                return;
            }
        }
    }
    catch (error) {
        core.setFailed(error.message);
    }
}
run();
