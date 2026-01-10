import * as core from "@actions/core";
import * as github from "@actions/github";
import OpenAI from "openai";
import { HuggingFaceLLM } from "./llm.huggingface";
import { extractLineNumbersFromPatch } from "./diff.parser";
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

function isCodeFile(filename: string): boolean {
  return (
    filename.endsWith(".ts") ||
    filename.endsWith(".js") ||
    filename.endsWith(".tsx") ||
    filename.endsWith(".jsx")
  );
}

function isTestFile(filename: string): boolean {
  return filename.includes(".spec.") || filename.includes(".test.");
}

function shouldIgnoreFile(filename: string): boolean {
  const ignoredPaths = ["node_modules/", "dist/", "build/"];

  const ignoredFiles = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];

  return (
    ignoredPaths.some((path) => filename.startsWith(path)) ||
    ignoredFiles.includes(filename)
  );
}

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

async function findExistingComment(
  octokit: any,
  owner: string,
  repo: string,
  prNumber: number,
  filename: string
) {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const marker = `<!-- ai-code-reviewer-FB:file=${filename} -->`;

  return comments.find(
    (comment: any) => comment.body && comment.body.includes(marker)
  );
}
// function extractLineNumberFromPatch(patch: string): number | null {
//   const lines = patch.split("\n");

//   for (const line of lines) {
//     // Added lines start with "+"
//     if (line.startsWith("+") && !line.startsWith("+++")) {
//       return 1; // safe default for new files
//     }
//   }

//   return null;
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
    const commitSha = pr.head.sha;

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
      if (!file.patch) return false;
      if (!isCodeFile(file.filename)) return false;
      if (isTestFile(file.filename)) return false;
      if (shouldIgnoreFile(file.filename)) return false;
      return true;
    });

    core.info(`Reviewing ${codeFiles.length} code files`);

    // Loop over code files and apply rules
    for (const file of codeFiles) {
      if (!file.patch) continue;

      const llm = hfKey ? new HuggingFaceLLM(hfKey) : null;

      // Build prompt for LLM
      const prompt = `
You are an expert code reviewer. Analyze the following code changes (diff) and provide concise, actionable suggestions. 
Do not rewrite the code. Focus on potential issues, best practices, and improvements. Do not repeat the code. Use bullet points.


File: ${file.filename}

Diff:
${file.patch}
`;

      const review = await llm?.reviewDiff(prompt);

      if (!review) {
        core.warning(`AI review skipped for ${file.filename}`);
        continue;
      }

      const lines = extractLineNumbersFromPatch(file.patch!);

      if (lines.length === 0) {
        core.warning(`No valid lines found for ${file.filename}`);
        continue;
      }

      // Optional: Add timestamp or other info like commit hash to review
      // Post comment to PR
      const marker = `<!-- ai-code-reviewer-FB:file=${file.filename} -->`;

      const commentBody = `
        ${marker}
        **AI Code Review**

        File: \`${file.filename}\`

        ${review}
        `;
      const existingComment = await findExistingComment(
        octokit,
        owner,
        repo,
        pr.number,
        file.filename
      );

      for (const line of lines) {
        if (review.length < 30) {
          core.info(`Skipping low-confidence review for ${file.filename}`);
          continue;
        }

        const marker = `<!-- ai-code-reviewer-FB:file=${file.filename}:line=${line} -->`;

        await octokit.rest.pulls.createReviewComment({
          owner,
          repo,
          pull_number: pr.number,
          commit_id: commitSha,
          path: file.filename,
          line,
          side: "RIGHT",
          body: `
${marker}
🤖 **AI Code Review**

${review}
`,
        });

        core.info(`Posted inline review for ${file.filename} at line ${line}`);
      }

      //       if (existingComment) {
      //         await octokit.rest.issues.updateComment({
      //           owner,
      //           repo,
      //           comment_id: existingComment.id,
      //           body: commentBody,
      //         });
      //         core.info(`Updated AI review for ${file.filename}`);
      //         continue;
      //       } else {
      //         await octokit.rest.pulls.createReviewComment({
      //           owner,
      //           repo,
      //           pull_number: pr.number,
      //           commit_id: commitSha,
      //           path: file.filename,
      //           line,
      //           side: "RIGHT",
      //           body: `
      // ${marker}
      // 🤖 **AI Code Review**

      // ${review}
      // `,
      //         });

      //         core.info(`Posted inline review for ${file.filename}`);
      //         // await octokit.rest.issues.createComment({
      //         //   owner,
      //         //   repo,
      //         //   issue_number: pr.number,
      //         //   body: commentBody,
      //         // });

      //         // core.info(`Posted AI review for ${file.filename}`);
      //       }
    }
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

run();
