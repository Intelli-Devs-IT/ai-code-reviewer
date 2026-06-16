"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.mergeReviewerConfig = mergeReviewerConfig;
exports.DEFAULT_CONFIG = {
    enabled: true,
    max_files: 10,
    min_confidence: 45,
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
    return {
        ...exports.DEFAULT_CONFIG,
        ...config,
        security_review: {
            ...exports.DEFAULT_CONFIG.security_review,
            ...(config.security_review ?? {}),
        },
    };
}
