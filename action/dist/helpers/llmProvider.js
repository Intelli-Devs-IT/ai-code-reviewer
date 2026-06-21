"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissingApiKeyProvider = exports.LlmProviderCallError = exports.ProviderTimeoutError = void 0;
exports.callLlmWithFallback = callLlmWithFallback;
exports.callLlmWithProviderChain = callLlmWithProviderChain;
const providerFailures_1 = require("./providerFailures");
class ProviderTimeoutError extends Error {
    constructor(provider, model, timeoutMs) {
        super(`${provider} provider request timed out after ${timeoutMs}ms for model ${model}.`);
        this.provider = provider;
        this.model = model;
        this.timeoutMs = timeoutMs;
        this.name = "ProviderTimeoutError";
    }
}
exports.ProviderTimeoutError = ProviderTimeoutError;
class LlmProviderCallError extends Error {
    constructor(failure, metadata) {
        super(failure.message);
        this.failure = failure;
        this.metadata = metadata;
        this.name = "LlmProviderCallError";
    }
}
exports.LlmProviderCallError = LlmProviderCallError;
class MissingApiKeyProvider {
    constructor(name, envVarName) {
        this.name = name;
        this.envVarName = envVarName;
    }
    async review() {
        const error = new Error(`${this.name} provider is configured but ${this.envVarName} is not set.`);
        error.status = 401;
        throw error;
    }
}
exports.MissingApiKeyProvider = MissingApiKeyProvider;
async function callLlmWithFallback(params) {
    return callLlmWithProviderChain({
        prompt: params.prompt,
        providerChain: [
            {
                provider: params.primaryProvider,
                model: params.primaryModel,
                timeoutMs: 30000,
            },
            ...(params.fallbackProvider && params.fallbackModel
                ? [
                    {
                        provider: params.fallbackProvider,
                        model: params.fallbackModel,
                        timeoutMs: 30000,
                    },
                ]
                : []),
        ],
        fallbackOn: params.fallbackOn,
        filePath: params.filePath,
        functionName: params.functionName,
        logger: params.logger,
    });
}
async function callLlmWithProviderChain(params) {
    const attempts = [];
    const maxAttempts = params.maxAttempts ?? params.providerChain.length;
    if (params.providerChain.length === 0) {
        throw new LlmProviderCallError((0, providerFailures_1.createProviderFailure)({
            error: new Error("No LLM providers configured."),
            filePath: params.filePath,
            functionName: params.functionName,
        }), {
            attempts,
            stopReason: "no_providers_configured",
        });
    }
    for (let index = 0; index < params.providerChain.length && attempts.length < maxAttempts; index++) {
        const current = params.providerChain[index];
        const timeoutMs = current.timeoutMs ?? 30000;
        const startedAt = Date.now();
        params.logger?.info([
            "LLM provider attempt:",
            `file=${params.filePath ?? ""}`,
            `function=${params.functionName ?? ""}`,
            `provider=${current.provider.name}`,
            `model=${current.model}`,
            `timeoutMs=${timeoutMs}`,
        ].join("\n"));
        try {
            const text = await callProviderWithTimeout({
                provider: current.provider,
                prompt: params.prompt,
                model: current.model,
                timeoutMs,
            });
            const durationMs = Date.now() - startedAt;
            attempts.push({
                provider: current.provider.name,
                model: current.model,
                success: true,
                durationMs,
            });
            params.logger?.info([
                "Provider chain stopped:",
                "reason=valid_response",
                `provider=${current.provider.name}`,
                `model=${current.model}`,
                `durationMs=${durationMs}`,
            ].join("\n"));
            if (index > 0) {
                params.logger?.info([
                    "Fallback provider succeeded:",
                    `provider=${current.provider.name}`,
                    `model=${current.model}`,
                ].join("\n"));
            }
            return {
                text,
                provider: current.provider.name,
                model: current.model,
                usedFallback: index > 0,
                attempts,
            };
        }
        catch (error) {
            const failureType = (0, providerFailures_1.classifyProviderError)(error);
            const durationMs = Date.now() - startedAt;
            attempts.push({
                provider: current.provider.name,
                model: current.model,
                success: false,
                failureType,
                durationMs,
            });
            const next = params.providerChain[index + 1];
            const maxAttemptsReached = attempts.length >= maxAttempts;
            const canFallback = next && !maxAttemptsReached && params.fallbackOn.includes(failureType);
            if (!canFallback) {
                const isTimeout = error instanceof ProviderTimeoutError;
                params.logger?.info([
                    "Provider chain stopped:",
                    `reason=${maxAttemptsReached && next ? "max_attempts_reached" : isTimeout ? "timeout" : "non_fallback_failure"}`,
                    `provider=${current.provider.name}`,
                    `model=${current.model}`,
                    `failureType=${failureType}`,
                    `attempts=${attempts.length}`,
                    `limit=${maxAttempts}`,
                    `timeoutMs=${timeoutMs}`,
                    `durationMs=${durationMs}`,
                ].join("\n"));
                const stopReason = maxAttemptsReached && next
                    ? "max_attempts_reached"
                    : isTimeout
                        ? "timeout"
                        : "non_fallback_failure";
                throw new LlmProviderCallError((0, providerFailures_1.createProviderFailure)({
                    error,
                    filePath: params.filePath,
                    functionName: params.functionName,
                    provider: current.provider.name,
                    model: current.model,
                }), {
                    attempts,
                    stopReason,
                });
            }
            params.logger?.info([
                "Provider failed, trying next fallback:",
                `file=${params.filePath ?? ""}`,
                `function=${params.functionName ?? ""}`,
                `provider=${current.provider.name}`,
                `model=${current.model}`,
                `failureType=${failureType}`,
                `durationMs=${durationMs}`,
                `nextProvider=${next.provider.name}`,
                `nextModel=${next.model}`,
            ].join("\n"));
        }
    }
    throw new LlmProviderCallError((0, providerFailures_1.createProviderFailure)({
        error: new Error("All LLM providers failed."),
        filePath: params.filePath,
        functionName: params.functionName,
    }), {
        attempts,
        stopReason: "non_fallback_failure",
    });
}
async function callProviderWithTimeout(params) {
    const abortController = new AbortController();
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            abortController.abort();
            reject(new ProviderTimeoutError(params.provider.name, params.model, params.timeoutMs));
        }, params.timeoutMs);
    });
    try {
        return await Promise.race([
            params.provider.review({
                prompt: params.prompt,
                model: params.model,
                temperature: 0.2,
                signal: abortController.signal,
            }),
            timeoutPromise,
        ]);
    }
    finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
}
