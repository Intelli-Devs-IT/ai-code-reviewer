"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HuggingFaceLLM = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
class HuggingFaceLLM {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.model = "deepseek-ai/deepseek-coder-6.7b-instruct";
    }
    async reviewDiff(prompt) {
        try {
            const response = await (0, node_fetch_1.default)(`https://api-inference.huggingface.co/models/${this.model}`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: {
                        max_new_tokens: 200,
                        temperature: 0.2,
                    },
                }),
            });
            if (!response.ok) {
                return null;
            }
            const data = await response.json();
            // HF returns array sometimes
            if (Array.isArray(data) && data[0]?.generated_text) {
                return data[0].generated_text.replace(prompt, "").trim();
            }
            return null;
        }
        catch {
            return null;
        }
    }
}
exports.HuggingFaceLLM = HuggingFaceLLM;
