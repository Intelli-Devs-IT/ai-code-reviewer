"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildChangedFunctionReviewPrompt = buildChangedFunctionReviewPrompt;
exports.buildScopedReviewPrompt = buildScopedReviewPrompt;
function buildChangedFunctionReviewPrompt({ functionText, patch, isFocusedContext, securityReviewEnabled = false, }) {
    return `
You are a senior code reviewer.

Review ONLY the changed function below.

${isFocusedContext ? "You are reviewing a focused excerpt from a larger function. Review only the provided excerpt and relevant patch. Do not assume unseen code unless the issue is directly supported by the provided context." : ""}

${buildReviewRules(securityReviewEnabled, "function")}

Changed function:

\`\`\`ts
${functionText}
\`\`\`

Relevant patch:

\`\`\`diff
${patch}
\`\`\`
`;
}
function buildScopedReviewPrompt({ fileName, targetLine, scopedPatch, securityReviewEnabled = false, }) {
    return `
You are a senior code reviewer.

${buildReviewRules(securityReviewEnabled, "scoped diff")}

Review ONLY the code below carefully and suggest improvements.

File: ${fileName}
Review starting at line: ${targetLine}

Diff:
${scopedPatch}
`;
}
function buildReviewRules(securityReviewEnabled, reviewedScope) {
    const securityRules = securityReviewEnabled
        ? `
Security review mode is enabled.
- Prioritize security-sensitive issues first, including authentication bypass, authorization mistakes, missing permission checks, insecure direct object access, SQL/NoSQL injection, command injection, path traversal, XSS, SSRF, unsafe deserialization, secret leakage, token leakage, weak crypto, insecure randomness, unsafe file upload handling, unsafe user input handling, data exposure, privacy leaks, payment or transaction manipulation, dangerous admin operations, and destructive actions without validation.
- Severe non-security bugs may still be reported when they are clearly supported by the provided code.
`
        : "";
    return `Rules:
${securityRules}- Focus only on meaningful issues: real bugs, security vulnerabilities, authentication or authorization mistakes, unsafe data handling, null or undefined edge cases, broken async behavior, incorrect error handling, race conditions, data loss risks, incorrect business logic, or serious maintainability issues that can cause bugs.
- Avoid comments about formatting, naming preference, minor style choices, harmless refactoring, subjective readability, missing comments, or generic "add tests" advice unless a specific bug risk exists.
- Do not review unchanged code, unrelated code, or code outside this ${reviewedScope}.
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
Optional GitHub suggestion block only if safe and exact.`;
}
