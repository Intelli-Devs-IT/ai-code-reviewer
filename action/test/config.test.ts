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

test("config defaults model routing to disabled", () => {
  assert.equal(DEFAULT_CONFIG.model_routing?.enabled, false);
  assert.equal(mergeReviewerConfig().model_routing?.enabled, false);
});

test("config defaults model validation mode to warn", () => {
  assert.equal(DEFAULT_CONFIG.model_validation?.mode, "warn");
  assert.equal(mergeReviewerConfig().model_validation?.mode, "warn");
});

test("config defaults provider failure behavior to warn", () => {
  assert.equal(DEFAULT_CONFIG.provider_failures?.behavior, "warn");
  assert.equal(mergeReviewerConfig().provider_failures?.behavior, "warn");
});

test("config reads model validation modes", () => {
  assert.equal(
    mergeReviewerConfig({
      model_validation: {
        mode: "strict",
      },
    }).model_validation?.mode,
    "strict"
  );
  assert.equal(
    mergeReviewerConfig({
      model_validation: {
        mode: "off",
      },
    }).model_validation?.mode,
    "off"
  );
});

test("config reads provider failure behaviors", () => {
  assert.equal(
    mergeReviewerConfig({
      provider_failures: {
        behavior: "fail",
      },
    }).provider_failures?.behavior,
    "fail"
  );
  assert.equal(
    mergeReviewerConfig({
      provider_failures: {
        behavior: "skip",
      },
    }).provider_failures?.behavior,
    "skip"
  );
});

test("invalid provider failure behavior falls back to warn", () => {
  const config = mergeReviewerConfig({
    provider_failures: {
      behavior: "ignore" as any,
    },
  });

  assert.equal(config.provider_failures?.behavior, "warn");
});

test("invalid model validation mode falls back to warn", () => {
  const config = mergeReviewerConfig({
    model_validation: {
      mode: "loud" as any,
    },
  });

  assert.equal(config.model_validation?.mode, "warn");
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

test("model routing route config is merged", () => {
  const config = mergeReviewerConfig({
    model_routing: {
      enabled: true,
      default_model: "routed/default-model",
      routes: {
        typescript: "routed/typescript-model",
      },
    },
  });

  assert.equal(config.model_routing?.enabled, true);
  assert.equal(config.model_routing?.default_model, "routed/default-model");
  assert.equal(
    config.model_routing?.routes?.typescript,
    "routed/typescript-model"
  );
});
