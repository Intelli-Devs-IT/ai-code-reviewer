import assert from "node:assert/strict";
import test from "node:test";

import {
  callLlmWithFallback,
  LlmProvider,
  LlmProviderCallError,
  MissingApiKeyProvider,
} from "../src/helpers/llmProvider";

test("primary provider success does not call fallback", async () => {
  let fallbackCalls = 0;
  const result = await callLlmWithFallback({
    prompt: "review",
    primaryProvider: provider("huggingface", async () => "primary text"),
    fallbackProvider: provider("openrouter", async () => {
      fallbackCalls += 1;
      return "fallback text";
    }),
    primaryModel: "hf/model",
    fallbackModel: "openrouter/model",
    fallbackOn: ["quota_exceeded"],
  });

  assert.equal(result.text, "primary text");
  assert.equal(result.provider, "huggingface");
  assert.equal(result.usedFallback, false);
  assert.equal(fallbackCalls, 0);
});

test("Hugging Face quota failure triggers OpenRouter fallback", async () => {
  const logs: string[] = [];
  const result = await callLlmWithFallback({
    prompt: "review",
    primaryProvider: provider("huggingface", async () => {
      const error = new Error("402 Payment Required");
      (error as any).status = 402;
      throw error;
    }),
    fallbackProvider: provider("openrouter", async () => "fallback text"),
    primaryModel: "Qwen/Qwen2.5-Coder-32B-Instruct:nscale",
    fallbackModel: "qwen/qwen-2.5-coder-32b-instruct",
    fallbackOn: ["quota_exceeded"],
    filePath: "src/a.ts",
    functionName: "loadUser",
    logger: {
      info: (message) => logs.push(message),
    },
  });

  assert.equal(result.text, "fallback text");
  assert.equal(result.provider, "openrouter");
  assert.equal(result.model, "qwen/qwen-2.5-coder-32b-instruct");
  assert.equal(result.usedFallback, true);
  assert.match(logs[0], /Primary provider failed, trying fallback:/);
  assert.match(logs[0], /failureType=quota_exceeded/);
  assert.match(logs[1], /Fallback provider succeeded:/);
});

test("fallback failure is recorded safely", async () => {
  await assert.rejects(
    () =>
      callLlmWithFallback({
        prompt: "review",
        primaryProvider: provider("huggingface", async () => {
          const error = new Error("402 Payment Required");
          (error as any).status = 402;
          throw error;
        }),
        fallbackProvider: provider("openrouter", async () => {
          const error = new Error("OPENROUTER_API_KEY sk-secret123");
          (error as any).status = 401;
          throw error;
        }),
        primaryModel: "hf/model",
        fallbackModel: "openrouter/model",
        fallbackOn: ["quota_exceeded"],
      }),
    (error) => {
      assert.ok(error instanceof LlmProviderCallError);
      assert.equal(error.failure.provider, "openrouter");
      assert.equal(error.failure.model, "openrouter/model");
      assert.equal(error.failure.type, "auth_failed");
      assert.doesNotMatch(error.failure.message, /sk-secret123/);
      return true;
    }
  );
});

test("fallback is not attempted for non-eligible errors", async () => {
  let fallbackCalls = 0;

  await assert.rejects(
    () =>
      callLlmWithFallback({
        prompt: "review",
        primaryProvider: provider("huggingface", async () => {
          const error = new Error("Unauthorized");
          (error as any).status = 401;
          throw error;
        }),
        fallbackProvider: provider("openrouter", async () => {
          fallbackCalls += 1;
          return "fallback text";
        }),
        primaryModel: "hf/model",
        fallbackModel: "openrouter/model",
        fallbackOn: ["quota_exceeded"],
      }),
    LlmProviderCallError
  );

  assert.equal(fallbackCalls, 0);
});

test("OpenRouter primary can fall back to Hugging Face with Hugging Face model", async () => {
  const calls: Array<{ provider: string; model: string }> = [];
  const result = await callLlmWithFallback({
    prompt: "review",
    primaryProvider: provider("openrouter", async (params) => {
      calls.push({ provider: "openrouter", model: params.model });
      const error = new Error("model unavailable");
      (error as any).status = 404;
      throw error;
    }),
    fallbackProvider: provider("huggingface", async (params) => {
      calls.push({ provider: "huggingface", model: params.model });
      return "fallback text";
    }),
    primaryModel: "cohere/north-mini-code:free",
    fallbackModel: "Qwen/Qwen2.5-Coder-32B-Instruct:nscale",
    fallbackOn: ["model_unavailable"],
  });

  assert.deepEqual(calls, [
    {
      provider: "openrouter",
      model: "cohere/north-mini-code:free",
    },
    {
      provider: "huggingface",
      model: "Qwen/Qwen2.5-Coder-32B-Instruct:nscale",
    },
  ]);
  assert.equal(result.provider, "huggingface");
  assert.equal(result.model, "Qwen/Qwen2.5-Coder-32B-Instruct:nscale");
});

test("Hugging Face primary can fall back to OpenRouter with OpenRouter model", async () => {
  const calls: Array<{ provider: string; model: string }> = [];
  const result = await callLlmWithFallback({
    prompt: "review",
    primaryProvider: provider("huggingface", async (params) => {
      calls.push({ provider: "huggingface", model: params.model });
      const error = new Error("402 Payment Required");
      (error as any).status = 402;
      throw error;
    }),
    fallbackProvider: provider("openrouter", async (params) => {
      calls.push({ provider: "openrouter", model: params.model });
      return "fallback text";
    }),
    primaryModel: "Qwen/Qwen2.5-Coder-32B-Instruct:nscale",
    fallbackModel: "cohere/north-mini-code:free",
    fallbackOn: ["quota_exceeded"],
  });

  assert.deepEqual(calls, [
    {
      provider: "huggingface",
      model: "Qwen/Qwen2.5-Coder-32B-Instruct:nscale",
    },
    {
      provider: "openrouter",
      model: "cohere/north-mini-code:free",
    },
  ]);
  assert.equal(result.provider, "openrouter");
  assert.equal(result.model, "cohere/north-mini-code:free");
});

test("OpenRouter primary can fall back to OpenAI with OpenAI model", async () => {
  const calls: Array<{ provider: string; model: string }> = [];
  const result = await callLlmWithFallback({
    prompt: "review",
    primaryProvider: provider("openrouter", async (params) => {
      calls.push({ provider: "openrouter", model: params.model });
      const error = new Error("rate limit");
      (error as any).status = 429;
      throw error;
    }),
    fallbackProvider: provider("openai", async (params) => {
      calls.push({ provider: "openai", model: params.model });
      return "fallback text";
    }),
    primaryModel: "cohere/north-mini-code:free",
    fallbackModel: "gpt-4.1-mini",
    fallbackOn: ["rate_limited"],
  });

  assert.deepEqual(calls, [
    {
      provider: "openrouter",
      model: "cohere/north-mini-code:free",
    },
    {
      provider: "openai",
      model: "gpt-4.1-mini",
    },
  ]);
  assert.equal(result.provider, "openai");
  assert.equal(result.model, "gpt-4.1-mini");
});

test("OpenRouter primary can fall back to Ollama with Ollama model", async () => {
  const calls: Array<{ provider: string; model: string }> = [];
  const result = await callLlmWithFallback({
    prompt: "review",
    primaryProvider: provider("openrouter", async (params) => {
      calls.push({ provider: "openrouter", model: params.model });
      const error = new Error("rate limit");
      (error as any).status = 429;
      throw error;
    }),
    fallbackProvider: provider("ollama", async (params) => {
      calls.push({ provider: "ollama", model: params.model });
      return "fallback text";
    }),
    primaryModel: "cohere/north-mini-code:free",
    fallbackModel: "qwen2.5-coder:7b",
    fallbackOn: ["rate_limited"],
  });

  assert.deepEqual(calls, [
    {
      provider: "openrouter",
      model: "cohere/north-mini-code:free",
    },
    {
      provider: "ollama",
      model: "qwen2.5-coder:7b",
    },
  ]);
  assert.equal(result.provider, "ollama");
  assert.equal(result.model, "qwen2.5-coder:7b");
});

test("missing OpenRouter key is classified safely as auth failure", async () => {
  await assert.rejects(
    () =>
      callLlmWithFallback({
        prompt: "review",
        primaryProvider: new MissingApiKeyProvider(
          "openrouter",
          "OPENROUTER_API_KEY"
        ),
        primaryModel: "cohere/north-mini-code:free",
        fallbackOn: ["quota_exceeded"],
      }),
    (error) => {
      assert.ok(error instanceof LlmProviderCallError);
      assert.equal(error.failure.provider, "openrouter");
      assert.equal(error.failure.model, "cohere/north-mini-code:free");
      assert.equal(error.failure.type, "auth_failed");
      assert.doesNotMatch(error.failure.message, /Bearer|sk-|hf_/);
      return true;
    }
  );
});

test("missing OpenAI key is classified safely as auth failure", async () => {
  await assert.rejects(
    () =>
      callLlmWithFallback({
        prompt: "review",
        primaryProvider: new MissingApiKeyProvider(
          "openai",
          "OPENAI_API_KEY"
        ),
        primaryModel: "gpt-4.1-mini",
        fallbackOn: ["quota_exceeded"],
      }),
    (error) => {
      assert.ok(error instanceof LlmProviderCallError);
      assert.equal(error.failure.provider, "openai");
      assert.equal(error.failure.model, "gpt-4.1-mini");
      assert.equal(error.failure.type, "auth_failed");
      assert.doesNotMatch(error.failure.message, /Bearer|sk-|hf_/);
      return true;
    }
  );
});

function provider(
  name: string,
  review: LlmProvider["review"]
): LlmProvider {
  return {
    name,
    review,
  };
}
