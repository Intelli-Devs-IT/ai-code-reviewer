"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyProviderError = classifyProviderError;
exports.createProviderFailure = createProviderFailure;
exports.formatProviderFailureForLog = formatProviderFailureForLog;
exports.shouldFailForProviderFailures = shouldFailForProviderFailures;
const modelResponseValidation_1 = require("./modelResponseValidation");
function classifyProviderError(error) {
    const status = getErrorStatus(error);
    const message = getErrorMessage(error).toLowerCase();
    if (status === 402 ||
        message.includes("depleted your monthly included credits") ||
        message.includes("monthly included credits") ||
        message.includes("payment required")) {
        return "quota_exceeded";
    }
    if (status === 408 || status === 429 || message.includes("rate limit")) {
        return "rate_limited";
    }
    if (status === 401 || status === 403 || message.includes("unauthorized")) {
        return "auth_failed";
    }
    if (status === 404 ||
        status === 503 ||
        message.includes("model is unavailable") ||
        message.includes("model is currently loading") ||
        message.includes("service unavailable")) {
        return "model_unavailable";
    }
    if (error instanceof modelResponseValidation_1.InvalidModelResponseError) {
        return "invalid_response";
    }
    if (status === 500 ||
        status === 502 ||
        status === 504 ||
        message.includes("network") ||
        message.includes("fetch failed") ||
        message.includes("econnrefused") ||
        message.includes("econnreset") ||
        message.includes("etimedout") ||
        message.includes("timed out") ||
        message.includes("timeout")) {
        return "network_error";
    }
    return "unknown";
}
function createProviderFailure(params) {
    return {
        filePath: params.filePath,
        functionName: params.functionName,
        provider: params.provider,
        model: params.model,
        type: classifyProviderError(params.error),
        message: (0, modelResponseValidation_1.getSafeProviderErrorMessage)(params.error),
    };
}
function formatProviderFailureForLog(failure) {
    const lines = [
        "Provider failure:",
        `type=${failure.type}`,
    ];
    if (failure.filePath)
        lines.push(`file=${failure.filePath}`);
    if (failure.functionName)
        lines.push(`function=${failure.functionName}`);
    if (failure.provider)
        lines.push(`provider=${failure.provider}`);
    if (failure.model)
        lines.push(`model=${failure.model}`);
    if (failure.message)
        lines.push(`message=${failure.message}`);
    return lines.join("\n");
}
function shouldFailForProviderFailures(behavior, providerFailures) {
    return behavior === "fail" && providerFailures.length > 0;
}
function getErrorStatus(error) {
    if (!error || typeof error !== "object") {
        return undefined;
    }
    const record = error;
    const status = record.status ?? record.statusCode ?? record.code;
    return typeof status === "number" ? status : undefined;
}
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    if (error && typeof error === "object") {
        const record = error;
        if (typeof record.message === "string") {
            return record.message;
        }
    }
    return String(error);
}
