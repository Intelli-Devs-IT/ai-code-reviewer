import assert from "node:assert/strict";
import test from "node:test";

import {
  extractFocusedFunctionContext,
  getFunctionReviewContext,
  getFunctionReviewTargets,
  LARGE_FUNCTION_LINE_THRESHOLD,
} from "../src/helpers/functionReviewTargets";
import { prepareReviewForScoring } from "../src/helpers/reviewOutput";
import { ExtractedFunction } from "../src/utils/ast-function-extractor";

test("normal-sized function uses full function text", () => {
  const fn = createFunction(1, LARGE_FUNCTION_LINE_THRESHOLD);
  const context = getFunctionReviewContext(fn, [40]);

  assert.equal(context.isFocused, false);
  assert.equal(context.focusedText, fn.text);
  assert.equal(context.focusedStartLine, fn.startLine);
  assert.equal(context.focusedEndLine, fn.endLine);
});

test("large function uses focused context", () => {
  const fn = createFunction(1, LARGE_FUNCTION_LINE_THRESHOLD + 20);
  const context = getFunctionReviewContext(fn, [50]);

  assert.equal(context.isFocused, true);
  assert.equal(context.focusedStartLine, 30);
  assert.equal(context.focusedEndLine, 70);
  assert.match(context.focusedText, /line 50/);
  assert.doesNotMatch(context.focusedText, /line 1$/m);
  assert.doesNotMatch(context.focusedText, /line 100$/m);
});

test("focused context includes changed lines and surrounding lines", () => {
  const fn = createFunction(1, 120);
  const context = extractFocusedFunctionContext(fn.text, 1, 120, [60], 2, 3);

  assert.equal(context.focusedStartLine, 58);
  assert.equal(context.focusedEndLine, 63);
  assert.match(context.focusedText, /line 58/);
  assert.match(context.focusedText, /line 60/);
  assert.match(context.focusedText, /line 63/);
});

test("focused context does not go outside function boundaries", () => {
  const fn = createFunction(10, 120);
  const context = extractFocusedFunctionContext(fn.text, 10, 120, [12], 20, 20);

  assert.equal(context.focusedStartLine, 10);
  assert.equal(context.focusedEndLine, 32);
  assert.match(context.focusedText, /line 10/);
  assert.match(context.focusedText, /line 12/);
  assert.doesNotMatch(context.focusedText, /line 9/);
});

test("multiple changed lines inside one large function still produce one review target", () => {
  const reviewedKeys = new Set<string>();
  const targets = getFunctionReviewTargets(
    "src/large.ts",
    [createFunction(1, 120)],
    [50, 60, 70],
    reviewedKeys
  );

  assert.equal(targets.length, 1);
});

test("inline comment line remains a changed line inside the function", () => {
  const [target] = getFunctionReviewTargets(
    "src/large.ts",
    [createFunction(1, 120)],
    [50, 60],
    new Set<string>()
  );

  assert.equal(target.commentLine, 50);
});

test("NO_REVIEW filtering still works with large function context", () => {
  const fn = createFunction(1, 120);
  const context = getFunctionReviewContext(fn, [50]);

  assert.equal(context.isFocused, true);
  assert.equal(prepareReviewForScoring("NO_REVIEW"), null);
});

function createFunction(startLine: number, endLine: number): ExtractedFunction {
  const text = Array.from(
    { length: endLine - startLine + 1 },
    (_, index) => `line ${startLine + index}`
  ).join("\n");

  return {
    name: "largeFunction",
    startLine,
    endLine,
    kind: "function",
    text,
  };
}
