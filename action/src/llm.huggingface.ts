import OpenAI from "openai";

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

export const DEFAULT_HUGGINGFACE_MODEL = models[1];
const baseurl = "https://router.huggingface.co/v1";
export class HuggingFaceLLM {
  private apiKey: string;
  private model: string;
  private client: OpenAI;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
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
  ): Promise<string | null> {
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
    } catch (error) {
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
