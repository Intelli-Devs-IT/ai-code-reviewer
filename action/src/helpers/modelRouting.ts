import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  LlmProviderName,
  ModelRoutingLanguage,
  ReviewerConfig,
} from "../config";
import { DEFAULT_HUGGINGFACE_MODEL } from "./huggingFaceModels";

export function detectLanguageFromPath(
  filePath: string
): ModelRoutingLanguage {
  const normalizedPath = filePath.toLowerCase();

  if (normalizedPath.endsWith(".ts") || normalizedPath.endsWith(".tsx")) {
    return "typescript";
  }

  if (
    normalizedPath.endsWith(".js") ||
    normalizedPath.endsWith(".jsx") ||
    normalizedPath.endsWith(".mjs") ||
    normalizedPath.endsWith(".cjs")
  ) {
    return "javascript";
  }

  if (normalizedPath.endsWith(".py")) {
    return "python";
  }

  if (normalizedPath.endsWith(".md") || normalizedPath.endsWith(".mdx")) {
    return "markdown";
  }

  if (normalizedPath.endsWith(".json")) {
    return "json";
  }

  if (normalizedPath.endsWith(".yml") || normalizedPath.endsWith(".yaml")) {
    return "yaml";
  }

  return "other";
}

export function resolveModelForFile(params: {
  filePath: string;
  config: ReviewerConfig;
  existingDefaultModel: string;
}): string {
  const routing = params.config.model_routing;

  if (!routing?.enabled) {
    return params.existingDefaultModel;
  }

  const language = detectLanguageFromPath(params.filePath);
  const routedModel = routing.routes?.[language];

  if (routedModel) {
    return routedModel;
  }

  if (routing.routes?.other) {
    return routing.routes.other;
  }

  if (routing.default_model) {
    return routing.default_model;
  }

  return params.existingDefaultModel;
}

export function resolveModelForProviderFile(params: {
  provider: LlmProviderName;
  filePath: string;
  config: ReviewerConfig;
}): string {
  if (params.provider === "openrouter") {
    return params.config.openrouter?.default_model || DEFAULT_OPENROUTER_MODEL;
  }

  if (params.provider === "openai") {
    return params.config.openai?.default_model || DEFAULT_OPENAI_MODEL;
  }

  if (params.provider === "ollama") {
    return params.config.ollama?.default_model || DEFAULT_OLLAMA_MODEL;
  }

  return resolveModelForFile({
    filePath: params.filePath,
    config: params.config,
    existingDefaultModel: DEFAULT_HUGGINGFACE_MODEL,
  });
}
