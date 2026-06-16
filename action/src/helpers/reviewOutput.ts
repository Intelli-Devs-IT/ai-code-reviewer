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

export type ReviewSkipReason =
  | "llm_empty_output"
  | "llm_returned_no_review"
  | "cleaned_output_empty"
  | "normalized_output_empty"
  | "should_skip_review";

export interface ReviewPreparationResult {
  review: string | null;
  skipReason?: ReviewSkipReason;
  preview?: string;
  cleanedPreview?: string;
  normalizedPreview?: string;
}

export function getSafeReviewPreview(
  review: string | null | undefined,
  maxLength = 200
): string {
  if (!review) {
    return "";
  }

  return review.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function prepareReviewWithDiagnostics(
  rawReview: string | null | undefined
): ReviewPreparationResult {
  if (!rawReview || !rawReview.trim()) {
    return {
      review: null,
      skipReason: "llm_empty_output",
      preview: getSafeReviewPreview(rawReview),
    };
  }

  const cleaned = cleanModelOutput(rawReview);

  if (!cleaned || !cleaned.trim()) {
    return {
      review: null,
      skipReason: "cleaned_output_empty",
      preview: getSafeReviewPreview(rawReview),
      cleanedPreview: getSafeReviewPreview(cleaned),
    };
  }

  const normalized = normalizeReview(cleaned);

  if (!normalized || !normalized.trim()) {
    return {
      review: null,
      skipReason: "normalized_output_empty",
      preview: getSafeReviewPreview(rawReview),
      cleanedPreview: getSafeReviewPreview(cleaned),
      normalizedPreview: getSafeReviewPreview(normalized),
    };
  }

  if (shouldSkipReview(normalized)) {
    const normalizedLower = normalized.trim().toLowerCase();

    return {
      review: null,
      skipReason: normalizedLower === "no_review"
        ? "llm_returned_no_review"
        : "should_skip_review",
      preview: getSafeReviewPreview(rawReview),
      cleanedPreview: getSafeReviewPreview(cleaned),
      normalizedPreview: getSafeReviewPreview(normalized),
    };
  }

  return {
    review: normalized,
    preview: getSafeReviewPreview(rawReview),
    cleanedPreview: getSafeReviewPreview(cleaned),
    normalizedPreview: getSafeReviewPreview(normalized),
  };
}

export function prepareReviewForScoring(rawReview: string): string | null {
  return prepareReviewWithDiagnostics(rawReview).review;
}
