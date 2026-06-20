import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { mergeReviewerConfig } from "../src/config";
import {
  determineExternalAnalysisRisk,
  formatExternalAnalysisEvidence,
  getFindingsForFile,
  getFindingsForFunction,
  loadExternalAnalysisReports,
  limitExternalAnalysisFindings,
  normalizeEslintSeverity,
  normalizeReportFilePath,
  normalizeSemgrepSeverity,
  parseEslintReport,
  parseSemgrepReport,
  parseTestReport,
} from "../src/helpers/externalAnalysis";

test("missing analysis config disables all report loading", async () => {
  const warnings: string[] = [];
  const summary = await loadExternalAnalysisReports({
    config: mergeReviewerConfig(),
    workspaceRoot: await createWorkspace(),
    logger: {
      warning: (message) => warnings.push(message),
    },
  });

  assert.deepEqual(summary.findings, []);
  assert.deepEqual(summary.loadWarnings, []);
  assert.deepEqual(warnings, []);
});

test("disabled report is not read", async () => {
  const warnings: string[] = [];
  const summary = await loadExternalAnalysisReports({
    config: mergeReviewerConfig({
      analysis: {
        lint: {
          enabled: false,
          report_path: "missing-eslint.json",
        },
      },
    }),
    workspaceRoot: await createWorkspace(),
    logger: {
      warning: (message) => warnings.push(message),
    },
  });

  assert.deepEqual(summary.findings, []);
  assert.deepEqual(summary.loadWarnings, []);
  assert.deepEqual(warnings, []);
});

test("enabled report with missing path produces warning", async () => {
  const warnings: string[] = [];
  const summary = await loadExternalAnalysisReports({
    config: mergeReviewerConfig({
      analysis: {
        lint: {
          enabled: true,
        },
      },
    }),
    workspaceRoot: await createWorkspace(),
    logger: {
      warning: (message) => warnings.push(message),
    },
  });

  assert.equal(summary.findings.length, 0);
  assert.equal(summary.loadWarnings.length, 1);
  assert.match(warnings[0], /report_path is missing/);
});

test("missing report file produces warning", async () => {
  const warnings: string[] = [];
  const summary = await loadExternalAnalysisReports({
    config: mergeReviewerConfig({
      analysis: {
        semgrep: {
          enabled: true,
          report_path: "reports/missing-semgrep.json",
        },
      },
    }),
    workspaceRoot: await createWorkspace(),
    logger: {
      warning: (message) => warnings.push(message),
    },
  });

  assert.equal(summary.findings.length, 0);
  assert.equal(summary.loadWarnings.length, 1);
  assert.match(warnings[0], /was not found/);
});

test("invalid JSON produces warning", async () => {
  const workspaceRoot = await createWorkspace();
  await writeWorkspaceFile(workspaceRoot, "reports/eslint.json", "{ nope");
  const warnings: string[] = [];

  const summary = await loadExternalAnalysisReports({
    config: mergeReviewerConfig({
      analysis: {
        lint: {
          enabled: true,
          report_path: "reports/eslint.json",
        },
      },
    }),
    workspaceRoot,
    logger: {
      warning: (message) => warnings.push(message),
    },
  });

  assert.equal(summary.findings.length, 0);
  assert.equal(summary.loadWarnings.length, 1);
  assert.match(warnings[0], /invalid JSON/);
});

test("ESLint JSON is parsed into normalized findings", () => {
  const workspaceRoot = "/repo";
  const findings = parseEslintReport(
    [
      {
        filePath: "/repo/src/file.ts",
        messages: [
          {
            ruleId: "no-unused-vars",
            severity: 1,
            message: "unused variable",
            line: 10,
            endLine: 10,
          },
          {
            ruleId: "no-console",
            severity: 2,
            message: "unexpected console",
            line: 12,
          },
        ],
      },
    ],
    workspaceRoot,
  );

  assert.equal(findings.length, 2);
  assert.deepEqual(findings[0], {
    tool: "lint",
    filePath: "src/file.ts",
    line: 10,
    endLine: 10,
    severity: "warning",
    ruleId: "no-unused-vars",
    message: "unused variable",
    raw: {
      ruleId: "no-unused-vars",
      severity: 1,
      message: "unused variable",
      line: 10,
      endLine: 10,
    },
  });
  assert.equal(findings[1].severity, "error");
});

test("Semgrep JSON is parsed into normalized findings", () => {
  const findings = parseSemgrepReport(
    {
      results: [
        {
          check_id: "typescript.lang.security.audit.example",
          path: "src/auth.ts",
          start: { line: 12 },
          end: { line: 14 },
          extra: {
            message: "unsafe input handling",
            severity: "CRITICAL",
          },
        },
      ],
    },
    "/repo",
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].tool, "semgrep");
  assert.equal(findings[0].filePath, "src/auth.ts");
  assert.equal(findings[0].line, 12);
  assert.equal(findings[0].endLine, 14);
  assert.equal(findings[0].severity, "critical");
  assert.equal(
    findings[0].ruleId,
    "typescript.lang.security.audit.example",
  );
  assert.equal(findings[0].message, "unsafe input handling");
});

test("simple test JSON is parsed into normalized findings", () => {
  const findings = parseTestReport(
    {
      success: false,
      numFailedTests: 2,
      testResults: [
        {
          name: "src/example.test.ts",
          message: "Expected true but received false",
        },
      ],
    },
    "/repo",
  );

  assert.deepEqual(findings, [
    {
      tool: "tests",
      filePath: "src/example.test.ts",
      severity: "error",
      message: "Expected true but received false",
      raw: {
        name: "src/example.test.ts",
        message: "Expected true but received false",
      },
    },
  ]);
});

test("severity normalization works", () => {
  assert.equal(normalizeEslintSeverity(1), "warning");
  assert.equal(normalizeEslintSeverity(2), "error");
  assert.equal(normalizeEslintSeverity(0), "info");
  assert.equal(normalizeSemgrepSeverity("INFO"), "info");
  assert.equal(normalizeSemgrepSeverity("WARNING"), "warning");
  assert.equal(normalizeSemgrepSeverity("ERROR"), "error");
  assert.equal(normalizeSemgrepSeverity("CRITICAL"), "critical");
  assert.equal(normalizeSemgrepSeverity("UNKNOWN"), "warning");
});

test("file path normalization works", () => {
  assert.equal(
    normalizeReportFilePath("/repo/src/file.ts", "/repo"),
    "src/file.ts",
  );
  assert.equal(
    normalizeReportFilePath("./src\\file.ts", "/repo"),
    "src/file.ts",
  );
});

test("getFindingsForFile returns only matching findings", () => {
  const findings = [
    {
      tool: "lint" as const,
      filePath: "src/a.ts",
      severity: "warning" as const,
      message: "a",
    },
    {
      tool: "semgrep" as const,
      filePath: "src/b.ts",
      severity: "error" as const,
      message: "b",
    },
  ];

  assert.deepEqual(getFindingsForFile(findings, "./src/a.ts"), [findings[0]]);
});

test("getFindingsForFunction includes findings inside function range", () => {
  const findings = [
    {
      tool: "semgrep" as const,
      filePath: "src/a.ts",
      line: 12,
      endLine: 12,
      severity: "error" as const,
      message: "inside",
    },
    {
      tool: "lint" as const,
      filePath: "src/a.ts",
      line: 50,
      severity: "warning" as const,
      message: "outside",
    },
  ];

  assert.deepEqual(
    getFindingsForFunction({
      findings,
      functionStartLine: 10,
      functionEndLine: 20,
    }),
    [findings[0]],
  );
});

test("getFindingsForFunction includes nearby and file-level findings", () => {
  const findings = [
    {
      tool: "lint" as const,
      filePath: "src/a.ts",
      line: 8,
      severity: "warning" as const,
      message: "nearby",
    },
    {
      tool: "tests" as const,
      filePath: "src/a.test.ts",
      severity: "error" as const,
      message: "file-level",
    },
  ];

  assert.deepEqual(
    getFindingsForFunction({
      findings,
      functionStartLine: 10,
      functionEndLine: 20,
      proximityLines: 3,
    }),
    [findings[1], findings[0]],
  );
});

test("external analysis evidence is formatted and limited", () => {
  const findings = limitExternalAnalysisFindings(
    [
      {
        tool: "lint" as const,
        filePath: "src/a.ts",
        line: 10,
        severity: "warning" as const,
        ruleId: "no-floating-promises",
        message: "Promise should be awaited.",
      },
      {
        tool: "semgrep" as const,
        filePath: "src/a.ts",
        line: 12,
        severity: "error" as const,
        ruleId: "no-hardcoded-secrets",
        message: "Possible hardcoded secret.",
      },
    ],
    1,
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].tool, "semgrep");
  assert.equal(
    formatExternalAnalysisEvidence(findings),
    "* [semgrep:error] line 12 no-hardcoded-secrets: Possible hardcoded secret.",
  );
});

test("external analysis risk uses only provided relevant findings", () => {
  assert.equal(
    determineExternalAnalysisRisk([
      {
        tool: "semgrep",
        filePath: "src/a.ts",
        severity: "error",
        message: "security issue",
      },
    ]),
    "high",
  );
  assert.equal(
    determineExternalAnalysisRisk([
      {
        tool: "semgrep",
        filePath: "src/other.ts",
        severity: "warning",
        message: "warning",
      },
      {
        tool: "lint",
        filePath: "src/a.ts",
        severity: "error",
        message: "lint error",
      },
    ]),
    "medium",
  );
  assert.equal(determineExternalAnalysisRisk([]), "low");
});

test("report parsing does not crash review loading", async () => {
  const workspaceRoot = await createWorkspace();
  await writeWorkspaceFile(
    workspaceRoot,
    "reports/semgrep.json",
    JSON.stringify({ unexpected: true }),
  );
  const warnings: string[] = [];

  const summary = await loadExternalAnalysisReports({
    config: mergeReviewerConfig({
      analysis: {
        semgrep: {
          enabled: true,
          report_path: "reports/semgrep.json",
        },
      },
    }),
    workspaceRoot,
    logger: {
      warning: (message) => warnings.push(message),
    },
  });

  assert.deepEqual(summary.findings, []);
  assert.equal(summary.loadWarnings.length, 1);
  assert.match(warnings[0], /could not be parsed/);
});

async function createWorkspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "ai-reviewer-analysis-"));
}

async function writeWorkspaceFile(
  workspaceRoot: string,
  filePath: string,
  contents: string,
): Promise<void> {
  const fullPath = path.join(workspaceRoot, filePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, contents);
}
