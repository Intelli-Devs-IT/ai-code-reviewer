"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChangedLines = getChangedLines;
/* ===========================
 * Get Changed Lines from Patch
 * =========================== */
function getChangedLines(patch) {
    const lines = patch.split("\n");
    const changedLines = [];
    let newFileLineNum = 0;
    for (const line of lines) {
        if (line.startsWith("@@")) {
            const match = line.match(/\+(\d+)/);
            if (match) {
                newFileLineNum = parseInt(match[1], 10);
            }
            continue;
        }
        // Only count lines that exist in the new file
        if (!line.startsWith("-")) {
            if (line.startsWith("+") && !line.startsWith("+++")) {
                changedLines.push(newFileLineNum);
            }
            newFileLineNum++;
        }
    }
    return changedLines;
}
