## AI Code Reviewer Action

This action uses AI to review your code based on best practices learned from thousands of open source projects. It provides a simple way to integrate AI-based code review into your GitHub workflow.

### Usage

1. Add the following YAML to your `.github/workflows/your-workflow.yml` file:

```yaml
name: "AI Code Reviewer"
description: "AI-based code review for pull requests"
author: "Fru Boris"

runs:
  using: "node20"
  main: "dist/index.js"
```
