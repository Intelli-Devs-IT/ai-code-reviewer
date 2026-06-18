# Architecture

## Major Parts

1. GitHub Action entrypoint
2. PR file retrieval
3. Diff and changed line extraction
4. Config loading from `.ai-reviewer.yml`
5. File include/exclude filtering
6. AST-based function extraction
7. Changed-function matching
8. LLM review generation
9. Provider response validation
10. Provider failure classification
11. Optional provider fallback
12. Configurable inline prompt modes
13. Optional model routing by file language
14. Configurable model validation
15. Model output cleanup
16. Confidence scoring
17. Inline comment posting
18. Summary comment creation/update
19. Risk classification
20. Risk label handling
21. Merge blocking

## Architecture Diagram

Pull Request
↓
GitHub Action
↓
Load Config
↓
Fetch Changed Files
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
Validate Provider Response
↓
Classify Provider Failures
↓
Fallback To OpenRouter If Configured
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

## Future Architecture: External Analysis Signals

This is planned future architecture, not current runtime behavior.

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
* Inline review prompt formatting lives in `action/src/helpers/reviewPrompt.ts`.
* Provider response validation lives in `action/src/helpers/modelResponseValidation.ts`.
* Provider failure classification lives in `action/src/helpers/providerFailures.ts`.
* Provider fallback orchestration lives in `action/src/helpers/llmProvider.ts`.
* OpenRouter fallback provider code lives in `action/src/llm.openrouter.ts`.
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
* Security review mode is opt-in through `.ai-reviewer.yml` and should not change default prompt behavior when disabled.
* Model routing is opt-in through `.ai-reviewer.yml` and should preserve the existing default model when disabled.
* Model validation defaults to warning on untested configured models; strict mode can require tested models only, and off mode supports advanced custom/private model usage.
* Provider responses must be validated before model text enters cleanup, confidence scoring, comments, or summary findings.
* Provider quota, payment, rate-limit, auth, model availability, and network failures should be reflected honestly in logs and summaries.
* Hugging Face is the default primary provider; OpenRouter is optional fallback when configured and `OPENROUTER_API_KEY` is available.
* Inline comments should be attached to changed lines whenever possible.
* If a function start line is not commentable, use a changed line inside that function.
* If AST extraction fails or returns no functions, the old scoped diff fallback can be used.
* Summary comment should be single and updated on reruns.
* Risk labels must be handled safely.
* Missing labels must not crash the workflow.
* Merge blocking should only happen for high-risk issues.

## Current Caveats

* Durable duplicate prevention across reruns should be treated carefully. The code fetches existing inline comments and uses in-run dedupe sets, but agents must verify behavior before claiming broad rerun dedupe.
* Summary findings are accumulated from accepted inline review findings across the PR run, deduplicated, and posted once after aggregation. Risk labels and merge blocking are decided once after the file review loop.
