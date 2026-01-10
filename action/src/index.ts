import * as core from "@actions/core";
import * as github from "@actions/github";
import OpenAI from "openai";

const openaiKey = process.env.OPENAI_API_KEY;
if (!openaiKey) throw new Error("OPENAI_API_KEY not found");

const openai = new OpenAI({
  apiKey: openaiKey,
});

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

      // Build prompt for LLM
      const prompt = `
You are an expert code reviewer. Analyze the following code changes (diff) and provide concise, actionable suggestions. 
Do not rewrite the code. Focus on potential issues, best practices, and improvements.

File: ${file.filename}

Diff:
${file.patch}
`;

      // Call OpenAI
      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 200,
      });

      const review = response.choices[0].message?.content?.trim();
      if (!review) continue;

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
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

run();
