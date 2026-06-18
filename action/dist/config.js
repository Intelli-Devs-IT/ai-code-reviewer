"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.mergeReviewerConfig = mergeReviewerConfig;
exports.normalizeReviewStrictness = normalizeReviewStrictness;
exports.normalizeModelValidationMode = normalizeModelValidationMode;
exports.getInlineConfidenceThreshold = getInlineConfidenceThreshold;
exports.DEFAULT_CONFIG = {
    enabled: true,
    max_files: 10,
    min_confidence: 45,
    review: {
        strictness: "balanced",
    },
    model_routing: {
        enabled: false,
        routes: {},
    },
    model_validation: {
        mode: "warn",
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
    const modelValidationMode = normalizeModelValidationMode(config.model_validation?.mode);
    return {
        ...exports.DEFAULT_CONFIG,
        ...config,
        review: {
            ...exports.DEFAULT_CONFIG.review,
            ...(config.review ?? {}),
            strictness,
        },
        model_routing: {
            ...exports.DEFAULT_CONFIG.model_routing,
            ...(config.model_routing ?? {}),
            routes: {
                ...(exports.DEFAULT_CONFIG.model_routing?.routes ?? {}),
                ...(config.model_routing?.routes ?? {}),
            },
        },
        model_validation: {
            ...exports.DEFAULT_CONFIG.model_validation,
            ...(config.model_validation ?? {}),
            mode: modelValidationMode,
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
function normalizeModelValidationMode(value) {
    if (value === "strict" || value === "warn" || value === "off") {
        return value;
    }
    return "warn";
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
