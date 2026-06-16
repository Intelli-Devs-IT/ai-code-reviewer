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
9. Configurable inline prompt modes
10. Optional model routing by file language
11. Model output cleanup
12. Confidence scoring
13. Inline comment posting
14. Summary comment creation/update
15. Risk classification
16. Risk label handling
17. Merge blocking

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

## Component Notes

* The GitHub Action entrypoint is `action/src/index.ts`.
* The compiled action entrypoint is `action/dist/index.js`.
* Config loading lives in `action/src/load-config.ts`.
* Inline review prompt formatting lives in `action/src/helpers/reviewPrompt.ts`.
* Model routing lives in `action/src/helpers/modelRouting.ts`.
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
* Inline comments should be attached to changed lines whenever possible.
* If a function start line is not commentable, use a changed line inside that function.
* If AST extraction fails or returns no functions, the old scoped diff fallback can be used.
* Summary comment should be single and updated on reruns.
* Risk labels must be handled safely.
* Missing labels must not crash the workflow.
* Merge blocking should only happen for high-risk issues.

## Current Caveats

* Durable duplicate prevention across reruns should be treated carefully. The code fetches existing inline comments and uses in-run dedupe sets, but agents must verify behavior before claiming broad rerun dedupe.
* Summary findings are accumulated from accepted inline review findings across the PR run, deduplicated, and posted once after aggregation. Risk calculation for labels and merge blocking still happens in the file review path, so modify it only with a specific task and tests.
