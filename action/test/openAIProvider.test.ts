import assert from "node:assert/strict";
import test from "node:test";

import { OpenAIProvider } from "../src/llm.openai";

test("OpenAI provider sends expected chat completions request shape", async () => {
  let capturedUrl = "";
  let capturedInit: any;
  const provider = new OpenAIProvider(
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
    }) as any
  );

  const text = await provider.review({
    prompt: "review this",
    model: "gpt-4.1-mini",
    temperature: 0.2,
  });
  const body = JSON.parse(capturedInit.body);

  assert.equal(capturedUrl, "https://api.openai.com/v1/chat/completions");
  assert.equal(capturedInit.method, "POST");
  assert.equal(capturedInit.headers.Authorization, "Bearer test-key");
  assert.equal(capturedInit.headers["Content-Type"], "application/json");
  assert.equal(body.model, "gpt-4.1-mini");
  assert.deepEqual(body.messages, [{ role: "user", content: "review this" }]);
  assert.equal(body.temperature, 0.2);
  assert.match(text, /ISSUE:/);
});

test("OpenAI provider extracts choices message content", async () => {
  const provider = new OpenAIProvider(
    "test-key",
    (async () =>
      jsonResponse({
        choices: [{ message: { content: "NO_REVIEW" } }],
      })) as any
  );

  assert.equal(
    await provider.review({
      prompt: "review this",
      model: "gpt-4.1-mini",
    }),
    "NO_REVIEW"
  );
});

test("OpenAI provider rejects empty response", async () => {
  const provider = new OpenAIProvider(
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
        model: "gpt-4.1-mini",
      }),
    /empty_response/
  );
});

test("OpenAI provider rejects HTML response", async () => {
  const provider = new OpenAIProvider(
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
        model: "gpt-4.1-mini",
      }),
    /invalid_content_type/
  );
});

test("OpenAI provider rejects malformed JSON", async () => {
  const provider = new OpenAIProvider(
    "test-key",
    (async () => textResponse("{not-json")) as any
  );

  await assert.rejects(
    () =>
      provider.review({
        prompt: "review this",
        model: "gpt-4.1-mini",
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
