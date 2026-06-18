"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReviewSkipLog = buildReviewSkipLog;
exports.logReviewSkip = logReviewSkip;
exports.redactSecrets = redactSecrets;
const SECRET_PATTERNS = [
    /Authorization:\s*Bearer\s+[A-Za-z0-9._-]+/gi,
    /Bearer\s+[A-Za-z0-9._-]+/gi,
    /ghp_[A-Za-z0-9_]+/g,
    /github_pat_[A-Za-z0-9_]+/g,
    /hf_[A-Za-z0-9_]+/g,
    /sk-[A-Za-z0-9_-]+/g,
];
function buildReviewSkipLog(params) {
    const lines = [
        "AI review skipped:",
        `file=${params.filePath}`,
        `reason=${params.reason}`,
    ];
    if (params.functionName)
        lines.push(`function=${params.functionName}`);
    if (params.provider)
        lines.push(`provider=${params.provider}`);
    if (params.model)
        lines.push(`model=${params.model}`);
    if (params.language)
        lines.push(`language=${params.language}`);
    if (params.reviewStrictness) {
        lines.push(`strictness=${params.reviewStrictness}`);
    }
    if (typeof params.securityReviewEnabled === "boolean") {
        lines.push(`securityReview=${params.securityReviewEnabled}`);
    }
    if (typeof params.confidence === "number") {
        lines.push(`confidence=${params.confidence}`);
    }
    if (typeof params.threshold === "number") {
        lines.push(`threshold=${params.threshold}`);
    }
    if (params.preview) {
        lines.push(`preview=${redactSecrets(params.preview).slice(0, 200)}`);
    }
    return lines.join("\n");
}
function logReviewSkip(logger, params) {
    logger.info(buildReviewSkipLog(params));
}
function redactSecrets(text) {
    return SECRET_PATTERNS.reduce((redacted, pattern) => {
        return redacted.replace(pattern, "[REDACTED]");
    }, text);
}
