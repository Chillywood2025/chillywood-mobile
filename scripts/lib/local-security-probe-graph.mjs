import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// This exception belongs only to the pure classifier probe, not Edge functions.
// Any dependency change requires an explicit review of this closed graph.
const graph = new Map([
  ["scripts/cognitive-security-runtime-probe.ts", [
    "../_lib/cognitivePolicyEngine.ts",
    "../config/intelligence/cognitive-security-regression-corpus.json",
    "../config/intelligence/cognitive-security-classification-policy.json",
  ]],
  ["_lib/cognitivePolicyEngine.ts", ["./cognitivePlatformFoundation.ts"]],
  ["_lib/cognitivePlatformFoundation.ts", []],
  ["config/intelligence/cognitive-security-regression-corpus.json", []],
  ["config/intelligence/cognitive-security-classification-policy.json", []],
]);

function reject(relative, reason) {
  // Do not echo unreviewed source, import URLs, or filesystem error details.
  throw new Error(`Local security probe dependency audit failed: ${relative}: ${reason}`);
}

function auditTypeScript(relative, source, expected) {
  const parsed = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (parsed.parseDiagnostics.length) reject(relative, "invalid TypeScript");

  const references = ts.preProcessFile(source, true, true);
  if (references.referencedFiles.length || references.typeReferenceDirectives.length
    || references.libReferenceDirectives.length || references.isLibFile) {
    reject(relative, "reference directives are not allowed");
  }
  // Pragmas can add dependencies without an import AST node. Conservatively
  // reject directive markers anywhere, including unknown placements, rather
  // than lexing comments incorrectly around template strings or regex literals.
  if (/<reference\b|@(?:deno-types|ts-types|ts-self-types|jsxImportSource|jsxRuntime)\b/i.test(source)) {
    reject(relative, "dependency directives are not allowed");
  }

  const remaining = new Set(expected);
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      if (node.parent !== parsed || !ts.isStringLiteral(node.moduleSpecifier)
        || !node.importClause || node.importClause.isTypeOnly) {
        reject(relative, "unknown import form");
      }
      const specifier = node.moduleSpecifier.text;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
      if (!remaining.delete(specifier) || !graph.has(target)) {
        reject(relative, "unreviewed or duplicate static import");
      }
      const attributes = node.attributes;
      if (specifier.endsWith(".json")) {
        if (attributes?.token !== ts.SyntaxKind.WithKeyword || attributes.elements.length !== 1
          || attributes.elements[0].name.text !== "type"
          || !ts.isStringLiteral(attributes.elements[0].value)
          || attributes.elements[0].value.text !== "json") {
          reject(relative, "JSON import must use only the reviewed type attribute");
        }
      } else if (attributes) reject(relative, "unreviewed import attributes");
    } else if (node.kind === ts.SyntaxKind.ImportKeyword || ts.isImportEqualsDeclaration(node)
      || ts.isImportTypeNode(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier)
      || (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword)
      || (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name))) {
      reject(relative, "dynamic, type, require, or re-export imports are not allowed");
    }
    if ((ts.isIdentifier(node) || ts.isStringLiteral(node))
      && (node.text === "require" || node.text === "createRequire")) {
      reject(relative, "require loaders are not allowed");
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  if (remaining.size) reject(relative, "reviewed static import missing");
}

export function auditLocalSecurityProbe(root) {
  const sources = new Map();
  for (const [relative, expected] of graph) {
    let source;
    try {
      // Reject symlinks at every graph path component, not just the leaf.
      let current = root;
      for (const component of relative.split("/")) {
        current = path.join(current, component);
        if (fs.lstatSync(current).isSymbolicLink()) reject(relative, "symlink in graph");
      }
      if (!fs.lstatSync(current).isFile()) reject(relative, "graph entry is not a file");
      source = fs.readFileSync(current, "utf8");
    } catch {
      reject(relative, "graph entry must be a readable regular file without symlinks");
    }
    if (relative.endsWith(".ts")) auditTypeScript(relative, source, expected);
    else {
      try { JSON.parse(source); } catch { reject(relative, "invalid JSON fixture"); }
    }
    sources.set(relative, source);
  }
  return sources;
}
