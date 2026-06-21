"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaProvider = void 0;
const modelResponseValidation_1 = require("./helpers/modelResponseValidation");
class OllamaProvider {
    constructor(baseUrl, fetchImpl = fetch) {
        this.baseUrl = baseUrl;
        this.fetchImpl = fetchImpl;
        this.name = "ollama";
        this.normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    }
    async review(params) {
        const response = await this.fetchImpl(`${this.normalizedBaseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            signal: params.signal,
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
                provider: "Ollama",
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
                provider: "Ollama",
                reason: "malformed_json",
            });
        }
        const text = (0, modelResponseValidation_1.extractModelResponseText)(parsed);
        return (0, modelResponseValidation_1.assertValidModelResponseText)({
            text: text ?? "",
            model: params.model,
            provider: "Ollama",
        });
    }
}
exports.OllamaProvider = OllamaProvider;
