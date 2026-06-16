"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUMMARY_MARKER = void 0;
exports.createSummaryFinding = createSummaryFinding;
exports.buildSummaryBody = buildSummaryBody;
exports.getHighestRisk = getHighestRisk;
exports.dedupeFindings = dedupeFindings;
exports.SUMMARY_MARKER = "<!-- ai-code-reviewer-FB:summary -->";
function createSummaryFinding({ filePath, functionName, review, risk, }) {
    return {
        filePath,
        functionName,
        issue: extractIssueSummary(review),
        risk,
    };
}
function buildSummaryBody({ reviewedFilePaths, findings, }) {
    const dedupedFindings = dedupeFindings(findings);
    const overallRisk = getHighestRisk(dedupedFindings);
    const riskLabel = formatRisk(overallRisk);
    return `
${exports.SUMMARY_MARKER}
🤖 **AI Code Review Summary**

Files Reviewed: ${reviewedFilePaths.size}
Inline Findings: ${dedupedFindings.length}
Overall Risk: ${riskLabel}

## Key Findings

${formatKeyFindings(dedupedFindings)}

## Risk Analysis

${formatRiskAnalysis(overallRisk, dedupedFindings.length)}

## Suggested Next Steps

${formatNextSteps(overallRisk, dedupedFindings.length)}
`;
}
function getHighestRisk(findings) {
    if (findings.some((finding) => finding.risk === "high"))
        return "high";
    if (findings.some((finding) => finding.risk === "medium"))
        return "medium";
    return "low";
}
function dedupeFindings(findings) {
    const seen = new Set();
    const deduped = [];
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
function extractIssueSummary(review) {
    const issueMatch = review.match(/ISSUE:\s*([\s\S]*?)(?:\n\s*IMPACT:|\n\s*SUGGESTION:|$)/i);
    const issueText = issueMatch?.[1] ?? review;
    const firstMeaningfulLine = issueText
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.length > 0);
    return firstMeaningfulLine ?? "Review finding needs attention.";
}
function formatKeyFindings(findings) {
    if (findings.length === 0) {
        return "No high-confidence issues were found in the reviewed changed functions.";
    }
    return findings
        .map((finding) => `* \`${finding.filePath}\`: ${finding.issue}`)
        .join("\n");
}
function formatRiskAnalysis(risk, findingCount) {
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
function formatNextSteps(risk, findingCount) {
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
function formatRisk(risk) {
    return risk[0].toUpperCase() + risk.slice(1);
}
function normalizeIssueText(issue) {
    return issue.toLowerCase().replace(/\s+/g, " ").trim();
}
