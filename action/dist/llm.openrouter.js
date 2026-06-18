"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenRouterProvider = void 0;
const modelResponseValidation_1 = require("./helpers/modelResponseValidation");
class OpenRouterProvider {
    constructor(apiKey, fetchImpl = fetch, referer) {
        this.apiKey = apiKey;
        this.fetchImpl = fetchImpl;
        this.referer = referer;
        this.name = "openrouter";
    }
    async review(params) {
        const response = await this.fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
                ...(this.referer ? { "HTTP-Referer": this.referer } : {}),
                "X-Title": "AI Code Reviewer",
            },
            body: JSON.stringify({
                model: params.model,
                messages: [
                    {
                        role: "user",
                        content: params.prompt,
                    },
                ],
                temperature: params.temperature ?? 0.2,
            }),
        });
        const responseText = await response.text();
        if (!response.ok) {
            const error = new Error(responseText || response.statusText);
            error.status = response.status;
            throw error;
        }
        const contentType = response.headers.get("content-type");
        if (contentType && !contentType.toLowerCase().includes("json")) {
            throw new modelResponseValidation_1.InvalidModelResponseError({
                text: responseText,
                model: params.model,
                provider: "OpenRouter",
                reason: "invalid_content_type",
            });
        }
        let parsed;
        try {
            parsed = JSON.parse(responseText);
        }
        catch {
            throw new modelResponseValidation_1.InvalidModelResponseError({
                text: responseText,
                model: params.model,
                provider: "OpenRouter",
                reason: "malformed_json",
            });
        }
        const text = (0, modelResponseValidation_1.extractModelResponseText)(parsed);
        return (0, modelResponseValidation_1.assertValidModelResponseText)({
            text: text ?? "",
            model: params.model,
            provider: "OpenRouter",
        });
    }
}
exports.OpenRouterProvider = OpenRouterProvider;
