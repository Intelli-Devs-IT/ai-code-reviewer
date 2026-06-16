"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanModelOutput = cleanModelOutput;
exports.shouldSkipReview = shouldSkipReview;
exports.getSafeReviewPreview = getSafeReviewPreview;
exports.prepareReviewWithDiagnostics = prepareReviewWithDiagnostics;
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
function getSafeReviewPreview(review, maxLength = 200) {
    if (!review) {
        return "";
    }
    return review.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
function prepareReviewWithDiagnostics(rawReview) {
    if (!rawReview || !rawReview.trim()) {
        return {
            review: null,
            skipReason: "llm_empty_output",
            preview: getSafeReviewPreview(rawReview),
        };
    }
    const cleaned = cleanModelOutput(rawReview);
    if (!cleaned || !cleaned.trim()) {
        return {
            review: null,
            skipReason: "cleaned_output_empty",
            preview: getSafeReviewPreview(rawReview),
            cleanedPreview: getSafeReviewPreview(cleaned),
        };
    }
    const normalized = (0, normalizeReview_1.normalizeReview)(cleaned);
    if (!normalized || !normalized.trim()) {
        return {
            review: null,
            skipReason: "normalized_output_empty",
            preview: getSafeReviewPreview(rawReview),
            cleanedPreview: getSafeReviewPreview(cleaned),
            normalizedPreview: getSafeReviewPreview(normalized),
        };
    }
    if (shouldSkipReview(normalized)) {
        const normalizedLower = normalized.trim().toLowerCase();
        return {
            review: null,
            skipReason: normalizedLower === "no_review"
                ? "llm_returned_no_review"
                : "should_skip_review",
            preview: getSafeReviewPreview(rawReview),
            cleanedPreview: getSafeReviewPreview(cleaned),
            normalizedPreview: getSafeReviewPreview(normalized),
        };
    }
    return {
        review: normalized,
        preview: getSafeReviewPreview(rawReview),
        cleanedPreview: getSafeReviewPreview(cleaned),
        normalizedPreview: getSafeReviewPreview(normalized),
    };
}
function prepareReviewForScoring(rawReview) {
    return prepareReviewWithDiagnostics(rawReview).review;
}
