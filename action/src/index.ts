import * as core from "@actions/core";
import * as github from "@actions/github";

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

interface Rule {
  description: string;
  test: (fileName: string, patch: string) => boolean;
}

// Example rules
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
      if (!file.patch) return false;
      if (!isCodeFile(file.filename)) return false;
      if (isTestFile(file.filename)) return false;
      if (shouldIgnoreFile(file.filename)) return false;
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
          core.warning(`[${file.filename}] ${rule.description}`);
        }
      }
    }
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

run();
