import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReviewSkipLog,
  redactSecrets,
} from "../src/helpers/reviewDiagnostics";

test("skip log includes file function model and review metadata", () => {
  const log = buildReviewSkipLog({
    filePath: "src/auth/auth.service.ts",
    functionName: "createUser",
    provider: "openrouter",
    model: "Qwen/Qwen2.5-Coder-32B-Instruct:nscale",
    language: "typescript",
    reviewStrictness: "balanced",
    securityReviewEnabled: false,
    reason: "confidence_below_threshold",
    confidence: 38,
    threshold: 45,
    limit: 5,
    skippedFunctions: 3,
  });

  assert.match(log, /AI review skipped:/);
  assert.match(log, /file=src\/auth\/auth.service\.ts/);
  assert.match(log, /function=createUser/);
  assert.match(log, /provider=openrouter/);
  assert.match(log, /model=Qwen\/Qwen2\.5-Coder-32B-Instruct:nscale/);
  assert.match(log, /language=typescript/);
  assert.match(log, /strictness=balanced/);
  assert.match(log, /securityReview=false/);
  assert.match(log, /reason=confidence_below_threshold/);
  assert.match(log, /confidence=38/);
  assert.match(log, /threshold=45/);
  assert.match(log, /limit=5/);
  assert.match(log, /skippedFunctions=3/);
});

test("skip log redacts token-like secrets from preview", () => {
  const log = buildReviewSkipLog({
    filePath: "src/auth.ts",
    reason: "should_skip_review",
    preview: "Provider mentioned Bearer abc.def and sk-testsecret",
  });

  assert.doesNotMatch(log, /Bearer abc\.def/);
  assert.doesNotMatch(log, /sk-testsecret/);
  assert.match(log, /\[REDACTED\]/);
});

test("redactSecrets masks common token formats", () => {
  const redacted = redactSecrets(
    "ghp_abc123 github_pat_abc123 hf_abc123 sk-abc123"
  );

  assert.equal(
    redacted,
    "[REDACTED] [REDACTED] [REDACTED] [REDACTED]"
  );
});
