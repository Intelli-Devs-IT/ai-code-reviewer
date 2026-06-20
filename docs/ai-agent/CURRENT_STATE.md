# Current State

This file describes what the project currently does. Treat the codebase as the final source of truth if this file becomes stale.

## Working Features

* GitHub Action runs on pull requests.
* Changed files are fetched.
* File patches are available.
* Changed lines are extracted.
* Full file source is fetched from the PR head SHA using Git tree/blob APIs.
* AST function extractor can extract TypeScript/JavaScript functions.
* Changed lines can be mapped to changed functions.
* Each reviewable file is processed once per run.
* Each changed function is reviewed once within the current run.
* Large changed functions use focused context around changed lines to reduce token waste.
* Review strictness can be configured as lenient, balanced, or strict.
* Review cost and noise limits can cap inline comments, changed functions per file, and total changed functions reviewed per PR.
* Lenient strictness is tuned to surface concrete edge-case, safety, and maintainability feedback without disabling NO_REVIEW.
* Optional security review mode can strengthen inline prompts for security-sensitive code.
* Optional model routing can select model names by detected file language.
* Model validation supports `strict`, `warn`, and `off` modes; `warn` is the default and allows untested custom/private models with warnings.
* Provider responses are validated so empty responses, raw HTML, and obvious provider errors are skipped before review cleanup and scoring.
* Provider quota/payment failures are classified and shown in the summary so failed provider calls are not presented as successful low-risk reviews.
* OpenRouter can be configured as an optional primary or fallback provider, with provider-aware model resolution for primary and fallback calls.
* Optional external ESLint, Semgrep, and simple test-result JSON reports can be loaded, parsed, normalized, correlated with changed files/functions, included as capped prompt evidence, and counted in the summary.
* Inline comments are posted near the correct function area.
* Unchanged functions are ignored by the AST-based inline review path.
* Summary comment is created or updated.
* Summary file count is based on unique files that entered inline AST or fallback review.
* Summary content is concise and based on accepted inline findings across the PR run.
* Summary findings are deduplicated and include file paths, inline finding count, overall risk, risk analysis, and next steps.
* Summary comments mention when review coverage is partial because configured review limits were reached.
* Confidence scoring is used to skip weak inline reviews.
* Inline review skip diagnostics log safe reasons when comments are not posted.
* Risk is classified as low, medium, or high.
* Accepted inline findings with strong security indicators can raise risk to high when security review mode is enabled.
* Risk labels are applied.
* High risk can block merge.
* Missing labels should be skipped safely.
* Action should continue if one inline comment fails.

## Important Known Principle

The current review strategy is:

Changed function
-> scoped review
-> confidence score
-> inline comment

Not:

entire file
-> many repeated comments

## Current Known Issue Checklist

* [ ] Confirm all `removeLabel` calls are safe and cannot crash when a label is missing.
* [ ] Confirm the label named `review` is not removed unsafely.
* [ ] Confirm prompt quality is strong enough to avoid generic comments.
* [ ] Confirm low-confidence reviews are skipped.
* [ ] Confirm summary comments remain stable on reruns.

## Do Not Break

* one review per changed function
* no comments on unchanged functions
* summary comment update behavior
* confidence threshold behavior
* risk classification
* merge blocking for high risk
* safe label removal
* fallback behavior when AST extraction fails

## Partial Or Needs Verification

* Duplicate inline comment prevention across reruns needs verification before further claims. Keep existing dedupe behavior intact unless a task specifically changes it.
* The summary and risk-label workflow should be modified only with focused tests because it affects PR-visible output and merge blocking.

## Future Work

* Current reviews are based primarily on changed code, AST function context, relevant external analysis evidence, LLM analysis, confidence scoring, and risk classification.
* Future work should improve external evidence summarization and use tool evidence more deeply in summary next steps.
