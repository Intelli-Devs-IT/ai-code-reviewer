import OpenAI from "openai";
import * as core from "@actions/core";

const openaiKey = process.env.OPENAI_API_KEY;
if (!openaiKey) throw new Error("OPENAI_API_KEY not found");

const openai = new OpenAI({
  apiKey: openaiKey,
});
const hfKey = process.env.HF_API_KEY;
if (!hfKey) {
  core.warning("HF_API_KEY not set, skipping AI reviews");
}
interface LLMClient {
  reviewDiff(prompt: string): Promise<string | null>;
}

interface Rule {
  description: string;
  test: (fileName: string, patch: string) => boolean;
}

const rules: Rule[] = [
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

class OpenAILLM implements LLMClient {
  async reviewDiff(prompt: string) {
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
      });
      return res.choices[0].message?.content ?? null;
    } catch {
      return null;
    }
  }
}
class OllamaLLM implements LLMClient {
  async reviewDiff(prompt: string) {
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
    } catch (err: any) {
      return null;
    }
  }
}
