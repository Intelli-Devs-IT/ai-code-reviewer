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
const openai_1 = __importDefault(require("openai"));
const core = __importStar(require("@actions/core"));
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
