import {
  ProviderFailure,
  ProviderFailureType,
} from "./providerFailures";
import {
  hasReviewLimitSkips,
  ReviewLimitState,
} from "./reviewLimits";
import { ExternalAnalysisSummary } from "./externalAnalysis";

export const SUMMARY_MARKER = "<!-- ai-code-reviewer-FB:summary -->";

export type SummaryRiskLevel = "low" | "medium" | "high" | "unknown";

export interface SummaryFinding {
  filePath: string;
  functionName?: string;
  issue: string;
  risk: SummaryRiskLevel;
}

export interface SummaryBodyOptions {
  reviewedFilePaths: Set<string>;
  findings: SummaryFinding[];
  providerFailures?: ProviderFailure[];
  providerFailureBehavior?: "warn" | "fail" | "skip";
  providerFallbackUsed?: boolean;
  reviewLimits?: ReviewLimitState;
  externalAnalysis?: ExternalAnalysisSummary;
  externalAnalysisRisk?: SummaryRiskLevel;
}

export function createSummaryFinding({
  filePath,
  functionName,
  review,
  risk,
}: {
  filePath: string;
  functionName?: string;
  review: string;
  risk: SummaryRiskLevel;
}): SummaryFinding {
  return {
    filePath,
    functionName,
    issue: extractIssueSummary(review),
    risk,
  };
}

export function buildSummaryBody({
  reviewedFilePaths,
  findings,
  providerFailures = [],
  providerFailureBehavior = "warn",
  providerFallbackUsed = false,
  reviewLimits,
  externalAnalysis,
  externalAnalysisRisk = "low",
}: SummaryBodyOptions): string {
  const dedupedFindings = dedupeFindings(findings);
  const baseOverallRisk =
    reviewedFilePaths.size === 0 && providerFailures.length > 0
      ? "unknown"
      : getHighestRisk(dedupedFindings);
  const overallRisk = baseOverallRisk === "unknown"
    ? baseOverallRisk
    : getHighestSummaryRisk(baseOverallRisk, externalAnalysisRisk);
  const riskLabel = formatRisk(overallRisk);

  return `
${SUMMARY_MARKER}
🤖 **AI Code Review Summary**

Files Reviewed: ${reviewedFilePaths.size}
Inline Findings: ${dedupedFindings.length}
Overall Risk: ${riskLabel}

## Key Findings

${formatKeyFindings(dedupedFindings, providerFailures)}

${formatProviderFailures(providerFailures, providerFailureBehavior)}

${formatProviderFallbackUsage(providerFallbackUsed)}

${formatReviewLimits(reviewLimits)}

${formatExternalAnalysis(externalAnalysis)}

## Risk Analysis

${formatRiskAnalysis(overallRisk, dedupedFindings.length, providerFailures, reviewLimits, externalAnalysisRisk)}

## Suggested Next Steps

${formatNextSteps(overallRisk, dedupedFindings.length, providerFailures, reviewLimits)}
`;
}

export function getHighestRisk(findings: SummaryFinding[]): SummaryRiskLevel {
  if (findings.some((finding) => finding.risk === "high")) return "high";
  if (findings.some((finding) => finding.risk === "medium")) return "medium";

  return "low";
}

function getHighestSummaryRisk(
  left: SummaryRiskLevel,
  right: SummaryRiskLevel
): SummaryRiskLevel {
  const priority: Record<SummaryRiskLevel, number> = {
    low: 0,
    medium: 1,
    high: 2,
    unknown: 3,
  };

  return priority[right] > priority[left] ? right : left;
}

export function dedupeFindings(findings: SummaryFinding[]): SummaryFinding[] {
  const seen = new Set<string>();
  const deduped: SummaryFinding[] = [];

  for (const finding of findings) {
    const key = [
      finding.filePath,
      finding.functionName ?? "",
      normalizeIssueText(finding.issue),
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(finding);
  }

  return deduped;
}

function extractIssueSummary(review: string): string {
  const issueMatch = review.match(/ISSUE:\s*([\s\S]*?)(?:\n\s*IMPACT:|\n\s*SUGGESTION:|$)/i);
  const issueText = issueMatch?.[1] ?? review;
  const firstMeaningfulLine = issueText
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstMeaningfulLine ?? "Review finding needs attention.";
}

function formatKeyFindings(
  findings: SummaryFinding[],
  providerFailures: ProviderFailure[]
): string {
  if (findings.length === 0) {
    if (providerFailures.length > 0) {
      return "No inline findings were produced because provider failures prevented some or all AI review calls from completing.";
    }

    return "No high-confidence issues were found in the reviewed changed functions.";
  }

  return findings
    .map((finding) => `* \`${finding.filePath}\`: ${finding.issue}`)
    .join("\n");
}

function formatRiskAnalysis(
  risk: SummaryRiskLevel,
  findingCount: number,
  providerFailures: ProviderFailure[],
  reviewLimits?: ReviewLimitState,
  externalAnalysisRisk: SummaryRiskLevel = "low"
): string {
  if (risk === "unknown") {
    return "Risk is unknown because AI review could not be completed due to provider failures.";
  }

  const limitNote = hasLimitSkips(reviewLimits)
    ? " Some changed functions were skipped because review limits were reached, so review coverage was partial."
    : "";
  const externalNote = externalAnalysisRisk === "high"
    ? " Relevant external analysis findings overlapping changed code raised the risk to high."
    : externalAnalysisRisk === "medium"
      ? " Relevant external analysis findings overlapping changed code raised the risk to medium."
      : "";

  if (providerFailures.length > 0) {
    return `${formatBaseRiskAnalysis(
      risk,
      findingCount
    )} Some changed functions were not reviewed because provider calls failed.${limitNote}${externalNote}`;
  }

  if (limitNote || externalNote) {
    return `${formatBaseRiskAnalysis(risk, findingCount)}${limitNote}${externalNote}`;
  }

  return formatBaseRiskAnalysis(risk, findingCount);
}

function formatBaseRiskAnalysis(
  risk: SummaryRiskLevel,
  findingCount: number
): string {
  if (findingCount === 0) {
    return "Low risk because no high-confidence issues were found in the reviewed changed functions.";
  }

  if (risk === "high") {
    return "High risk because at least one accepted finding may affect security, data integrity, authorization, or production behavior.";
  }

  if (risk === "medium") {
    return "Medium risk because accepted findings should be reviewed before merge, but no high-risk finding was identified.";
  }

  return "Low risk because accepted findings appear limited in scope and no medium or high-risk finding was identified.";
}

function formatNextSteps(
  risk: SummaryRiskLevel,
  findingCount: number,
  providerFailures: ProviderFailure[],
  reviewLimits?: ReviewLimitState
): string {
  if (risk === "unknown") {
    return "* Add Hugging Face prepaid credits, upgrade billing, or configure another provider/model.\n* Rerun the workflow after provider access is restored.";
  }

  const limitStep = hasLimitSkips(reviewLimits)
    ? "\n* Increase review limits and rerun the workflow if broader AI coverage is needed."
    : "";

  if (providerFailures.length > 0) {
    return `${formatBaseNextSteps(
      risk,
      findingCount
    )}\n* Resolve provider access issues and rerun the workflow to review skipped functions.${limitStep}`;
  }

  return `${formatBaseNextSteps(risk, findingCount)}${limitStep}`;
}

function formatBaseNextSteps(
  risk: SummaryRiskLevel,
  findingCount: number
): string {
  if (findingCount === 0) {
    return "* No immediate action required from the AI review.\n* Review the changed functions manually as usual before merge.";
  }

  if (risk === "high") {
    return "* Address the high-risk finding before merge.\n* Re-run the review after the fix is pushed.";
  }

  if (risk === "medium") {
    return "* Review the listed findings and fix the ones that apply.\n* Re-run the review after meaningful changes.";
  }

  return "* Review the listed findings.\n* Fix any confirmed issue before merge.";
}

function formatRisk(risk: SummaryRiskLevel): string {
  return risk[0].toUpperCase() + risk.slice(1);
}

function formatProviderFailures(
  providerFailures: ProviderFailure[],
  behavior: "warn" | "fail" | "skip"
): string {
  if (providerFailures.length === 0) {
    return "";
  }

  const quotaOnly = providerFailures.every(
    (failure) => failure.type === "quota_exceeded"
  );

  if (behavior === "skip" && !quotaOnly) {
    return "## Provider Issue\n\nSome provider calls failed, so the AI review may be incomplete.";
  }

  const intro = quotaOnly
    ? "AI review could not be completed because the model provider quota was exhausted."
    : "AI review could not be completed for every changed function because provider calls failed.";

  return `## Provider Issue

${intro}

${dedupeProviderFailures(providerFailures)
  .map((failure) => `* ${formatProviderFailure(failure)}`)
  .join("\n")}`;
}

function formatProviderFallbackUsage(providerFallbackUsed: boolean): string {
  if (!providerFallbackUsed) {
    return "";
  }

  return "## Provider Fallback\n\nProvider fallback was used for some reviews.";
}

function formatReviewLimits(reviewLimits?: ReviewLimitState): string {
  if (!hasLimitSkips(reviewLimits)) {
    return "";
  }

  return `## Review Limits

Some changed functions were skipped because configured review limits were reached.

* Max inline comments: ${reviewLimits.maxInlineComments}
* Max functions per file: ${reviewLimits.maxFunctionsPerFile}
* Max total functions: ${reviewLimits.maxTotalFunctions}`;
}

function formatExternalAnalysis(
  externalAnalysis?: ExternalAnalysisSummary
): string {
  if (
    !externalAnalysis ||
    (externalAnalysis.findings.length === 0 &&
      externalAnalysis.loadWarnings.length === 0)
  ) {
    return "";
  }

  const lintCount = countFindingsByTool(externalAnalysis, "lint");
  const semgrepCount = countFindingsByTool(externalAnalysis, "semgrep");
  const testCount = countFindingsByTool(externalAnalysis, "tests");

  return `## External Analysis

* Lint findings loaded: ${lintCount}
* Semgrep findings loaded: ${semgrepCount}
* Test findings loaded: ${testCount}
* Report warnings: ${externalAnalysis.loadWarnings.length}`;
}

function countFindingsByTool(
  externalAnalysis: ExternalAnalysisSummary,
  tool: "lint" | "semgrep" | "tests"
): number {
  return externalAnalysis.findings.filter((finding) => finding.tool === tool)
    .length;
}

function hasLimitSkips(
  reviewLimits?: ReviewLimitState
): reviewLimits is ReviewLimitState {
  return Boolean(reviewLimits && hasReviewLimitSkips(reviewLimits));
}

function formatProviderFailure(failure: ProviderFailure): string {
  const provider = formatProviderName(failure.provider);
  const type = formatProviderFailureType(failure.type);
  const model = failure.model ? ` for model ${failure.model}` : "";
  const location = failure.filePath ? ` in \`${failure.filePath}\`` : "";

  return `${provider} ${type}${model}${location}.`;
}

function formatProviderName(provider?: string): string {
  if (provider === "ollama") return "Ollama";
  if (provider === "openai") return "OpenAI";
  if (provider === "openrouter") return "OpenRouter";
  if (provider === "huggingface") return "Hugging Face";

  return "Provider";
}

function formatProviderFailureType(type: ProviderFailureType): string {
  switch (type) {
    case "quota_exceeded":
      return "quota exceeded";
    case "rate_limited":
      return "rate limited";
    case "auth_failed":
      return "authentication failed";
    case "model_unavailable":
      return "model unavailable";
    case "invalid_response":
      return "invalid response";
    case "network_error":
      return "network error";
    case "unknown":
    default:
      return "provider failure";
  }
}

function dedupeProviderFailures(
  providerFailures: ProviderFailure[]
): ProviderFailure[] {
  const seen = new Set<string>();
  const deduped: ProviderFailure[] = [];

  for (const failure of providerFailures) {
    const key = [
      failure.filePath ?? "",
      failure.functionName ?? "",
      failure.model ?? "",
      failure.type,
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(failure);
  }

  return deduped;
}

function normalizeIssueText(issue: string): string {
  return issue.toLowerCase().replace(/\s+/g, " ").trim();
}
