import { ReviewStrictness } from "../config";

export interface ChangedFunctionPromptOptions {
  functionText: string;
  patch: string;
  isFocusedContext: boolean;
  securityReviewEnabled?: boolean;
  reviewStrictness?: ReviewStrictness;
}

export interface ScopedReviewPromptOptions {
  fileName: string;
  targetLine: number;
  scopedPatch: string;
  securityReviewEnabled?: boolean;
  reviewStrictness?: ReviewStrictness;
}

export function buildChangedFunctionReviewPrompt({
  functionText,
  patch,
  isFocusedContext,
  securityReviewEnabled = false,
  reviewStrictness = "balanced",
}: ChangedFunctionPromptOptions): string {
  return `
You are a senior code reviewer.

Review ONLY the changed function below.

${isFocusedContext ? "You are reviewing a focused excerpt from a larger function. Review only the provided excerpt and relevant patch. Do not assume unseen code unless the issue is directly supported by the provided context." : ""}

${buildReviewRules(securityReviewEnabled, reviewStrictness, "function")}

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

export function buildScopedReviewPrompt({
  fileName,
  targetLine,
  scopedPatch,
  securityReviewEnabled = false,
  reviewStrictness = "balanced",
}: ScopedReviewPromptOptions): string {
  return `
You are a senior code reviewer.

${buildReviewRules(securityReviewEnabled, reviewStrictness, "scoped diff")}

Review ONLY the code below carefully and suggest improvements.

File: ${fileName}
Review starting at line: ${targetLine}

Diff:
${scopedPatch}
`;
}

function buildReviewRules(
  securityReviewEnabled: boolean,
  reviewStrictness: ReviewStrictness,
  reviewedScope: string
): string {
  const securityRules = securityReviewEnabled
    ? `
Security review mode is enabled.
- Prioritize security-sensitive issues first, including authentication bypass, authorization mistakes, missing permission checks, insecure direct object access, SQL/NoSQL injection, command injection, path traversal, XSS, SSRF, unsafe deserialization, secret leakage, token leakage, weak crypto, insecure randomness, unsafe file upload handling, unsafe user input handling, data exposure, privacy leaks, payment or transaction manipulation, dangerous admin operations, and destructive actions without validation.
- Severe non-security bugs may still be reported when they are clearly supported by the provided code.
`
    : "";

  const strictnessRules = buildStrictnessRules(reviewStrictness);

  return `Rules:
${securityRules}${strictnessRules}- Focus only on meaningful issues: real bugs, security vulnerabilities, authentication or authorization mistakes, unsafe data handling, null or undefined edge cases, broken async behavior, incorrect error handling, race conditions, data loss risks, incorrect business logic, or serious maintainability issues that can cause bugs.
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

function buildStrictnessRules(reviewStrictness: ReviewStrictness): string {
  if (reviewStrictness === "lenient") {
    return `Review strictness: lenient.
- Actively look for useful feedback on missing input validation, possible runtime errors, missing null or undefined guards, division by zero, weak error handling, confusing conditional logic, unsafe assumptions, maintainability problems that may lead to bugs, simple security or data-safety improvements, and incorrect or incomplete edge-case handling.
- Allow useful maintainability issues and clear refactoring suggestions when they are tied to a concrete behavior risk, safety improvement, or repeated practical problem.
- Testable improvements are acceptable when they are tied to a specific behavior risk.
- Medium-confidence reviews are acceptable when the issue is specific, useful, and directly supported by the reviewed code.
- Return NO_REVIEW only if the function is clearly correct and there is no useful bug, edge-case, safety, or maintainability feedback.
- Do not return NO_REVIEW just because the issue is not severe.
- Still avoid pure formatting, naming preference, generic cleanup, or subjective style comments.
`;
  }

  if (reviewStrictness === "strict") {
    return `Review strictness: strict.
- Only report high-confidence, high-impact issues: real bugs, security issues, data loss, authentication or permission mistakes, broken async behavior, serious logic errors, or maintainability risks likely to cause bugs.
- Skip weak style, refactor-only, speculative, or low-impact comments.
- Strongly prefer NO_REVIEW when the issue is not clearly meaningful and directly supported by the provided code.
`;
  }

  return `Review strictness: balanced.
- Use the default review bar: report meaningful bugs, edge cases, security issues, and serious maintainability issues while avoiding noisy comments.
`;
}
