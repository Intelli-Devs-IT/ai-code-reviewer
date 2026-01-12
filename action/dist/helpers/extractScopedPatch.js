"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractScopedPatch = extractScopedPatch;
function extractScopedPatch(patch, anchorLine, contextLines = 20) {
    const lines = patch.split("\n");
    let currentLine = 0;
    let startIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("@@")) {
            const match = line.match(/\+(\d+)/);
            if (match) {
                currentLine = parseInt(match[1], 10) - 1;
            }
            continue;
        }
        if (!line.startsWith("-")) {
            currentLine++;
        }
        if (currentLine >= anchorLine) {
            startIndex = Math.max(0, i - contextLines);
            break;
        }
    }
    return lines.slice(startIndex, startIndex + contextLines * 2).join("\n");
}
