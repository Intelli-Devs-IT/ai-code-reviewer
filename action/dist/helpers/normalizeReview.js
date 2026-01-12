"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeReview = normalizeReview;
function normalizeReview(text) {
    // Keep only the first explanation + first suggestion block
    const explanationIdx = text.indexOf("Explanation:");
    const suggestionIdx = text.indexOf("```suggestion");
    if (explanationIdx !== -1 && suggestionIdx !== -1) {
        return (text.slice(0, suggestionIdx) + text.slice(suggestionIdx)).trim();
    }
    return text.trim();
}
