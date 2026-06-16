# AI Agent Instructions

This repository is an AI-powered GitHub Pull Request reviewer.

Before making code changes, AI coding agents must read:

1. docs/ai-agent/PROJECT_OVERVIEW.md
2. docs/ai-agent/ARCHITECTURE.md
3. docs/ai-agent/DEVELOPMENT_RULES.md
4. docs/ai-agent/CURRENT_STATE.md
5. docs/ai-agent/ROADMAP.md
6. docs/ai-agent/CODEX_TASK_GUIDE.md

## Core Rules

- Make one focused change per task.
- Do not rewrite the project.
- Preserve existing behavior unless explicitly asked to change it.
- Add or update tests for behavior changes.
- Run the project test command before finishing.
- Do not expose chain-of-thought in code, logs, comments, or PR reviews.
- Keep GitHub API interactions defensive.
- Missing labels must not crash the action.
- One changed function should produce at most one inline review comment.

## Documentation Update Rules

After completing a task, update documentation only when the task changes project behavior, architecture, workflow, roadmap status, development rules, or known issues.

Update only the relevant files under `docs/ai-agent`.

Do not update documentation for:

- formatting-only changes
- test-only changes
- internal refactors that do not affect behavior
- dependency-free cleanup that does not change how the project works

Do not rewrite all documentation unless explicitly asked.

Keep documentation updates:

- small
- accurate
- directly related to the task
- consistent with the current codebase

When fixing a known issue, update `docs/ai-agent/CURRENT_STATE.md` if the issue is listed there.

When completing a roadmap item, update `docs/ai-agent/ROADMAP.md`.

When changing architecture or review flow, update `docs/ai-agent/ARCHITECTURE.md`.

When changing agent rules or coding expectations, update `docs/ai-agent/DEVELOPMENT_RULES.md`.

## Instruction Priority

If instructions conflict, follow this order:

1. The most specific user prompt
2. This `AGENTS.md` file
3. `docs/ai-agent/DEVELOPMENT_RULES.md`
4. The other files under `docs/ai-agent`
