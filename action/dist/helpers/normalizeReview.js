"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeReview = normalizeReview;
function normalizeReview(text) {
    const trimmed = text.trim();
    const firstSuggestionIdx = trimmed.indexOf("```suggestion");
    if (firstSuggestionIdx === -1) {
        return trimmed;
    }
    const firstSuggestionEndIdx = trimmed.indexOf("```", firstSuggestionIdx + "```suggestion".length);
    if (firstSuggestionEndIdx === -1) {
        return trimmed.slice(0, firstSuggestionIdx).trim();
    }
    return trimmed.slice(0, firstSuggestionEndIdx + "```".length).trim();
}
