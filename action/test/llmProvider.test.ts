import assert from "node:assert/strict";
import test from "node:test";

import {
  callLlmWithFallback,
  LlmProvider,
  LlmProviderCallError,
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

function provider(
  name: string,
  review: LlmProvider["review"]
): LlmProvider {
  return {
    name,
    review,
  };
}
