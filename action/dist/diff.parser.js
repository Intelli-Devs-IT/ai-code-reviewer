"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractLineNumbersFromPatch = extractLineNumbersFromPatch;
function extractLineNumbersFromPatch(patch) {
    const lines = patch.split("\n");
    const commentLines = [];
    let newLineNumber = 0;
    let inHunk = false;
    let foundInCurrentHunk = false;
    for (const line of lines) {
        // Start of a new hunk
        if (line.startsWith("@@")) {
            const match = line.match(/\+(\d+)/);
            if (match) {
                newLineNumber = parseInt(match[1], 10) - 1;
                inHunk = true;
                foundInCurrentHunk = false;
            }
            continue;
        }
        if (!inHunk)
            continue;
        // Increment new-file line count for context or added lines
        if (!line.startsWith("-")) {
            newLineNumber++;
        }
        // First added line in this hunk → record it
        if (line.startsWith("+") &&
            !line.startsWith("+++") &&
            !foundInCurrentHunk) {
            commentLines.push(newLineNumber);
            foundInCurrentHunk = true;
        }
    }
    return commentLines;
}
