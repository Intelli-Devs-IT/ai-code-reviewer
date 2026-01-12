export function findFunctionStartLine(
  patch: string,
  targetLine: number
): number {
  const lines = patch.split("\n");
  let currentLine = 0;

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

    if (currentLine >= targetLine) {
      // walk backwards
      for (let j = i; j >= 0; j--) {
        const l = lines[j];
        if (
          l.includes("function ") ||
          l.includes("=>") ||
          l.includes("async ") ||
          l.includes("class ")
        ) {
          return currentLine;
        }
      }
    }
  }

  return targetLine; // fallback
}
