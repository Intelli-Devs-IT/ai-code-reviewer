import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyProviderError,
  createProviderFailure,
  formatProviderFailureForLog,
  shouldFailForProviderFailures,
} from "../src/helpers/providerFailures";

test("HTTP 402 is classified as quota_exceeded", () => {
  assert.equal(classifyProviderError({ status: 402 }), "quota_exceeded");
});

test("monthly included credits message is classified as quota_exceeded", () => {
  assert.equal(
    classifyProviderError(
      new Error(
        "You have depleted your monthly included credits. Purchase pre-paid credits to continue using Inference Providers."
      )
    ),
    "quota_exceeded"
  );
});

test("Payment Required message is classified as quota_exceeded", () => {
  assert.equal(
    classifyProviderError(new Error("402 Payment Required")),
    "quota_exceeded"
  );
});

test("OpenRouter auth statuses are classified as auth_failed", () => {
  assert.equal(classifyProviderError({ status: 401 }), "auth_failed");
  assert.equal(classifyProviderError({ status: 403 }), "auth_failed");
});

test("OpenAI auth statuses are classified as auth_failed", () => {
  assert.equal(classifyProviderError({ status: 401 }), "auth_failed");
  assert.equal(classifyProviderError({ status: 403 }), "auth_failed");
});

test("OpenAI rate limit status is classified as rate_limited", () => {
  assert.equal(classifyProviderError({ status: 429 }), "rate_limited");
});

test("OpenAI missing model status is classified as model_unavailable", () => {
  assert.equal(classifyProviderError({ status: 404 }), "model_unavailable");
});

test("Ollama unreachable endpoint errors are classified as network_error", () => {
  assert.equal(classifyProviderError(new Error("fetch failed")), "network_error");
  assert.equal(
    classifyProviderError(new Error("connect ECONNREFUSED 127.0.0.1:11434")),
    "network_error"
  );
});

test("Ollama missing model status is classified as model_unavailable", () => {
  assert.equal(classifyProviderError({ status: 404 }), "model_unavailable");
});

test("Ollama rate limit status is classified as rate_limited", () => {
  assert.equal(classifyProviderError({ status: 429 }), "rate_limited");
});

test("OpenRouter rate limit statuses are classified as rate_limited", () => {
  assert.equal(classifyProviderError({ status: 408 }), "rate_limited");
  assert.equal(classifyProviderError({ status: 429 }), "rate_limited");
});

test("OpenRouter missing model status is classified as model_unavailable", () => {
  assert.equal(classifyProviderError({ status: 404 }), "model_unavailable");
});

test("OpenRouter server errors are classified as network_error", () => {
  assert.equal(classifyProviderError({ status: 500 }), "network_error");
  assert.equal(classifyProviderError({ status: 502 }), "network_error");
  assert.equal(classifyProviderError({ status: 504 }), "network_error");
});

test("provider failure logs do not include secrets", () => {
  const failure = createProviderFailure({
    error: new Error("Authorization: Bearer hf_secret_token and sk-secret123"),
    filePath: "src/auth.ts",
    functionName: "login",
    model: "Qwen/Qwen2.5-Coder-32B-Instruct:nscale",
  });
  const log = formatProviderFailureForLog(failure);

  assert.doesNotMatch(log, /Bearer hf_secret_token/);
  assert.doesNotMatch(log, /Authorization: Bearer/);
  assert.doesNotMatch(log, /sk-secret123/);
  assert.match(log, /\[REDACTED\]/);
  assert.match(log, /file=src\/auth\.ts/);
  assert.match(log, /function=login/);
});

test("fail behavior fails only when provider failures exist", () => {
  const failures = [
    createProviderFailure({
      error: { status: 402 },
      model: "Qwen/Qwen2.5-Coder-32B-Instruct:nscale",
    }),
  ];

  assert.equal(shouldFailForProviderFailures("fail", failures), true);
  assert.equal(shouldFailForProviderFailures("warn", failures), false);
  assert.equal(shouldFailForProviderFailures("skip", failures), false);
  assert.equal(shouldFailForProviderFailures("fail", []), false);
});
