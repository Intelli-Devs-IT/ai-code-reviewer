export function extractScopedPatch(
  patch: string,
  anchorLine: number,
  contextLines = 20
): string {
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

    if (!lines[i].startsWith("-")) currentLine++;

    if (currentLine >= anchorLine) {
      return lines
        .slice(Math.max(0, i - contextLines), i + contextLines)
        .join("\n");
    }
  }

  return patch;
}
