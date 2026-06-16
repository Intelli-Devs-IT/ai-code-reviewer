import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSummaryBody,
  createSummaryFinding,
  SUMMARY_MARKER,
} from "../src/helpers/summaryComment";

test("summary includes correct files reviewed count", () => {
  const body = buildSummaryBody({
    reviewedFilePaths: new Set(["src/a.ts", "src/b.ts"]),
    findings: [
      createFinding("src/a.ts", "ISSUE:\nFirst issue.", "low"),
      createFinding("src/b.ts", "ISSUE:\nSecond issue.", "medium"),
    ],
  });

  assert.match(body, /Files Reviewed: 2/);
});

test("summary includes correct inline findings count", () => {
  const body = buildSummaryBody({
    reviewedFilePaths: new Set(["src/a.ts", "src/b.ts"]),
    findings: [
      createFinding("src/a.ts", "ISSUE:\nFirst issue.", "low"),
      createFinding("src/b.ts", "ISSUE:\nSecond issue.", "low"),
    ],
  });

  assert.match(body, /Inline Findings: 2/);
});

test("summary includes findings from multiple files", () => {
  const body = buildSummaryBody({
    reviewedFilePaths: new Set(["src/a.ts", "src/b.ts"]),
    findings: [
      createFinding("src/a.ts", "ISSUE:\nFirst issue.", "low"),
      createFinding("src/b.ts", "ISSUE:\nSecond issue.", "low"),
    ],
  });

  assert.match(body, /\* `src\/a\.ts`: First issue\./);
  assert.match(body, /\* `src\/b\.ts`: Second issue\./);
});

test("summary does not duplicate repeated findings", () => {
  const duplicateReview = "ISSUE:\nRepeated null access risk.";
  const body = buildSummaryBody({
    reviewedFilePaths: new Set(["src/a.ts"]),
    findings: [
      createFinding("src/a.ts", duplicateReview, "medium", "loadUser"),
      createFinding("src/a.ts", duplicateReview, "medium", "loadUser"),
    ],
  });

  assert.match(body, /Inline Findings: 1/);
});

test("summary risk becomes high if any finding is high risk", () => {
  const body = buildSummaryBody({
    reviewedFilePaths: new Set(["src/a.ts", "src/b.ts"]),
    findings: [
      createFinding("src/a.ts", "ISSUE:\nLow issue.", "low"),
      createFinding("src/b.ts", "ISSUE:\nHigh issue.", "high"),
    ],
  });

  assert.match(body, /Overall Risk: High/);
});

test("summary risk becomes medium when medium findings exist without high findings", () => {
  const body = buildSummaryBody({
    reviewedFilePaths: new Set(["src/a.ts", "src/b.ts"]),
    findings: [
      createFinding("src/a.ts", "ISSUE:\nLow issue.", "low"),
      createFinding("src/b.ts", "ISSUE:\nMedium issue.", "medium"),
    ],
  });

  assert.match(body, /Overall Risk: Medium/);
});

test("summary risk stays low when there are no findings", () => {
  const body = buildSummaryBody({
    reviewedFilePaths: new Set(["src/a.ts"]),
    findings: [],
  });

  assert.match(body, /Overall Risk: Low/);
});

test("summary marker is preserved for comment updates", () => {
  const body = buildSummaryBody({
    reviewedFilePaths: new Set(["src/a.ts"]),
    findings: [],
  });

  assert.match(body, new RegExp(SUMMARY_MARKER));
});

test("no-finding summary message is shown when appropriate", () => {
  const body = buildSummaryBody({
    reviewedFilePaths: new Set(["src/a.ts"]),
    findings: [],
  });

  assert.match(
    body,
    /No high-confidence issues were found in the reviewed changed functions\./
  );
});

test("multiple reviewed functions in one file still count as one file", () => {
  const body = buildSummaryBody({
    reviewedFilePaths: new Set(["src/a.ts"]),
    findings: [
      createFinding("src/a.ts", "ISSUE:\nFirst issue.", "low", "first"),
      createFinding("src/a.ts", "ISSUE:\nSecond issue.", "low", "second"),
    ],
  });

  assert.match(body, /Files Reviewed: 1/);
  assert.match(body, /Inline Findings: 2/);
});

function createFinding(
  filePath: string,
  review: string,
  risk: "low" | "medium" | "high",
  functionName?: string
) {
  return createSummaryFinding({
    filePath,
    functionName,
    review,
    risk,
  });
}
