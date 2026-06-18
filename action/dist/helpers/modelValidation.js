"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfiguredModels = validateConfiguredModels;
exports.buildUnknownModelMessage = buildUnknownModelMessage;
exports.findClosestTestedModel = findClosestTestedModel;
exports.getConfiguredRoutingModels = getConfiguredRoutingModels;
const huggingFaceModels_1 = require("./huggingFaceModels");
function validateConfiguredModels(config, logger) {
    const mode = config.model_validation?.mode ?? "warn";
    if (mode === "off") {
        return;
    }
    const configuredModels = getConfiguredRoutingModels(config);
    for (const configured of configuredModels) {
        if (huggingFaceModels_1.TESTED_HUGGINGFACE_MODELS.includes(configured.model)) {
            continue;
        }
        const message = buildUnknownModelMessage(configured);
        if (mode === "strict") {
            throw new Error(message);
        }
        logger?.warning(message);
    }
}
function buildUnknownModelMessage(configured) {
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
function findClosestTestedModel(model) {
    let bestMatch = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const testedModel of huggingFaceModels_1.TESTED_HUGGINGFACE_MODELS) {
        const distance = levenshteinDistance(model, testedModel);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = testedModel;
        }
    }
    const maxDistance = Math.max(3, Math.ceil(model.length * 0.2));
    return bestDistance <= maxDistance ? bestMatch : null;
}
function getConfiguredRoutingModels(config) {
    const routing = config.model_routing;
    const configuredModels = [];
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
function levenshteinDistance(left, right) {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    const current = Array(right.length + 1).fill(0);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
        current[0] = leftIndex;
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
            const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
            current[rightIndex] = Math.min(current[rightIndex - 1] + 1, previous[rightIndex] + 1, previous[rightIndex - 1] + cost);
        }
        for (let index = 0; index <= right.length; index++) {
            previous[index] = current[index];
        }
    }
    return previous[right.length];
}
