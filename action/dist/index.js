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
function isCodeFile(filename) {
    return (filename.endsWith(".ts") ||
        filename.endsWith(".js") ||
        filename.endsWith(".tsx") ||
        filename.endsWith(".jsx"));
}
function isTestFile(filename) {
    return filename.includes(".spec.") || filename.includes(".test.");
}
function shouldIgnoreFile(filename) {
    const ignoredPaths = ["node_modules/", "dist/", "build/"];
    const ignoredFiles = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];
    return (ignoredPaths.some((path) => filename.startsWith(path)) ||
        ignoredFiles.includes(filename));
}
// Example rules
const rules = [
    {
        description: "Contains console.log (remove before commit)",
        test: (_, patch) => /\bconsole\.log\b/.test(patch),
    },
    {
        description: "Contains eval() (avoid dynamic execution)",
        test: (_, patch) => /\beval\s*\(/.test(patch),
    },
    {
        description: "Contains trailing whitespace",
        test: (_, patch) => /[ \t]+$/m.test(patch),
    },
];
async function run() {
    try {
        core.info("🤖 AI Code Reviewer Action started");
        const context = github.context;
        if (!context.payload.pull_request) {
            core.info("Not a pull request event, skipping.");
            return;
        }
        const pr = context.payload.pull_request;
        const { owner, repo } = context.repo;
        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            throw new Error("GITHUB_TOKEN not found");
        }
        const octokit = github.getOctokit(token);
        // Fetch changed files
        const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
            owner,
            repo,
            pull_number: pr.number,
            per_page: 100,
        });
        core.info(`Found ${files.length} changed files`);
        const codeFiles = files.filter((file) => {
            if (!file.patch)
                return false;
            if (!isCodeFile(file.filename))
                return false;
            if (isTestFile(file.filename))
                return false;
            if (shouldIgnoreFile(file.filename))
                return false;
            return true;
        });
        core.info(`Reviewing ${codeFiles.length} code files`);
        for (const file of codeFiles) {
            core.info(`\n--- ${file.filename} (${file.status}) ---`);
            if (!file.patch) {
                core.info("No diff available (binary or too large)");
                continue;
            }
            core.info(file.patch);
            for (const rule of rules) {
                if (rule.test(file.filename, file.patch)) {
                    core.info(rule.description);
                    core.warning(`[${file.filename}] ${rule.description}`);
                }
            }
        }
    }
    catch (error) {
        core.setFailed(error.message);
    }
}
run();
