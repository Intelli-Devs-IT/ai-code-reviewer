/* ===========================
 * Get Changed Lines from Patch
 * =========================== */
export function getChangedLines(patch: string): number[] {
  const lines = patch.split("\n");
  const changedLines: number[] = [];
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
