import assert from "node:assert/strict";
import test from "node:test";

import { OpenRouterProvider } from "../src/llm.openrouter";

test("OpenRouter provider sends expected request shape", async () => {
  let capturedUrl = "";
  let capturedInit: any;
  const provider = new OpenRouterProvider(
    "test-key",
    (async (url: string, init: any) => {
      capturedUrl = url;
      capturedInit = init;

      return jsonResponse({
        choices: [
          {
            message: {
              content: "ISSUE:\nHandle null.\n\nIMPACT:\nAvoids a crash.",
            },
          },
        ],
      });
    }) as any,
    "https://github.com/example/repo"
  );

  const text = await provider.review({
    prompt: "review this",
    model: "qwen/qwen-2.5-coder-32b-instruct",
    temperature: 0.2,
  });
  const body = JSON.parse(capturedInit.body);

  assert.equal(
    capturedUrl,
    "https://openrouter.ai/api/v1/chat/completions"
  );
  assert.equal(capturedInit.method, "POST");
  assert.equal(capturedInit.headers.Authorization, "Bearer test-key");
  assert.equal(capturedInit.headers["Content-Type"], "application/json");
  assert.equal(capturedInit.headers["HTTP-Referer"], "https://github.com/example/repo");
  assert.equal(capturedInit.headers["X-Title"], "AI Code Reviewer");
  assert.equal(body.model, "qwen/qwen-2.5-coder-32b-instruct");
  assert.deepEqual(body.messages, [{ role: "user", content: "review this" }]);
  assert.equal(body.temperature, 0.2);
  assert.match(text, /ISSUE:/);
});

test("OpenRouter provider extracts choices message content", async () => {
  const provider = new OpenRouterProvider(
    "test-key",
    (async () =>
      jsonResponse({
        choices: [{ message: { content: "NO_REVIEW" } }],
      })) as any
  );

  assert.equal(
    await provider.review({
      prompt: "review this",
      model: "qwen/qwen-2.5-coder-32b-instruct",
    }),
    "NO_REVIEW"
  );
});

test("OpenRouter provider rejects empty response", async () => {
  const provider = new OpenRouterProvider(
    "test-key",
    (async () =>
      jsonResponse({
        choices: [{ message: { content: "" } }],
      })) as any
  );

  await assert.rejects(
    () =>
      provider.review({
        prompt: "review this",
        model: "qwen/qwen-2.5-coder-32b-instruct",
      }),
    /empty_response/
  );
});

test("OpenRouter provider rejects HTML response", async () => {
  const provider = new OpenRouterProvider(
    "test-key",
    (async () =>
      textResponse("<!doctype html><html><body>Provider error</body></html>", {
        contentType: "text/html",
      })) as any
  );

  await assert.rejects(
    () =>
      provider.review({
        prompt: "review this",
        model: "qwen/qwen-2.5-coder-32b-instruct",
      }),
    /invalid_content_type/
  );
});

test("OpenRouter provider rejects malformed JSON", async () => {
  const provider = new OpenRouterProvider(
    "test-key",
    (async () => textResponse("{not-json")) as any
  );

  await assert.rejects(
    () =>
      provider.review({
        prompt: "review this",
        model: "qwen/qwen-2.5-coder-32b-instruct",
      }),
    /malformed_json/
  );
});

function jsonResponse(body: unknown) {
  return textResponse(JSON.stringify(body));
}

function textResponse(
  body: string,
  options: { status?: number; contentType?: string } = {}
) {
  return {
    ok: (options.status ?? 200) >= 200 && (options.status ?? 200) < 300,
    status: options.status ?? 200,
    statusText: "OK",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type"
          ? options.contentType ?? "application/json"
          : null,
    },
    text: async () => body,
  };
}
