"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissingApiKeyProvider = exports.LlmProviderCallError = void 0;
exports.callLlmWithFallback = callLlmWithFallback;
const providerFailures_1 = require("./providerFailures");
class LlmProviderCallError extends Error {
    constructor(failure) {
        super(failure.message);
        this.failure = failure;
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
    try {
        const text = await params.primaryProvider.review({
            prompt: params.prompt,
            model: params.primaryModel,
            temperature: 0.2,
        });
        return {
            text,
            provider: params.primaryProvider.name,
            model: params.primaryModel,
            usedFallback: false,
        };
    }
    catch (error) {
        const failureType = (0, providerFailures_1.classifyProviderError)(error);
        const fallbackProvider = params.fallbackProvider;
        const fallbackModel = params.fallbackModel;
        const canFallback = fallbackProvider && fallbackModel && params.fallbackOn.includes(failureType);
        if (!canFallback) {
            throw new LlmProviderCallError((0, providerFailures_1.createProviderFailure)({
                error,
                filePath: params.filePath,
                functionName: params.functionName,
                provider: params.primaryProvider.name,
                model: params.primaryModel,
            }));
        }
        params.logger?.info([
            "Primary provider failed, trying fallback:",
            `file=${params.filePath ?? ""}`,
            `function=${params.functionName ?? ""}`,
            `primaryProvider=${params.primaryProvider.name}`,
            `primaryModel=${params.primaryModel}`,
            `failureType=${failureType}`,
            `fallbackProvider=${fallbackProvider.name}`,
            `fallbackModel=${fallbackModel}`,
        ].join("\n"));
        try {
            const text = await fallbackProvider.review({
                prompt: params.prompt,
                model: fallbackModel,
                temperature: 0.2,
            });
            params.logger?.info([
                "Fallback provider succeeded:",
                `provider=${fallbackProvider.name}`,
                `model=${fallbackModel}`,
            ].join("\n"));
            return {
                text,
                provider: fallbackProvider.name,
                model: fallbackModel,
                usedFallback: true,
            };
        }
        catch (fallbackError) {
            throw new LlmProviderCallError((0, providerFailures_1.createProviderFailure)({
                error: fallbackError,
                filePath: params.filePath,
                functionName: params.functionName,
                provider: fallbackProvider.name,
                model: fallbackModel,
            }));
        }
    }
}
