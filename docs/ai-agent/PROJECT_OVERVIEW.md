# Project Overview

This project is an AI-powered GitHub Pull Request reviewer. It is built as a GitHub Action that runs on pull requests and reviews PR changes automatically.

The project currently focuses on TypeScript and JavaScript repositories. The design should stay open to additional languages later, but agents must not add language support unless explicitly asked.

## Main Goals

* Review changed files in pull requests.
* Extract diffs and changed lines.
* Review code using an LLM.
* Post inline review comments.
* Post a single summary comment.
* Calculate a confidence score.
* Classify risk as low, medium, or high.
* Apply risk labels.
* Optionally block merges for high-risk findings.
* Avoid duplicate comments where supported by the current flow.
* Support configuration through `.ai-reviewer.yml`.
* Support future productization.

## High-Level Flow

Pull Request opened or updated
-> GitHub Action runs
-> changed files are fetched
-> patches are extracted
-> changed functions are identified
-> LLM reviews scoped code
-> confidence score is calculated
-> inline comments are posted
-> summary comment is created or updated
-> risk label is applied
-> high-risk review can fail the check

## Current Scope

The action is implemented under `action/`. Runtime TypeScript lives in `action/src/`, and compiled GitHub Action output lives in `action/dist/`.

Current review behavior is centered on changed functions when AST extraction succeeds. If AST extraction returns no functions for a file, the older scoped diff review path remains available as fallback.

Configuration is loaded from `.ai-reviewer.yml` when available. Agents changing configuration behavior must update tests and documentation in the same task.

Review strictness can be configured with `review.strictness`. It defaults to `balanced` when the field is missing.

Optional security-focused inline review can be enabled with `security_review.enabled: true`. It is disabled by default when the field is missing.

Optional model routing can be enabled with `model_routing.enabled: true`. When disabled or missing, the existing default model is used.

Example `.ai-reviewer.yml`:

```yaml
enabled: true
max_files: 5

include:
  - "**/*.ts"
  - "**/*.js"

exclude:
  - "**/*.spec.ts"
  - "dist/**"

review:
  strictness: balanced

security_review:
  enabled: false

model_routing:
  enabled: true
  default_model: qwen/qwen2.5-coder-32b-instruct
  routes:
    typescript: qwen/qwen2.5-coder-32b-instruct
    javascript: qwen/qwen2.5-coder-32b-instruct
    markdown: small-model-name
```
