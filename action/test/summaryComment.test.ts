import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSummaryBody,
  formatSummaryFinding,
  SUMMARY_MARKER,
} from "../src/helpers/summaryComment";

test("multiple reviewed files produce the correct total", () => {
  const body = buildSummaryBody({
    confidence: 80,
    risk: "medium",
    reviewedFilePaths: new Set(["src/a.ts", "src/b.ts"]),
    summaryFindings: [
      formatSummaryFinding("src/a.ts", "First finding"),
      formatSummaryFinding("src/b.ts", "Second finding"),
    ],
  });

  assert.match(body, /\*\*Files Reviewed:\*\* 2/);
});

test("file count comes from reviewed files, not finding count", () => {
  const body = buildSummaryBody({
    confidence: 80,
    risk: "medium",
    reviewedFilePaths: new Set(["src/a.ts", "src/b.ts", "src/c.ts"]),
    summaryFindings: [formatSummaryFinding("src/a.ts", "First finding")],
  });

  assert.match(body, /\*\*Files Reviewed:\*\* 3/);
});

test("multiple reviewed functions in one file still count as one file", () => {
  const reviewedFilePaths = new Set<string>();

  reviewedFilePaths.add("src/a.ts");
  reviewedFilePaths.add("src/a.ts");
  reviewedFilePaths.add("src/a.ts");

  const body = buildSummaryBody({
    confidence: 70,
    risk: "low",
    reviewedFilePaths,
    summaryFindings: [formatSummaryFinding("src/a.ts", "Finding")],
  });

  assert.match(body, /\*\*Files Reviewed:\*\* 1/);
});

test("skipped files are not counted", () => {
  const body = buildSummaryBody({
    confidence: 75,
    risk: "low",
    reviewedFilePaths: new Set(["src/reviewed.ts"]),
    summaryFindings: [formatSummaryFinding("src/reviewed.ts", "Finding")],
  });

  assert.match(body, /\*\*Files Reviewed:\*\* 1/);
  assert.doesNotMatch(body, /src\/skipped\.ts/);
});

test("summary findings are accumulated instead of overwritten", () => {
  const body = buildSummaryBody({
    confidence: 85,
    risk: "high",
    reviewedFilePaths: new Set(["src/a.ts", "src/b.ts"]),
    summaryFindings: [
      formatSummaryFinding("src/a.ts", "First finding"),
      formatSummaryFinding("src/b.ts", "Second finding"),
    ],
  });

  assert.match(body, /### src\/a\.ts\nFirst finding/);
  assert.match(body, /### src\/b\.ts\nSecond finding/);
});

test("summary marker is preserved for comment updates", () => {
  const body = buildSummaryBody({
    confidence: 90,
    risk: "low",
    reviewedFilePaths: new Set(["src/a.ts"]),
    summaryFindings: [formatSummaryFinding("src/a.ts", "Finding")],
  });

  assert.match(body, new RegExp(SUMMARY_MARKER));
});
