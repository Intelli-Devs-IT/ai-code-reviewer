"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissingApiKeyProvider = exports.LlmProviderCallError = void 0;
exports.callLlmWithFallback = callLlmWithFallback;
exports.callLlmWithProviderChain = callLlmWithProviderChain;
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
    return callLlmWithProviderChain({
        prompt: params.prompt,
        providerChain: [
            {
                provider: params.primaryProvider,
                model: params.primaryModel,
            },
            ...(params.fallbackProvider && params.fallbackModel
                ? [
                    {
                        provider: params.fallbackProvider,
                        model: params.fallbackModel,
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
    if (params.providerChain.length === 0) {
        throw new LlmProviderCallError((0, providerFailures_1.createProviderFailure)({
            error: new Error("No LLM providers configured."),
            filePath: params.filePath,
            functionName: params.functionName,
        }));
    }
    for (let index = 0; index < params.providerChain.length; index++) {
        const current = params.providerChain[index];
        params.logger?.info([
            "LLM provider attempt:",
            `file=${params.filePath ?? ""}`,
            `function=${params.functionName ?? ""}`,
            `provider=${current.provider.name}`,
            `model=${current.model}`,
        ].join("\n"));
        try {
            const text = await current.provider.review({
                prompt: params.prompt,
                model: current.model,
                temperature: 0.2,
            });
            attempts.push({
                provider: current.provider.name,
                model: current.model,
                success: true,
            });
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
            attempts.push({
                provider: current.provider.name,
                model: current.model,
                success: false,
                failureType,
            });
            const next = params.providerChain[index + 1];
            const canFallback = next && params.fallbackOn.includes(failureType);
            if (!canFallback) {
                throw new LlmProviderCallError((0, providerFailures_1.createProviderFailure)({
                    error,
                    filePath: params.filePath,
                    functionName: params.functionName,
                    provider: current.provider.name,
                    model: current.model,
                }));
            }
            params.logger?.info([
                "Provider failed, trying next fallback:",
                `file=${params.filePath ?? ""}`,
                `function=${params.functionName ?? ""}`,
                `provider=${current.provider.name}`,
                `model=${current.model}`,
                `failureType=${failureType}`,
                `nextProvider=${next.provider.name}`,
                `nextModel=${next.model}`,
            ].join("\n"));
        }
    }
    throw new LlmProviderCallError((0, providerFailures_1.createProviderFailure)({
        error: new Error("All LLM providers failed."),
        filePath: params.filePath,
        functionName: params.functionName,
    }));
}
