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
9. Model output cleanup
10. Confidence scoring
11. Inline comment posting
12. Summary comment creation/update
13. Risk classification
14. Risk label handling
15. Merge blocking

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
* Changed line extraction lives in `action/src/helpers/util.helpers.ts`.
* Scoped patch fallback logic lives in `action/src/helpers/extractScopedPatch.ts`.
* AST function extraction lives in `action/src/utils/ast-function-extractor.ts`.
* Changed-function targeting lives in `action/src/helpers/functionReviewTargets.ts`.
* Risk label cleanup lives in `action/src/helpers/riskLabels.ts`.

## Key Principles

* Review changed functions, not entire files.
* One changed function should produce at most one inline review.
* Inline comments should be attached to changed lines whenever possible.
* If a function start line is not commentable, use a changed line inside that function.
* If AST extraction fails or returns no functions, the old scoped diff fallback can be used.
* Summary comment should be single and updated on reruns.
* Risk labels must be handled safely.
* Missing labels must not crash the workflow.
* Merge blocking should only happen for high-risk issues.

## Current Caveats

* Durable duplicate prevention across reruns should be treated carefully. The code fetches existing inline comments and uses in-run dedupe sets, but agents must verify behavior before claiming broad rerun dedupe.
* Summary/risk calculation currently happens inside the file review loop. Do not restructure this without a specific task and tests.
