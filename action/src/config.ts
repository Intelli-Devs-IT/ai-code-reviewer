export type ReviewStrictness = "lenient" | "balanced" | "strict";
export type ModelValidationMode = "strict" | "warn" | "off";
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
  security_review?: {
    enabled?: boolean;
  };
}

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
  config: Partial<ReviewerConfig> = {}
): ReviewerConfig {
  const strictness = normalizeReviewStrictness(config.review?.strictness);
  const modelValidationMode = normalizeModelValidationMode(
    config.model_validation?.mode
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
  value: unknown
): ModelValidationMode {
  if (value === "strict" || value === "warn" || value === "off") {
    return value;
  }

  return "warn";
}

export function getInlineConfidenceThreshold(
  strictness: ReviewStrictness
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
