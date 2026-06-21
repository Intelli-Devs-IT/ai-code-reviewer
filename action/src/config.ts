import type { ProviderFailureType } from "./helpers/providerFailures";

export type ReviewStrictness = "lenient" | "balanced" | "strict";
export type ModelValidationMode = "strict" | "warn" | "off";
export type ProviderFailureBehavior = "warn" | "fail" | "skip";
export type LlmProviderName =
  | "huggingface"
  | "openrouter"
  | "openai"
  | "ollama";
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
    max_inline_comments?: number;
    max_functions_per_file?: number;
    max_total_functions?: number;
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
    fallbacks?: FallbackLlmProviderName[];
    fallback_on?: ProviderFailureType[];
    timeout_ms?: number;
    max_attempts_per_review?: number;
  };
  huggingface?: {
    timeout_ms?: number;
  };
  openrouter?: {
    default_model?: string;
    timeout_ms?: number;
  };
  openai?: {
    default_model?: string;
    timeout_ms?: number;
  };
  ollama?: {
    base_url?: string;
    default_model?: string;
    timeout_ms?: number;
  };
  analysis?: {
    lint?: {
      enabled?: boolean;
      report_path?: string;
    };
    semgrep?: {
      enabled?: boolean;
      report_path?: string;
    };
    tests?: {
      enabled?: boolean;
      report_path?: string;
    };
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
export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";
export const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:7b";
export const DEFAULT_PROVIDER_TIMEOUT_MS = 30000;
export const DEFAULT_OLLAMA_TIMEOUT_MS = 15000;
export const DEFAULT_MAX_PROVIDER_ATTEMPTS_PER_REVIEW = 2;
export const DEFAULT_MAX_INLINE_COMMENTS = 10;
export const DEFAULT_MAX_FUNCTIONS_PER_FILE = 5;
export const DEFAULT_MAX_TOTAL_FUNCTIONS = 30;

export const DEFAULT_CONFIG: ReviewerConfig = {
  enabled: true,
  max_files: 10,
  min_confidence: 45,
  review: {
    strictness: "balanced",
    max_inline_comments: DEFAULT_MAX_INLINE_COMMENTS,
    max_functions_per_file: DEFAULT_MAX_FUNCTIONS_PER_FILE,
    max_total_functions: DEFAULT_MAX_TOTAL_FUNCTIONS,
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
    timeout_ms: DEFAULT_PROVIDER_TIMEOUT_MS,
    max_attempts_per_review: DEFAULT_MAX_PROVIDER_ATTEMPTS_PER_REVIEW,
  },
  huggingface: {
    timeout_ms: DEFAULT_PROVIDER_TIMEOUT_MS,
  },
  openrouter: {
    default_model: DEFAULT_OPENROUTER_MODEL,
    timeout_ms: DEFAULT_PROVIDER_TIMEOUT_MS,
  },
  openai: {
    default_model: DEFAULT_OPENAI_MODEL,
    timeout_ms: DEFAULT_PROVIDER_TIMEOUT_MS,
  },
  ollama: {
    base_url: DEFAULT_OLLAMA_BASE_URL,
    default_model: DEFAULT_OLLAMA_MODEL,
    timeout_ms: DEFAULT_OLLAMA_TIMEOUT_MS,
  },
  analysis: {
    lint: {
      enabled: false,
    },
    semgrep: {
      enabled: false,
    },
    tests: {
      enabled: false,
    },
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
  const fallbackProviders = normalizeOptionalLlmProviderNames(
    config.providers?.fallbacks,
  );
  const providerTimeoutMs = normalizePositiveInteger(
    config.providers?.timeout_ms,
    DEFAULT_PROVIDER_TIMEOUT_MS,
  );

  return {
    ...DEFAULT_CONFIG,
    ...config,
    review: {
      ...DEFAULT_CONFIG.review,
      ...(config.review ?? {}),
      strictness,
      max_inline_comments: normalizePositiveInteger(
        config.review?.max_inline_comments,
        DEFAULT_MAX_INLINE_COMMENTS,
      ),
      max_functions_per_file: normalizePositiveInteger(
        config.review?.max_functions_per_file,
        DEFAULT_MAX_FUNCTIONS_PER_FILE,
      ),
      max_total_functions: normalizePositiveInteger(
        config.review?.max_total_functions,
        DEFAULT_MAX_TOTAL_FUNCTIONS,
      ),
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
      fallbacks: fallbackProviders,
      fallback_on: normalizeProviderFallbackOn(config.providers?.fallback_on),
      timeout_ms: providerTimeoutMs,
      max_attempts_per_review: normalizePositiveInteger(
        config.providers?.max_attempts_per_review,
        DEFAULT_MAX_PROVIDER_ATTEMPTS_PER_REVIEW,
      ),
    },
    huggingface: {
      ...DEFAULT_CONFIG.huggingface,
      ...(config.huggingface ?? {}),
      timeout_ms: normalizePositiveInteger(
        config.huggingface?.timeout_ms,
        providerTimeoutMs,
      ),
    },
    openrouter: {
      ...DEFAULT_CONFIG.openrouter,
      ...(config.openrouter ?? {}),
      timeout_ms: normalizePositiveInteger(
        config.openrouter?.timeout_ms,
        providerTimeoutMs,
      ),
    },
    openai: {
      ...DEFAULT_CONFIG.openai,
      ...(config.openai ?? {}),
      timeout_ms: normalizePositiveInteger(
        config.openai?.timeout_ms,
        providerTimeoutMs,
      ),
    },
    ollama: {
      ...DEFAULT_CONFIG.ollama,
      ...(config.ollama ?? {}),
      base_url: normalizeNonEmptyString(
        config.ollama?.base_url,
        DEFAULT_OLLAMA_BASE_URL,
      ),
      default_model: normalizeNonEmptyString(
        config.ollama?.default_model,
        DEFAULT_OLLAMA_MODEL,
      ),
      timeout_ms: normalizePositiveInteger(
        config.ollama?.timeout_ms,
        DEFAULT_OLLAMA_TIMEOUT_MS,
      ),
    },
    analysis: {
      lint: {
        ...DEFAULT_CONFIG.analysis?.lint,
        ...(config.analysis?.lint ?? {}),
      },
      semgrep: {
        ...DEFAULT_CONFIG.analysis?.semgrep,
        ...(config.analysis?.semgrep ?? {}),
      },
      tests: {
        ...DEFAULT_CONFIG.analysis?.tests,
        ...(config.analysis?.tests ?? {}),
      },
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
  if (
    value === "huggingface" ||
    value === "openrouter" ||
    value === "openai" ||
    value === "ollama"
  ) {
    return value;
  }

  return fallback;
}

export function normalizeOptionalLlmProviderName(
  value: unknown,
): FallbackLlmProviderName | undefined {
  if (
    value === "huggingface" ||
    value === "openrouter" ||
    value === "openai" ||
    value === "ollama"
  ) {
    return value;
  }

  return undefined;
}

export function normalizeOptionalLlmProviderNames(
  value: unknown,
): FallbackLlmProviderName[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((provider) => normalizeOptionalLlmProviderName(provider))
    .filter((provider): provider is FallbackLlmProviderName => Boolean(provider));
}

export function resolveProviderChain(config: ReviewerConfig): LlmProviderName[] {
  const primaryProvider = config.providers?.primary ?? "huggingface";
  const configuredFallbacks = config.providers?.fallbacks ?? [];
  const fallbackProviders =
    configuredFallbacks.length > 0
      ? configuredFallbacks
      : config.providers?.fallback
        ? [config.providers.fallback]
        : [];
  const chain: LlmProviderName[] = [];
  const seen = new Set<LlmProviderName>();

  for (const provider of [primaryProvider, ...fallbackProviders]) {
    if (seen.has(provider)) {
      continue;
    }

    seen.add(provider);
    chain.push(provider);
  }

  return chain;
}

export function resolveProviderTimeoutMs(
  config: ReviewerConfig,
  provider: LlmProviderName,
): number {
  switch (provider) {
    case "openrouter":
      return config.openrouter?.timeout_ms ?? DEFAULT_PROVIDER_TIMEOUT_MS;
    case "openai":
      return config.openai?.timeout_ms ?? DEFAULT_PROVIDER_TIMEOUT_MS;
    case "ollama":
      return config.ollama?.timeout_ms ?? DEFAULT_OLLAMA_TIMEOUT_MS;
    case "huggingface":
    default:
      return config.huggingface?.timeout_ms ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  }
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

export function normalizePositiveInteger(
  value: unknown,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return fallback;
  }

  return value;
}

export function normalizeNonEmptyString(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  return value;
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
