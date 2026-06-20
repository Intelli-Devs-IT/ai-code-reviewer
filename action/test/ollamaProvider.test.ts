import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_OLLAMA_BASE_URL } from "../src/config";
import { OllamaProvider } from "../src/llm.ollama";

test("Ollama provider sends expected chat completions request shape", async () => {
  let capturedUrl = "";
  let capturedInit: any;
  const provider = new OllamaProvider(
    "http://ollama.local:11434/v1",
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
  );

  const text = await provider.review({
    prompt: "review this",
    model: "qwen2.5-coder:7b",
    temperature: 0.2,
  });
  const body = JSON.parse(capturedInit.body);

  assert.equal(
    capturedUrl,
    "http://ollama.local:11434/v1/chat/completions",
  );
  assert.equal(capturedInit.method, "POST");
  assert.equal(capturedInit.headers["Content-Type"], "application/json");
  assert.equal(capturedInit.headers.Authorization, undefined);
  assert.equal(body.model, "qwen2.5-coder:7b");
  assert.deepEqual(body.messages, [{ role: "user", content: "review this" }]);
  assert.equal(body.temperature, 0.2);
  assert.match(text, /ISSUE:/);
});

test("Ollama provider uses default base URL when missing from config", async () => {
  let capturedUrl = "";
  const provider = new OllamaProvider(
    DEFAULT_OLLAMA_BASE_URL,
    (async (url: string) => {
      capturedUrl = url;

      return jsonResponse({
        choices: [{ message: { content: "NO_REVIEW" } }],
      });
    }) as any,
  );

  await provider.review({
    prompt: "review this",
    model: "qwen2.5-coder:7b",
  });

  assert.equal(
    capturedUrl,
    "http://localhost:11434/v1/chat/completions",
  );
});

test("Ollama provider handles trailing slash in base URL", async () => {
  let capturedUrl = "";
  const provider = new OllamaProvider(
    "http://localhost:11434/v1/",
    (async (url: string) => {
      capturedUrl = url;

      return jsonResponse({
        choices: [{ message: { content: "NO_REVIEW" } }],
      });
    }) as any,
  );

  await provider.review({
    prompt: "review this",
    model: "qwen2.5-coder:7b",
  });

  assert.equal(
    capturedUrl,
    "http://localhost:11434/v1/chat/completions",
  );
});

test("Ollama provider extracts choices message content", async () => {
  const provider = new OllamaProvider(
    DEFAULT_OLLAMA_BASE_URL,
    (async () =>
      jsonResponse({
        choices: [{ message: { content: "NO_REVIEW" } }],
      })) as any,
  );

  assert.equal(
    await provider.review({
      prompt: "review this",
      model: "qwen2.5-coder:7b",
    }),
    "NO_REVIEW",
  );
});

test("Ollama provider rejects empty response", async () => {
  const provider = new OllamaProvider(
    DEFAULT_OLLAMA_BASE_URL,
    (async () =>
      jsonResponse({
        choices: [{ message: { content: "" } }],
      })) as any,
  );

  await assert.rejects(
    () =>
      provider.review({
        prompt: "review this",
        model: "qwen2.5-coder:7b",
      }),
    /empty_response/,
  );
});

test("Ollama provider rejects HTML response", async () => {
  const provider = new OllamaProvider(
    DEFAULT_OLLAMA_BASE_URL,
    (async () =>
      textResponse("<!doctype html><html><body>Provider error</body></html>", {
        contentType: "text/html",
      })) as any,
  );

  await assert.rejects(
    () =>
      provider.review({
        prompt: "review this",
        model: "qwen2.5-coder:7b",
      }),
    /invalid_content_type/,
  );
});

test("Ollama provider rejects malformed JSON", async () => {
  const provider = new OllamaProvider(
    DEFAULT_OLLAMA_BASE_URL,
    (async () => textResponse("{not-json")) as any,
  );

  await assert.rejects(
    () =>
      provider.review({
        prompt: "review this",
        model: "qwen2.5-coder:7b",
      }),
    /malformed_json/,
  );
});

function jsonResponse(body: unknown) {
  return textResponse(JSON.stringify(body));
}

function textResponse(
  body: string,
  options: { status?: number; contentType?: string } = {},
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
