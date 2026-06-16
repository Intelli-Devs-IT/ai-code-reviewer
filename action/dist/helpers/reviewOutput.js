"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanModelOutput = cleanModelOutput;
exports.shouldSkipReview = shouldSkipReview;
exports.prepareReviewForScoring = prepareReviewForScoring;
const normalizeReview_1 = require("./normalizeReview");
const NO_REVIEW_RESPONSES = new Set([
    "no_review",
    "no meaningful issue found",
    "no meaningful issue found.",
    "no issue found",
    "no issue found.",
    "no issues found",
    "no issues found.",
    "no change required",
    "no change required.",
]);
function cleanModelOutput(text) {
    if (!text)
        return text;
    return text
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/^\s+|\s+$/g, "")
        .trim();
}
function shouldSkipReview(review) {
    const normalized = review.trim();
    if (!normalized) {
        return true;
    }
    const lower = normalized.toLowerCase();
    if (NO_REVIEW_RESPONSES.has(lower)) {
        return true;
    }
    return false;
}
function prepareReviewForScoring(rawReview) {
    const cleaned = cleanModelOutput(rawReview);
    const normalized = (0, normalizeReview_1.normalizeReview)(cleaned);
    return shouldSkipReview(normalized) ? null : normalized;
}
