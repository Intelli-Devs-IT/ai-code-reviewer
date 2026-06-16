"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HuggingFaceLLM = exports.DEFAULT_HUGGINGFACE_MODEL = void 0;
const openai_1 = __importDefault(require("openai"));
const models = [
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B:novita",
    "Qwen/Qwen2.5-Coder-32B-Instruct:nscale",
    "deepseek-ai/DeepSeek-Coder-V2-Instruct",
    "bigcode/starcoder2-15b-instruct",
    "Qwen/Qwen3.6-35B-A3B:featherless-ai",
    "zai-org/GLM-5.1:together",
    "Qwen/Qwen3-Coder-Next:novita",
    "deepseek-ai/DeepSeek-V4-Flash:novita",
];
exports.DEFAULT_HUGGINGFACE_MODEL = models[1];
const baseurl = "https://router.huggingface.co/v1";
class HuggingFaceLLM {
    constructor(apiKey) {
        this.apiKey = apiKey;
        // this.model = "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B:novita";
        this.model = exports.DEFAULT_HUGGINGFACE_MODEL;
        this.client = new openai_1.default({
            baseURL: baseurl,
            apiKey: this.apiKey,
        });
    }
    async reviewDiff(prompt, modelOverride) {
        try {
            const chatCompletion = await this.client.chat.completions.create({
                model: modelOverride ?? this.model,
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
