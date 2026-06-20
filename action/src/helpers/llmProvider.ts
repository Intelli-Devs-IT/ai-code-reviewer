import type { LlmProviderName } from "../config";
import type { ProviderFailure, ProviderFailureType } from "./providerFailures";
import {
  createProviderFailure,
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
  attempts: LlmProviderAttemptResult[];
}

export interface LlmProviderChainEntry {
  provider: LlmProvider;
  model: string;
}

export interface LlmProviderAttemptResult {
  provider: string;
  model: string;
  success: boolean;
  failureType?: ProviderFailureType;
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

export class MissingApiKeyProvider implements LlmProvider {
  constructor(
    readonly name: LlmProviderName,
    private readonly envVarName: string,
  ) {}

  async review(): Promise<string> {
    const error = new Error(
      `${this.name} provider is configured but ${this.envVarName} is not set.`
    );
    (error as any).status = 401;
    throw error;
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
  return callLlmWithProviderChain({
    prompt: params.prompt,
    providerChain: [
      {
        provider: params.primaryProvider,
        model: params.primaryModel,
      },
      ...(params.fallbackProvider && params.fallbackModel
        ? [
            {
              provider: params.fallbackProvider,
              model: params.fallbackModel,
            },
          ]
        : []),
    ],
    fallbackOn: params.fallbackOn,
    filePath: params.filePath,
    functionName: params.functionName,
    logger: params.logger,
  });
}

export async function callLlmWithProviderChain(params: {
  prompt: string;
  providerChain: LlmProviderChainEntry[];
  fallbackOn: ProviderFailureType[];
  filePath?: string;
  functionName?: string;
  logger?: Logger;
}): Promise<LlmCallResult> {
  const attempts: LlmProviderAttemptResult[] = [];

  if (params.providerChain.length === 0) {
    throw new LlmProviderCallError(
      createProviderFailure({
        error: new Error("No LLM providers configured."),
        filePath: params.filePath,
        functionName: params.functionName,
      })
    );
  }

  for (let index = 0; index < params.providerChain.length; index++) {
    const current = params.providerChain[index];

    params.logger?.info(
      [
        "LLM provider attempt:",
        `file=${params.filePath ?? ""}`,
        `function=${params.functionName ?? ""}`,
        `provider=${current.provider.name}`,
        `model=${current.model}`,
      ].join("\n")
    );

    try {
      const text = await current.provider.review({
        prompt: params.prompt,
        model: current.model,
        temperature: 0.2,
      });

      attempts.push({
        provider: current.provider.name,
        model: current.model,
        success: true,
      });

      if (index > 0) {
        params.logger?.info(
          [
            "Fallback provider succeeded:",
            `provider=${current.provider.name}`,
            `model=${current.model}`,
          ].join("\n")
        );
      }

      return {
        text,
        provider: current.provider.name,
        model: current.model,
        usedFallback: index > 0,
        attempts,
      };
    } catch (error) {
      const failureType = classifyProviderError(error);
      attempts.push({
        provider: current.provider.name,
        model: current.model,
        success: false,
        failureType,
      });

      const next = params.providerChain[index + 1];
      const canFallback = next && params.fallbackOn.includes(failureType);

      if (!canFallback) {
        throw new LlmProviderCallError(
          createProviderFailure({
            error,
            filePath: params.filePath,
            functionName: params.functionName,
            provider: current.provider.name,
            model: current.model,
          })
        );
      }

      params.logger?.info(
        [
          "Provider failed, trying next fallback:",
          `file=${params.filePath ?? ""}`,
          `function=${params.functionName ?? ""}`,
          `provider=${current.provider.name}`,
          `model=${current.model}`,
          `failureType=${failureType}`,
          `nextProvider=${next.provider.name}`,
          `nextModel=${next.model}`,
        ].join("\n")
      );
    }
  }

  throw new LlmProviderCallError(
    createProviderFailure({
      error: new Error("All LLM providers failed."),
      filePath: params.filePath,
      functionName: params.functionName,
    })
  );
}
