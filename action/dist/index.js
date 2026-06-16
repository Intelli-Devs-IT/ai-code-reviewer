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
const config_1 = require("./config");
const llm_huggingface_1 = require("./llm.huggingface");
const load_config_1 = require("./load-config");
const extractScopedPatch_1 = require("./helpers/extractScopedPatch");
const util_helpers_1 = require("./helpers/util.helpers");
const riskLabels_1 = require("./helpers/riskLabels");
const ast_function_extractor_1 = require("./utils/ast-function-extractor");
const functionReviewTargets_1 = require("./helpers/functionReviewTargets");
const reviewOutput_1 = require("./helpers/reviewOutput");
const summaryComment_1 = require("./helpers/summaryComment");
const riskLevel_1 = require("./helpers/riskLevel");
const reviewPrompt_1 = require("./helpers/reviewPrompt");
const modelRouting_1 = require("./helpers/modelRouting");
const reviewDiagnostics_1 = require("./helpers/reviewDiagnostics");
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
        const OVERRIDE_LABEL = "ai-review: override";
        const securityReviewEnabled = config.security_review?.enabled === true;
        const reviewStrictness = config.review?.strictness ?? "balanced";
        const INLINE_CONFIDENCE_THRESHOLD = (0, config_1.getInlineConfidenceThreshold)(reviewStrictness);
        const modelRoutingEnabled = config.model_routing?.enabled === true;
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
        const reviewableFiles = [];
        for (const file of files) {
            const language = (0, modelRouting_1.detectLanguageFromPath)(file.filename);
            const selectedModel = (0, modelRouting_1.resolveModelForFile)({
                filePath: file.filename,
                config,
                existingDefaultModel: llm_huggingface_1.DEFAULT_HUGGINGFACE_MODEL,
            });
            if (!file.patch) {
                (0, reviewDiagnostics_1.logReviewSkip)(core, {
                    filePath: file.filename,
                    reason: "file_no_patch",
                    model: selectedModel,
                    language,
                    reviewStrictness,
                    securityReviewEnabled,
                    threshold: INLINE_CONFIDENCE_THRESHOLD,
                });
                continue;
            }
            if (!(0, load_config_1.fileMatchesConfig)(file.filename, config)) {
                (0, reviewDiagnostics_1.logReviewSkip)(core, {
                    filePath: file.filename,
                    reason: "file_skipped_by_config",
                    model: selectedModel,
                    language,
                    reviewStrictness,
                    securityReviewEnabled,
                    threshold: INLINE_CONFIDENCE_THRESHOLD,
                });
                continue;
            }
            reviewableFiles.push(file);
        }
        const codeFiles = reviewableFiles.slice(0, config.max_files);
        core.info(`Reviewing ${codeFiles.length} code files`);
        const reviewedFunctionKeys = new Set();
        const reviewedScopedLines = new Set();
        const reviewedFilePaths = new Set();
        const summaryFindings = [];
        let highestAcceptedFindingRisk = "low";
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
        const riskLabels = Object.values(labelMap).map((label) => label.name);
        /* =======================
           Review each file
           ======================= */
        for (const file of codeFiles) {
            const patch = file.patch;
            if (!patch)
                continue;
            const inlineLanguage = (0, modelRouting_1.detectLanguageFromPath)(file.filename);
            const inlineReviewModel = (0, modelRouting_1.resolveModelForFile)({
                filePath: file.filename,
                config,
                existingDefaultModel: llm_huggingface_1.DEFAULT_HUGGINGFACE_MODEL,
            });
            if (modelRoutingEnabled) {
                core.info(`Using routed model for ${file.filename}: ${inlineReviewModel}`);
            }
            const changedLines = (0, util_helpers_1.getChangedLines)(patch);
            if (changedLines.length === 0) {
                (0, reviewDiagnostics_1.logReviewSkip)(core, {
                    filePath: file.filename,
                    reason: "no_changed_lines",
                    model: inlineReviewModel,
                    language: inlineLanguage,
                    reviewStrictness,
                    securityReviewEnabled,
                    threshold: INLINE_CONFIDENCE_THRESHOLD,
                });
                continue;
            }
            const sourceCode = await getFileSourceFromRef(octokit, owner, repo, file.filename, commitSha);
            if (sourceCode === null) {
                (0, reviewDiagnostics_1.logReviewSkip)(core, {
                    filePath: file.filename,
                    reason: "source_unavailable",
                    model: inlineReviewModel,
                    language: inlineLanguage,
                    reviewStrictness,
                    securityReviewEnabled,
                    threshold: INLINE_CONFIDENCE_THRESHOLD,
                });
                continue;
            }
            const extractedFunctions = (0, ast_function_extractor_1.extractFunctionsFromSource)(sourceCode, file.filename);
            const functionTargets = (0, functionReviewTargets_1.getFunctionReviewTargets)(file.filename, extractedFunctions, changedLines, reviewedFunctionKeys);
            if (!(0, functionReviewTargets_1.shouldUseScopedReviewFallback)(extractedFunctions) &&
                functionTargets.length > 0) {
                for (const target of functionTargets) {
                    const reviewContext = (0, functionReviewTargets_1.getFunctionReviewContext)(target.fn, changedLines);
                    reviewedFilePaths.add(file.filename);
                    core.debug(`Posting inline comment for ${file.filename} at line ${target.commentLine}`);
                    const prompt = (0, reviewPrompt_1.buildChangedFunctionReviewPrompt)({
                        functionText: reviewContext.focusedText,
                        patch,
                        isFocusedContext: reviewContext.isFocused,
                        securityReviewEnabled,
                        reviewStrictness,
                    });
                    let raw;
                    try {
                        raw = await llm.reviewDiff(prompt, modelRoutingEnabled ? inlineReviewModel : undefined);
                    }
                    catch {
                        (0, reviewDiagnostics_1.logReviewSkip)(core, {
                            filePath: file.filename,
                            functionName: target.fn.name,
                            reason: "provider_model_call_failed",
                            model: inlineReviewModel,
                            language: inlineLanguage,
                            reviewStrictness,
                            securityReviewEnabled,
                            threshold: INLINE_CONFIDENCE_THRESHOLD,
                        });
                        core.warning(`AI inline review failed for ${file.filename}`);
                        continue;
                    }
                    const prepared = (0, reviewOutput_1.prepareReviewWithDiagnostics)(raw);
                    const cleaned = prepared.review;
                    if (!cleaned) {
                        (0, reviewDiagnostics_1.logReviewSkip)(core, {
                            filePath: file.filename,
                            functionName: target.fn.name,
                            reason: prepared.skipReason ?? "should_skip_review",
                            model: inlineReviewModel,
                            language: inlineLanguage,
                            reviewStrictness,
                            securityReviewEnabled,
                            threshold: INLINE_CONFIDENCE_THRESHOLD,
                            preview: prepared.normalizedPreview ?? prepared.preview,
                        });
                        continue;
                    }
                    const confidence = scoreReviewConfidence(cleaned);
                    if (confidence < INLINE_CONFIDENCE_THRESHOLD) {
                        (0, reviewDiagnostics_1.logReviewSkip)(core, {
                            filePath: file.filename,
                            functionName: target.fn.name,
                            reason: "confidence_below_threshold",
                            model: inlineReviewModel,
                            language: inlineLanguage,
                            reviewStrictness,
                            securityReviewEnabled,
                            confidence,
                            threshold: INLINE_CONFIDENCE_THRESHOLD,
                            preview: prepared.normalizedPreview,
                        });
                        continue;
                    }
                    const findingRisk = (0, riskLevel_1.determineRiskLevel)([confidence], [cleaned.toLowerCase()], { securitySensitive: securityReviewEnabled });
                    highestAcceptedFindingRisk = (0, riskLevel_1.getHighestRiskLevel)(highestAcceptedFindingRisk, findingRisk);
                    summaryFindings.push((0, summaryComment_1.createSummaryFinding)({
                        filePath: file.filename,
                        functionName: target.fn.name,
                        review: cleaned,
                        risk: findingRisk,
                    }));
                    try {
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
                        (0, reviewDiagnostics_1.logReviewSkip)(core, {
                            filePath: file.filename,
                            functionName: target.fn.name,
                            reason: "inline_comment_post_failed",
                            model: inlineReviewModel,
                            language: inlineLanguage,
                            reviewStrictness,
                            securityReviewEnabled,
                            threshold: INLINE_CONFIDENCE_THRESHOLD,
                        });
                        core.warning(`Failed to post inline comment for ${file.filename}: ${error}`);
                    }
                }
                continue;
            }
            if ((0, functionReviewTargets_1.shouldUseScopedReviewFallback)(extractedFunctions)) {
                (0, reviewDiagnostics_1.logReviewSkip)(core, {
                    filePath: file.filename,
                    reason: "ast_no_functions_fallback_used",
                    model: inlineReviewModel,
                    language: inlineLanguage,
                    reviewStrictness,
                    securityReviewEnabled,
                    threshold: INLINE_CONFIDENCE_THRESHOLD,
                });
            }
            else {
                (0, reviewDiagnostics_1.logReviewSkip)(core, {
                    filePath: file.filename,
                    reason: "no_changed_functions_found",
                    model: inlineReviewModel,
                    language: inlineLanguage,
                    reviewStrictness,
                    securityReviewEnabled,
                    threshold: INLINE_CONFIDENCE_THRESHOLD,
                });
            }
            // Pick the first changed line to comment on
            const targetLine = changedLines[0];
            // Skip if already reviewed
            const scopedReviewKey = `${file.filename}:${targetLine}`;
            if (reviewedScopedLines.has(scopedReviewKey))
                continue;
            reviewedScopedLines.add(scopedReviewKey);
            core.debug(`Posting inline comment for ${file.filename} at line ${targetLine}`);
            const scopedPatch = (0, extractScopedPatch_1.extractScopedPatch)(patch, targetLine);
            core.debug(`Scoped Patch:\n${scopedPatch}`);
            reviewedFilePaths.add(file.filename);
            const prompt = (0, reviewPrompt_1.buildScopedReviewPrompt)({
                fileName: file.filename,
                targetLine,
                scopedPatch,
                securityReviewEnabled,
                reviewStrictness,
            });
            let raw;
            try {
                raw = await llm.reviewDiff(prompt, modelRoutingEnabled ? inlineReviewModel : undefined);
            }
            catch {
                (0, reviewDiagnostics_1.logReviewSkip)(core, {
                    filePath: file.filename,
                    reason: "provider_model_call_failed",
                    model: inlineReviewModel,
                    language: inlineLanguage,
                    reviewStrictness,
                    securityReviewEnabled,
                    threshold: INLINE_CONFIDENCE_THRESHOLD,
                });
                core.warning(`AI inline review failed for ${file.filename}`);
                continue;
            }
            const prepared = (0, reviewOutput_1.prepareReviewWithDiagnostics)(raw);
            const cleaned = prepared.review;
            if (!cleaned) {
                (0, reviewDiagnostics_1.logReviewSkip)(core, {
                    filePath: file.filename,
                    reason: prepared.skipReason ?? "should_skip_review",
                    model: inlineReviewModel,
                    language: inlineLanguage,
                    reviewStrictness,
                    securityReviewEnabled,
                    threshold: INLINE_CONFIDENCE_THRESHOLD,
                    preview: prepared.normalizedPreview ?? prepared.preview,
                });
                continue;
            }
            const confidence = scoreReviewConfidence(cleaned);
            if (confidence < INLINE_CONFIDENCE_THRESHOLD) {
                (0, reviewDiagnostics_1.logReviewSkip)(core, {
                    filePath: file.filename,
                    reason: "confidence_below_threshold",
                    model: inlineReviewModel,
                    language: inlineLanguage,
                    reviewStrictness,
                    securityReviewEnabled,
                    confidence,
                    threshold: INLINE_CONFIDENCE_THRESHOLD,
                    preview: prepared.normalizedPreview,
                });
                continue;
            }
            const findingRisk = (0, riskLevel_1.determineRiskLevel)([confidence], [cleaned.toLowerCase()], { securitySensitive: securityReviewEnabled });
            highestAcceptedFindingRisk = (0, riskLevel_1.getHighestRiskLevel)(highestAcceptedFindingRisk, findingRisk);
            summaryFindings.push((0, summaryComment_1.createSummaryFinding)({
                filePath: file.filename,
                review: cleaned,
                risk: findingRisk,
            }));
            try {
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
                (0, reviewDiagnostics_1.logReviewSkip)(core, {
                    filePath: file.filename,
                    reason: "inline_comment_post_failed",
                    model: inlineReviewModel,
                    language: inlineLanguage,
                    reviewStrictness,
                    securityReviewEnabled,
                    threshold: INLINE_CONFIDENCE_THRESHOLD,
                });
                core.warning(`Failed to post inline comment for ${file.filename}: ${error}`);
            }
        }
        if (reviewedFilePaths.size === 0) {
            core.info("No summary findings to post");
            return;
        }
        const finalRisk = highestAcceptedFindingRisk;
        const selected = labelMap[finalRisk];
        await ensureLabel(octokit, owner, repo, selected.name, selected.color, selected.description);
        await (0, riskLabels_1.applyRiskLabel)(octokit, owner, repo, pr.number, selected.name, riskLabels, core);
        core.info(`Applied risk label: ${selected.name}`);
        const prLabels = pr.labels?.map((l) => l.name) ?? [];
        const hasOverride = prLabels.includes(OVERRIDE_LABEL);
        if (finalRisk === "high" && !hasOverride) {
            await upsertSummaryComment(octokit, owner, repo, pr.number, (0, summaryComment_1.buildSummaryBody)({
                reviewedFilePaths,
                findings: summaryFindings,
            }));
            core.setFailed("🚨 AI review detected HIGH-RISK issues. Add 'ai-review: override' to bypass.");
            return;
        }
        if (finalRisk === "high" && hasOverride) {
            core.warning("⚠️ High-risk PR overridden by maintainer label.");
        }
        await upsertSummaryComment(octokit, owner, repo, pr.number, (0, summaryComment_1.buildSummaryBody)({
            reviewedFilePaths,
            findings: summaryFindings,
        }));
    }
    catch (error) {
        core.setFailed(error.message);
    }
}
run();
