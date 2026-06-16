import { ExtractedFunction } from "../utils/ast-function-extractor";

export interface FunctionReviewTarget {
  fn: ExtractedFunction;
  key: string;
  commentLine: number;
}

export function findChangedFunctions(
  functions: ExtractedFunction[],
  changedLines: number[]
): ExtractedFunction[] {
  return functions.filter((fn) =>
    changedLines.some((line) => line >= fn.startLine && line <= fn.endLine)
  );
}

export function getFunctionReviewKey(
  fileName: string,
  fn: ExtractedFunction
): string {
  return `${fileName}:${fn.name}:${fn.startLine}:${fn.endLine}`;
}

export function getCommentLineForFunction(
  fn: ExtractedFunction,
  changedLines: number[]
): number {
  if (changedLines.includes(fn.startLine)) {
    return fn.startLine;
  }

  return (
    changedLines.find((line) => line >= fn.startLine && line <= fn.endLine) ??
    fn.startLine
  );
}

export function getFunctionReviewTargets(
  fileName: string,
  functions: ExtractedFunction[],
  changedLines: number[],
  reviewedKeys: Set<string>
): FunctionReviewTarget[] {
  const targets: FunctionReviewTarget[] = [];

  for (const fn of findChangedFunctions(functions, changedLines)) {
    const key = getFunctionReviewKey(fileName, fn);

    if (reviewedKeys.has(key)) {
      continue;
    }

    reviewedKeys.add(key);
    targets.push({
      fn,
      key,
      commentLine: getCommentLineForFunction(fn, changedLines),
    });
  }

  return targets;
}

export function shouldUseScopedReviewFallback(
  functions: ExtractedFunction[]
): boolean {
  return functions.length === 0;
}
