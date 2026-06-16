"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractFunctionsFromSource = extractFunctionsFromSource;
const ts = __importStar(require("typescript"));
const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
function extractFunctionsFromSource(sourceCode, filePath) {
    if (!isSupportedFile(filePath)) {
        return [];
    }
    const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true, getScriptKind(filePath));
    const extractedFunctions = [];
    function addFunction(node, name, kind, start = node.getStart(sourceFile), end = node.getEnd()) {
        extractedFunctions.push({
            name,
            startLine: getLineNumber(sourceFile, start),
            endLine: getLineNumber(sourceFile, Math.max(start, end - 1)),
            kind,
            text: sourceCode.slice(start, end),
        });
    }
    function visit(node) {
        if (ts.isFunctionDeclaration(node)) {
            addFunction(node, node.name?.text ?? "", "function");
        }
        if (ts.isVariableDeclaration(node) &&
            node.initializer &&
            ts.isArrowFunction(node.initializer)) {
            const name = getNodeName(node.name);
            const { start, end } = getVariableFunctionRange(node, sourceFile);
            addFunction(node, name, "arrow-function", start, end);
        }
        if (ts.isMethodDeclaration(node)) {
            const name = getPropertyName(node.name);
            const kind = ts.isClassLike(node.parent) ? "class-method" : "method";
            addFunction(node, name, kind);
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return extractedFunctions;
}
function isSupportedFile(filePath) {
    return SUPPORTED_EXTENSIONS.has(getFileExtension(filePath));
}
function getFileExtension(filePath) {
    const extensionStart = filePath.lastIndexOf(".");
    return extensionStart === -1 ? "" : filePath.slice(extensionStart).toLowerCase();
}
function getScriptKind(filePath) {
    switch (getFileExtension(filePath)) {
        case ".js":
            return ts.ScriptKind.JS;
        case ".jsx":
            return ts.ScriptKind.JSX;
        case ".tsx":
            return ts.ScriptKind.TSX;
        case ".ts":
        default:
            return ts.ScriptKind.TS;
    }
}
function getLineNumber(sourceFile, position) {
    return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}
function getNodeName(name) {
    return ts.isIdentifier(name) ? name.text : "";
}
function getPropertyName(name) {
    if (ts.isIdentifier(name) ||
        ts.isPrivateIdentifier(name) ||
        ts.isStringLiteral(name) ||
        ts.isNumericLiteral(name)) {
        return name.text;
    }
    return "";
}
function getVariableFunctionRange(node, sourceFile) {
    const declarationList = node.parent;
    const statement = declarationList.parent;
    if (ts.isVariableDeclarationList(declarationList) &&
        declarationList.declarations.length === 1 &&
        ts.isVariableStatement(statement)) {
        return {
            start: statement.getStart(sourceFile),
            end: statement.getEnd(),
        };
    }
    return {
        start: node.getStart(sourceFile),
        end: node.getEnd(),
    };
}
