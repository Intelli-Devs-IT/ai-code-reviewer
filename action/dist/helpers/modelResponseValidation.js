"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidModelResponseError = void 0;
exports.isLikelyHtmlResponse = isLikelyHtmlResponse;
exports.assertValidModelResponseText = assertValidModelResponseText;
exports.extractModelResponseText = extractModelResponseText;
exports.getSafeProviderPreview = getSafeProviderPreview;
exports.getSafeProviderErrorMessage = getSafeProviderErrorMessage;
const reviewDiagnostics_1 = require("./reviewDiagnostics");
class InvalidModelResponseError extends Error {
    constructor(params) {
        super(buildInvalidResponseMessage(params));
        this.name = "InvalidModelResponseError";
    }
}
exports.InvalidModelResponseError = InvalidModelResponseError;
function isLikelyHtmlResponse(text) {
    const normalized = text.trim().toLowerCase();
    return (normalized.startsWith("<!doctype html") ||
        normalized.startsWith("<html") ||
        normalized.includes("<head") ||
        normalized.includes("<body") ||
        normalized.includes("<title>hugging face") ||
        normalized.includes("hugging face - the ai community building the future."));
}
function assertValidModelResponseText(params) {
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
function extractModelResponseText(response) {
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
    const responseRecord = response;
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
function getSafeProviderPreview(text, maxLength = 200) {
    return (0, reviewDiagnostics_1.redactSecrets)(text.replace(/\s+/g, " ").trim()).slice(0, maxLength);
}
function getSafeProviderErrorMessage(error) {
    const message = error instanceof Error ? error.message : String(error);
    return getSafeProviderPreview(message);
}
function isObviousProviderErrorResponse(text) {
    const normalized = text.trim().toLowerCase();
    return (normalized.startsWith("error:") ||
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
        normalized.includes("invalid json response"));
}
function buildInvalidResponseMessage(params) {
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
