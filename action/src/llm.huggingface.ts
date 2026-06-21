import OpenAI from "openai";
import {
  assertValidModelResponseText,
  extractModelResponseText,
  InvalidModelResponseError,
} from "./helpers/modelResponseValidation";
import { DEFAULT_HUGGINGFACE_MODEL } from "./helpers/huggingFaceModels";
import { LlmProvider } from "./helpers/llmProvider";

export {
  DEFAULT_HUGGINGFACE_MODEL,
  TESTED_HUGGINGFACE_MODELS,
} from "./helpers/huggingFaceModels";

const baseurl = "https://router.huggingface.co/v1";

interface Logger {
  warning: (message: string) => void;
}

export class HuggingFaceLLM implements LlmProvider {
  readonly name = "huggingface";

  private apiKey: string;
  private model: string;
  private client: OpenAI;
  private logger?: Logger;

  constructor(apiKey: string, logger?: Logger) {
    this.apiKey = apiKey;
    this.logger = logger;
    // this.model = "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B:novita";
    this.model = DEFAULT_HUGGINGFACE_MODEL;
    this.client = new OpenAI({
      baseURL: baseurl,
      apiKey: this.apiKey,
    });
  }

  async reviewDiff(
    prompt: string,
    modelOverride?: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const selectedModel = modelOverride ?? this.model;

    try {
      const chatCompletion = await this.client.chat.completions.create(
        {
          model: selectedModel,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        },
        signal ? { signal } : undefined,
      );
      const text = extractModelResponseText(chatCompletion);

      return assertValidModelResponseText({
        text: text ?? "",
        model: selectedModel,
        provider: "Hugging Face",
      });
    } catch (error) {
      if (error instanceof InvalidModelResponseError) {
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

  async review(params: {
    prompt: string;
    model: string;
    temperature?: number;
    signal?: AbortSignal;
  }): Promise<string> {
    const text = await this.reviewDiff(
      params.prompt,
      params.model,
      params.signal,
    );

    return assertValidModelResponseText({
      text: text ?? "",
      model: params.model,
      provider: "Hugging Face",
    });
  }
}
