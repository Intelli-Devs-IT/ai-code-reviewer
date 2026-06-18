import type { ProviderFailureType } from "./helpers/providerFailures";

export type ReviewStrictness = "lenient" | "balanced" | "strict";
export type ModelValidationMode = "strict" | "warn" | "off";
export type ProviderFailureBehavior = "warn" | "fail" | "skip";
export type LlmProviderName = "huggingface" | "openrouter";
export type PrimaryLlmProviderName = LlmProviderName;
export type FallbackLlmProviderName = LlmProviderName;
export type ModelRoutingLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "markdown"
  | "json"
  | "yaml"
  | "other";

export interface ReviewerConfig {
  enabled: boolean;
  max_files: number;
  include: string[];
  exclude: string[];
  min_confidence?: number;
  review?: {
    strictness?: ReviewStrictness;
  };
  model_routing?: {
    enabled?: boolean;
    default_model?: string;
    routes?: Partial<Record<ModelRoutingLanguage, string>>;
  };
  model_validation?: {
    mode?: ModelValidationMode;
  };
  provider_failures?: {
    behavior?: ProviderFailureBehavior;
  };
  providers?: {
    primary?: PrimaryLlmProviderName;
    fallback?: FallbackLlmProviderName;
    fallback_on?: ProviderFailureType[];
  };
  openrouter?: {
    default_model?: string;
  };
  security_review?: {
    enabled?: boolean;
  };
}

export const DEFAULT_PROVIDER_FALLBACK_ON: ProviderFailureType[] = [
  "quota_exceeded",
  "rate_limited",
  "model_unavailable",
  "invalid_response",
  "network_error",
];

export const DEFAULT_OPENROUTER_MODEL = "cohere/north-mini-code:free";

export const DEFAULT_CONFIG: ReviewerConfig = {
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
  provider_failures: {
    behavior: "warn",
  },
  providers: {
    primary: "huggingface",
    fallback_on: DEFAULT_PROVIDER_FALLBACK_ON,
  },
  openrouter: {
    default_model: DEFAULT_OPENROUTER_MODEL,
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

export function mergeReviewerConfig(
  config: Partial<ReviewerConfig> = {},
): ReviewerConfig {
  const strictness = normalizeReviewStrictness(config.review?.strictness);
  const modelValidationMode = normalizeModelValidationMode(
    config.model_validation?.mode,
  );
  const providerFailureBehavior = normalizeProviderFailureBehavior(
    config.provider_failures?.behavior,
  );
  const primaryProvider = normalizeLlmProviderName(
    config.providers?.primary,
    "huggingface",
  );
  const fallbackProvider = normalizeOptionalLlmProviderName(
    config.providers?.fallback,
  );

  return {
    ...DEFAULT_CONFIG,
    ...config,
    review: {
      ...DEFAULT_CONFIG.review,
      ...(config.review ?? {}),
      strictness,
    },
    model_routing: {
      ...DEFAULT_CONFIG.model_routing,
      ...(config.model_routing ?? {}),
      routes: {
        ...(DEFAULT_CONFIG.model_routing?.routes ?? {}),
        ...(config.model_routing?.routes ?? {}),
      },
    },
    model_validation: {
      ...DEFAULT_CONFIG.model_validation,
      ...(config.model_validation ?? {}),
      mode: modelValidationMode,
    },
    provider_failures: {
      ...DEFAULT_CONFIG.provider_failures,
      ...(config.provider_failures ?? {}),
      behavior: providerFailureBehavior,
    },
    providers: {
      ...DEFAULT_CONFIG.providers,
      ...(config.providers ?? {}),
      primary: primaryProvider,
      fallback: fallbackProvider,
      fallback_on: normalizeProviderFallbackOn(config.providers?.fallback_on),
    },
    openrouter: {
      ...DEFAULT_CONFIG.openrouter,
      ...(config.openrouter ?? {}),
    },
    security_review: {
      ...DEFAULT_CONFIG.security_review,
      ...(config.security_review ?? {}),
    },
  };
}

export function normalizeReviewStrictness(value: unknown): ReviewStrictness {
  if (value === "lenient" || value === "balanced" || value === "strict") {
    return value;
  }

  return "balanced";
}

export function normalizeModelValidationMode(
  value: unknown,
): ModelValidationMode {
  if (value === "strict" || value === "warn" || value === "off") {
    return value;
  }

  return "warn";
}

export function normalizeProviderFailureBehavior(
  value: unknown,
): ProviderFailureBehavior {
  if (value === "warn" || value === "fail" || value === "skip") {
    return value;
  }

  return "warn";
}

export function normalizeLlmProviderName(
  value: unknown,
  fallback: PrimaryLlmProviderName,
): PrimaryLlmProviderName {
  if (value === "huggingface" || value === "openrouter") {
    return value;
  }

  return fallback;
}

export function normalizeOptionalLlmProviderName(
  value: unknown,
): FallbackLlmProviderName | undefined {
  if (value === "huggingface" || value === "openrouter") {
    return value;
  }

  return undefined;
}

export function normalizeProviderFallbackOn(
  value: unknown,
): ProviderFailureType[] {
  if (!Array.isArray(value)) {
    return DEFAULT_PROVIDER_FALLBACK_ON;
  }

  const normalized = value.filter(isProviderFailureType);

  return normalized.length > 0 ? normalized : DEFAULT_PROVIDER_FALLBACK_ON;
}

function isProviderFailureType(value: unknown): value is ProviderFailureType {
  return (
    value === "quota_exceeded" ||
    value === "rate_limited" ||
    value === "auth_failed" ||
    value === "model_unavailable" ||
    value === "invalid_response" ||
    value === "network_error" ||
    value === "unknown"
  );
}

export function getInlineConfidenceThreshold(
  strictness: ReviewStrictness,
): number {
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
