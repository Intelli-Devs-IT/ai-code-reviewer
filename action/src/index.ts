import * as core from "@actions/core";
import * as github from "@actions/github";
import { HuggingFaceLLM } from "./llm.huggingface";
import { loadConfig, fileMatchesConfig } from "./load-config";

/* =======================
   Helpers: file filtering
   ======================= */

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
    ignoredPaths.some((p) => filename.startsWith(p)) ||
    ignoredFiles.includes(filename)
  );
}

/* =======================
   Helpers: diff parsing
   ======================= */

function extractLineNumbersFromPatch(patch: string): number[] {
  const lines = patch.split("\n");

  const commentLines: number[] = [];
  let newLineNumber = 0;
  let inHunk = false;
  let foundInCurrentHunk = false;

  for (const line of lines) {
    // Start of a new hunk
    if (line.startsWith("@@")) {
      const match = line.match(/\+(\d+)/);
      if (match) {
        newLineNumber = parseInt(match[1], 10) - 1;
        inHunk = true;
        foundInCurrentHunk = false;
      }
      continue;
    }

    if (!inHunk) continue;

    // Context or added lines increase new-file line count
    if (!line.startsWith("-")) {
      newLineNumber++;
    }

    // First added line in this hunk
    if (
      line.startsWith("+") &&
      !line.startsWith("+++") &&
      !foundInCurrentHunk
    ) {
      commentLines.push(newLineNumber);
      foundInCurrentHunk = true;
    }
  }

  return commentLines;
}

/* =======================
   Helpers: fetch existing inline comments
   ======================= */
async function getExistingInlineComments(
  octokit: any,
  owner: string,
  repo: string,
  pullNumber: number
) {
  return await octokit.paginate(octokit.rest.pulls.listReviewComments, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });
}

/* =======================
   Main Action
   ======================= */

async function run() {
  try {
    const context = github.context;

    if (!context.payload.pull_request) {
      core.info("Not a pull request event. Skipping.");
      return;
    }

    const pr = context.payload.pull_request;
    const { owner, repo } = context.repo;
    const commitSha = pr.head.sha;

    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN is missing");

    const octokit = github.getOctokit(token);

    /* =======================
       Load configuration
       ======================= */
    const config = await loadConfig(octokit, owner, repo, pr.head.ref);

    if (!config.enabled) {
      core.info("AI reviewer disabled via config");
      return;
    }
    /* =======================
       Init LLM (optional)
       ======================= */

    const hfKey = process.env.HF_API_KEY;
    const llm = hfKey ? new HuggingFaceLLM(hfKey) : null;

    if (!llm) {
      core.warning("HF_API_KEY not set. AI reviews disabled.");
      return;
    }

    /* =======================
       Fetch existing inline comments
       ======================= */

    const existingInlineComments = await getExistingInlineComments(
      octokit,
      owner,
      repo,
      pr.number
    );

    /* =======================
       Fetch PR files
       ======================= */

    const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: pr.number,
      per_page: 100,
    });

    // const codeFiles = files.filter((file) => {
    //   if (!file.patch) return false;
    //   if (!isCodeFile(file.filename)) return false;
    //   if (isTestFile(file.filename)) return false;
    //   if (shouldIgnoreFile(file.filename)) return false;
    //   return true;
    // });

    const codeFiles = files
      .filter((file) => file.patch)
      .filter((file) => fileMatchesConfig(file.filename, config))
      .slice(0, config.max_files);

    core.info(`Reviewing ${codeFiles.length} code files`);

    /* =======================
       Review each file
       ======================= */

    for (const file of codeFiles) {
      const lines = extractLineNumbersFromPatch(file.patch!);
      if (lines.length === 0) continue;

      const prompt = `
You are an expert code reviewer.
Review the following Git diff and give concise, actionable feedback.
Use bullet points. Do not repeat the code.

File: ${file.filename}

Diff:
${file.patch}
`;

      let review: string | null = null;

      try {
        review = await llm.reviewDiff(prompt);
      } catch {
        core.warning(`AI review failed for ${file.filename}`);
        continue;
      }

      if (!review || review.length < 30) {
        core.info(`Low-confidence review skipped for ${file.filename}`);
        continue;
      }

      /* =======================
         Post inline comments
         ======================= */

      for (const line of lines) {
        const marker = `<!-- ai-code-reviewer-FB:file=${file.filename}:line=${line} -->`;

        const alreadyExists = existingInlineComments.some((comment: any) =>
          comment.body?.includes(marker)
        );

        if (alreadyExists) {
          core.info(
            `Skipping duplicate inline comment for ${file.filename}:${line}`
          );
          continue;
        }

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
    }
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

run();
