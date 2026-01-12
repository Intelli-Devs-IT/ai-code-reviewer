"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HuggingFaceLLM = void 0;
const openai_1 = __importDefault(require("openai"));
const models = [
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B:novita",
    "Qwen/Qwen2.5-Coder-32B-Instruct:nscale",
    "deepseek-ai/DeepSeek-Coder-V2-Instruct",
    "bigcode/starcoder2-15b-instruct",
    // "microsoft/phi-3-mini:latest",
    // "mistralai/Mistral-7B-Instruct-v0.1:latest",
    // "meta-llama/Llama-3-7B-Instruct:latest",
    // "meta-llama/Llama-3-13B-Instruct:latest",
    // "meta-llama/Llama-3-70B-Instruct:latest",
];
const baseurl = "https://router.huggingface.co/v1";
class HuggingFaceLLM {
    constructor(apiKey) {
        this.apiKey = apiKey;
        // this.model = "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B:novita";
        this.model = models[1];
        this.client = new openai_1.default({
            baseURL: baseurl,
            apiKey: this.apiKey,
        });
    }
    async reviewDiff(prompt) {
        try {
            const chatCompletion = await this.client.chat.completions.create({
                model: this.model,
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
