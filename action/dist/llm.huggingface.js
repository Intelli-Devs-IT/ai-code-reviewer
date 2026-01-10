"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HuggingFaceLLM = void 0;
const openai_1 = __importDefault(require("openai"));
const baseurl = "https://router.huggingface.co/v1";
class HuggingFaceLLM {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.model = "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B:novita";
        this.client = new openai_1.default({
            baseURL: baseurl,
            apiKey: this.apiKey,
        });
    }
    async reviewDiff(prompt) {
        try {
            const chatCompletion = await this.client.chat.completions.create({
                model: "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B:novita",
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
            });
            return chatCompletion.choices[0].message?.content ?? null;
        }
        catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
        // This is the old implementation using fetch
        // try {
        //   const response = await fetch(
        //     `https://api-inference.huggingface.co/models/${this.model}`,
        //     {
        //       method: "POST",
        //       headers: {
        //         Authorization: `Bearer ${this.apiKey}`,
        //         "Content-Type": "application/json",
        //       },
        //       body: JSON.stringify({
        //         inputs: prompt,
        //         parameters: {
        //           max_new_tokens: 200,
        //           temperature: 0.2,
        //         },
        //       }),
        //     }
        //   );
        //   if (!response.ok) {
        //     return null;
        //   }
        //   const data: any = await response.json();
        //   // HF returns array sometimes
        //   if (Array.isArray(data) && data[0]?.generated_text) {
        //     return data[0].generated_text.replace(prompt, "").trim();
        //   }
        //   return null;
        // } catch {
        //   return null;
        // }
    }
}
exports.HuggingFaceLLM = HuggingFaceLLM;
