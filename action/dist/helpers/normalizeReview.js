"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeReview = normalizeReview;
function normalizeReview(text) {
    // remove duplicate explanation blocks
    const explanationIndex = text.indexOf("Explanation:");
    const suggestionIndex = text.indexOf("```suggestion");
    if (explanationIndex !== -1 && suggestionIndex !== -1) {
        return text.slice(0, suggestionIndex) + text.slice(suggestionIndex);
    }
    return text;
}
