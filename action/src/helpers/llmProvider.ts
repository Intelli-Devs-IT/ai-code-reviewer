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
    signal?: AbortSignal;
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
  timeoutMs?: number;
}

export interface LlmProviderAttemptResult {
  provider: string;
  model: string;
  success: boolean;
  failureType?: ProviderFailureType;
  durationMs: number;
}

export type ProviderChainStopReason =
  | "valid_response"
  | "max_attempts_reached"
  | "non_fallback_failure"
  | "timeout"
  | "no_providers_configured";

interface Logger {
  info(message: string): void;
}

export class ProviderTimeoutError extends Error {
  constructor(
    readonly provider: string,
    readonly model: string,
    readonly timeoutMs: number,
  ) {
    super(
      `${provider} provider request timed out after ${timeoutMs}ms for model ${model}.`
    );
    this.name = "ProviderTimeoutError";
  }
}

export class LlmProviderCallError extends Error {
  constructor(
    public readonly failure: ProviderFailure,
    public readonly metadata?: {
      attempts?: LlmProviderAttemptResult[];
      stopReason?: ProviderChainStopReason;
    },
  ) {
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
        timeoutMs: 30000,
      },
      ...(params.fallbackProvider && params.fallbackModel
        ? [
            {
              provider: params.fallbackProvider,
              model: params.fallbackModel,
              timeoutMs: 30000,
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
  maxAttempts?: number;
  filePath?: string;
  functionName?: string;
  logger?: Logger;
}): Promise<LlmCallResult> {
  const attempts: LlmProviderAttemptResult[] = [];
  const maxAttempts = params.maxAttempts ?? params.providerChain.length;

  if (params.providerChain.length === 0) {
    throw new LlmProviderCallError(
      createProviderFailure({
        error: new Error("No LLM providers configured."),
        filePath: params.filePath,
        functionName: params.functionName,
      }),
      {
        attempts,
        stopReason: "no_providers_configured",
      },
    );
  }

  for (
    let index = 0;
    index < params.providerChain.length && attempts.length < maxAttempts;
    index++
  ) {
    const current = params.providerChain[index];
    const timeoutMs = current.timeoutMs ?? 30000;
    const startedAt = Date.now();

    params.logger?.info(
      [
        "LLM provider attempt:",
        `file=${params.filePath ?? ""}`,
        `function=${params.functionName ?? ""}`,
        `provider=${current.provider.name}`,
        `model=${current.model}`,
        `timeoutMs=${timeoutMs}`,
      ].join("\n")
    );

    try {
      const text = await callProviderWithTimeout({
        provider: current.provider,
        prompt: params.prompt,
        model: current.model,
        timeoutMs,
      });
      const durationMs = Date.now() - startedAt;

      attempts.push({
        provider: current.provider.name,
        model: current.model,
        success: true,
        durationMs,
      });

      params.logger?.info(
        [
          "Provider chain stopped:",
          "reason=valid_response",
          `provider=${current.provider.name}`,
          `model=${current.model}`,
          `durationMs=${durationMs}`,
        ].join("\n")
      );

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
      const durationMs = Date.now() - startedAt;
      attempts.push({
        provider: current.provider.name,
        model: current.model,
        success: false,
        failureType,
        durationMs,
      });

      const next = params.providerChain[index + 1];
      const maxAttemptsReached = attempts.length >= maxAttempts;
      const canFallback =
        next && !maxAttemptsReached && params.fallbackOn.includes(failureType);

      if (!canFallback) {
        const isTimeout = error instanceof ProviderTimeoutError;
        params.logger?.info(
          [
            "Provider chain stopped:",
            `reason=${maxAttemptsReached && next ? "max_attempts_reached" : isTimeout ? "timeout" : "non_fallback_failure"}`,
            `provider=${current.provider.name}`,
            `model=${current.model}`,
            `failureType=${failureType}`,
            `attempts=${attempts.length}`,
            `limit=${maxAttempts}`,
            `timeoutMs=${timeoutMs}`,
            `durationMs=${durationMs}`,
          ].join("\n")
        );

        const stopReason: ProviderChainStopReason =
          maxAttemptsReached && next
            ? "max_attempts_reached"
            : isTimeout
              ? "timeout"
              : "non_fallback_failure";

        throw new LlmProviderCallError(
          createProviderFailure({
            error,
            filePath: params.filePath,
            functionName: params.functionName,
            provider: current.provider.name,
            model: current.model,
          }),
          {
            attempts,
            stopReason,
          },
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
          `durationMs=${durationMs}`,
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
    }),
    {
      attempts,
      stopReason: "non_fallback_failure",
    },
  );
}

async function callProviderWithTimeout(params: {
  provider: LlmProvider;
  prompt: string;
  model: string;
  timeoutMs: number;
}): Promise<string> {
  const abortController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      abortController.abort();
      reject(
        new ProviderTimeoutError(
          params.provider.name,
          params.model,
          params.timeoutMs
        )
      );
    }, params.timeoutMs);
  });

  try {
    return await Promise.race([
      params.provider.review({
        prompt: params.prompt,
        model: params.model,
        temperature: 0.2,
        signal: abortController.signal,
      }),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
