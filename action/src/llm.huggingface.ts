// import fetch from "node-fetch";
import OpenAI from "openai";

// const client = new OpenAI({
//   baseURL: "https://router.huggingface.co/v1",
//   apiKey: process.env.HF_API_KEY,
// });

const baseurl = "https://router.huggingface.co/v1";
export class HuggingFaceLLM {
  private apiKey: string;
  private model: string;
  private client: OpenAI;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.model = "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B:novita";
    this.client = new OpenAI({
      baseURL: baseurl,
      apiKey: this.apiKey,
    });
  }

  async reviewDiff(prompt: string): Promise<string | null> {
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
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
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
