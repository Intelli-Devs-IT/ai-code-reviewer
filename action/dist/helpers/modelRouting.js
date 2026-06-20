"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectLanguageFromPath = detectLanguageFromPath;
exports.resolveModelForFile = resolveModelForFile;
exports.resolveModelForProviderFile = resolveModelForProviderFile;
const config_1 = require("../config");
const huggingFaceModels_1 = require("./huggingFaceModels");
function detectLanguageFromPath(filePath) {
    const normalizedPath = filePath.toLowerCase();
    if (normalizedPath.endsWith(".ts") || normalizedPath.endsWith(".tsx")) {
        return "typescript";
    }
    if (normalizedPath.endsWith(".js") ||
        normalizedPath.endsWith(".jsx") ||
        normalizedPath.endsWith(".mjs") ||
        normalizedPath.endsWith(".cjs")) {
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
function resolveModelForFile(params) {
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
function resolveModelForProviderFile(params) {
    if (params.provider === "openrouter") {
        return params.config.openrouter?.default_model || config_1.DEFAULT_OPENROUTER_MODEL;
    }
    if (params.provider === "openai") {
        return params.config.openai?.default_model || config_1.DEFAULT_OPENAI_MODEL;
    }
    return resolveModelForFile({
        filePath: params.filePath,
        config: params.config,
        existingDefaultModel: huggingFaceModels_1.DEFAULT_HUGGINGFACE_MODEL,
    });
}
