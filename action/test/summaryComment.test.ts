import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSummaryBody,
  createSummaryFinding,
  SUMMARY_MARKER,
} from "../src/helpers/summaryComment";
import {
  createReviewLimitState,
  recordReviewLimitSkip,
} from "../src/helpers/reviewLimits";

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

test("all quota-failed provider calls produce unknown-risk summary", () => {
  const body = buildSummaryBody({
    reviewedFilePaths: new Set(),
    findings: [],
    providerFailures: [
      {
        filePath: "src/a.ts",
        functionName: "loadUser",
        provider: "huggingface",
        model: "Qwen/Qwen2.5-Coder-32B-Instruct:nscale",
        type: "quota_exceeded",
        message: "402 Payment Required",
      },
    ],
  });

  assert.match(body, /Files Reviewed: 0/);
  assert.match(body, /Inline Findings: 0/);
  assert.match(body, /Overall Risk: Unknown/);
  assert.match(
    body,
    /AI review could not be completed because the model provider quota was exhausted\./
  );
  assert.match(
    body,
    /Hugging Face quota exceeded for model Qwen\/Qwen2\.5-Coder-32B-Instruct:nscale/
  );
  assert.match(body, /Add Hugging Face prepaid credits/);
});

test("mixed success and provider failure summary mentions partial review", () => {
  const body = buildSummaryBody({
    reviewedFilePaths: new Set(["src/a.ts"]),
    findings: [createFinding("src/a.ts", "ISSUE:\nAccepted issue.", "low")],
    providerFailures: [
      {
        filePath: "src/b.ts",
        provider: "huggingface",
        model: "Qwen/Qwen2.5-Coder-32B-Instruct:nscale",
        type: "quota_exceeded",
        message: "402 Payment Required",
      },
    ],
  });

  assert.match(body, /Files Reviewed: 1/);
  assert.match(body, /Inline Findings: 1/);
  assert.match(body, /Overall Risk: Low/);
  assert.match(body, /Some changed functions were not reviewed/);
  assert.match(body, /Resolve provider access issues and rerun the workflow/);
});

test("skip behavior keeps provider failure summary concise", () => {
  const body = buildSummaryBody({
    reviewedFilePaths: new Set(["src/a.ts"]),
    findings: [],
    providerFailureBehavior: "skip",
    providerFailures: [
      {
        filePath: "src/b.ts",
        provider: "openrouter",
        model: "custom/model",
        type: "network_error",
        message: "fetch failed",
      },
    ],
  });

  assert.match(
    body,
    /Some provider calls failed, so the AI review may be incomplete\./
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

test("summary mentions review limits when limits are reached", () => {
  const reviewLimits = createReviewLimitState({
    maxInlineComments: 5,
    maxFunctionsPerFile: 5,
    maxTotalFunctions: 25,
  });
  recordReviewLimitSkip(reviewLimits, "max_total_functions_reached", 2);

  const body = buildSummaryBody({
    reviewedFilePaths: new Set(["src/a.ts"]),
    findings: [],
    reviewLimits,
  });

  assert.match(body, /## Review Limits/);
  assert.match(
    body,
    /Some changed functions were skipped because configured review limits were reached\./
  );
  assert.match(body, /\* Max inline comments: 5/);
  assert.match(body, /\* Max functions per file: 5/);
  assert.match(body, /\* Max total functions: 25/);
  assert.match(body, /Overall Risk: Low/);
  assert.match(body, /review coverage was partial/);
});

test("summary includes external analysis counts when reports are loaded", () => {
  const body = buildSummaryBody({
    reviewedFilePaths: new Set(["src/a.ts"]),
    findings: [],
    externalAnalysis: {
      findings: [
        {
          tool: "lint",
          filePath: "src/a.ts",
          severity: "warning",
          message: "lint issue",
        },
        {
          tool: "semgrep",
          filePath: "src/a.ts",
          severity: "error",
          message: "semgrep issue",
        },
        {
          tool: "tests",
          filePath: "src/a.test.ts",
          severity: "error",
          message: "test issue",
        },
      ],
      loadWarnings: ["missing optional report"],
    },
  });

  assert.match(body, /## External Analysis/);
  assert.match(body, /\* Lint findings loaded: 1/);
  assert.match(body, /\* Semgrep findings loaded: 1/);
  assert.match(body, /\* Test findings loaded: 1/);
  assert.match(body, /\* Report warnings: 1/);
  assert.doesNotMatch(body, /missing optional report/);
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
