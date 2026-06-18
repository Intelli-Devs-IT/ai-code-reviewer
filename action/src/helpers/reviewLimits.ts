import {
  DEFAULT_MAX_FUNCTIONS_PER_FILE,
  DEFAULT_MAX_INLINE_COMMENTS,
  DEFAULT_MAX_TOTAL_FUNCTIONS,
  ReviewerConfig,
} from "../config";

export type ReviewLimitSkipReason =
  | "max_inline_comments_reached"
  | "max_functions_per_file_reached"
  | "max_total_functions_reached";

export interface ReviewLimits {
  maxInlineComments: number;
  maxFunctionsPerFile: number;
  maxTotalFunctions: number;
}

export interface ReviewLimitState extends ReviewLimits {
  attemptedFunctionsTotal: number;
  acceptedInlineComments: number;
  skippedByMaxInlineComments: number;
  skippedByMaxFunctionsPerFile: number;
  skippedByMaxTotalFunctions: number;
}

export interface ReviewLimitSkip {
  reason: ReviewLimitSkipReason;
  limit: number;
}

export function getReviewLimits(config: ReviewerConfig): ReviewLimits {
  return {
    maxInlineComments:
      config.review?.max_inline_comments ?? DEFAULT_MAX_INLINE_COMMENTS,
    maxFunctionsPerFile:
      config.review?.max_functions_per_file ?? DEFAULT_MAX_FUNCTIONS_PER_FILE,
    maxTotalFunctions:
      config.review?.max_total_functions ?? DEFAULT_MAX_TOTAL_FUNCTIONS,
  };
}

export function createReviewLimitState(
  limits: ReviewLimits,
): ReviewLimitState {
  return {
    ...limits,
    attemptedFunctionsTotal: 0,
    acceptedInlineComments: 0,
    skippedByMaxInlineComments: 0,
    skippedByMaxFunctionsPerFile: 0,
    skippedByMaxTotalFunctions: 0,
  };
}

export function getFunctionReviewLimitSkip(params: {
  state: ReviewLimitState;
  attemptedFunctionsForFile: number;
}): ReviewLimitSkip | null {
  const { state } = params;

  if (state.acceptedInlineComments >= state.maxInlineComments) {
    return {
      reason: "max_inline_comments_reached",
      limit: state.maxInlineComments,
    };
  }

  if (state.attemptedFunctionsTotal >= state.maxTotalFunctions) {
    return {
      reason: "max_total_functions_reached",
      limit: state.maxTotalFunctions,
    };
  }

  if (params.attemptedFunctionsForFile >= state.maxFunctionsPerFile) {
    return {
      reason: "max_functions_per_file_reached",
      limit: state.maxFunctionsPerFile,
    };
  }

  return null;
}

export function getInlineCommentLimitSkip(
  state: ReviewLimitState,
): ReviewLimitSkip | null {
  if (state.acceptedInlineComments < state.maxInlineComments) {
    return null;
  }

  return {
    reason: "max_inline_comments_reached",
    limit: state.maxInlineComments,
  };
}

export function recordFunctionReviewAttempt(
  state: ReviewLimitState,
): void {
  state.attemptedFunctionsTotal += 1;
}

export function recordAcceptedInlineComment(
  state: ReviewLimitState,
): void {
  state.acceptedInlineComments += 1;
}

export function recordReviewLimitSkip(
  state: ReviewLimitState,
  reason: ReviewLimitSkipReason,
  count = 1,
): void {
  switch (reason) {
    case "max_inline_comments_reached":
      state.skippedByMaxInlineComments += count;
      return;
    case "max_functions_per_file_reached":
      state.skippedByMaxFunctionsPerFile += count;
      return;
    case "max_total_functions_reached":
      state.skippedByMaxTotalFunctions += count;
      return;
  }
}

export function hasReviewLimitSkips(state: ReviewLimitState): boolean {
  return getTotalReviewLimitSkips(state) > 0;
}

export function getTotalReviewLimitSkips(state: ReviewLimitState): number {
  return (
    state.skippedByMaxInlineComments +
    state.skippedByMaxFunctionsPerFile +
    state.skippedByMaxTotalFunctions
  );
}
