import * as core from "@actions/core";

async function run() {
  try {
    core.info("🤖 AI Code Reviewer Action started");
    core.info("If you see this, the Action works.");
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

run();
