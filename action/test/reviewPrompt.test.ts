import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChangedFunctionReviewPrompt,
  buildScopedReviewPrompt,
} from "../src/helpers/reviewPrompt";
import { prepareReviewForScoring } from "../src/helpers/reviewOutput";

test("security mode prompt includes security-specific priorities", () => {
  const prompt = buildChangedFunctionReviewPrompt({
    functionText: "function updateUser() { return true; }",
    patch: "@@ -1 +1 @@",
    isFocusedContext: false,
    securityReviewEnabled: true,
  });

  assert.match(prompt, /Security review mode is enabled/);
  assert.match(prompt, /authentication bypass/);
  assert.match(prompt, /SQL\/NoSQL injection/);
  assert.match(prompt, /path traversal/);
  assert.match(prompt, /SSRF/);
});

test("normal mode prompt does not enable security-specific mode", () => {
  const prompt = buildChangedFunctionReviewPrompt({
    functionText: "function updateUser() { return true; }",
    patch: "@@ -1 +1 @@",
    isFocusedContext: false,
  });

  assert.doesNotMatch(prompt, /Security review mode is enabled/);
  assert.doesNotMatch(prompt, /authentication bypass/);
});

test("security mode keeps NO_REVIEW behavior", () => {
  const prompt = buildScopedReviewPrompt({
    fileName: "src/auth.ts",
    targetLine: 10,
    scopedPatch: "@@ -10 +10 @@\n+return user;",
    securityReviewEnabled: true,
  });

  assert.match(prompt, /return exactly: NO_REVIEW/);
  assert.equal(prepareReviewForScoring("NO_REVIEW"), null);
});

test("lenient strictness allows useful maintainability feedback", () => {
  const prompt = buildChangedFunctionReviewPrompt({
    functionText: "function updateUser() { return true; }",
    patch: "@@ -1 +1 @@",
    isFocusedContext: false,
    reviewStrictness: "lenient",
  });

  assert.match(prompt, /Review strictness: lenient/);
  assert.match(prompt, /useful maintainability issues/);
  assert.match(prompt, /Medium-confidence reviews are acceptable/);
  assert.match(prompt, /missing input validation/);
  assert.match(prompt, /division by zero/);
  assert.match(prompt, /missing null or undefined guards/);
  assert.match(prompt, /specific behavior risk/);
});

test("lenient strictness does not encourage NO_REVIEW too easily", () => {
  const prompt = buildChangedFunctionReviewPrompt({
    functionText: "function divide(a, b) { return a / b; }",
    patch: "@@ -1 +1 @@",
    isFocusedContext: false,
    reviewStrictness: "lenient",
  });

  assert.match(
    prompt,
    /Return NO_REVIEW only if the function is clearly correct/
  );
  assert.match(
    prompt,
    /Do not return NO_REVIEW just because the issue is not severe/
  );
});

test("balanced strictness keeps default review bar", () => {
  const prompt = buildChangedFunctionReviewPrompt({
    functionText: "function updateUser() { return true; }",
    patch: "@@ -1 +1 @@",
    isFocusedContext: false,
    reviewStrictness: "balanced",
  });

  assert.match(prompt, /Review strictness: balanced/);
  assert.match(prompt, /default review bar/);
});

test("strict strictness requires high-impact issues", () => {
  const prompt = buildChangedFunctionReviewPrompt({
    functionText: "function updateUser() { return true; }",
    patch: "@@ -1 +1 @@",
    isFocusedContext: false,
    reviewStrictness: "strict",
  });

  assert.match(prompt, /Review strictness: strict/);
  assert.match(prompt, /Only report high-confidence, high-impact issues/);
  assert.match(prompt, /Strongly prefer NO_REVIEW/);
});

test("NO_REVIEW instruction is preserved in all strictness modes", () => {
  for (const reviewStrictness of ["lenient", "balanced", "strict"] as const) {
    const prompt = buildChangedFunctionReviewPrompt({
      functionText: "function updateUser() { return true; }",
      patch: "@@ -1 +1 @@",
      isFocusedContext: false,
      reviewStrictness,
    });

    assert.match(prompt, /return exactly: NO_REVIEW/);
  }
});

test("security mode combines with strict review mode", () => {
  const prompt = buildScopedReviewPrompt({
    fileName: "src/admin.ts",
    targetLine: 12,
    scopedPatch: "@@ -12 +12 @@\n+deleteUser(userId);",
    securityReviewEnabled: true,
    reviewStrictness: "strict",
  });

  assert.match(prompt, /Security review mode is enabled/);
  assert.match(prompt, /authentication bypass/);
  assert.match(prompt, /Review strictness: strict/);
  assert.match(prompt, /Only report high-confidence, high-impact issues/);
});

test("focused large-function prompt explains excerpt limitations", () => {
  const prompt = buildChangedFunctionReviewPrompt({
    functionText: "function large() { return true; }",
    patch: "@@ -20 +20 @@",
    isFocusedContext: true,
  });

  assert.match(prompt, /focused excerpt from a larger function/);
  assert.match(prompt, /Do not assume unseen code/);
});

test("prompt includes external analysis evidence when available", () => {
  const prompt = buildChangedFunctionReviewPrompt({
    functionText: "function login() { return true; }",
    patch: "@@ -1 +1 @@",
    isFocusedContext: false,
    externalAnalysisEvidence:
      "* [semgrep:error] line 42 no-hardcoded-secrets: Possible hardcoded secret.",
  });

  assert.match(prompt, /External Analysis Evidence:/);
  assert.match(prompt, /\[semgrep:error\] line 42/);
  assert.match(prompt, /supporting evidence, not automatic truth/);
  assert.match(prompt, /Do not repeat tool output blindly/);
  assert.match(prompt, /Still return NO_REVIEW/);
});

test("prompt omits external analysis evidence when none exists", () => {
  const prompt = buildChangedFunctionReviewPrompt({
    functionText: "function login() { return true; }",
    patch: "@@ -1 +1 @@",
    isFocusedContext: false,
  });

  assert.doesNotMatch(prompt, /External Analysis Evidence:/);
});
