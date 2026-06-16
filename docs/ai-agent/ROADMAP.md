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

## Current Focus

Prompt quality improvement.

Goals:

* reduce weak comments
* avoid unnecessary suggestion blocks
* make comments more actionable
* skip reviews when there is no meaningful issue
* improve summary quality
* improve risk explanation

## Next Phases

### Phase 1: Prompt Quality

* improve inline review prompt
* require empty response when no meaningful issue exists
* improve suggestion-block rules
* improve confidence scoring based on review quality
* add tests for weak output filtering

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
* add model routing by language

### Phase 4: Security Review Mode

* security-focused prompt
* auth and permission checks
* injection checks
* secret leakage checks
* unsafe dependency checks

### Phase 5: Productization

* SaaS configuration
* dashboard
* repository onboarding
* usage limits
* billing-ready architecture
* organization-level settings
