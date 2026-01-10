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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const openai_1 = __importDefault(require("openai"));
const llm_huggingface_1 = require("./llm.huggingface");
const openaiKey = process.env.OPENAI_API_KEY;
if (!openaiKey)
    throw new Error("OPENAI_API_KEY not found");
const openai = new openai_1.default({
    apiKey: openaiKey,
});
const hfKey = process.env.HF_API_KEY;
if (!hfKey) {
    core.warning("HF_API_KEY not set, skipping AI reviews");
}
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
class OpenAILLM {
    async reviewDiff(prompt) {
        try {
            const res = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 200,
            });
            return res.choices[0].message?.content ?? null;
        }
        catch {
            return null;
        }
    }
}
class OllamaLLM {
    async reviewDiff(prompt) {
        try {
            // LOCAL ollama model = "qwen2.5-coder:1.5b"
            const response = await fetch("http://localhost:11434/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "qwen2.5-coder:1.5b",
                    prompt,
                    stream: false,
                }),
            });
            const data = await response.json();
            return data.response;
        }
        catch (err) {
            return null;
        }
    }
}
// class HuggingFaceLLM implements LLMClient {
//   //   async reviewDiff(prompt: string) {
//   //     // call HF API
//   //   }
// }
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
        // Loop over code files and apply rules
        for (const file of codeFiles) {
            if (!file.patch)
                continue;
            const llm = hfKey ? new llm_huggingface_1.HuggingFaceLLM(hfKey) : null;
            // Build prompt for LLM
            const prompt = `
You are an expert code reviewer. Analyze the following code changes (diff) and provide concise, actionable suggestions. 
Do not rewrite the code. Focus on potential issues, best practices, and improvements. Do not repeat the code. Use bullet points.


File: ${file.filename}

Diff:
${file.patch}
`;
            const review = await llm?.reviewDiff(prompt);
            //   try {
            //     // Call OpenAI
            //     // const response = await openai.chat.completions.create({
            //     //   model: "gpt-3.5-turbo",
            //     //   messages: [{ role: "user", content: prompt }],
            //     //   temperature: 0.2,
            //     //   max_tokens: 200,
            //     // });
            //     // review = response.choices[0].message?.content?.trim();
            //     // LOCAL ollama model = "qwen2.5-coder:1.5b"
            //     const response = await fetch("http://localhost:11434/api/generate", {
            //       method: "POST",
            //       headers: { "Content-Type": "application/json" },
            //       body: JSON.stringify({
            //         model: "qwen2.5-coder:1.5b",
            //         prompt,
            //         stream: false,
            //       }),
            //     });
            //     const data = await response.json();
            //     review = data.response;
            //   } catch (err: any) {
            //     core.warning(`AI review skipped for ${file.filename}: ${err.message}`);
            //     continue;
            //   }
            if (!review) {
                core.warning(`AI review skipped for ${file.filename}`);
                continue;
            }
            // Post comment to PR
            const commentBody = `
**AI Code Review**

File: \`${file.filename}\`

${review}
`;
            await octokit.rest.issues.createComment({
                owner,
                repo,
                issue_number: pr.number,
                body: commentBody,
            });
            core.info(`Posted AI review for ${file.filename}`);
        }
    }
    catch (error) {
        core.setFailed(error.message);
    }
}
run();
