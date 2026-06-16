# Codex Task Guide

This file explains how future Codex prompts should be executed in this repository.

## Before Making Changes

The coding agent must:

1. Read `AGENTS.md`.
2. Read `docs/ai-agent/PROJECT_OVERVIEW.md`.
3. Read `docs/ai-agent/ARCHITECTURE.md`.
4. Read `docs/ai-agent/DEVELOPMENT_RULES.md`.
5. Read `docs/ai-agent/CURRENT_STATE.md`.
6. Check the exact user task.
7. Search the codebase for the relevant existing logic.
8. Make the smallest safe change.

## Task Execution Rules

* Work step by step.
* Do not implement future roadmap items unless asked.
* Do not perform broad refactors.
* Do not rename files unless necessary.
* Do not change environment variables unless asked.
* Do not change GitHub workflow triggers unless asked.
* Keep behavior backward compatible.
* Add tests for changed behavior.
* Run tests before finishing.
* Report what changed and what was not changed.

## Recommended Final Response Format for Coding Agents

When done, the agent should report:

1. Summary of changes
2. Files changed
3. Tests run
4. Any remaining risks
5. Suggested next step

## Current Next Task After Documentation

After creating these docs, the next development task is:

Fully fix all unsafe GitHub label removal calls.

Specifically:

* search the whole project for `removeLabel`
* ensure every `removeLabel` call is safe
* catch 404 missing label errors
* keep non-404 errors visible
* prevent `Label does not exist` from crashing or polluting the workflow
* confirm whether the label `review` should be removed at all
