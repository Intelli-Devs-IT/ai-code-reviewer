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
   Helpers: diff parsing
   ======================= */
function extractLineNumbersFromPatch(patch) {
    const lines = patch.split("\n");
    const commentLines = [];
    let newLineNumber = 0;
    let inHunk = false;
    let foundInCurrentHunk = false;
    for (const line of lines) {
        // Start of a new hunk
        if (line.startsWith("@@")) {
            const match = line.match(/\+(\d+)/);
            if (match) {
                newLineNumber = parseInt(match[1], 10) - 1;
                inHunk = true;
                foundInCurrentHunk = false;
            }
            continue;
        }
        if (!inHunk)
            continue;
        // Context or added lines increase new-file line count
        if (!line.startsWith("-")) {
            newLineNumber++;
        }
        // First added line in this hunk
        if (line.startsWith("+") &&
            !line.startsWith("+++") &&
            !foundInCurrentHunk) {
            commentLines.push(newLineNumber);
            foundInCurrentHunk = true;
        }
    }
    return commentLines;
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
            try {
                review = await llm.reviewDiff(prompt);
            }
            catch {
                core.warning(`AI review failed for ${file.filename}`);
                continue;
            }
            if (!review || review.length < 30) {
                core.info(`Low-confidence review skipped for ${file.filename}`);
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

${review}
`,
                });
                core.info(`Posted inline review for ${file.filename} at line ${line}`);
            }
        }
    }
    catch (error) {
        core.setFailed(error.message);
    }
}
run();
