"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.mergeReviewerConfig = mergeReviewerConfig;
exports.normalizeReviewStrictness = normalizeReviewStrictness;
exports.getInlineConfidenceThreshold = getInlineConfidenceThreshold;
exports.DEFAULT_CONFIG = {
    enabled: true,
    max_files: 10,
    min_confidence: 45,
    review: {
        strictness: "balanced",
    },
    security_review: {
        enabled: false,
    },
    include: ["**/*.ts", "**/*.js", "**/*.tsx", "**/*.jsx"],
    exclude: [
        "**/*.spec.*",
        "**/*.test.*",
        "dist/**",
        "build/**",
        "node_modules/**",
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
    ],
};
function mergeReviewerConfig(config = {}) {
    const strictness = normalizeReviewStrictness(config.review?.strictness);
    return {
        ...exports.DEFAULT_CONFIG,
        ...config,
        review: {
            ...exports.DEFAULT_CONFIG.review,
            ...(config.review ?? {}),
            strictness,
        },
        security_review: {
            ...exports.DEFAULT_CONFIG.security_review,
            ...(config.security_review ?? {}),
        },
    };
}
function normalizeReviewStrictness(value) {
    if (value === "lenient" || value === "balanced" || value === "strict") {
        return value;
    }
    return "balanced";
}
function getInlineConfidenceThreshold(strictness) {
    switch (strictness) {
        case "lenient":
            return 10;
        case "strict":
            return 65;
        case "balanced":
        default:
            return 20;
    }
}
