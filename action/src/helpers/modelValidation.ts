import { ReviewerConfig } from "../config";
import { TESTED_HUGGINGFACE_MODELS } from "./huggingFaceModels";

interface Logger {
  warning: (message: string) => void;
}

export interface ConfiguredModel {
  path: string;
  model: string;
}

export function validateConfiguredModels(
  config: ReviewerConfig,
  logger?: Logger
): void {
  const mode = config.model_validation?.mode ?? "warn";

  if (mode === "off") {
    return;
  }

  const configuredModels = getConfiguredRoutingModels(config);

  for (const configured of configuredModels) {
    if (TESTED_HUGGINGFACE_MODELS.includes(configured.model)) {
      continue;
    }

    const message = buildUnknownModelMessage(configured);

    if (mode === "strict") {
      throw new Error(message);
    }

    logger?.warning(message);
  }
}

export function buildUnknownModelMessage(configured: ConfiguredModel): string {
  const lines = [
    `Unknown model configured for ${configured.path}:`,
    configured.model,
    "",
    "This model is not in the tested model list.",
  ];
  const suggestion = findClosestTestedModel(configured.model);

  if (suggestion) {
    lines.push(`Did you mean: ${suggestion}?`);
  }

  return lines.join("\n");
}

export function findClosestTestedModel(model: string): string | null {
  let bestMatch: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const testedModel of TESTED_HUGGINGFACE_MODELS) {
    const distance = levenshteinDistance(model, testedModel);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = testedModel;
    }
  }

  const maxDistance = Math.max(3, Math.ceil(model.length * 0.2));
  return bestDistance <= maxDistance ? bestMatch : null;
}

export function getConfiguredRoutingModels(
  config: ReviewerConfig
): ConfiguredModel[] {
  const routing = config.model_routing;
  const configuredModels: ConfiguredModel[] = [];

  if (!routing) {
    return configuredModels;
  }

  if (routing.default_model) {
    configuredModels.push({
      path: "model_routing.default_model",
      model: routing.default_model,
    });
  }

  for (const [language, model] of Object.entries(routing.routes ?? {})) {
    if (!model) {
      continue;
    }

    configuredModels.push({
      path: `model_routing.routes.${language}`,
      model,
    });
  }

  return configuredModels;
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array(right.length + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost
      );
    }

    for (let index = 0; index <= right.length; index++) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}
