import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_CONFIG, mergeReviewerConfig } from "../src/config";

test("config defaults security review mode to disabled", () => {
  assert.equal(DEFAULT_CONFIG.security_review?.enabled, false);
});

test("config reads enabled security review mode", () => {
  const config = mergeReviewerConfig({
    enabled: true,
    security_review: {
      enabled: true,
    },
  });

  assert.equal(config.security_review?.enabled, true);
});

test("missing security review config keeps default disabled behavior", () => {
  const config = mergeReviewerConfig({
    enabled: true,
    max_files: 5,
    include: ["**/*.ts"],
    exclude: [],
  });

  assert.equal(config.security_review?.enabled, false);
  assert.equal(config.max_files, 5);
});

test("empty config merge falls back to disabled security review mode", () => {
  const config = mergeReviewerConfig();

  assert.equal(config.security_review?.enabled, false);
});
