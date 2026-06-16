import assert from "node:assert/strict";
import test from "node:test";

import { mergeReviewerConfig } from "../src/config";
import {
  detectLanguageFromPath,
  resolveModelForFile,
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
