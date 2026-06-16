import assert from "node:assert/strict";
import test from "node:test";

import { normalizeReview } from "../src/helpers/normalizeReview";
import {
  cleanModelOutput,
  prepareReviewForScoring,
  prepareReviewWithDiagnostics,
  shouldSkipReview,
} from "../src/helpers/reviewOutput";

test("skips NO_REVIEW output", () => {
  assert.equal(shouldSkipReview("NO_REVIEW"), true);
  assert.equal(prepareReviewForScoring("NO_REVIEW"), null);
  assert.equal(
    prepareReviewWithDiagnostics("NO_REVIEW").skipReason,
    "llm_returned_no_review"
  );
});

test("skips empty and whitespace output", () => {
  assert.equal(shouldSkipReview(""), true);
  assert.equal(shouldSkipReview("   "), true);
  assert.equal(prepareReviewForScoring("   "), null);
  assert.equal(
    prepareReviewWithDiagnostics("   ").skipReason,
    "llm_empty_output"
  );
});

test("handles cleaned think output before skip filtering", () => {
  const cleaned = cleanModelOutput("<think>private reasoning</think>\nNO_REVIEW");

  assert.equal(cleaned, "NO_REVIEW");
  assert.equal(
    prepareReviewForScoring("<think>private reasoning</think>\nNO_REVIEW"),
    null
  );
  assert.equal(
    prepareReviewWithDiagnostics("<think>private reasoning</think>").skipReason,
    "cleaned_output_empty"
  );
});

test("does not skip a real issue", () => {
  const review = "ISSUE:\nPossible null access.\n\nIMPACT:\nThis can throw.";

  assert.equal(shouldSkipReview(review), false);
  assert.equal(prepareReviewForScoring(review), review);
});

test("skips generic no-issue text", () => {
  assert.equal(shouldSkipReview("No meaningful issue found."), true);
  assert.equal(prepareReviewForScoring("No meaningful issue found."), null);
});

test("normalizes multiple suggestion blocks to the first block", () => {
  const review = `ISSUE:
Bad state update.

IMPACT:
The second update can overwrite the first.

SUGGESTION:
\`\`\`suggestion
setCount((count) => count + 1);
\`\`\`

\`\`\`suggestion
setOther((value) => value + 1);
\`\`\``;

  const normalized = normalizeReview(review);

  assert.match(normalized, /setCount/);
  assert.doesNotMatch(normalized, /setOther/);
});
