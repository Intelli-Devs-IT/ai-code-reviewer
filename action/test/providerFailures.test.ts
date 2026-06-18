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
