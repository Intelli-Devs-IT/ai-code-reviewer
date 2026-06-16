"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUMMARY_MARKER = void 0;
exports.formatSummaryFinding = formatSummaryFinding;
exports.buildSummaryBody = buildSummaryBody;
exports.SUMMARY_MARKER = "<!-- ai-code-reviewer-FB:summary -->";
function formatSummaryFinding(fileName, review) {
    return `### ${fileName}\n${review}`;
}
function buildSummaryBody({ confidence, risk, reviewedFilePaths, summaryFindings, }) {
    return `
${exports.SUMMARY_MARKER}
🤖 **AI Code Review Summary**
_Confidence: ${confidence}/100_
${risk === "high" ? "**🚨 HIGH RISK ISSUES DETECTED 🚨**" : ""}

**Files Reviewed:** ${reviewedFilePaths.size}

${summaryFindings.join("\n\n")}
`;
}
