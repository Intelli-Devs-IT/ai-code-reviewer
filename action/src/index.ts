import * as core from "@actions/core";
import * as github from "@actions/github";

async function run() {
  try {
    core.info("🤖 AI Code Reviewer Action started");

    // GitHub context (this is magic GitHub provides)
    const context = github.context;

    // Basic info
    const eventName = context.eventName;
    const repo = context.repo;

    core.info(`Event: ${eventName}`);
    core.info(`Repository: ${repo.owner}/${repo.repo}`);

    // Only run on pull requests
    if (!context.payload.pull_request) {
      core.info("Not a pull request event, skipping.");
      return;
    }

    const pr = context.payload.pull_request;

    core.info(`PR #${pr.number}`);
    core.info(`PR title: ${pr.title}`);
    core.info(`PR author: ${pr.user.login}`);
    core.info(`Base branch: ${pr.base.ref}`);
    core.info(`Head branch: ${pr.head.ref}`);
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

run();
