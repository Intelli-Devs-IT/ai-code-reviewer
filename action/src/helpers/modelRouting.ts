import { ModelRoutingLanguage, ReviewerConfig } from "../config";

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
