import * as core from "@actions/core";
import * as github from "@actions/github";
import { getInlineConfidenceThreshold } from "./config";
import type { LlmProviderName } from "./config";
import { HuggingFaceLLM } from "./llm.huggingface";
import { OpenAIProvider } from "./llm.openai";
import { OpenRouterProvider } from "./llm.openrouter";
import { loadConfig, fileMatchesConfig } from "./load-config";
import { findFunctionStartLine } from "./helpers/findFunctionStartLine";
import { extractScopedPatch } from "./helpers/extractScopedPatch";
import { getChangedLines } from "./helpers/util.helpers";
import { applyRiskLabel } from "./helpers/riskLabels";
import { extractFunctionsFromSource } from "./utils/ast-function-extractor";
import {
  getFunctionReviewContext,
  getFunctionReviewTargets,
  shouldUseScopedReviewFallback,
} from "./helpers/functionReviewTargets";
import { prepareReviewWithDiagnostics } from "./helpers/reviewOutput";
import {
  buildSummaryBody,
  createSummaryFinding,
  SummaryFinding,
  SUMMARY_MARKER,
} from "./helpers/summaryComment";
import {
  determineRiskLevel,
  getHighestRiskLevel,
  RiskLevel,
} from "./helpers/riskLevel";
import {
  buildChangedFunctionReviewPrompt,
  buildScopedReviewPrompt,
} from "./helpers/reviewPrompt";
import {
  detectLanguageFromPath,
  resolveModelForProviderFile,
} from "./helpers/modelRouting";
import { logReviewSkip } from "./helpers/reviewDiagnostics";
import { FileSourceFetcher } from "./helpers/fileSourceFetcher";
import { validateConfiguredModels } from "./helpers/modelValidation";
import {
  createProviderFailure,
  formatProviderFailureForLog,
  ProviderFailure,
  shouldFailForProviderFailures,
} from "./helpers/providerFailures";
import {
  callLlmWithFallback,
  LlmProvider,
  LlmProviderCallError,
  MissingApiKeyProvider,
} from "./helpers/llmProvider";
import {
  createReviewLimitState,
  getFunctionReviewLimitSkip,
  getInlineCommentLimitSkip,
  getReviewLimits,
  recordAcceptedInlineComment,
  recordFunctionReviewAttempt,
  recordReviewLimitSkip,
} from "./helpers/reviewLimits";
import {
  countExternalFindingsByTool,
  determineExternalAnalysisRisk,
  formatExternalAnalysisEvidence,
  getFindingsForFile,
  getFindingsForFunction,
  limitExternalAnalysisFindings,
  loadExternalAnalysisReports,
} from "./helpers/externalAnalysis";

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

function getProviderApiKeyEnvVar(provider: LlmProviderName): string {
  if (provider === "openai") {
    return "OPENAI_API_KEY";
  }

  return provider === "openrouter" ? "OPENROUTER_API_KEY" : "HF_API_KEY";
}

function getProviderDisplayName(provider: LlmProviderName): string {
  if (provider === "openai") {
    return "OpenAI";
  }

  return provider === "openrouter" ? "OpenRouter" : "Hugging Face";
}

function createConfiguredProvider(params: {
  provider: LlmProviderName;
  hfKey?: string;
  openRouterKey?: string;
  openAIKey?: string;
  referer?: string;
}): LlmProvider | null {
  if (params.provider === "openai") {
    return params.openAIKey
      ? new OpenAIProvider(params.openAIKey, fetch)
      : null;
  }

  if (params.provider === "openrouter") {
    return params.openRouterKey
      ? new OpenRouterProvider(params.openRouterKey, fetch, params.referer)
      : null;
  }

  return params.hfKey ? new HuggingFaceLLM(params.hfKey, core) : null;
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
    const fileSourceFetcher = new FileSourceFetcher(core);

    /* =======================
       Load configuration
       ======================= */
    const config = await loadConfig(octokit, owner, repo, pr.head.ref);
    const OVERRIDE_LABEL = "ai-review: override";
    const securityReviewEnabled = config.security_review?.enabled === true;
    const reviewStrictness = config.review?.strictness ?? "balanced";
    const INLINE_CONFIDENCE_THRESHOLD =
      getInlineConfidenceThreshold(reviewStrictness);
    const providerFailureBehavior =
      config.provider_failures?.behavior ?? "warn";
    const fallbackOn = config.providers?.fallback_on ?? [];
    const primaryProviderName = config.providers?.primary ?? "huggingface";
    const fallbackProviderName = config.providers?.fallback;
    const reviewLimits = getReviewLimits(config);
    const reviewLimitState = createReviewLimitState(reviewLimits);

    if (!config.enabled) {
      core.info("AI reviewer disabled via config");
      return;
    }

    validateConfiguredModels(config, core);
    const externalAnalysis = await loadExternalAnalysisReports({
      config,
      workspaceRoot: process.env.GITHUB_WORKSPACE ?? process.cwd(),
      logger: core,
    });
    core.info(
      [
        "External analysis loaded:",
        `lintFindings=${countExternalFindingsByTool(externalAnalysis.findings, "lint")}`,
        `semgrepFindings=${countExternalFindingsByTool(externalAnalysis.findings, "semgrep")}`,
        `testFindings=${countExternalFindingsByTool(externalAnalysis.findings, "tests")}`,
        `warnings=${externalAnalysis.loadWarnings.length}`,
      ].join("\n")
    );

    /* =======================
       Init LLM (optional)
       ======================= */

    const hfKey = process.env.HF_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const openAIKey = process.env.OPENAI_API_KEY;
    const providerReferer = `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${owner}/${repo}`;
    let primaryProvider = createConfiguredProvider({
      provider: primaryProviderName,
      hfKey,
      openRouterKey,
      openAIKey,
      referer: providerReferer,
    });
    const fallbackProvider = fallbackProviderName
      ? createConfiguredProvider({
          provider: fallbackProviderName,
          hfKey,
          openRouterKey,
          openAIKey,
          referer: providerReferer,
        }) ?? undefined
      : undefined;

    if (!primaryProvider) {
      const envVarName = getProviderApiKeyEnvVar(primaryProviderName);
      core.warning(
        `${getProviderDisplayName(primaryProviderName)} primary provider is configured but ${envVarName} is not set.`
      );
      if (primaryProviderName === "huggingface" && !fallbackProviderName) {
        core.warning("HF_API_KEY not set. AI reviews disabled.");
        return;
      }
      primaryProvider = new MissingApiKeyProvider(
        primaryProviderName,
        envVarName
      );
    }

    if (fallbackProviderName && !fallbackProvider) {
      core.warning(
        `${getProviderDisplayName(fallbackProviderName)} fallback provider is configured but ${getProviderApiKeyEnvVar(fallbackProviderName)} is not set.`
      );
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

    const reviewableFiles = [];

    for (const file of files) {
      const language = detectLanguageFromPath(file.filename);
      const selectedModel = resolveModelForProviderFile({
        provider: primaryProviderName,
        filePath: file.filename,
        config,
      });

      if (!file.patch) {
        logReviewSkip(core, {
          filePath: file.filename,
          reason: "file_no_patch",
          provider: primaryProviderName,
          model: selectedModel,
          language,
          reviewStrictness,
          securityReviewEnabled,
          threshold: INLINE_CONFIDENCE_THRESHOLD,
        });
        continue;
      }

      if (!fileMatchesConfig(file.filename, config)) {
        logReviewSkip(core, {
          filePath: file.filename,
          reason: "file_skipped_by_config",
          provider: primaryProviderName,
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
    const reviewedFunctionKeys = new Set<string>();
    const reviewedScopedLines = new Set<string>();
    const reviewedFilePaths = new Set<string>();
    const summaryFindings: SummaryFinding[] = [];
    const providerFailures: ProviderFailure[] = [];
    let highestAcceptedFindingRisk: RiskLevel = "low";
    let highestExternalAnalysisRisk: RiskLevel = "low";

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

    const riskLabels = Object.values(labelMap).map((label) => label.name);

    /* =======================
       Review each file
       ======================= */

    for (const file of codeFiles) {
        const patch = file.patch;
        if (!patch) continue;

        const inlineLanguage = detectLanguageFromPath(file.filename);
        const inlineReviewModel = resolveModelForProviderFile({
          provider: primaryProviderName,
          filePath: file.filename,
          config,
        });
        const inlineFallbackModel = fallbackProviderName
          ? resolveModelForProviderFile({
              provider: fallbackProviderName,
              filePath: file.filename,
              config,
            })
          : undefined;
        const fileExternalFindings = getFindingsForFile(
          externalAnalysis.findings,
          file.filename
        );
        let attemptedFunctionsForFile = 0;

        core.info(
          [
            "Using provider model:",
            `file=${file.filename}`,
            `provider=${primaryProviderName}`,
            `model=${inlineReviewModel}`,
            `language=${inlineLanguage}`,
          ].join("\n")
        );

        const changedLines = getChangedLines(patch);
        if (changedLines.length === 0) {
          logReviewSkip(core, {
            filePath: file.filename,
            reason: "no_changed_lines",
            provider: primaryProviderName,
            model: inlineReviewModel,
            language: inlineLanguage,
            reviewStrictness,
            securityReviewEnabled,
            threshold: INLINE_CONFIDENCE_THRESHOLD,
          });
          continue;
        }

        const sourceCode = await fileSourceFetcher.fetchFileSourceFromHead({
          github: octokit,
          owner,
          repo,
          filePath: file.filename,
          headSha: commitSha,
        });

        if (sourceCode === null) {
          logReviewSkip(core, {
            filePath: file.filename,
            reason: "source_unavailable",
            provider: primaryProviderName,
            model: inlineReviewModel,
            language: inlineLanguage,
            reviewStrictness,
            securityReviewEnabled,
            threshold: INLINE_CONFIDENCE_THRESHOLD,
          });
        }

        const extractedFunctions =
          sourceCode === null
            ? []
            : extractFunctionsFromSource(sourceCode, file.filename);
        const functionTargets = getFunctionReviewTargets(
          file.filename,
          extractedFunctions,
          changedLines,
          reviewedFunctionKeys
        );

        if (
          !shouldUseScopedReviewFallback(extractedFunctions) &&
          functionTargets.length > 0
        ) {
          for (const target of functionTargets) {
            const limitSkip = getFunctionReviewLimitSkip({
              state: reviewLimitState,
              attemptedFunctionsForFile,
            });

            if (limitSkip) {
              recordReviewLimitSkip(reviewLimitState, limitSkip.reason);
              logReviewSkip(core, {
                filePath: file.filename,
                functionName: target.fn.name,
                reason: limitSkip.reason,
                provider: primaryProviderName,
                model: inlineReviewModel,
                language: inlineLanguage,
                reviewStrictness,
                securityReviewEnabled,
                threshold: INLINE_CONFIDENCE_THRESHOLD,
                limit: limitSkip.limit,
                skippedFunctions: 1,
              });
              continue;
            }

            const reviewContext = getFunctionReviewContext(
              target.fn,
              changedLines
            );
            const externalEvidenceFindings = getFindingsForFunction({
              findings: fileExternalFindings,
              functionStartLine: target.fn.startLine,
              functionEndLine: target.fn.endLine,
            });
            const externalAnalysisEvidence = formatExternalAnalysisEvidence(
              externalEvidenceFindings
            );

            if (externalEvidenceFindings.length > 0) {
              highestExternalAnalysisRisk = getHighestRiskLevel(
                highestExternalAnalysisRisk,
                determineExternalAnalysisRisk(externalEvidenceFindings)
              );
              core.info(
                [
                  "External evidence for function:",
                  `file=${file.filename}`,
                  `function=${target.fn.name}`,
                  `evidenceCount=${externalEvidenceFindings.length}`,
                ].join("\n")
              );
            }

            core.debug(
              `Posting inline comment for ${file.filename} at line ${target.commentLine}`
            );

            const prompt = buildChangedFunctionReviewPrompt({
              functionText: reviewContext.focusedText,
              patch,
              isFocusedContext: reviewContext.isFocused,
              securityReviewEnabled,
              reviewStrictness,
              externalAnalysisEvidence,
            });

            let raw: string | null;
            let reviewProviderName = primaryProviderName;
            let reviewModel = inlineReviewModel;
            recordFunctionReviewAttempt(reviewLimitState);
            attemptedFunctionsForFile += 1;
            try {
              const llmResult = await callLlmWithFallback({
                prompt,
                primaryProvider,
                fallbackProvider,
                primaryModel: inlineReviewModel,
                fallbackModel: inlineFallbackModel,
                fallbackOn,
                filePath: file.filename,
                functionName: target.fn.name,
                logger: core,
              });
              raw = llmResult.text;
              reviewProviderName = llmResult.provider as LlmProviderName;
              reviewModel = llmResult.model;
            } catch (error) {
              const providerFailure =
                error instanceof LlmProviderCallError
                  ? error.failure
                  : createProviderFailure({
                      error,
                      filePath: file.filename,
                      functionName: target.fn.name,
                      provider: primaryProviderName,
                      model: inlineReviewModel,
                    });
              providerFailures.push(providerFailure);
              logReviewSkip(core, {
                filePath: file.filename,
                functionName: target.fn.name,
                reason: "provider_model_call_failed",
                provider: providerFailure.provider ?? primaryProviderName,
                model: providerFailure.model ?? inlineReviewModel,
                language: inlineLanguage,
                reviewStrictness,
                securityReviewEnabled,
                threshold: INLINE_CONFIDENCE_THRESHOLD,
              });
              core.warning(formatProviderFailureForLog(providerFailure));
              continue;
            }

            reviewedFilePaths.add(file.filename);

            const prepared = prepareReviewWithDiagnostics(raw);
            const cleaned = prepared.review;

            if (!cleaned) {
              logReviewSkip(core, {
                filePath: file.filename,
                functionName: target.fn.name,
                reason: prepared.skipReason ?? "should_skip_review",
                provider: reviewProviderName,
                model: reviewModel,
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
              logReviewSkip(core, {
                filePath: file.filename,
                functionName: target.fn.name,
                reason: "confidence_below_threshold",
                provider: reviewProviderName,
                model: reviewModel,
                language: inlineLanguage,
                reviewStrictness,
                securityReviewEnabled,
                confidence,
                threshold: INLINE_CONFIDENCE_THRESHOLD,
                preview: prepared.normalizedPreview,
              });
              continue;
            }

            const inlineLimitSkip =
              getInlineCommentLimitSkip(reviewLimitState);
            if (inlineLimitSkip) {
              recordReviewLimitSkip(reviewLimitState, inlineLimitSkip.reason);
              logReviewSkip(core, {
                filePath: file.filename,
                functionName: target.fn.name,
                reason: inlineLimitSkip.reason,
                provider: reviewProviderName,
                model: reviewModel,
                language: inlineLanguage,
                reviewStrictness,
                securityReviewEnabled,
                threshold: INLINE_CONFIDENCE_THRESHOLD,
                limit: inlineLimitSkip.limit,
                skippedFunctions: 1,
              });
              continue;
            }

            const findingRisk = determineRiskLevel(
              [confidence],
              [cleaned.toLowerCase()],
              { securitySensitive: securityReviewEnabled }
            );
            highestAcceptedFindingRisk = getHighestRiskLevel(
              highestAcceptedFindingRisk,
              findingRisk
            );

            summaryFindings.push(
              createSummaryFinding({
                filePath: file.filename,
                functionName: target.fn.name,
                review: cleaned,
                risk: findingRisk,
              })
            );
            recordAcceptedInlineComment(reviewLimitState);

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

              core.info(
                `Posted inline comment for ${file.filename}:${target.commentLine}`
              );
            } catch (error) {
              logReviewSkip(core, {
                filePath: file.filename,
                functionName: target.fn.name,
                reason: "inline_comment_post_failed",
                provider: reviewProviderName,
                model: reviewModel,
                language: inlineLanguage,
                reviewStrictness,
                securityReviewEnabled,
                threshold: INLINE_CONFIDENCE_THRESHOLD,
              });
              core.warning(
                `Failed to post inline comment for ${file.filename}: ${error}`
              );
            }
          }

          continue;
        }

        if (shouldUseScopedReviewFallback(extractedFunctions)) {
          logReviewSkip(core, {
            filePath: file.filename,
            reason: "ast_no_functions_fallback_used",
            provider: primaryProviderName,
            model: inlineReviewModel,
            language: inlineLanguage,
            reviewStrictness,
            securityReviewEnabled,
            threshold: INLINE_CONFIDENCE_THRESHOLD,
          });
        } else {
          logReviewSkip(core, {
            filePath: file.filename,
            reason: "no_changed_functions_found",
            provider: primaryProviderName,
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
        if (reviewedScopedLines.has(scopedReviewKey)) continue;
        reviewedScopedLines.add(scopedReviewKey);

        const scopedInlineLimitSkip =
          getInlineCommentLimitSkip(reviewLimitState);
        if (scopedInlineLimitSkip) {
          recordReviewLimitSkip(
            reviewLimitState,
            scopedInlineLimitSkip.reason
          );
          logReviewSkip(core, {
            filePath: file.filename,
            reason: scopedInlineLimitSkip.reason,
            provider: primaryProviderName,
            model: inlineReviewModel,
            language: inlineLanguage,
            reviewStrictness,
            securityReviewEnabled,
            threshold: INLINE_CONFIDENCE_THRESHOLD,
            limit: scopedInlineLimitSkip.limit,
            skippedFunctions: 1,
          });
          continue;
        }

        core.debug(
          `Posting inline comment for ${file.filename} at line ${targetLine}`
        );

        const scopedPatch = extractScopedPatch(patch, targetLine);
        core.debug(`Scoped Patch:\n${scopedPatch}`);
        const scopedExternalEvidenceFindings =
          limitExternalAnalysisFindings(fileExternalFindings);
        const scopedExternalAnalysisEvidence = formatExternalAnalysisEvidence(
          scopedExternalEvidenceFindings
        );

        if (scopedExternalEvidenceFindings.length > 0) {
          highestExternalAnalysisRisk = getHighestRiskLevel(
            highestExternalAnalysisRisk,
            determineExternalAnalysisRisk(scopedExternalEvidenceFindings)
          );
          core.info(
            [
              "External evidence for scoped review:",
              `file=${file.filename}`,
              `evidenceCount=${scopedExternalEvidenceFindings.length}`,
            ].join("\n")
          );
        }

        const prompt = buildScopedReviewPrompt({
          fileName: file.filename,
          targetLine,
          scopedPatch,
          securityReviewEnabled,
          reviewStrictness,
          externalAnalysisEvidence: scopedExternalAnalysisEvidence,
        });

        let raw: string | null;
        let reviewProviderName = primaryProviderName;
        let reviewModel = inlineReviewModel;
        try {
          const llmResult = await callLlmWithFallback({
            prompt,
            primaryProvider,
            fallbackProvider,
            primaryModel: inlineReviewModel,
            fallbackModel: inlineFallbackModel,
            fallbackOn,
            filePath: file.filename,
            logger: core,
          });
          raw = llmResult.text;
          reviewProviderName = llmResult.provider as LlmProviderName;
          reviewModel = llmResult.model;
        } catch (error) {
          const providerFailure =
            error instanceof LlmProviderCallError
              ? error.failure
              : createProviderFailure({
                  error,
                  filePath: file.filename,
                  provider: primaryProviderName,
                  model: inlineReviewModel,
                });
          providerFailures.push(providerFailure);
          logReviewSkip(core, {
            filePath: file.filename,
            reason: "provider_model_call_failed",
            provider: providerFailure.provider ?? primaryProviderName,
            model: providerFailure.model ?? inlineReviewModel,
            language: inlineLanguage,
            reviewStrictness,
            securityReviewEnabled,
            threshold: INLINE_CONFIDENCE_THRESHOLD,
          });
          core.warning(formatProviderFailureForLog(providerFailure));
          continue;
        }

        reviewedFilePaths.add(file.filename);

        const prepared = prepareReviewWithDiagnostics(raw);
        const cleaned = prepared.review;

        if (!cleaned) {
          logReviewSkip(core, {
            filePath: file.filename,
            reason: prepared.skipReason ?? "should_skip_review",
            provider: reviewProviderName,
            model: reviewModel,
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
          logReviewSkip(core, {
            filePath: file.filename,
            reason: "confidence_below_threshold",
            provider: reviewProviderName,
            model: reviewModel,
            language: inlineLanguage,
            reviewStrictness,
            securityReviewEnabled,
            confidence,
            threshold: INLINE_CONFIDENCE_THRESHOLD,
            preview: prepared.normalizedPreview,
          });
          continue;
        }

        const inlineLimitSkip = getInlineCommentLimitSkip(reviewLimitState);
        if (inlineLimitSkip) {
          recordReviewLimitSkip(reviewLimitState, inlineLimitSkip.reason);
          logReviewSkip(core, {
            filePath: file.filename,
            reason: inlineLimitSkip.reason,
            provider: reviewProviderName,
            model: reviewModel,
            language: inlineLanguage,
            reviewStrictness,
            securityReviewEnabled,
            threshold: INLINE_CONFIDENCE_THRESHOLD,
            limit: inlineLimitSkip.limit,
            skippedFunctions: 1,
          });
          continue;
        }

        const findingRisk = determineRiskLevel(
          [confidence],
          [cleaned.toLowerCase()],
          { securitySensitive: securityReviewEnabled }
        );
        highestAcceptedFindingRisk = getHighestRiskLevel(
          highestAcceptedFindingRisk,
          findingRisk
        );

        summaryFindings.push(
          createSummaryFinding({
            filePath: file.filename,
            review: cleaned,
            risk: findingRisk,
          })
        );
        recordAcceptedInlineComment(reviewLimitState);

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
        } catch (error) {
          logReviewSkip(core, {
            filePath: file.filename,
            reason: "inline_comment_post_failed",
            provider: reviewProviderName,
            model: reviewModel,
            language: inlineLanguage,
            reviewStrictness,
            securityReviewEnabled,
            threshold: INLINE_CONFIDENCE_THRESHOLD,
          });
          core.warning(
            `Failed to post inline comment for ${file.filename}: ${error}`
          );
        }
    }

    if (reviewedFilePaths.size === 0 && providerFailures.length === 0) {
      core.info("No summary findings to post");
      return;
    }

    if (reviewedFilePaths.size === 0 && providerFailures.length > 0) {
      await upsertSummaryComment(
        octokit,
        owner,
        repo,
        pr.number,
        buildSummaryBody({
          reviewedFilePaths,
          findings: summaryFindings,
          providerFailures,
          providerFailureBehavior,
          reviewLimits: reviewLimitState,
          externalAnalysis,
          externalAnalysisRisk: highestExternalAnalysisRisk,
        })
      );

      if (
        shouldFailForProviderFailures(providerFailureBehavior, providerFailures)
      ) {
        core.setFailed(
          "AI review could not be completed because provider calls failed."
        );
      }

      return;
    }

    const finalRisk = getHighestRiskLevel(
      highestAcceptedFindingRisk,
      highestExternalAnalysisRisk
    );
    const selected = labelMap[finalRisk];

    await ensureLabel(
      octokit,
      owner,
      repo,
      selected.name,
      selected.color,
      selected.description
    );

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

    const prLabels = pr.labels?.map((l: any) => l.name) ?? [];
    const hasOverride = prLabels.includes(OVERRIDE_LABEL);

    if (finalRisk === "high" && !hasOverride) {
      await upsertSummaryComment(
        octokit,
        owner,
        repo,
        pr.number,
        buildSummaryBody({
          reviewedFilePaths,
          findings: summaryFindings,
          providerFailures,
          providerFailureBehavior,
          reviewLimits: reviewLimitState,
          externalAnalysis,
          externalAnalysisRisk: highestExternalAnalysisRisk,
        })
      );

      core.setFailed(
        "🚨 AI review detected HIGH-RISK issues. Add 'ai-review: override' to bypass."
      );
      return;
    }

    if (finalRisk === "high" && hasOverride) {
      core.warning("⚠️ High-risk PR overridden by maintainer label.");
    }

    await upsertSummaryComment(
      octokit,
      owner,
      repo,
      pr.number,
      buildSummaryBody({
        reviewedFilePaths,
        findings: summaryFindings,
        providerFailures,
        providerFailureBehavior,
        reviewLimits: reviewLimitState,
        externalAnalysis,
        externalAnalysisRisk: highestExternalAnalysisRisk,
      })
    );

    if (shouldFailForProviderFailures(providerFailureBehavior, providerFailures)) {
      core.setFailed("AI review completed with provider failures.");
    }
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

run();
