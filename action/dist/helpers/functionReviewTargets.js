"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LARGE_FUNCTION_LINE_THRESHOLD = void 0;
exports.findChangedFunctions = findChangedFunctions;
exports.getFunctionReviewKey = getFunctionReviewKey;
exports.getCommentLineForFunction = getCommentLineForFunction;
exports.getFunctionReviewTargets = getFunctionReviewTargets;
exports.shouldUseScopedReviewFallback = shouldUseScopedReviewFallback;
exports.getFunctionLineCount = getFunctionLineCount;
exports.extractFocusedFunctionContext = extractFocusedFunctionContext;
exports.getFunctionReviewContext = getFunctionReviewContext;
exports.LARGE_FUNCTION_LINE_THRESHOLD = 80;
const DEFAULT_FOCUSED_CONTEXT_LINES = 20;
function findChangedFunctions(functions, changedLines) {
    return functions.filter((fn) => changedLines.some((line) => line >= fn.startLine && line <= fn.endLine));
}
function getFunctionReviewKey(fileName, fn) {
    return `${fileName}:${fn.name}:${fn.startLine}:${fn.endLine}`;
}
function getCommentLineForFunction(fn, changedLines) {
    if (changedLines.includes(fn.startLine)) {
        return fn.startLine;
    }
    return (changedLines.find((line) => line >= fn.startLine && line <= fn.endLine) ??
        fn.startLine);
}
function getFunctionReviewTargets(fileName, functions, changedLines, reviewedKeys) {
    const targets = [];
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
function shouldUseScopedReviewFallback(functions) {
    return functions.length === 0;
}
function getFunctionLineCount(fn) {
    return fn.endLine - fn.startLine + 1;
}
function extractFocusedFunctionContext(functionText, functionStartLine, functionEndLine, changedLines, contextLinesBefore = DEFAULT_FOCUSED_CONTEXT_LINES, contextLinesAfter = DEFAULT_FOCUSED_CONTEXT_LINES) {
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
    const lastChangedLine = changedLinesInsideFunction[changedLinesInsideFunction.length - 1];
    const focusedStartLine = Math.max(functionStartLine, firstChangedLine - contextLinesBefore);
    const focusedEndLine = Math.min(functionEndLine, lastChangedLine + contextLinesAfter);
    const functionLines = functionText.split("\n");
    const startOffset = focusedStartLine - functionStartLine;
    const endOffset = focusedEndLine - functionStartLine + 1;
    return {
        focusedText: functionLines.slice(startOffset, endOffset).join("\n"),
        focusedStartLine,
        focusedEndLine,
    };
}
function getFunctionReviewContext(fn, changedLines) {
    if (getFunctionLineCount(fn) <= exports.LARGE_FUNCTION_LINE_THRESHOLD) {
        return {
            focusedText: fn.text,
            focusedStartLine: fn.startLine,
            focusedEndLine: fn.endLine,
            isFocused: false,
        };
    }
    return {
        ...extractFocusedFunctionContext(fn.text, fn.startLine, fn.endLine, changedLines),
        isFocused: true,
    };
}
