"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
exports.fileMatchesConfig = fileMatchesConfig;
const yaml = __importStar(require("js-yaml"));
const minimatch_1 = require("minimatch");
const config_1 = require("./config");
async function loadConfig(octokit, owner, repo, ref) {
    try {
        const response = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: ".ai-reviewer.yml",
            ref,
        });
        if (!("content" in response.data))
            return config_1.DEFAULT_CONFIG;
        const decoded = Buffer.from(response.data.content, "base64").toString("utf-8");
        const parsed = yaml.load(decoded);
        return {
            ...config_1.DEFAULT_CONFIG,
            ...parsed,
        };
    }
    catch {
        return config_1.DEFAULT_CONFIG;
    }
}
function fileMatchesConfig(filename, config) {
    const included = config.include.some((pattern) => (0, minimatch_1.minimatch)(filename, pattern));
    const excluded = config.exclude.some((pattern) => (0, minimatch_1.minimatch)(filename, pattern));
    return included && !excluded;
}
