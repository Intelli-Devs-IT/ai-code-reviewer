"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findChangedFunctions = findChangedFunctions;
exports.getFunctionReviewKey = getFunctionReviewKey;
exports.getCommentLineForFunction = getCommentLineForFunction;
exports.getFunctionReviewTargets = getFunctionReviewTargets;
exports.shouldUseScopedReviewFallback = shouldUseScopedReviewFallback;
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
