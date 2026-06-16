import { ExtractedFunction } from "../utils/ast-function-extractor";

export const LARGE_FUNCTION_LINE_THRESHOLD = 80;
const DEFAULT_FOCUSED_CONTEXT_LINES = 20;

export interface FunctionReviewTarget {
  fn: ExtractedFunction;
  key: string;
  commentLine: number;
}

export interface FocusedFunctionContext {
  focusedText: string;
  focusedStartLine: number;
  focusedEndLine: number;
}

export interface FunctionReviewContext extends FocusedFunctionContext {
  isFocused: boolean;
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

export function getFunctionLineCount(fn: ExtractedFunction): number {
  return fn.endLine - fn.startLine + 1;
}

export function extractFocusedFunctionContext(
  functionText: string,
  functionStartLine: number,
  functionEndLine: number,
  changedLines: number[],
  contextLinesBefore = DEFAULT_FOCUSED_CONTEXT_LINES,
  contextLinesAfter = DEFAULT_FOCUSED_CONTEXT_LINES
): FocusedFunctionContext {
  const changedLinesInsideFunction = changedLines
    .filter((line) => line >= functionStartLine && line <= functionEndLine)
    .sort((a, b) => a - b);

  if (changedLinesInsideFunction.length === 0) {
    return {
      focusedText: functionText,
      focusedStartLine: functionStartLine,
      focusedEndLine: functionEndLine,
    };
  }

  const firstChangedLine = changedLinesInsideFunction[0];
  const lastChangedLine =
    changedLinesInsideFunction[changedLinesInsideFunction.length - 1];
  const focusedStartLine = Math.max(
    functionStartLine,
    firstChangedLine - contextLinesBefore
  );
  const focusedEndLine = Math.min(
    functionEndLine,
    lastChangedLine + contextLinesAfter
  );
  const functionLines = functionText.split("\n");
  const startOffset = focusedStartLine - functionStartLine;
  const endOffset = focusedEndLine - functionStartLine + 1;

  return {
    focusedText: functionLines.slice(startOffset, endOffset).join("\n"),
    focusedStartLine,
    focusedEndLine,
  };
}

export function getFunctionReviewContext(
  fn: ExtractedFunction,
  changedLines: number[]
): FunctionReviewContext {
  if (getFunctionLineCount(fn) <= LARGE_FUNCTION_LINE_THRESHOLD) {
    return {
      focusedText: fn.text,
      focusedStartLine: fn.startLine,
      focusedEndLine: fn.endLine,
      isFocused: false,
    };
  }

  return {
    ...extractFocusedFunctionContext(
      fn.text,
      fn.startLine,
      fn.endLine,
      changedLines
    ),
    isFocused: true,
  };
}
