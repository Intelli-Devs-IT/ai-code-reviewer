/* ===========================
 * Get Changed Lines from Patch
 * =========================== */
export function getChangedLines(patch: string): number[] {
  const lines = patch.split("\n");
  const changedLines: number[] = [];

  let currentLine = 0;

  for (const line of lines) {
    // Hunk header: @@ -a,b +c,d @@
    if (line.startsWith("@@")) {
      const match = line.match(/\+(\d+)/);
      if (match) {
        currentLine = parseInt(match[1], 10) - 1;
      }
      continue;
    }

    // Removed lines don't advance the new-file line counter
    if (line.startsWith("-")) {
      continue;
    }

    // Added line
    if (line.startsWith("+")) {
      currentLine++;
      changedLines.push(currentLine);
      continue;
    }

    // Context line
    currentLine++;
  }

  return changedLines;
}
