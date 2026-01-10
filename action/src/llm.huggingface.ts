import fetch from "node-fetch";

export class HuggingFaceLLM {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.model = "deepseek-ai/deepseek-coder-6.7b-instruct";
  }

  async reviewDiff(prompt: string): Promise<string | null> {
    try {
      const response = await fetch(
        `https://api-inference.huggingface.co/models/${this.model}`,
        {
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
        }
      );

      if (!response.ok) {
        return null;
      }

      const data: any = await response.json();

      // HF returns array sometimes
      if (Array.isArray(data) && data[0]?.generated_text) {
        return data[0].generated_text.replace(prompt, "").trim();
      }

      return null;
    } catch {
      return null;
    }
  }
}
