"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadExternalAnalysisReports = loadExternalAnalysisReports;
exports.parseExternalAnalysisReport = parseExternalAnalysisReport;
exports.parseEslintReport = parseEslintReport;
exports.parseSemgrepReport = parseSemgrepReport;
exports.parseTestReport = parseTestReport;
exports.getFindingsForFile = getFindingsForFile;
exports.getFindingsForFunction = getFindingsForFunction;
exports.limitExternalAnalysisFindings = limitExternalAnalysisFindings;
exports.formatExternalAnalysisEvidence = formatExternalAnalysisEvidence;
exports.countExternalFindingsByTool = countExternalFindingsByTool;
exports.determineExternalAnalysisRisk = determineExternalAnalysisRisk;
exports.normalizeReportFilePath = normalizeReportFilePath;
exports.normalizeRepoPath = normalizeRepoPath;
exports.normalizeEslintSeverity = normalizeEslintSeverity;
exports.normalizeSemgrepSeverity = normalizeSemgrepSeverity;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const DEFAULT_MAX_EXTERNAL_EVIDENCE_FINDINGS = 5;
const DEFAULT_FUNCTION_PROXIMITY_LINES = 3;
const SEVERITY_PRIORITY = {
    info: 0,
    warning: 1,
    error: 2,
    critical: 3,
};
const EMPTY_SUMMARY = {
    findings: [],
    loadWarnings: [],
};
async function loadExternalAnalysisReports(params) {
    const analysis = params.config.analysis;
    if (!analysis) {
        return { ...EMPTY_SUMMARY };
    }
    const summary = {
        findings: [],
        loadWarnings: [],
    };
    for (const tool of ["lint", "semgrep", "tests"]) {
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
function parseExternalAnalysisReport(params) {
    switch (params.tool) {
        case "lint":
            return parseEslintReport(params.parsed, params.workspaceRoot);
        case "semgrep":
            return parseSemgrepReport(params.parsed, params.workspaceRoot);
        case "tests":
            return parseTestReport(params.parsed, params.workspaceRoot);
    }
}
function parseEslintReport(parsed, workspaceRoot) {
    if (!Array.isArray(parsed)) {
        throw new Error("ESLint report must be a JSON array.");
    }
    const findings = [];
    for (const fileResult of parsed) {
        if (!isRecord(fileResult)) {
            continue;
        }
        const filePath = typeof fileResult.filePath === "string"
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
                ruleId: typeof message.ruleId === "string" ? message.ruleId : undefined,
                message: message.message,
                raw: message,
            });
        }
    }
    return findings;
}
function parseSemgrepReport(parsed, workspaceRoot) {
    if (!isRecord(parsed) || !Array.isArray(parsed.results)) {
        throw new Error("Semgrep report must include a results array.");
    }
    const findings = [];
    for (const result of parsed.results) {
        if (!isRecord(result)) {
            continue;
        }
        const extra = isRecord(result.extra) ? result.extra : {};
        const start = isRecord(result.start) ? result.start : {};
        const end = isRecord(result.end) ? result.end : {};
        const message = typeof extra.message === "string"
            ? extra.message
            : "Semgrep finding needs attention.";
        findings.push({
            tool: "semgrep",
            filePath: typeof result.path === "string"
                ? normalizeReportFilePath(result.path, workspaceRoot)
                : undefined,
            line: toPositiveInteger(start.line),
            endLine: toPositiveInteger(end.line),
            severity: normalizeSemgrepSeverity(extra.severity),
            ruleId: typeof result.check_id === "string" ? result.check_id : undefined,
            message,
            raw: result,
        });
    }
    return findings;
}
function parseTestReport(parsed, workspaceRoot) {
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
    const findings = [];
    for (const testResult of results) {
        if (!isRecord(testResult)) {
            continue;
        }
        const message = typeof testResult.message === "string"
            ? testResult.message
            : "Test failure needs attention.";
        findings.push({
            tool: "tests",
            filePath: typeof testResult.name === "string"
                ? normalizeReportFilePath(testResult.name, workspaceRoot)
                : undefined,
            severity: "error",
            message,
            raw: testResult,
        });
    }
    return findings;
}
function getFindingsForFile(findings, filePath) {
    const normalizedFilePath = normalizeRepoPath(filePath);
    return findings.filter((finding) => {
        if (!finding.filePath) {
            return false;
        }
        return normalizeRepoPath(finding.filePath) === normalizedFilePath;
    });
}
function getFindingsForFunction({ findings, functionStartLine, functionEndLine, maxFindings = DEFAULT_MAX_EXTERNAL_EVIDENCE_FINDINGS, proximityLines = DEFAULT_FUNCTION_PROXIMITY_LINES, }) {
    const lowerBound = Math.max(1, functionStartLine - proximityLines);
    const upperBound = functionEndLine + proximityLines;
    return sortExternalFindingsBySignal(findings.filter((finding) => {
        if (typeof finding.line !== "number") {
            return true;
        }
        const findingStart = finding.line;
        const findingEnd = finding.endLine ?? finding.line;
        return findingEnd >= lowerBound && findingStart <= upperBound;
    })).slice(0, maxFindings);
}
function limitExternalAnalysisFindings(findings, maxFindings = DEFAULT_MAX_EXTERNAL_EVIDENCE_FINDINGS) {
    return sortExternalFindingsBySignal(findings).slice(0, maxFindings);
}
function formatExternalAnalysisEvidence(findings) {
    return findings.map(formatExternalAnalysisFinding).join("\n");
}
function countExternalFindingsByTool(findings, tool) {
    return findings.filter((finding) => finding.tool === tool).length;
}
function determineExternalAnalysisRisk(findings) {
    if (findings.some((finding) => finding.tool === "semgrep" &&
        (finding.severity === "critical" || finding.severity === "error"))) {
        return "high";
    }
    if (findings.some((finding) => finding.tool === "tests" && finding.severity === "error")) {
        return "medium";
    }
    if (findings.some((finding) => finding.tool === "lint" && finding.severity === "error")) {
        return "medium";
    }
    return "low";
}
function normalizeReportFilePath(filePath, workspaceRoot) {
    const normalizedRoot = normalizeRepoPath(node_path_1.default.resolve(workspaceRoot));
    const resolvedPath = node_path_1.default.isAbsolute(filePath)
        ? filePath
        : node_path_1.default.resolve(workspaceRoot, filePath);
    const normalizedPath = normalizeRepoPath(resolvedPath);
    if (normalizedPath === normalizedRoot ||
        !normalizedPath.startsWith(`${normalizedRoot}/`)) {
        return normalizeRepoPath(filePath);
    }
    return normalizedPath.slice(normalizedRoot.length + 1);
}
function normalizeRepoPath(filePath) {
    return filePath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}
function normalizeEslintSeverity(value) {
    if (value === 1)
        return "warning";
    if (value === 2)
        return "error";
    return "info";
}
function sortExternalFindingsBySignal(findings) {
    return [...findings].sort((left, right) => {
        const severityDelta = SEVERITY_PRIORITY[right.severity] - SEVERITY_PRIORITY[left.severity];
        if (severityDelta !== 0) {
            return severityDelta;
        }
        return (left.line ?? Number.MAX_SAFE_INTEGER) -
            (right.line ?? Number.MAX_SAFE_INTEGER);
    });
}
function formatExternalAnalysisFinding(finding) {
    const location = typeof finding.line === "number"
        ? `line ${finding.line}`
        : finding.filePath ?? "file-level";
    const rule = finding.ruleId ? ` ${finding.ruleId}` : "";
    const message = finding.message.replace(/\s+/g, " ").trim().slice(0, 220);
    return `* [${finding.tool}:${finding.severity}] ${location}${rule}: ${message}`;
}
function normalizeSemgrepSeverity(value) {
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
function loadWarning(summary, logger, message) {
    summary.loadWarnings.push(message);
    logger.warning(message);
}
async function loadOneReport(params) {
    const summary = {
        findings: [],
        loadWarnings: [],
    };
    if (!params.reportConfig?.report_path) {
        loadWarning(summary, params.logger, `External analysis ${params.tool} report is enabled but report_path is missing.`);
        return summary;
    }
    const reportPath = resolveReportPath(params.workspaceRoot, params.reportConfig.report_path);
    let rawReport;
    try {
        rawReport = await node_fs_1.promises.readFile(reportPath, "utf8");
    }
    catch {
        loadWarning(summary, params.logger, `External analysis ${params.tool} report was not found: ${params.reportConfig.report_path}`);
        return summary;
    }
    let parsed;
    try {
        parsed = JSON.parse(rawReport);
    }
    catch {
        loadWarning(summary, params.logger, `External analysis ${params.tool} report contains invalid JSON: ${params.reportConfig.report_path}`);
        return summary;
    }
    try {
        summary.findings = parseExternalAnalysisReport({
            tool: params.tool,
            parsed,
            workspaceRoot: params.workspaceRoot,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        loadWarning(summary, params.logger, `External analysis ${params.tool} report could not be parsed: ${message}`);
    }
    return summary;
}
function resolveReportPath(workspaceRoot, reportPath) {
    if (node_path_1.default.isAbsolute(reportPath)) {
        return reportPath;
    }
    return node_path_1.default.resolve(workspaceRoot, reportPath);
}
function toPositiveInteger(value) {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        return undefined;
    }
    return value;
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
