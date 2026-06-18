import assert from "node:assert/strict";
import test from "node:test";

import { mergeReviewerConfig } from "../src/config";
import {
  createReviewLimitState,
  getFunctionReviewLimitSkip,
  getInlineCommentLimitSkip,
  getReviewLimits,
  recordAcceptedInlineComment,
  recordFunctionReviewAttempt,
  recordReviewLimitSkip,
} from "../src/helpers/reviewLimits";

test("review limits are read from config", () => {
  const limits = getReviewLimits(
    mergeReviewerConfig({
      review: {
        max_inline_comments: 4,
        max_functions_per_file: 2,
        max_total_functions: 8,
      },
    })
  );

  assert.deepEqual(limits, {
    maxInlineComments: 4,
    maxFunctionsPerFile: 2,
    maxTotalFunctions: 8,
  });
});

test("max_functions_per_file limits reviewed functions in one file", () => {
  const state = createReviewLimitState({
    maxInlineComments: 10,
    maxFunctionsPerFile: 2,
    maxTotalFunctions: 30,
  });

  assert.equal(
    getFunctionReviewLimitSkip({
      state,
      attemptedFunctionsForFile: 2,
    })?.reason,
    "max_functions_per_file_reached"
  );
});

test("max_total_functions limits reviewed functions across the PR", () => {
  const state = createReviewLimitState({
    maxInlineComments: 10,
    maxFunctionsPerFile: 5,
    maxTotalFunctions: 2,
  });

  recordFunctionReviewAttempt(state);
  recordFunctionReviewAttempt(state);

  assert.equal(
    getFunctionReviewLimitSkip({
      state,
      attemptedFunctionsForFile: 0,
    })?.reason,
    "max_total_functions_reached"
  );
});

test("max_inline_comments limits accepted inline findings", () => {
  const state = createReviewLimitState({
    maxInlineComments: 1,
    maxFunctionsPerFile: 5,
    maxTotalFunctions: 30,
  });

  recordAcceptedInlineComment(state);

  assert.equal(
    getFunctionReviewLimitSkip({
      state,
      attemptedFunctionsForFile: 0,
    })?.reason,
    "max_inline_comments_reached"
  );
  assert.equal(
    getInlineCommentLimitSkip(state)?.reason,
    "max_inline_comments_reached"
  );
});

test("NO_REVIEW-style attempts do not count as inline comments", () => {
  const state = createReviewLimitState({
    maxInlineComments: 1,
    maxFunctionsPerFile: 5,
    maxTotalFunctions: 30,
  });

  recordFunctionReviewAttempt(state);

  assert.equal(state.attemptedFunctionsTotal, 1);
  assert.equal(state.acceptedInlineComments, 0);
  assert.equal(getInlineCommentLimitSkip(state), null);
});

test("limit skips are tracked by reason", () => {
  const state = createReviewLimitState({
    maxInlineComments: 1,
    maxFunctionsPerFile: 2,
    maxTotalFunctions: 3,
  });

  recordReviewLimitSkip(state, "max_inline_comments_reached");
  recordReviewLimitSkip(state, "max_functions_per_file_reached", 2);
  recordReviewLimitSkip(state, "max_total_functions_reached");

  assert.equal(state.skippedByMaxInlineComments, 1);
  assert.equal(state.skippedByMaxFunctionsPerFile, 2);
  assert.equal(state.skippedByMaxTotalFunctions, 1);
});
