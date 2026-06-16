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
