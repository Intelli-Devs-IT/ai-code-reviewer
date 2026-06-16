import { normalizeReview } from "./normalizeReview";

const NO_REVIEW_RESPONSES = new Set([
  "no_review",
  "no meaningful issue found",
  "no meaningful issue found.",
  "no issue found",
  "no issue found.",
  "no issues found",
  "no issues found.",
  "no change required",
  "no change required.",
]);

export function cleanModelOutput(text: string): string {
  if (!text) return text;

  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s+|\s+$/g, "")
    .trim();
}

export function shouldSkipReview(review: string): boolean {
  const normalized = review.trim();

  if (!normalized) {
    return true;
  }

  const lower = normalized.toLowerCase();

  if (NO_REVIEW_RESPONSES.has(lower)) {
    return true;
  }

  return false;
}

export function prepareReviewForScoring(rawReview: string): string | null {
  const cleaned = cleanModelOutput(rawReview);
  const normalized = normalizeReview(cleaned);

  return shouldSkipReview(normalized) ? null : normalized;
}
