"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReviewLimits = getReviewLimits;
exports.createReviewLimitState = createReviewLimitState;
exports.getFunctionReviewLimitSkip = getFunctionReviewLimitSkip;
exports.getInlineCommentLimitSkip = getInlineCommentLimitSkip;
exports.recordFunctionReviewAttempt = recordFunctionReviewAttempt;
exports.recordAcceptedInlineComment = recordAcceptedInlineComment;
exports.recordReviewLimitSkip = recordReviewLimitSkip;
exports.hasReviewLimitSkips = hasReviewLimitSkips;
exports.getTotalReviewLimitSkips = getTotalReviewLimitSkips;
const config_1 = require("../config");
function getReviewLimits(config) {
    return {
        maxInlineComments: config.review?.max_inline_comments ?? config_1.DEFAULT_MAX_INLINE_COMMENTS,
        maxFunctionsPerFile: config.review?.max_functions_per_file ?? config_1.DEFAULT_MAX_FUNCTIONS_PER_FILE,
        maxTotalFunctions: config.review?.max_total_functions ?? config_1.DEFAULT_MAX_TOTAL_FUNCTIONS,
    };
}
function createReviewLimitState(limits) {
    return {
        ...limits,
        attemptedFunctionsTotal: 0,
        acceptedInlineComments: 0,
        skippedByMaxInlineComments: 0,
        skippedByMaxFunctionsPerFile: 0,
        skippedByMaxTotalFunctions: 0,
    };
}
function getFunctionReviewLimitSkip(params) {
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
function getInlineCommentLimitSkip(state) {
    if (state.acceptedInlineComments < state.maxInlineComments) {
        return null;
    }
    return {
        reason: "max_inline_comments_reached",
        limit: state.maxInlineComments,
    };
}
function recordFunctionReviewAttempt(state) {
    state.attemptedFunctionsTotal += 1;
}
function recordAcceptedInlineComment(state) {
    state.acceptedInlineComments += 1;
}
function recordReviewLimitSkip(state, reason, count = 1) {
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
function hasReviewLimitSkips(state) {
    return getTotalReviewLimitSkips(state) > 0;
}
function getTotalReviewLimitSkips(state) {
    return (state.skippedByMaxInlineComments +
        state.skippedByMaxFunctionsPerFile +
        state.skippedByMaxTotalFunctions);
}
