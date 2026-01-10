export interface ReviewerConfig {
  enabled: boolean;
  max_files: number;
  include: string[];
  exclude: string[];
}

export const DEFAULT_CONFIG: ReviewerConfig = {
  enabled: true,
  max_files: 10,
  include: ["**/*.ts", "**/*.js", "**/*.tsx", "**/*.jsx"],
  exclude: [
    "**/*.spec.*",
    "**/*.test.*",
    "dist/**",
    "build/**",
    "node_modules/**",
  ],
};
