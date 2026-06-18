import { ProviderFailureType } from "./providerFailures";
import {
  createProviderFailure,
  ProviderFailure,
  classifyProviderError,
} from "./providerFailures";

export interface LlmProvider {
  name: string;
  review(params: {
    prompt: string;
    model: string;
    temperature?: number;
  }): Promise<string>;
}

export interface LlmCallResult {
  text: string;
  provider: string;
  model: string;
  usedFallback: boolean;
}

interface Logger {
  info(message: string): void;
}

export class LlmProviderCallError extends Error {
  constructor(public readonly failure: ProviderFailure) {
    super(failure.message);
    this.name = "LlmProviderCallError";
  }
}

export async function callLlmWithFallback(params: {
  prompt: string;
  primaryProvider: LlmProvider;
  fallbackProvider?: LlmProvider;
  primaryModel: string;
  fallbackModel?: string;
  fallbackOn: ProviderFailureType[];
  filePath?: string;
  functionName?: string;
  logger?: Logger;
}): Promise<LlmCallResult> {
  try {
    const text = await params.primaryProvider.review({
      prompt: params.prompt,
      model: params.primaryModel,
      temperature: 0.2,
    });

    return {
      text,
      provider: params.primaryProvider.name,
      model: params.primaryModel,
      usedFallback: false,
    };
  } catch (error) {
    const failureType = classifyProviderError(error);
    const fallbackProvider = params.fallbackProvider;
    const fallbackModel = params.fallbackModel;
    const canFallback =
      fallbackProvider && fallbackModel && params.fallbackOn.includes(failureType);

    if (!canFallback) {
      throw new LlmProviderCallError(
        createProviderFailure({
          error,
          filePath: params.filePath,
          functionName: params.functionName,
          provider: params.primaryProvider.name,
          model: params.primaryModel,
        })
      );
    }

    params.logger?.info(
      [
        "Primary provider failed, trying fallback:",
        `file=${params.filePath ?? ""}`,
        `function=${params.functionName ?? ""}`,
        `primaryProvider=${params.primaryProvider.name}`,
        `primaryModel=${params.primaryModel}`,
        `failureType=${failureType}`,
        `fallbackProvider=${fallbackProvider.name}`,
        `fallbackModel=${fallbackModel}`,
      ].join("\n")
    );

    try {
      const text = await fallbackProvider.review({
        prompt: params.prompt,
        model: fallbackModel,
        temperature: 0.2,
      });

      params.logger?.info(
        [
          "Fallback provider succeeded:",
          `provider=${fallbackProvider.name}`,
          `model=${fallbackModel}`,
        ].join("\n")
      );

      return {
        text,
        provider: fallbackProvider.name,
        model: fallbackModel,
        usedFallback: true,
      };
    } catch (fallbackError) {
      throw new LlmProviderCallError(
        createProviderFailure({
          error: fallbackError,
          filePath: params.filePath,
          functionName: params.functionName,
          provider: fallbackProvider.name,
          model: fallbackModel,
        })
      );
    }
  }
}
