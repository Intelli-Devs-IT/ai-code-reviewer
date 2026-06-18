# Roadmap

## Completed

* GitHub Action PR workflow
* PR file retrieval
* diff extraction
* changed line extraction
* LLM review generation
* inline comments
* summary comment
* confidence scoring
* risk classification
* risk labeling
* merge blocking
* duplicate comment prevention, partially implemented and requiring verification across reruns
* config file support
* scoped reviews
* safe label cleanup
* AST-based function extraction
* changed function matching
* one review per changed function
* large function focused-context handling
* optional security review mode
* configurable review strictness
* configurable review cost and noise limits
* basic model routing configuration
* configurable model validation for tested, custom, private, and experimental models
* provider quota/payment failure handling in logs and summary output
* optional OpenRouter provider with provider-aware primary/fallback model resolution
* external analysis report configuration and parsing foundation

## Current Focus

Prompt quality improvement.

Goals:

* reduce weak comments
* avoid unnecessary suggestion blocks
* make comments more actionable
* skip reviews when there is no meaningful issue
* let repositories choose lenient, balanced, or strict review behavior
* improve summary quality
* improve risk explanation

## Next Phases

### Phase 1: Prompt Quality

* improve inline review prompt
* require empty response when no meaningful issue exists
* improve suggestion-block rules
* improve confidence scoring based on review quality
* add tests for weak output filtering
* configurable review strictness: completed

### Phase 2: Large Function Handling

* detect large functions: completed
* use focused context around changed lines: completed
* avoid token waste: completed for one-review-per-function flow
* preserve correct line anchoring: completed
* split large functions into multiple review chunks: planned

### Phase 3: Language Expansion

* support Python
* support PHP
* support Java
* support Go
* add model routing by language: completed for basic file-extension routing

### Phase 4: Security Review Mode

* security-focused prompt: completed
* opt-in `.ai-reviewer.yml` configuration: completed
* auth and permission checks: prioritized in security mode
* injection checks: prioritized in security mode
* secret leakage checks: prioritized in security mode
* accepted security findings can raise effective risk in security mode: completed
* unsafe dependency checks: planned

### Phase 5: External Analysis Signals

Planned future work:

* consume lint report files: completed for ESLint JSON
* consume Semgrep report files: completed for common Semgrep JSON
* consume test result files: completed for simple generic JSON
* correlate tool findings with changed files/functions: basic file-level helper completed, prompt integration planned
* use tool evidence to improve inline review prompts
* include tool evidence in the summary comment
* raise risk when Semgrep or tests detect serious issues
* avoid posting tool findings that are unrelated to changed files
* keep external analysis optional and config-driven

Implemented `.ai-reviewer.yml` config shape for report loading:

```yaml
analysis:
  lint:
    enabled: true
    report_path: reports/eslint.json

  semgrep:
    enabled: true
    report_path: reports/semgrep.json

  tests:
    enabled: true
    report_path: reports/test-results.json
```

This configuration is implemented for report loading and parsing. Prompt and inline-comment use of report evidence is planned future work.

### Phase 6: Productization

* SaaS configuration
* dashboard
* repository onboarding
* usage limits
* billing-ready architecture
* organization-level settings
