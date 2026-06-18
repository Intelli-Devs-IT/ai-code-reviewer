"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HuggingFaceLLM = exports.TESTED_HUGGINGFACE_MODELS = exports.DEFAULT_HUGGINGFACE_MODEL = void 0;
const openai_1 = __importDefault(require("openai"));
const modelResponseValidation_1 = require("./helpers/modelResponseValidation");
const huggingFaceModels_1 = require("./helpers/huggingFaceModels");
var huggingFaceModels_2 = require("./helpers/huggingFaceModels");
Object.defineProperty(exports, "DEFAULT_HUGGINGFACE_MODEL", { enumerable: true, get: function () { return huggingFaceModels_2.DEFAULT_HUGGINGFACE_MODEL; } });
Object.defineProperty(exports, "TESTED_HUGGINGFACE_MODELS", { enumerable: true, get: function () { return huggingFaceModels_2.TESTED_HUGGINGFACE_MODELS; } });
const baseurl = "https://router.huggingface.co/v1";
class HuggingFaceLLM {
    constructor(apiKey, logger) {
        this.name = "huggingface";
        this.apiKey = apiKey;
        this.logger = logger;
        // this.model = "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B:novita";
        this.model = huggingFaceModels_1.DEFAULT_HUGGINGFACE_MODEL;
        this.client = new openai_1.default({
            baseURL: baseurl,
            apiKey: this.apiKey,
        });
    }
    async reviewDiff(prompt, modelOverride) {
        const selectedModel = modelOverride ?? this.model;
        try {
            const chatCompletion = await this.client.chat.completions.create({
                model: selectedModel,
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
            });
            const text = (0, modelResponseValidation_1.extractModelResponseText)(chatCompletion);
            return (0, modelResponseValidation_1.assertValidModelResponseText)({
                text: text ?? "",
                model: selectedModel,
                provider: "Hugging Face",
            });
        }
        catch (error) {
            if (error instanceof modelResponseValidation_1.InvalidModelResponseError) {
                this.logger?.warning(error.message);
            }
            throw error;
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
    async review(params) {
        const text = await this.reviewDiff(params.prompt, params.model);
        return (0, modelResponseValidation_1.assertValidModelResponseText)({
            text: text ?? "",
            model: params.model,
            provider: "Hugging Face",
        });
    }
}
exports.HuggingFaceLLM = HuggingFaceLLM;
