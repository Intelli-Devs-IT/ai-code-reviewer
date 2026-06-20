import {
  assertValidModelResponseText,
  extractModelResponseText,
  InvalidModelResponseError,
} from "./helpers/modelResponseValidation";
import { LlmProvider } from "./helpers/llmProvider";

type FetchLike = typeof fetch;

export class OpenAIProvider implements LlmProvider {
  readonly name = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async review(params: {
    prompt: string;
    model: string;
    temperature?: number;
  }): Promise<string> {
    const response = await this.fetchImpl(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: params.model,
          messages: [
            {
              role: "user",
              content: params.prompt,
            },
          ],
          max_tokens: 200,
          temperature: params.temperature ?? 0.2,
        }),
      },
    );

    const responseText = await response.text();

    if (!response.ok) {
      const error = new Error(responseText || response.statusText);
      (error as any).status = response.status;
      throw error;
    }

    const contentType = response.headers.get("content-type");
    if (contentType && !contentType.toLowerCase().includes("json")) {
      throw new InvalidModelResponseError({
        text: responseText,
        model: params.model,
        provider: "OpenAI",
        reason: "invalid_content_type",
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      throw new InvalidModelResponseError({
        text: responseText,
        model: params.model,
        provider: "OpenAI",
        reason: "malformed_json",
      });
    }

    const text = extractModelResponseText(parsed);

    return assertValidModelResponseText({
      text: text ?? "",
      model: params.model,
      provider: "OpenAI",
    });
  }
}
