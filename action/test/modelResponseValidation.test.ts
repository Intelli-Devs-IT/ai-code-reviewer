import assert from "node:assert/strict";
import test from "node:test";

import {
  assertValidModelResponseText,
  extractModelResponseText,
  getSafeProviderErrorMessage,
  isLikelyHtmlResponse,
} from "../src/helpers/modelResponseValidation";

const model = "Qwen/Qwen2.5-Coder-32B-Instruct:nscale";

test("detects HTML provider responses", () => {
  assert.equal(isLikelyHtmlResponse("<!doctype html><html></html>"), true);
  assert.equal(isLikelyHtmlResponse("<html><head></head><body></body>"), true);
});

test("detects Hugging Face HTML title responses", () => {
  assert.equal(
    isLikelyHtmlResponse(
      "<title>Hugging Face</title> Hugging Face - The AI community building the future."
    ),
    true
  );
});

test("rejects empty and whitespace response text", () => {
  assert.throws(
    () =>
      assertValidModelResponseText({
        text: "",
        model,
        provider: "Hugging Face",
      }),
    /empty_response/
  );
  assert.throws(
    () =>
      assertValidModelResponseText({
        text: "   ",
        model,
        provider: "Hugging Face",
      }),
    /empty_response/
  );
});

test("rejects provider quota message returned as text", () => {
  assert.throws(
    () =>
      assertValidModelResponseText({
        text: "You have depleted your monthly included credits. Purchase pre-paid credits to continue using Inference Providers.",
        model,
        provider: "Hugging Face",
      }),
    /provider_error_response/
  );
});

test("accepts valid plain text response", () => {
  const text = "ISSUE:\nPossible null access.\n\nIMPACT:\nThis can throw.";

  assert.equal(
    assertValidModelResponseText({
      text: `  ${text}  `,
      model,
      provider: "Hugging Face",
    }),
    text
  );
});

test("extracts valid OpenAI-style response text", () => {
  const response = {
    choices: [
      {
        message: {
          content: "ISSUE:\nHandle null.\n\nIMPACT:\nAvoids a crash.",
        },
      },
    ],
  };

  assert.equal(
    extractModelResponseText(response),
    "ISSUE:\nHandle null.\n\nIMPACT:\nAvoids a crash."
  );
});

test("extracts valid generated_text response text", () => {
  const response = [
    {
      generated_text: "ISSUE:\nValidate input.\n\nIMPACT:\nAvoids bad data.",
    },
  ];

  assert.equal(
    extractModelResponseText(response),
    "ISSUE:\nValidate input.\n\nIMPACT:\nAvoids bad data."
  );
});

test("rejects HTML with model name and safe preview", () => {
  assert.throws(
    () =>
      assertValidModelResponseText({
        text: "<title>Hugging Face</title>",
        model,
        provider: "Hugging Face",
      }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Provider response rejected:/);
      assert.match(error.message, new RegExp(escapeRegExp(model)));
      assert.match(error.message, /html_response/);
      assert.match(error.message, /<title>Hugging Face/);
      return true;
    }
  );
});

test("safe provider error messages redact tokens and authorization headers", () => {
  const message = getSafeProviderErrorMessage(
    new Error("Authorization: Bearer hf_secret_token and sk-secret123")
  );

  assert.doesNotMatch(message, /Bearer hf_secret_token/);
  assert.doesNotMatch(message, /sk-secret123/);
  assert.doesNotMatch(message, /Authorization: Bearer/);
  assert.match(message, /\[REDACTED\]/);
});

test("malformed response shape extracts no model text", () => {
  assert.equal(extractModelResponseText({ choices: [] }), null);
  assert.equal(extractModelResponseText({ error: "model unavailable" }), null);
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
