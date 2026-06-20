# Architecture

## Major Parts

1. GitHub Action entrypoint
2. PR file retrieval
3. Diff and changed line extraction
4. Config loading from `.ai-reviewer.yml`
5. File include/exclude filtering
6. Optional external analysis report loading, normalization, and correlation
7. AST-based function extraction
8. Changed-function matching
9. LLM review generation
10. Provider response validation
11. Provider failure classification
12. Provider-aware model resolution and optional provider fallback
13. Configurable inline prompt modes
14. Configurable review cost and noise limits
15. Optional model routing by file language
16. Configurable model validation
17. Model output cleanup
18. Confidence scoring
19. Inline comment posting
20. Summary comment creation/update
21. Risk classification
22. Risk label handling
23. Merge blocking

## Architecture Diagram

Pull Request
↓
GitHub Action
↓
Load Config
↓
Fetch Changed Files
↓
Load Optional External Analysis Reports
↓
Correlate External Findings With Changed Files/Functions
↓
Extract Patch + Changed Lines
↓
Fetch Full File Source
↓
AST Function Extraction
↓
Match Changed Lines to Functions
↓
Review Each Changed Function Once
↓
Apply Review Limits
↓
Validate Provider Response
↓
Resolve Provider-Specific Model
↓
Classify Provider Failures
↓
Fallback To Configured Provider If Allowed
↓
Clean + Normalize LLM Output
↓
Score Confidence
↓
Post Inline Comments
↓
Create/Update Summary Comment
↓
Apply Risk Label
↓
Block Merge if High Risk

## External Analysis Signals

Report loading, file/function correlation, capped prompt evidence, summary counts, and risk context are current runtime behavior. Deeper evidence-driven summary actions remain future work.

Pull Request
->
GitHub Action
->
Fetch Changed Files
->
Fetch Optional Analysis Reports
->
Correlate Reports With Changed Files/Functions
->
LLM Review With Code + Tool Evidence
->
Inline Comments
->
Summary
->
Risk Label
->
Merge Blocking

## Component Notes

* The GitHub Action entrypoint is `action/src/index.ts`.
* The compiled action entrypoint is `action/dist/index.js`.
* Config loading lives in `action/src/load-config.ts`.
* Full file source fetching lives in `action/src/helpers/fileSourceFetcher.ts` and uses cached Git tree/blob API calls for PR head content.
* External analysis report loading, parsing, correlation, evidence formatting, and external-risk helpers live in `action/src/helpers/externalAnalysis.ts`.
* Inline review prompt formatting lives in `action/src/helpers/reviewPrompt.ts`.
* Review cost and noise limit tracking lives in `action/src/helpers/reviewLimits.ts`.
* Provider response validation lives in `action/src/helpers/modelResponseValidation.ts`.
* Provider failure classification lives in `action/src/helpers/providerFailures.ts`.
* Provider-aware model resolution lives in `action/src/helpers/modelRouting.ts`.
* Provider fallback orchestration lives in `action/src/helpers/llmProvider.ts`.
* OpenRouter provider code lives in `action/src/llm.openrouter.ts`.
* OpenAI provider code lives in `action/src/llm.openai.ts`.
* Ollama provider code lives in `action/src/llm.ollama.ts`.
* Model routing lives in `action/src/helpers/modelRouting.ts`.
* Model validation lives in `action/src/helpers/modelValidation.ts`.
* Inline review skip diagnostics live in `action/src/helpers/reviewDiagnostics.ts`.
* Changed line extraction lives in `action/src/helpers/util.helpers.ts`.
* Scoped patch fallback logic lives in `action/src/helpers/extractScopedPatch.ts`.
* AST function extraction lives in `action/src/utils/ast-function-extractor.ts`.
* Changed-function targeting lives in `action/src/helpers/functionReviewTargets.ts`.
* Summary comment formatting lives in `action/src/helpers/summaryComment.ts`.
* Risk level classification lives in `action/src/helpers/riskLevel.ts`.
* Risk label cleanup lives in `action/src/helpers/riskLabels.ts`.

## Key Principles

* Review changed functions, not entire files.
* One changed function should produce at most one inline review.
* Large changed functions should be reviewed through a focused excerpt around changed lines.
* Review strictness is configurable and defaults to balanced behavior.
* Review limits cap inline comments, changed functions per file, and changed functions across the PR run.
* External lint, Semgrep, and test reports are optional and config-driven. Missing or invalid reports should warn and continue.
* External analysis findings may be used as capped supporting evidence in prompts, but they are not posted blindly as inline comments.
* Security review mode is opt-in through `.ai-reviewer.yml` and should not change default prompt behavior when disabled.
* Model routing is opt-in through `.ai-reviewer.yml` and should preserve provider-specific default models when disabled.
* Model validation defaults to warning on untested configured models; strict mode can require tested models only, and off mode supports advanced custom/private model usage.
* Provider responses must be validated before model text enters cleanup, confidence scoring, comments, or summary findings.
* Provider quota, payment, rate-limit, auth, model availability, and network failures should be reflected honestly in logs and summaries.
* Hugging Face is the default primary provider; OpenRouter, OpenAI, and Ollama can be configured as primary or fallback when their required endpoint or API keys are available.
* Ollama is intended for local or self-hosted runners and requires the configured `ollama.base_url` to be reachable from the runner.
* Hugging Face, OpenRouter, OpenAI, and Ollama model names must be resolved separately for primary and fallback calls.
* Inline comments should be attached to changed lines whenever possible.
* If a function start line is not commentable, use a changed line inside that function.
* If AST extraction fails or returns no functions, the old scoped diff fallback can be used.
* Summary comment should be single and updated on reruns.
* Summary comments should mention partial AI review coverage when configured review limits skip changed functions.
* Summary comments may include external analysis report counts and risk notes when relevant findings overlap changed code.
* Risk labels must be handled safely.
* Missing labels must not crash the workflow.
* Merge blocking should only happen for high-risk issues.

## Current Caveats

* Durable duplicate prevention across reruns should be treated carefully. The code fetches existing inline comments and uses in-run dedupe sets, but agents must verify behavior before claiming broad rerun dedupe.
* Summary findings are accumulated from accepted inline review findings across the PR run, deduplicated, and posted once after aggregation. Risk labels and merge blocking are decided once after the file review loop.
