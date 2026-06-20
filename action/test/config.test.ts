import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MAX_FUNCTIONS_PER_FILE,
  DEFAULT_MAX_INLINE_COMMENTS,
  DEFAULT_MAX_TOTAL_FUNCTIONS,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_PROVIDER_FALLBACK_ON,
  DEFAULT_CONFIG,
  getInlineConfidenceThreshold,
  mergeReviewerConfig,
  resolveProviderChain,
} from "../src/config";

test("config defaults security review mode to disabled", () => {
  assert.equal(DEFAULT_CONFIG.security_review?.enabled, false);
});

test("config defaults review strictness to balanced", () => {
  assert.equal(DEFAULT_CONFIG.review?.strictness, "balanced");
  assert.equal(mergeReviewerConfig().review?.strictness, "balanced");
});

test("config defaults review cost and noise limits", () => {
  const config = mergeReviewerConfig();

  assert.equal(
    config.review?.max_inline_comments,
    DEFAULT_MAX_INLINE_COMMENTS,
  );
  assert.equal(
    config.review?.max_functions_per_file,
    DEFAULT_MAX_FUNCTIONS_PER_FILE,
  );
  assert.equal(
    config.review?.max_total_functions,
    DEFAULT_MAX_TOTAL_FUNCTIONS,
  );
});

test("config defaults external analysis reports to disabled", () => {
  const config = mergeReviewerConfig();

  assert.equal(config.analysis?.lint?.enabled, false);
  assert.equal(config.analysis?.semgrep?.enabled, false);
  assert.equal(config.analysis?.tests?.enabled, false);
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

test("config defaults providers to huggingface without fallback", () => {
  const config = mergeReviewerConfig();

  assert.equal(config.providers?.primary, "huggingface");
  assert.equal(config.providers?.fallback, undefined);
  assert.deepEqual(config.providers?.fallback_on, DEFAULT_PROVIDER_FALLBACK_ON);
});

test("config defaults OpenRouter model", () => {
  assert.equal(
    mergeReviewerConfig().openrouter?.default_model,
    DEFAULT_OPENROUTER_MODEL,
  );
});

test("config defaults OpenAI model", () => {
  assert.equal(mergeReviewerConfig().openai?.default_model, DEFAULT_OPENAI_MODEL);
});

test("config defaults Ollama settings", () => {
  const config = mergeReviewerConfig();

  assert.equal(config.ollama?.base_url, DEFAULT_OLLAMA_BASE_URL);
  assert.equal(config.ollama?.default_model, DEFAULT_OLLAMA_MODEL);
});

test("config reads model validation modes", () => {
  assert.equal(
    mergeReviewerConfig({
      model_validation: {
        mode: "strict",
      },
    }).model_validation?.mode,
    "strict",
  );
  assert.equal(
    mergeReviewerConfig({
      model_validation: {
        mode: "off",
      },
    }).model_validation?.mode,
    "off",
  );
});

test("config reads provider failure behaviors", () => {
  assert.equal(
    mergeReviewerConfig({
      provider_failures: {
        behavior: "fail",
      },
    }).provider_failures?.behavior,
    "fail",
  );
  assert.equal(
    mergeReviewerConfig({
      provider_failures: {
        behavior: "skip",
      },
    }).provider_failures?.behavior,
    "skip",
  );
});

test("config reads provider fallback settings", () => {
  const config = mergeReviewerConfig({
    providers: {
      primary: "huggingface",
      fallback: "openrouter",
      fallback_on: ["quota_exceeded"],
    },
    openrouter: {
      default_model: "openrouter/custom-model",
    },
  });

  assert.equal(config.providers?.primary, "huggingface");
  assert.equal(config.providers?.fallback, "openrouter");
  assert.deepEqual(config.providers?.fallback_on, ["quota_exceeded"]);
  assert.equal(config.openrouter?.default_model, "openrouter/custom-model");
});

test("config reads provider fallback chain settings", () => {
  const config = mergeReviewerConfig({
    providers: {
      primary: "openai",
      fallbacks: ["openrouter", "huggingface", "ollama"],
      fallback_on: ["rate_limited", "model_unavailable"],
    },
  });

  assert.equal(config.providers?.primary, "openai");
  assert.deepEqual(config.providers?.fallbacks, [
    "openrouter",
    "huggingface",
    "ollama",
  ]);
  assert.deepEqual(config.providers?.fallback_on, [
    "rate_limited",
    "model_unavailable",
  ]);
});

test("resolveProviderChain uses configured fallback chain", () => {
  const config = mergeReviewerConfig({
    providers: {
      primary: "openai",
      fallbacks: ["openrouter", "huggingface"],
      fallback: "ollama",
    },
  });

  assert.deepEqual(resolveProviderChain(config), [
    "openai",
    "openrouter",
    "huggingface",
  ]);
});

test("resolveProviderChain keeps backward-compatible single fallback", () => {
  const config = mergeReviewerConfig({
    providers: {
      primary: "openai",
      fallback: "openrouter",
    },
  });

  assert.deepEqual(resolveProviderChain(config), ["openai", "openrouter"]);
});

test("resolveProviderChain uses primary only when no fallback is configured", () => {
  const config = mergeReviewerConfig({
    providers: {
      primary: "openai",
    },
  });

  assert.deepEqual(resolveProviderChain(config), ["openai"]);
});

test("resolveProviderChain preserves default Hugging Face provider", () => {
  assert.deepEqual(resolveProviderChain(mergeReviewerConfig()), ["huggingface"]);
});

test("resolveProviderChain removes duplicate providers and cycles", () => {
  const config = mergeReviewerConfig({
    providers: {
      primary: "openai",
      fallbacks: ["openrouter", "openai", "openrouter", "ollama"],
    },
  });

  assert.deepEqual(resolveProviderChain(config), [
    "openai",
    "openrouter",
    "ollama",
  ]);
});

test("config reads OpenRouter primary and Hugging Face fallback", () => {
  const config = mergeReviewerConfig({
    providers: {
      primary: "openrouter",
      fallback: "huggingface",
      fallback_on: ["auth_failed"],
    },
    openrouter: {
      default_model: "cohere/north-mini-code:free",
    },
  });

  assert.equal(config.providers?.primary, "openrouter");
  assert.equal(config.providers?.fallback, "huggingface");
  assert.deepEqual(config.providers?.fallback_on, ["auth_failed"]);
  assert.equal(
    config.openrouter?.default_model,
    "cohere/north-mini-code:free",
  );
});

test("config reads OpenAI primary and fallback settings", () => {
  const config = mergeReviewerConfig({
    providers: {
      primary: "openai",
      fallback: "openrouter",
      fallback_on: ["rate_limited"],
    },
    openai: {
      default_model: "gpt-4.1-mini",
    },
  });

  assert.equal(config.providers?.primary, "openai");
  assert.equal(config.providers?.fallback, "openrouter");
  assert.deepEqual(config.providers?.fallback_on, ["rate_limited"]);
  assert.equal(config.openai?.default_model, "gpt-4.1-mini");
});

test("config reads Ollama primary and fallback settings", () => {
  const config = mergeReviewerConfig({
    providers: {
      primary: "ollama",
      fallback: "openrouter",
      fallback_on: ["model_unavailable", "network_error"],
    },
    ollama: {
      base_url: "http://ollama.local:11434/v1",
      default_model: "qwen2.5-coder:14b",
    },
  });

  assert.equal(config.providers?.primary, "ollama");
  assert.equal(config.providers?.fallback, "openrouter");
  assert.deepEqual(config.providers?.fallback_on, [
    "model_unavailable",
    "network_error",
  ]);
  assert.equal(config.ollama?.base_url, "http://ollama.local:11434/v1");
  assert.equal(config.ollama?.default_model, "qwen2.5-coder:14b");
});

test("empty Ollama settings fall back to defaults", () => {
  const config = mergeReviewerConfig({
    ollama: {
      base_url: " ",
      default_model: "",
    },
  });

  assert.equal(config.ollama?.base_url, DEFAULT_OLLAMA_BASE_URL);
  assert.equal(config.ollama?.default_model, DEFAULT_OLLAMA_MODEL);
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

test("config reads review cost and noise limits", () => {
  const config = mergeReviewerConfig({
    review: {
      max_inline_comments: 5,
      max_functions_per_file: 3,
      max_total_functions: 12,
    },
  });

  assert.equal(config.review?.max_inline_comments, 5);
  assert.equal(config.review?.max_functions_per_file, 3);
  assert.equal(config.review?.max_total_functions, 12);
});

test("config reads external analysis report settings", () => {
  const config = mergeReviewerConfig({
    analysis: {
      lint: {
        enabled: true,
        report_path: "reports/eslint.json",
      },
      semgrep: {
        enabled: true,
        report_path: "reports/semgrep.json",
      },
      tests: {
        enabled: true,
        report_path: "reports/test-results.json",
      },
    },
  });

  assert.equal(config.analysis?.lint?.enabled, true);
  assert.equal(config.analysis?.lint?.report_path, "reports/eslint.json");
  assert.equal(config.analysis?.semgrep?.enabled, true);
  assert.equal(config.analysis?.semgrep?.report_path, "reports/semgrep.json");
  assert.equal(config.analysis?.tests?.enabled, true);
  assert.equal(config.analysis?.tests?.report_path, "reports/test-results.json");
});

test("invalid review cost and noise limits fall back to defaults", () => {
  const config = mergeReviewerConfig({
    review: {
      max_inline_comments: 0,
      max_functions_per_file: -1,
      max_total_functions: 2.5,
    },
  });

  assert.equal(
    config.review?.max_inline_comments,
    DEFAULT_MAX_INLINE_COMMENTS,
  );
  assert.equal(
    config.review?.max_functions_per_file,
    DEFAULT_MAX_FUNCTIONS_PER_FILE,
  );
  assert.equal(
    config.review?.max_total_functions,
    DEFAULT_MAX_TOTAL_FUNCTIONS,
  );
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
    "routed/typescript-model",
  );
});
