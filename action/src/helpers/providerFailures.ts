import { ProviderFailureBehavior } from "../config";
import {
  getSafeProviderErrorMessage,
  InvalidModelResponseError,
} from "./modelResponseValidation";

export type ProviderFailureType =
  | "quota_exceeded"
  | "rate_limited"
  | "auth_failed"
  | "model_unavailable"
  | "invalid_response"
  | "network_error"
  | "unknown";

export interface ProviderFailure {
  filePath?: string;
  functionName?: string;
  model?: string;
  type: ProviderFailureType;
  message: string;
}

export function classifyProviderError(error: unknown): ProviderFailureType {
  const status = getErrorStatus(error);
  const message = getErrorMessage(error).toLowerCase();

  if (
    status === 402 ||
    message.includes("depleted your monthly included credits") ||
    message.includes("monthly included credits") ||
    message.includes("payment required")
  ) {
    return "quota_exceeded";
  }

  if (status === 429 || message.includes("rate limit")) {
    return "rate_limited";
  }

  if (status === 401 || status === 403 || message.includes("unauthorized")) {
    return "auth_failed";
  }

  if (
    status === 404 ||
    status === 503 ||
    message.includes("model is unavailable") ||
    message.includes("model is currently loading") ||
    message.includes("service unavailable")
  ) {
    return "model_unavailable";
  }

  if (error instanceof InvalidModelResponseError) {
    return "invalid_response";
  }

  if (
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  ) {
    return "network_error";
  }

  return "unknown";
}

export function createProviderFailure(params: {
  error: unknown;
  filePath?: string;
  functionName?: string;
  model?: string;
}): ProviderFailure {
  return {
    filePath: params.filePath,
    functionName: params.functionName,
    model: params.model,
    type: classifyProviderError(params.error),
    message: getSafeProviderErrorMessage(params.error),
  };
}

export function formatProviderFailureForLog(failure: ProviderFailure): string {
  const lines = [
    "Provider failure:",
    `type=${failure.type}`,
  ];

  if (failure.filePath) lines.push(`file=${failure.filePath}`);
  if (failure.functionName) lines.push(`function=${failure.functionName}`);
  if (failure.model) lines.push(`model=${failure.model}`);
  if (failure.message) lines.push(`message=${failure.message}`);

  return lines.join("\n");
}

export function shouldFailForProviderFailures(
  behavior: ProviderFailureBehavior,
  providerFailures: ProviderFailure[]
): boolean {
  return behavior === "fail" && providerFailures.length > 0;
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const record = error as Record<string, unknown>;
  const status = record.status ?? record.statusCode ?? record.code;

  return typeof status === "number" ? status : undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") {
      return record.message;
    }
  }

  return String(error);
}
