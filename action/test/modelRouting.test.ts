import assert from "node:assert/strict";
import test from "node:test";

import { mergeReviewerConfig } from "../src/config";
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENROUTER_MODEL,
} from "../src/config";
import { DEFAULT_HUGGINGFACE_MODEL } from "../src/helpers/huggingFaceModels";
import {
  detectLanguageFromPath,
  resolveModelForFile,
  resolveModelForProviderFile,
} from "../src/helpers/modelRouting";
import { buildChangedFunctionReviewPrompt } from "../src/helpers/reviewPrompt";

const EXISTING_DEFAULT_MODEL = "existing/default-model";

test("routing disabled returns existing default model", () => {
  const config = mergeReviewerConfig({
    model_routing: {
      enabled: false,
      routes: {
        typescript: "routed/typescript-model",
      },
    },
  });

  assert.equal(
    resolveModelForFile({
      filePath: "src/app.ts",
      config,
      existingDefaultModel: EXISTING_DEFAULT_MODEL,
    }),
    EXISTING_DEFAULT_MODEL
  );
});

test("missing model routing returns existing default model", () => {
  const config = mergeReviewerConfig();

  assert.equal(
    resolveModelForFile({
      filePath: "src/app.ts",
      config,
      existingDefaultModel: EXISTING_DEFAULT_MODEL,
    }),
    EXISTING_DEFAULT_MODEL
  );
});

test("OpenRouter provider uses openrouter.default_model when routing is disabled", () => {
  const config = mergeReviewerConfig({
    providers: {
      primary: "openrouter",
    },
    model_routing: {
      enabled: false,
      default_model: "hf/routed-default",
    },
    openrouter: {
      default_model: "cohere/north-mini-code:free",
    },
  });

  assert.equal(
    resolveModelForProviderFile({
      provider: "openrouter",
      filePath: "src/app.ts",
      config,
    }),
    "cohere/north-mini-code:free"
  );
});

test("OpenRouter provider falls back to DEFAULT_OPENROUTER_MODEL", () => {
  const config = mergeReviewerConfig({
    providers: {
      primary: "openrouter",
    },
    openrouter: {
      default_model: undefined,
    },
  });

  assert.equal(
    resolveModelForProviderFile({
      provider: "openrouter",
      filePath: "src/app.ts",
      config,
    }),
    DEFAULT_OPENROUTER_MODEL
  );
});

test("OpenAI provider uses openai.default_model when routing is disabled", () => {
  const config = mergeReviewerConfig({
    providers: {
      primary: "openai",
    },
    model_routing: {
      enabled: false,
      default_model: "hf/routed-default",
    },
    openai: {
      default_model: "gpt-4.1-mini",
    },
  });

  assert.equal(
    resolveModelForProviderFile({
      provider: "openai",
      filePath: "src/app.ts",
      config,
    }),
    "gpt-4.1-mini"
  );
});

test("OpenAI provider falls back to DEFAULT_OPENAI_MODEL", () => {
  const config = mergeReviewerConfig({
    providers: {
      primary: "openai",
    },
    openai: {
      default_model: undefined,
    },
  });

  assert.equal(
    resolveModelForProviderFile({
      provider: "openai",
      filePath: "src/app.ts",
      config,
    }),
    DEFAULT_OPENAI_MODEL
  );
});

test("Hugging Face provider still uses DEFAULT_HUGGINGFACE_MODEL when routing is disabled", () => {
  const config = mergeReviewerConfig({
    providers: {
      primary: "huggingface",
    },
    model_routing: {
      enabled: false,
    },
    openrouter: {
      default_model: "cohere/north-mini-code:free",
    },
  });

  assert.equal(
    resolveModelForProviderFile({
      provider: "huggingface",
      filePath: "src/app.ts",
      config,
    }),
    DEFAULT_HUGGINGFACE_MODEL
  );
});

test("Hugging Face provider keeps existing model routing behavior", () => {
  const config = mergeReviewerConfig({
    providers: {
      primary: "huggingface",
    },
    model_routing: {
      enabled: true,
      routes: {
        typescript: "hf/typescript-model",
      },
    },
  });

  assert.equal(
    resolveModelForProviderFile({
      provider: "huggingface",
      filePath: "src/app.ts",
      config,
    }),
    "hf/typescript-model"
  );
});

test("detects supported languages from file paths", () => {
  assert.equal(detectLanguageFromPath("src/app.ts"), "typescript");
  assert.equal(detectLanguageFromPath("src/app.tsx"), "typescript");
  assert.equal(detectLanguageFromPath("src/app.js"), "javascript");
  assert.equal(detectLanguageFromPath("src/app.jsx"), "javascript");
  assert.equal(detectLanguageFromPath("scripts/task.mjs"), "javascript");
  assert.equal(detectLanguageFromPath("scripts/task.cjs"), "javascript");
  assert.equal(detectLanguageFromPath("scripts/task.py"), "python");
  assert.equal(detectLanguageFromPath("README.md"), "markdown");
  assert.equal(detectLanguageFromPath("docs/page.mdx"), "markdown");
  assert.equal(detectLanguageFromPath("package.json"), "json");
  assert.equal(detectLanguageFromPath(".github/action.yml"), "yaml");
  assert.equal(detectLanguageFromPath(".github/action.yaml"), "yaml");
  assert.equal(detectLanguageFromPath("Dockerfile"), "other");
});

test("typescript file resolves to typescript route", () => {
  assert.equal(resolveFor("src/app.ts"), "routed/typescript-model");
});

test("javascript file resolves to javascript route", () => {
  assert.equal(resolveFor("src/app.js"), "routed/javascript-model");
});

test("python file resolves to python route", () => {
  assert.equal(resolveFor("scripts/task.py"), "routed/python-model");
});

test("markdown file resolves to markdown route", () => {
  assert.equal(resolveFor("README.md"), "routed/markdown-model");
});

test("unknown extension uses other route if provided", () => {
  assert.equal(resolveFor("Dockerfile"), "routed/other-model");
});

test("unknown extension falls back to routing default model", () => {
  const config = mergeReviewerConfig({
    model_routing: {
      enabled: true,
      default_model: "routed/default-model",
      routes: {},
    },
  });

  assert.equal(
    resolveModelForFile({
      filePath: "Dockerfile",
      config,
      existingDefaultModel: EXISTING_DEFAULT_MODEL,
    }),
    "routed/default-model"
  );
});

test("unknown extension falls back to existing default model", () => {
  const config = mergeReviewerConfig({
    model_routing: {
      enabled: true,
      routes: {},
    },
  });

  assert.equal(
    resolveModelForFile({
      filePath: "Dockerfile",
      config,
      existingDefaultModel: EXISTING_DEFAULT_MODEL,
    }),
    EXISTING_DEFAULT_MODEL
  );
});

test("model routing does not change prompt strictness or security mode behavior", () => {
  const model = resolveFor("src/admin.ts");
  const prompt = buildChangedFunctionReviewPrompt({
    functionText: "function deleteUser() { return true; }",
    patch: "@@ -1 +1 @@",
    isFocusedContext: false,
    securityReviewEnabled: true,
    reviewStrictness: "strict",
  });

  assert.equal(model, "routed/typescript-model");
  assert.match(prompt, /Security review mode is enabled/);
  assert.match(prompt, /Review strictness: strict/);
});

function resolveFor(filePath: string): string {
  const config = mergeReviewerConfig({
    model_routing: {
      enabled: true,
      default_model: "routed/default-model",
      routes: {
        typescript: "routed/typescript-model",
        javascript: "routed/javascript-model",
        python: "routed/python-model",
        markdown: "routed/markdown-model",
        other: "routed/other-model",
      },
    },
  });

  return resolveModelForFile({
    filePath,
    config,
    existingDefaultModel: EXISTING_DEFAULT_MODEL,
  });
}
