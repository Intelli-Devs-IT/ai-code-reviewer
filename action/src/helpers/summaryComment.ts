export const SUMMARY_MARKER = "<!-- ai-code-reviewer-FB:summary -->";

export type SummaryRiskLevel = "low" | "medium" | "high";

export interface SummaryBodyOptions {
  confidence: number;
  risk: SummaryRiskLevel;
  reviewedFilePaths: Set<string>;
  summaryFindings: string[];
}

export function formatSummaryFinding(fileName: string, review: string): string {
  return `### ${fileName}\n${review}`;
}

export function buildSummaryBody({
  confidence,
  risk,
  reviewedFilePaths,
  summaryFindings,
}: SummaryBodyOptions): string {
  return `
${SUMMARY_MARKER}
🤖 **AI Code Review Summary**
_Confidence: ${confidence}/100_
${risk === "high" ? "**🚨 HIGH RISK ISSUES DETECTED 🚨**" : ""}

**Files Reviewed:** ${reviewedFilePaths.size}

${summaryFindings.join("\n\n")}
`;
}
