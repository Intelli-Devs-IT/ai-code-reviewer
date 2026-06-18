import { redactSecrets } from "./reviewDiagnostics";

export interface ModelResponseTextParams {
  text: string;
  model: string;
  provider?: string;
}

interface InvalidModelResponseParams extends ModelResponseTextParams {
  reason: string;
}

export class InvalidModelResponseError extends Error {
  constructor(params: InvalidModelResponseParams) {
    super(buildInvalidResponseMessage(params));
    this.name = "InvalidModelResponseError";
  }
}

export function isLikelyHtmlResponse(text: string): boolean {
  const normalized = text.trim().toLowerCase();

  return (
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html") ||
    normalized.includes("<head") ||
    normalized.includes("<body") ||
    normalized.includes("<title>hugging face") ||
    normalized.includes("hugging face - the ai community building the future.")
  );
}

export function assertValidModelResponseText(
  params: ModelResponseTextParams
): string {
  const trimmed = params.text.trim();

  if (!trimmed) {
    throw new InvalidModelResponseError({
      ...params,
      text: trimmed,
      reason: "empty_response",
    });
  }

  if (isLikelyHtmlResponse(trimmed)) {
    throw new InvalidModelResponseError({
      ...params,
      text: trimmed,
      reason: "html_response",
    });
  }

  if (isObviousProviderErrorResponse(trimmed)) {
    throw new InvalidModelResponseError({
      ...params,
      text: trimmed,
      reason: "provider_error_response",
    });
  }

  return trimmed;
}

export function extractModelResponseText(response: unknown): string | null {
  if (typeof response === "string") {
    return response;
  }

  if (!response || typeof response !== "object") {
    return null;
  }

  if (Array.isArray(response)) {
    const generatedText = response[0]?.generated_text;
    return typeof generatedText === "string" ? generatedText : null;
  }

  const responseRecord = response as Record<string, any>;
  const messageContent = responseRecord.choices?.[0]?.message?.content;
  if (typeof messageContent === "string") {
    return messageContent;
  }

  const textContent = responseRecord.choices?.[0]?.text;
  if (typeof textContent === "string") {
    return textContent;
  }

  if (typeof responseRecord.generated_text === "string") {
    return responseRecord.generated_text;
  }

  if (typeof responseRecord.response === "string") {
    return responseRecord.response;
  }

  return null;
}

export function getSafeProviderPreview(text: string, maxLength = 200): string {
  return redactSecrets(text.replace(/\s+/g, " ").trim()).slice(0, maxLength);
}

export function getSafeProviderErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return getSafeProviderPreview(message);
}

function isObviousProviderErrorResponse(text: string): boolean {
  const normalized = text.trim().toLowerCase();

  return (
    normalized.startsWith("error:") ||
    normalized.startsWith("provider error") ||
    normalized.startsWith("rate limit") ||
    normalized.startsWith("rate-limit") ||
    normalized.startsWith("too many requests") ||
    normalized.includes("depleted your monthly included credits") ||
    normalized.includes("monthly included credits") ||
    normalized.includes("payment required") ||
    normalized.includes("model is currently loading") ||
    normalized.includes("model is unavailable") ||
    normalized.includes("service unavailable") ||
    normalized.includes("bad gateway") ||
    normalized.includes("gateway timeout") ||
    normalized.includes("unexpected token '<'") ||
    normalized.includes("malformed json") ||
    normalized.includes("invalid json response")
  );
}

function buildInvalidResponseMessage(params: InvalidModelResponseParams): string {
  const lines = [
    "Provider response rejected:",
    `model=${params.model}`,
    `reason=${params.reason}`,
  ];

  if (params.provider) {
    lines.splice(1, 0, `provider=${params.provider}`);
  }

  const preview = getSafeProviderPreview(params.text);
  if (preview) {
    lines.push(`preview=${preview}`);
  }

  return lines.join("\n");
}
