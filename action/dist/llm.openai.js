"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIProvider = void 0;
const modelResponseValidation_1 = require("./helpers/modelResponseValidation");
class OpenAIProvider {
    constructor(apiKey, fetchImpl = fetch) {
        this.apiKey = apiKey;
        this.fetchImpl = fetchImpl;
        this.name = "openai";
    }
    async review(params) {
        const response = await this.fetchImpl("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
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
                provider: "OpenAI",
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
                provider: "OpenAI",
                reason: "malformed_json",
            });
        }
        const text = (0, modelResponseValidation_1.extractModelResponseText)(parsed);
        return (0, modelResponseValidation_1.assertValidModelResponseText)({
            text: text ?? "",
            model: params.model,
            provider: "OpenAI",
        });
    }
}
exports.OpenAIProvider = OpenAIProvider;
