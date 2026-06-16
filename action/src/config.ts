export interface ReviewerConfig {
  enabled: boolean;
  max_files: number;
  include: string[];
  exclude: string[];
  min_confidence?: number;
  security_review?: {
    enabled?: boolean;
  };
}

export const DEFAULT_CONFIG: ReviewerConfig = {
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

export function mergeReviewerConfig(
  config: Partial<ReviewerConfig> = {}
): ReviewerConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    security_review: {
      ...DEFAULT_CONFIG.security_review,
      ...(config.security_review ?? {}),
    },
  };
}
