import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CONFIG,
  getInlineConfidenceThreshold,
  mergeReviewerConfig,
} from "../src/config";

test("config defaults security review mode to disabled", () => {
  assert.equal(DEFAULT_CONFIG.security_review?.enabled, false);
});

test("config defaults review strictness to balanced", () => {
  assert.equal(DEFAULT_CONFIG.review?.strictness, "balanced");
  assert.equal(mergeReviewerConfig().review?.strictness, "balanced");
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

test("missing strictness defaults to balanced", () => {
  const config = mergeReviewerConfig({
    review: {},
  });

  assert.equal(config.review?.strictness, "balanced");
});

test("lenient strictness is parsed correctly", () => {
  const config = mergeReviewerConfig({
    review: {
      strictness: "lenient",
    },
  });

  assert.equal(config.review?.strictness, "lenient");
});

test("balanced strictness is parsed correctly", () => {
  const config = mergeReviewerConfig({
    review: {
      strictness: "balanced",
    },
  });

  assert.equal(config.review?.strictness, "balanced");
});

test("strict strictness is parsed correctly", () => {
  const config = mergeReviewerConfig({
    review: {
      strictness: "strict",
    },
  });

  assert.equal(config.review?.strictness, "strict");
});

test("invalid strictness falls back to balanced", () => {
  const config = mergeReviewerConfig({
    review: {
      strictness: "loud" as any,
    },
  });

  assert.equal(config.review?.strictness, "balanced");
});

test("empty config merge falls back to disabled security review mode", () => {
  const config = mergeReviewerConfig();

  assert.equal(config.security_review?.enabled, false);
});

test("inline confidence threshold changes by strictness", () => {
  assert.equal(getInlineConfidenceThreshold("lenient"), 10);
  assert.equal(getInlineConfidenceThreshold("balanced"), 20);
  assert.equal(getInlineConfidenceThreshold("strict"), 65);
});
