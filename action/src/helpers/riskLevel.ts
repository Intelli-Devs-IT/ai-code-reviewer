export type RiskLevel = "low" | "medium" | "high";

export interface DetermineRiskLevelOptions {
  securitySensitive?: boolean;
}

const GENERAL_HIGH_RISK_FLAGS = [
  "security",
  "race condition",
  "leak",
  "authentication",
  "authorization",
  "sql",
  "injection",
  "token",
  "crypto",
];

const STRONG_SECURITY_INDICATORS = [
  "authentication",
  "authorization",
  "permission",
  "injection",
  "xss",
  "ssrf",
  "csrf",
  "secret",
  "token",
  "password",
  "credential",
  "crypto",
  "encryption",
  "path traversal",
  "data leak",
  "privacy",
  "payment",
  "admin",
  "destructive action",
];

const RISK_PRIORITY: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function getHighestRiskLevel(...risks: RiskLevel[]): RiskLevel {
  return risks.reduce<RiskLevel>((highest, risk) => {
    return RISK_PRIORITY[risk] > RISK_PRIORITY[highest] ? risk : highest;
  }, "low");
}

export function determineRiskLevel(
  confidenceScores: number[],
  reviews: string[],
  options: DetermineRiskLevelOptions = {}
): RiskLevel {
  if (confidenceScores.length === 0) return "low";

  const maxConfidence = Math.max(...confidenceScores);
  const normalizedReviews = reviews.map((review) => review.toLowerCase());
  const hasGeneralHighRiskFlag = normalizedReviews.some((text) =>
    GENERAL_HIGH_RISK_FLAGS.some((flag) => text.includes(flag))
  );
  const hasStrongSecurityIndicator = normalizedReviews.some((text) =>
    STRONG_SECURITY_INDICATORS.some((indicator) => text.includes(indicator))
  );

  if (options.securitySensitive && hasStrongSecurityIndicator) return "high";
  if (maxConfidence >= 70 && hasGeneralHighRiskFlag) return "high";
  if (maxConfidence >= 55) return "medium";
  return "low";
}
