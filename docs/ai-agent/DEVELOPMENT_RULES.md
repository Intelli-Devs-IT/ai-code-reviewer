# Development Rules for AI Coding Agents

These rules apply to any AI coding agent modifying this repository.

## General Rules

* Do not rewrite the whole project unless explicitly asked.
* Make one focused change per task.
* Preserve existing behavior unless the task says otherwise.
* Prefer small, testable changes.
* Do not remove existing safety checks.
* Do not remove fallback behavior unless a replacement is already tested.
* Do not change public configuration formats without updating documentation and tests.
* Do not introduce unnecessary dependencies.
* Do not expose chain-of-thought or hidden reasoning in logs, comments, PR reviews, or summaries.

## GitHub API Rules

* Use the PR head SHA when fetching changed file contents.
* PR comments must target valid diff lines.
* If a function start line is not commentable, fallback to the first changed line inside that function.
* Do not let one failed inline comment crash the whole action.
* Removing labels must be safe.
* Never call `removeLabel` in a way that crashes if the label is missing.
* Only remove AI-owned labels unless explicitly instructed otherwise.

## LLM Review Rules

* Review only changed code or changed functions.
* Do not review unchanged functions.
* Keep inline comments short and actionable.
* Avoid weak, generic, or style-only comments.
* Do not output more than one GitHub suggestion block per inline comment.
* Clean model output before posting.
* Remove model thinking tags such as `<think>...</think>`.
* Skip low-confidence reviews.
* Do not post empty or useless reviews.

## Risk Rules

* Risk levels are low, medium, and high.
* High risk should be reserved for security, data loss, auth, payment, privacy, dangerous logic, or severe production issues.
* Merge blocking should only happen for high-risk findings.
* Missing labels must not fail the action.

## Testing Rules

* Add or update tests for every behavior change.
* Existing tests must pass.
* Add regression tests for bugs.
* Prefer testing utilities separately from GitHub API integration code.
* Mock GitHub API calls where needed.

## Documentation Rules

* Update docs when architecture or behavior changes.
* Keep AI-agent docs current.
* Do not let docs claim features that do not exist.
