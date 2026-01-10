"use strict";
function extractLineNumberFromPatch(patch) {
    const lines = patch.split("\n");
    let newLineNumber = 0;
    for (const line of lines) {
        // Hunk header
        if (line.startsWith("@@")) {
            const match = line.match(/\+(\d+)/);
            if (match) {
                newLineNumber = parseInt(match[1], 10) - 1;
            }
            continue;
        }
        // Context or added line increments new file line count
        if (!line.startsWith("-")) {
            newLineNumber++;
        }
        // Added line → valid comment target
        if (line.startsWith("+") && !line.startsWith("+++")) {
            return newLineNumber;
        }
    }
    return null;
}
