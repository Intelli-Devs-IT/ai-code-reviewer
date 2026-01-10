import * as core from "@actions/core";
import * as github from "@actions/github";

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

    for (const file of files) {
      core.info(`\n--- ${file.filename} (${file.status}) ---`);

      if (!file.patch) {
        core.info("No diff available (binary or too large)");
        continue;
      }

      core.info(file.patch);
    }
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

run();
