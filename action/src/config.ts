export type ReviewStrictness = "lenient" | "balanced" | "strict";

export interface ReviewerConfig {
  enabled: boolean;
  max_files: number;
  include: string[];
  exclude: string[];
  min_confidence?: number;
  review?: {
    strictness?: ReviewStrictness;
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

  return {
    ...DEFAULT_CONFIG,
    ...config,
    review: {
      ...DEFAULT_CONFIG.review,
      ...(config.review ?? {}),
      strictness,
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
