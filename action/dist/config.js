"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = exports.DEFAULT_MAX_TOTAL_FUNCTIONS = exports.DEFAULT_MAX_FUNCTIONS_PER_FILE = exports.DEFAULT_MAX_INLINE_COMMENTS = exports.DEFAULT_OPENROUTER_MODEL = exports.DEFAULT_PROVIDER_FALLBACK_ON = void 0;
exports.mergeReviewerConfig = mergeReviewerConfig;
exports.normalizeReviewStrictness = normalizeReviewStrictness;
exports.normalizeModelValidationMode = normalizeModelValidationMode;
exports.normalizeProviderFailureBehavior = normalizeProviderFailureBehavior;
exports.normalizeLlmProviderName = normalizeLlmProviderName;
exports.normalizeOptionalLlmProviderName = normalizeOptionalLlmProviderName;
exports.normalizeProviderFallbackOn = normalizeProviderFallbackOn;
exports.normalizePositiveInteger = normalizePositiveInteger;
exports.getInlineConfidenceThreshold = getInlineConfidenceThreshold;
exports.DEFAULT_PROVIDER_FALLBACK_ON = [
    "quota_exceeded",
    "rate_limited",
    "model_unavailable",
    "invalid_response",
    "network_error",
];
exports.DEFAULT_OPENROUTER_MODEL = "cohere/north-mini-code:free";
exports.DEFAULT_MAX_INLINE_COMMENTS = 10;
exports.DEFAULT_MAX_FUNCTIONS_PER_FILE = 5;
exports.DEFAULT_MAX_TOTAL_FUNCTIONS = 30;
exports.DEFAULT_CONFIG = {
    enabled: true,
    max_files: 10,
    min_confidence: 45,
    review: {
        strictness: "balanced",
        max_inline_comments: exports.DEFAULT_MAX_INLINE_COMMENTS,
        max_functions_per_file: exports.DEFAULT_MAX_FUNCTIONS_PER_FILE,
        max_total_functions: exports.DEFAULT_MAX_TOTAL_FUNCTIONS,
    },
    model_routing: {
        enabled: false,
        routes: {},
    },
    model_validation: {
        mode: "warn",
    },
    provider_failures: {
        behavior: "warn",
    },
    providers: {
        primary: "huggingface",
        fallback_on: exports.DEFAULT_PROVIDER_FALLBACK_ON,
    },
    openrouter: {
        default_model: exports.DEFAULT_OPENROUTER_MODEL,
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
    const providerFailureBehavior = normalizeProviderFailureBehavior(config.provider_failures?.behavior);
    const primaryProvider = normalizeLlmProviderName(config.providers?.primary, "huggingface");
    const fallbackProvider = normalizeOptionalLlmProviderName(config.providers?.fallback);
    return {
        ...exports.DEFAULT_CONFIG,
        ...config,
        review: {
            ...exports.DEFAULT_CONFIG.review,
            ...(config.review ?? {}),
            strictness,
            max_inline_comments: normalizePositiveInteger(config.review?.max_inline_comments, exports.DEFAULT_MAX_INLINE_COMMENTS),
            max_functions_per_file: normalizePositiveInteger(config.review?.max_functions_per_file, exports.DEFAULT_MAX_FUNCTIONS_PER_FILE),
            max_total_functions: normalizePositiveInteger(config.review?.max_total_functions, exports.DEFAULT_MAX_TOTAL_FUNCTIONS),
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
        provider_failures: {
            ...exports.DEFAULT_CONFIG.provider_failures,
            ...(config.provider_failures ?? {}),
            behavior: providerFailureBehavior,
        },
        providers: {
            ...exports.DEFAULT_CONFIG.providers,
            ...(config.providers ?? {}),
            primary: primaryProvider,
            fallback: fallbackProvider,
            fallback_on: normalizeProviderFallbackOn(config.providers?.fallback_on),
        },
        openrouter: {
            ...exports.DEFAULT_CONFIG.openrouter,
            ...(config.openrouter ?? {}),
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
function normalizeProviderFailureBehavior(value) {
    if (value === "warn" || value === "fail" || value === "skip") {
        return value;
    }
    return "warn";
}
function normalizeLlmProviderName(value, fallback) {
    if (value === "huggingface" || value === "openrouter") {
        return value;
    }
    return fallback;
}
function normalizeOptionalLlmProviderName(value) {
    if (value === "huggingface" || value === "openrouter") {
        return value;
    }
    return undefined;
}
function normalizeProviderFallbackOn(value) {
    if (!Array.isArray(value)) {
        return exports.DEFAULT_PROVIDER_FALLBACK_ON;
    }
    const normalized = value.filter(isProviderFailureType);
    return normalized.length > 0 ? normalized : exports.DEFAULT_PROVIDER_FALLBACK_ON;
}
function normalizePositiveInteger(value, fallback) {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        return fallback;
    }
    return value;
}
function isProviderFailureType(value) {
    return (value === "quota_exceeded" ||
        value === "rate_limited" ||
        value === "auth_failed" ||
        value === "model_unavailable" ||
        value === "invalid_response" ||
        value === "network_error" ||
        value === "unknown");
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
