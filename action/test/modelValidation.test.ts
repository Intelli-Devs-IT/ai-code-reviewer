import assert from "node:assert/strict";
import test from "node:test";

import { mergeReviewerConfig } from "../src/config";
import {
  DEFAULT_HUGGINGFACE_MODEL,
  TESTED_HUGGINGFACE_MODELS,
} from "../src/helpers/huggingFaceModels";
import {
  findClosestTestedModel,
  getConfiguredRoutingModels,
  validateConfiguredModels,
} from "../src/helpers/modelValidation";

const TESTED_MODEL = "bigcode/starcoder2-15b-instruct";
const TYPO_MODEL = "sbigcode/starcoder2-15b-instruct";
const UNKNOWN_MODEL = "private/custom-review-model";

test("DEFAULT_HUGGINGFACE_MODEL remains unchanged", () => {
  assert.equal(
    DEFAULT_HUGGINGFACE_MODEL,
    "Qwen/Qwen2.5-Coder-32B-Instruct:nscale"
  );
  assert.ok(TESTED_HUGGINGFACE_MODELS.includes(DEFAULT_HUGGINGFACE_MODEL));
});

test("strict mode blocks unknown route model", () => {
  const config = mergeReviewerConfig({
    model_validation: {
      mode: "strict",
    },
    model_routing: {
      enabled: true,
      routes: {
        markdown: UNKNOWN_MODEL,
      },
    },
  });

  assert.throws(
    () => validateConfiguredModels(config),
    /Unknown model configured for model_routing\.routes\.markdown/
  );
});

test("warn mode allows unknown route model and logs warning", () => {
  const warnings: string[] = [];
  const config = mergeReviewerConfig({
    model_validation: {
      mode: "warn",
    },
    model_routing: {
      enabled: true,
      routes: {
        markdown: UNKNOWN_MODEL,
      },
    },
  });

  validateConfiguredModels(config, {
    warning: (message) => warnings.push(message),
  });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /model_routing\.routes\.markdown/);
  assert.match(warnings[0], new RegExp(escapeRegExp(UNKNOWN_MODEL)));
});

test("off mode allows unknown route model without warning", () => {
  const warnings: string[] = [];
  const config = mergeReviewerConfig({
    model_validation: {
      mode: "off",
    },
    model_routing: {
      enabled: true,
      routes: {
        markdown: UNKNOWN_MODEL,
      },
    },
  });

  validateConfiguredModels(config, {
    warning: (message) => warnings.push(message),
  });

  assert.deepEqual(warnings, []);
});

test("tested model passes in strict warn and off modes", () => {
  for (const mode of ["strict", "warn", "off"] as const) {
    const warnings: string[] = [];
    const config = mergeReviewerConfig({
      model_validation: {
        mode,
      },
      model_routing: {
        enabled: true,
        routes: {
          typescript: TESTED_MODEL,
        },
      },
    });

    assert.doesNotThrow(() =>
      validateConfiguredModels(config, {
        warning: (message) => warnings.push(message),
      })
    );
    assert.deepEqual(warnings, []);
  }
});

test("typo model gives closest tested model suggestion", () => {
  const warnings: string[] = [];
  const config = mergeReviewerConfig({
    model_validation: {
      mode: "warn",
    },
    model_routing: {
      enabled: true,
      routes: {
        markdown: TYPO_MODEL,
      },
    },
  });

  validateConfiguredModels(config, {
    warning: (message) => warnings.push(message),
  });

  assert.equal(findClosestTestedModel(TYPO_MODEL), TESTED_MODEL);
  assert.match(warnings[0], /Did you mean: bigcode\/starcoder2-15b-instruct\?/);
});

test("model_routing.default_model is validated", () => {
  const warnings: string[] = [];
  const config = mergeReviewerConfig({
    model_validation: {
      mode: "warn",
    },
    model_routing: {
      enabled: true,
      default_model: UNKNOWN_MODEL,
    },
  });

  validateConfiguredModels(config, {
    warning: (message) => warnings.push(message),
  });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /model_routing\.default_model/);
});

test("model_routing.routes values are validated", () => {
  const config = mergeReviewerConfig({
    model_validation: {
      mode: "warn",
    },
    model_routing: {
      enabled: true,
      default_model: TESTED_MODEL,
      routes: {
        typescript: TESTED_MODEL,
        markdown: UNKNOWN_MODEL,
      },
    },
  });

  assert.deepEqual(getConfiguredRoutingModels(config), [
    {
      path: "model_routing.default_model",
      model: TESTED_MODEL,
    },
    {
      path: "model_routing.routes.typescript",
      model: TESTED_MODEL,
    },
    {
      path: "model_routing.routes.markdown",
      model: UNKNOWN_MODEL,
    },
  ]);
});

test("OpenRouter model is not validated against Hugging Face tested models", () => {
  const config = mergeReviewerConfig({
    model_validation: {
      mode: "strict",
    },
    providers: {
      fallback: "openrouter",
    },
    openrouter: {
      default_model: "qwen/qwen-2.5-coder-32b-instruct",
    },
  });

  assert.doesNotThrow(() => validateConfiguredModels(config));
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
