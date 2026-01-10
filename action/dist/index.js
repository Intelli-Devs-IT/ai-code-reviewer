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
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
async function run() {
    try {
        core.info("🤖 AI Code Reviewer Action started");
        // GitHub context (this is magic GitHub provides)
        const context = github.context;
        // Basic info
        const eventName = context.eventName;
        const repo = context.repo;
        core.info(`Event: ${eventName}`);
        core.info(`Repository: ${repo.owner}/${repo.repo}`);
        // Only run on pull requests
        if (!context.payload.pull_request) {
            core.info("Not a pull request event, skipping.");
            return;
        }
        const pr = context.payload.pull_request;
        core.info(`PR #${pr.number}`);
        core.info(`PR title: ${pr.title}`);
        core.info(`PR author: ${pr.user.login}`);
        core.info(`Base branch: ${pr.base.ref}`);
        core.info(`Head branch: ${pr.head.ref}`);
    }
    catch (error) {
        core.setFailed(error.message);
    }
}
run();
