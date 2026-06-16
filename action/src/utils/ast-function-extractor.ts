import * as ts from "typescript";

export interface ExtractedFunction {
  name: string;
  startLine: number;
  endLine: number;
  kind:
    | "function"
    | "arrow-function"
    | "method"
    | "class-method"
    | "unknown";
  text: string;
}

const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

export function extractFunctionsFromSource(
  sourceCode: string,
  filePath: string
): ExtractedFunction[] {
  if (!isSupportedFile(filePath)) {
    return [];
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath)
  );

  const extractedFunctions: ExtractedFunction[] = [];

  function addFunction(
    node: ts.Node,
    name: string,
    kind: ExtractedFunction["kind"],
    start = node.getStart(sourceFile),
    end = node.getEnd()
  ): void {
    extractedFunctions.push({
      name,
      startLine: getLineNumber(sourceFile, start),
      endLine: getLineNumber(sourceFile, Math.max(start, end - 1)),
      kind,
      text: sourceCode.slice(start, end),
    });
  }

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node)) {
      addFunction(node, node.name?.text ?? "", "function");
    }

    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isArrowFunction(node.initializer)
    ) {
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

function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(getFileExtension(filePath));
}

function getFileExtension(filePath: string): string {
  const extensionStart = filePath.lastIndexOf(".");

  return extensionStart === -1 ? "" : filePath.slice(extensionStart).toLowerCase();
}

function getScriptKind(filePath: string): ts.ScriptKind {
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

function getLineNumber(sourceFile: ts.SourceFile, position: number): number {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function getNodeName(name: ts.BindingName): string {
  return ts.isIdentifier(name) ? name.text : "";
}

function getPropertyName(name: ts.PropertyName): string {
  if (
    ts.isIdentifier(name) ||
    ts.isPrivateIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }

  return "";
}

function getVariableFunctionRange(
  node: ts.VariableDeclaration,
  sourceFile: ts.SourceFile
): { start: number; end: number } {
  const declarationList = node.parent;
  const statement = declarationList.parent;

  if (
    ts.isVariableDeclarationList(declarationList) &&
    declarationList.declarations.length === 1 &&
    ts.isVariableStatement(statement)
  ) {
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
