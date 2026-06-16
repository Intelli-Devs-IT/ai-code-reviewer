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
* basic model routing configuration

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

### Phase 5: Productization

* SaaS configuration
* dashboard
* repository onboarding
* usage limits
* billing-ready architecture
* organization-level settings
