import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const INDEX_SOURCE = readFileSync("src/index.ts", "utf8");

test("main review orchestration processes codeFiles in one loop", () => {
  const fileLoopMatches = INDEX_SOURCE.match(/for \(const file of codeFiles\)/g);

  assert.equal(fileLoopMatches?.length, 1);
});

test("no changed functions skip log has one call site", () => {
  const skipMatches = INDEX_SOURCE.match(/reason: "no_changed_functions_found"/g);

  assert.equal(skipMatches?.length, 1);
});

test("risk label application has one run-level call site", () => {
  const labelMatches = INDEX_SOURCE.match(/await applyRiskLabel/g);
  const labelIndex = INDEX_SOURCE.indexOf("await applyRiskLabel");
  const noReviewedFilesIndex = INDEX_SOURCE.indexOf(
    "if (reviewedFilePaths.size === 0)"
  );

  assert.equal(labelMatches?.length, 1);
  assert.ok(labelIndex > noReviewedFilesIndex);
});

test("source unavailable falls through to scoped review fallback", () => {
  assert.match(
    INDEX_SOURCE,
    /sourceCode === null\s*\?\s*\[\]\s*:\s*extractFunctionsFromSource/
  );
});

test("provider failures skip inline comment creation and continue", () => {
  const providerFailureBlocks = INDEX_SOURCE.match(
    /catch \(error\) \{[\s\S]*?reason: "provider_model_call_failed"[\s\S]*?continue;/g
  );

  assert.equal(providerFailureBlocks?.length, 2);

  for (const block of providerFailureBlocks ?? []) {
    assert.doesNotMatch(block, /createReviewComment/);
  }
});

test("risk label is skipped when only provider failures occurred", () => {
  const noReviewedFilesIndex = INDEX_SOURCE.indexOf(
    "if (reviewedFilePaths.size === 0 && providerFailures.length > 0)"
  );
  const labelIndex = INDEX_SOURCE.indexOf("await applyRiskLabel");

  assert.ok(noReviewedFilesIndex > -1);
  assert.ok(labelIndex > noReviewedFilesIndex);
});

test("provider failure fail behavior can fail after summary update", () => {
  assert.match(
    INDEX_SOURCE,
    /shouldFailForProviderFailures\(providerFailureBehavior, providerFailures\)[\s\S]*core\.setFailed/
  );
});

test("provider model logging includes provider and model", () => {
  assert.match(INDEX_SOURCE, /"Using provider model:"/);
  assert.match(INDEX_SOURCE, /`provider=\$\{primaryProviderName\}`/);
  assert.match(INDEX_SOURCE, /`model=\$\{inlineReviewModel\}`/);
});

test("main review calls use provider-aware model resolution", () => {
  assert.match(INDEX_SOURCE, /resolveModelForProviderFile/);
  assert.doesNotMatch(
    INDEX_SOURCE,
    /modelRoutingEnabled\s*\?\s*inlineReviewModel\s*:\s*DEFAULT_HUGGINGFACE_MODEL/
  );
});
