import * as core from "@actions/core";
import * as github from "@actions/github";

async function run() {
  try {
    core.info("🤖 AI Code Reviewer Action started");

    const context = github.context;

    // Ensure this is a pull request
    if (!context.payload.pull_request) {
      core.info("Not a pull request event, skipping.");
      return;
    }

    const pr = context.payload.pull_request;
    const { owner, repo } = context.repo;

    core.info(`Repository: ${owner}/${repo}`);
    core.info(`PR #${pr.number}`);

    // Create GitHub API client using auto-provided token
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN not found");
    }

    const octokit = github.getOctokit(token);

    // Fetch changed files in the PR
    const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: pr.number,
      per_page: 100,
    });

    core.info(`Found ${files.length} changed files:`);

    for (const file of files) {
      core.info(`- ${file.filename} (${file.status})`);
    }
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

run();
