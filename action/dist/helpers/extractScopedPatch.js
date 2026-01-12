"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractScopedPatch = extractScopedPatch;
function extractScopedPatch(patch, anchorLine, contextLines = 20) {
    const lines = patch.split("\n");
    let currentLine = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("@@")) {
            const match = lines[i].match(/\+(\d+)/);
            if (match) {
                currentLine = parseInt(match[1], 10) - 1;
            }
            continue;
        }
        if (!lines[i].startsWith("-"))
            currentLine++;
        if (currentLine >= anchorLine) {
            return lines
                .slice(Math.max(0, i - contextLines), i + contextLines)
                .join("\n");
        }
    }
    return patch;
}
