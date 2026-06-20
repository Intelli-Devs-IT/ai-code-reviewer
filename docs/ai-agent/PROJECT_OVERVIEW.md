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

Review strictness can be configured with `review.strictness`. It defaults to `balanced` when the field is missing. Review cost and comment noise can be controlled with `review.max_inline_comments`, `review.max_functions_per_file`, and `review.max_total_functions`.

Optional security-focused inline review can be enabled with `security_review.enabled: true`. It is disabled by default when the field is missing.

Optional model routing can be enabled with `model_routing.enabled: true`. When disabled or missing, the configured primary provider uses its own default model.

Model validation can be configured with `model_validation.mode`. It defaults to `warn`, which allows custom/private/experimental models while warning when a configured model is outside the tested model list. Use `strict` to allow only tested models, or `off` to disable model-name validation.

Provider failure handling can be configured with `provider_failures.behavior`. It defaults to `warn`, which continues the workflow and includes provider failures in the summary. Use `fail` to fail the workflow when provider calls fail, or `skip` to keep failure details concise while avoiding misleading review summaries.

Hugging Face remains the default primary LLM provider. OpenRouter and OpenAI can be configured as either primary or fallback providers with `providers.primary` or `providers.fallback`. OpenRouter uses `OPENROUTER_API_KEY`; OpenAI uses `OPENAI_API_KEY`. Provider-specific defaults are kept separate so model names are not reused across providers.

Optional external analysis report loading can be enabled with `analysis.lint`, `analysis.semgrep`, and `analysis.tests`. The action can load and normalize existing JSON report files, correlate findings with changed files/functions, and include a capped evidence section in inline review prompts. It does not run those tools directly and does not post tool findings blindly as comments.

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
  max_inline_comments: 10
  max_functions_per_file: 5
  max_total_functions: 30

security_review:
  enabled: false

model_routing:
  enabled: true
  default_model: qwen/qwen2.5-coder-32b-instruct
  routes:
    typescript: qwen/qwen2.5-coder-32b-instruct
    javascript: qwen/qwen2.5-coder-32b-instruct
    markdown: small-model-name

model_validation:
  mode: warn

provider_failures:
  behavior: warn

providers:
  primary: huggingface
  fallback: openrouter
  fallback_on:
    - quota_exceeded
    - rate_limited
    - model_unavailable
    - invalid_response
    - network_error

openrouter:
  default_model: cohere/north-mini-code:free

openai:
  default_model: gpt-4.1-mini

analysis:
  lint:
    enabled: false
    report_path: reports/eslint.json

  semgrep:
    enabled: false
    report_path: reports/semgrep.json

  tests:
    enabled: false
    report_path: reports/test-results.json
```
