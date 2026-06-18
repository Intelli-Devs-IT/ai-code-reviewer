import { ModelRoutingLanguage } from "../config";
import { ReviewSkipReason } from "./reviewOutput";

export interface ReviewSkipLogParams {
  filePath: string;
  reason: ReviewSkipReason | string;
  functionName?: string;
  provider?: string;
  model?: string;
  language?: ModelRoutingLanguage;
  reviewStrictness?: string;
  securityReviewEnabled?: boolean;
  confidence?: number;
  threshold?: number;
  limit?: number;
  skippedFunctions?: number;
  preview?: string;
}

const SECRET_PATTERNS = [
  /Authorization:\s*Bearer\s+[A-Za-z0-9._-]+/gi,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /ghp_[A-Za-z0-9_]+/g,
  /github_pat_[A-Za-z0-9_]+/g,
  /hf_[A-Za-z0-9_]+/g,
  /sk-[A-Za-z0-9_-]+/g,
];

export function buildReviewSkipLog(params: ReviewSkipLogParams): string {
  const lines = [
    "AI review skipped:",
    `file=${params.filePath}`,
    `reason=${params.reason}`,
  ];

  if (params.functionName) lines.push(`function=${params.functionName}`);
  if (params.provider) lines.push(`provider=${params.provider}`);
  if (params.model) lines.push(`model=${params.model}`);
  if (params.language) lines.push(`language=${params.language}`);
  if (params.reviewStrictness) {
    lines.push(`strictness=${params.reviewStrictness}`);
  }
  if (typeof params.securityReviewEnabled === "boolean") {
    lines.push(`securityReview=${params.securityReviewEnabled}`);
  }
  if (typeof params.confidence === "number") {
    lines.push(`confidence=${params.confidence}`);
  }
  if (typeof params.threshold === "number") {
    lines.push(`threshold=${params.threshold}`);
  }
  if (typeof params.limit === "number") {
    lines.push(`limit=${params.limit}`);
  }
  if (typeof params.skippedFunctions === "number") {
    lines.push(`skippedFunctions=${params.skippedFunctions}`);
  }
  if (params.preview) {
    lines.push(`preview=${redactSecrets(params.preview).slice(0, 200)}`);
  }

  return lines.join("\n");
}

export function logReviewSkip(
  logger: { info: (message: string) => void },
  params: ReviewSkipLogParams
): void {
  logger.info(buildReviewSkipLog(params));
}

export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((redacted, pattern) => {
    return redacted.replace(pattern, "[REDACTED]");
  }, text);
}
