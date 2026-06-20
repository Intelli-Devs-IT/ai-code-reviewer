import { promises as fs } from "node:fs";
import path from "node:path";
import { ReviewerConfig } from "../config";
import { RiskLevel } from "./riskLevel";

export type AnalysisTool = "lint" | "semgrep" | "tests";
export type AnalysisSeverity = "info" | "warning" | "error" | "critical";

export interface ExternalAnalysisFinding {
  tool: AnalysisTool;
  filePath?: string;
  line?: number;
  endLine?: number;
  severity: AnalysisSeverity;
  ruleId?: string;
  message: string;
  raw?: unknown;
}

export interface ExternalAnalysisSummary {
  findings: ExternalAnalysisFinding[];
  loadWarnings: string[];
}

export interface FunctionExternalAnalysisParams {
  findings: ExternalAnalysisFinding[];
  functionStartLine: number;
  functionEndLine: number;
  maxFindings?: number;
  proximityLines?: number;
}

const DEFAULT_MAX_EXTERNAL_EVIDENCE_FINDINGS = 5;
const DEFAULT_FUNCTION_PROXIMITY_LINES = 3;
const SEVERITY_PRIORITY: Record<AnalysisSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

interface LoggerLike {
  warning(message: string): void;
}

type ReportConfig = NonNullable<ReviewerConfig["analysis"]>[AnalysisTool];

const EMPTY_SUMMARY: ExternalAnalysisSummary = {
  findings: [],
  loadWarnings: [],
};

export async function loadExternalAnalysisReports(params: {
  config: ReviewerConfig;
  workspaceRoot: string;
  logger: LoggerLike;
}): Promise<ExternalAnalysisSummary> {
  const analysis = params.config.analysis;

  if (!analysis) {
    return { ...EMPTY_SUMMARY };
  }

  const summary: ExternalAnalysisSummary = {
    findings: [],
    loadWarnings: [],
  };

  for (const tool of ["lint", "semgrep", "tests"] as const) {
    const reportConfig = analysis[tool];

    if (!reportConfig?.enabled) {
      continue;
    }

    const loaded = await loadOneReport({
      tool,
      reportConfig,
      workspaceRoot: params.workspaceRoot,
      logger: params.logger,
    });

    summary.findings.push(...loaded.findings);
    summary.loadWarnings.push(...loaded.loadWarnings);
  }

  return summary;
}

export function parseExternalAnalysisReport(params: {
  tool: AnalysisTool;
  parsed: unknown;
  workspaceRoot: string;
}): ExternalAnalysisFinding[] {
  switch (params.tool) {
    case "lint":
      return parseEslintReport(params.parsed, params.workspaceRoot);
    case "semgrep":
      return parseSemgrepReport(params.parsed, params.workspaceRoot);
    case "tests":
      return parseTestReport(params.parsed, params.workspaceRoot);
  }
}

export function parseEslintReport(
  parsed: unknown,
  workspaceRoot: string,
): ExternalAnalysisFinding[] {
  if (!Array.isArray(parsed)) {
    throw new Error("ESLint report must be a JSON array.");
  }

  const findings: ExternalAnalysisFinding[] = [];

  for (const fileResult of parsed) {
    if (!isRecord(fileResult)) {
      continue;
    }

    const filePath =
      typeof fileResult.filePath === "string"
        ? normalizeReportFilePath(fileResult.filePath, workspaceRoot)
        : undefined;
    const messages = Array.isArray(fileResult.messages)
      ? fileResult.messages
      : [];

    for (const message of messages) {
      if (!isRecord(message) || typeof message.message !== "string") {
        continue;
      }

      findings.push({
        tool: "lint",
        filePath,
        line: toPositiveInteger(message.line),
        endLine: toPositiveInteger(message.endLine),
        severity: normalizeEslintSeverity(message.severity),
        ruleId:
          typeof message.ruleId === "string" ? message.ruleId : undefined,
        message: message.message,
        raw: message,
      });
    }
  }

  return findings;
}

export function parseSemgrepReport(
  parsed: unknown,
  workspaceRoot: string,
): ExternalAnalysisFinding[] {
  if (!isRecord(parsed) || !Array.isArray(parsed.results)) {
    throw new Error("Semgrep report must include a results array.");
  }

  const findings: ExternalAnalysisFinding[] = [];

  for (const result of parsed.results) {
    if (!isRecord(result)) {
      continue;
    }

    const extra = isRecord(result.extra) ? result.extra : {};
    const start = isRecord(result.start) ? result.start : {};
    const end = isRecord(result.end) ? result.end : {};
    const message =
      typeof extra.message === "string"
        ? extra.message
        : "Semgrep finding needs attention.";

    findings.push({
      tool: "semgrep",
      filePath:
        typeof result.path === "string"
          ? normalizeReportFilePath(result.path, workspaceRoot)
          : undefined,
      line: toPositiveInteger(start.line),
      endLine: toPositiveInteger(end.line),
      severity: normalizeSemgrepSeverity(extra.severity),
      ruleId:
        typeof result.check_id === "string" ? result.check_id : undefined,
      message,
      raw: result,
    });
  }

  return findings;
}

export function parseTestReport(
  parsed: unknown,
  workspaceRoot: string,
): ExternalAnalysisFinding[] {
  if (!isRecord(parsed)) {
    throw new Error("Test report must be a JSON object.");
  }

  const success = parsed.success === true;
  const failedCount = typeof parsed.numFailedTests === "number"
    ? parsed.numFailedTests
    : 0;

  if (success && failedCount === 0) {
    return [];
  }

  const results = Array.isArray(parsed.testResults) ? parsed.testResults : [];
  const findings: ExternalAnalysisFinding[] = [];

  for (const testResult of results) {
    if (!isRecord(testResult)) {
      continue;
    }

    const message =
      typeof testResult.message === "string"
        ? testResult.message
        : "Test failure needs attention.";

    findings.push({
      tool: "tests",
      filePath:
        typeof testResult.name === "string"
          ? normalizeReportFilePath(testResult.name, workspaceRoot)
          : undefined,
      severity: "error",
      message,
      raw: testResult,
    });
  }

  return findings;
}

export function getFindingsForFile(
  findings: ExternalAnalysisFinding[],
  filePath: string,
): ExternalAnalysisFinding[] {
  const normalizedFilePath = normalizeRepoPath(filePath);

  return findings.filter((finding) => {
    if (!finding.filePath) {
      return false;
    }

    return normalizeRepoPath(finding.filePath) === normalizedFilePath;
  });
}

export function getFindingsForFunction({
  findings,
  functionStartLine,
  functionEndLine,
  maxFindings = DEFAULT_MAX_EXTERNAL_EVIDENCE_FINDINGS,
  proximityLines = DEFAULT_FUNCTION_PROXIMITY_LINES,
}: FunctionExternalAnalysisParams): ExternalAnalysisFinding[] {
  const lowerBound = Math.max(1, functionStartLine - proximityLines);
  const upperBound = functionEndLine + proximityLines;

  return sortExternalFindingsBySignal(
    findings.filter((finding) => {
      if (typeof finding.line !== "number") {
        return true;
      }

      const findingStart = finding.line;
      const findingEnd = finding.endLine ?? finding.line;

      return findingEnd >= lowerBound && findingStart <= upperBound;
    }),
  ).slice(0, maxFindings);
}

export function limitExternalAnalysisFindings(
  findings: ExternalAnalysisFinding[],
  maxFindings = DEFAULT_MAX_EXTERNAL_EVIDENCE_FINDINGS,
): ExternalAnalysisFinding[] {
  return sortExternalFindingsBySignal(findings).slice(0, maxFindings);
}

export function formatExternalAnalysisEvidence(
  findings: ExternalAnalysisFinding[],
): string {
  return findings.map(formatExternalAnalysisFinding).join("\n");
}

export function countExternalFindingsByTool(
  findings: ExternalAnalysisFinding[],
  tool: AnalysisTool,
): number {
  return findings.filter((finding) => finding.tool === tool).length;
}

export function determineExternalAnalysisRisk(
  findings: ExternalAnalysisFinding[],
): RiskLevel {
  if (
    findings.some(
      (finding) =>
        finding.tool === "semgrep" &&
        (finding.severity === "critical" || finding.severity === "error"),
    )
  ) {
    return "high";
  }

  if (
    findings.some(
      (finding) =>
        finding.tool === "tests" && finding.severity === "error",
    )
  ) {
    return "medium";
  }

  if (
    findings.some(
      (finding) => finding.tool === "lint" && finding.severity === "error",
    )
  ) {
    return "medium";
  }

  return "low";
}

export function normalizeReportFilePath(
  filePath: string,
  workspaceRoot: string,
): string {
  const normalizedRoot = normalizeRepoPath(path.resolve(workspaceRoot));
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(workspaceRoot, filePath);
  const normalizedPath = normalizeRepoPath(resolvedPath);

  if (
    normalizedPath === normalizedRoot ||
    !normalizedPath.startsWith(`${normalizedRoot}/`)
  ) {
    return normalizeRepoPath(filePath);
  }

  return normalizedPath.slice(normalizedRoot.length + 1);
}

export function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

export function normalizeEslintSeverity(value: unknown): AnalysisSeverity {
  if (value === 1) return "warning";
  if (value === 2) return "error";

  return "info";
}

function sortExternalFindingsBySignal(
  findings: ExternalAnalysisFinding[],
): ExternalAnalysisFinding[] {
  return [...findings].sort((left, right) => {
    const severityDelta =
      SEVERITY_PRIORITY[right.severity] - SEVERITY_PRIORITY[left.severity];

    if (severityDelta !== 0) {
      return severityDelta;
    }

    return (left.line ?? Number.MAX_SAFE_INTEGER) -
      (right.line ?? Number.MAX_SAFE_INTEGER);
  });
}

function formatExternalAnalysisFinding(
  finding: ExternalAnalysisFinding,
): string {
  const location = typeof finding.line === "number"
    ? `line ${finding.line}`
    : finding.filePath ?? "file-level";
  const rule = finding.ruleId ? ` ${finding.ruleId}` : "";
  const message = finding.message.replace(/\s+/g, " ").trim().slice(0, 220);

  return `* [${finding.tool}:${finding.severity}] ${location}${rule}: ${message}`;
}

export function normalizeSemgrepSeverity(value: unknown): AnalysisSeverity {
  if (typeof value !== "string") {
    return "warning";
  }

  switch (value.toUpperCase()) {
    case "INFO":
      return "info";
    case "WARNING":
      return "warning";
    case "ERROR":
      return "error";
    case "CRITICAL":
      return "critical";
    default:
      return "warning";
  }
}

function loadWarning(
  summary: ExternalAnalysisSummary,
  logger: LoggerLike,
  message: string,
): void {
  summary.loadWarnings.push(message);
  logger.warning(message);
}

async function loadOneReport(params: {
  tool: AnalysisTool;
  reportConfig: ReportConfig;
  workspaceRoot: string;
  logger: LoggerLike;
}): Promise<ExternalAnalysisSummary> {
  const summary: ExternalAnalysisSummary = {
    findings: [],
    loadWarnings: [],
  };

  if (!params.reportConfig?.report_path) {
    loadWarning(
      summary,
      params.logger,
      `External analysis ${params.tool} report is enabled but report_path is missing.`,
    );
    return summary;
  }

  const reportPath = resolveReportPath(
    params.workspaceRoot,
    params.reportConfig.report_path,
  );

  let rawReport: string;
  try {
    rawReport = await fs.readFile(reportPath, "utf8");
  } catch {
    loadWarning(
      summary,
      params.logger,
      `External analysis ${params.tool} report was not found: ${params.reportConfig.report_path}`,
    );
    return summary;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawReport);
  } catch {
    loadWarning(
      summary,
      params.logger,
      `External analysis ${params.tool} report contains invalid JSON: ${params.reportConfig.report_path}`,
    );
    return summary;
  }

  try {
    summary.findings = parseExternalAnalysisReport({
      tool: params.tool,
      parsed,
      workspaceRoot: params.workspaceRoot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    loadWarning(
      summary,
      params.logger,
      `External analysis ${params.tool} report could not be parsed: ${message}`,
    );
  }

  return summary;
}

function resolveReportPath(workspaceRoot: string, reportPath: string): string {
  if (path.isAbsolute(reportPath)) {
    return reportPath;
  }

  return path.resolve(workspaceRoot, reportPath);
}

function toPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
