# AI Agent Instructions

This repository is an AI-powered GitHub Pull Request reviewer.

Before making code changes, AI coding agents must read:

1. docs/ai-agent/PROJECT_OVERVIEW.md
2. docs/ai-agent/ARCHITECTURE.md
3. docs/ai-agent/DEVELOPMENT_RULES.md
4. docs/ai-agent/CURRENT_STATE.md
5. docs/ai-agent/ROADMAP.md
6. docs/ai-agent/CODEX_TASK_GUIDE.md

Rules:

* Make one focused change per task.
* Do not rewrite the project.
* Preserve existing behavior unless explicitly asked to change it.
* Add or update tests for behavior changes.
* Run the project test command before finishing.
* Do not expose chain-of-thought in code, logs, comments, or PR reviews.
* Keep GitHub API interactions defensive.
* Missing labels must not crash the action.
* One changed function should produce at most one inline review comment.

If instructions conflict, follow the most specific user prompt first, then DEVELOPMENT_RULES.md, then the other docs.
