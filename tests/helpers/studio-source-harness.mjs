import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { loadPickedMediaResources } from "./picked-media-resources-host.mjs";

// Execute the exact production declarations, replacing only their named IO
// boundaries. SOURCE_ROOT also permits the same assertions against an old tree.
export function loadStudioFunctions(file, names, context, root = process.env.STUDIO_SOURCE_ROOT || process.cwd()) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) {
      found.set(node.name.text, node.getText(ast).replace(/^export /, ""));
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) {
      found.set(node.name.text, `const ${node.getText(ast)};`);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  names.forEach((name) => assert.ok(found.has(name), `Missing production declaration ${file}:${name}`));
  const code = ts.transpileModule(names.map((name) => found.get(name)).join("\n")
    + `\nglobalThis.api = {${names.join(",")}};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  Object.assign(context, { ...loadPickedMediaResources(), ...context });
  vm.runInNewContext(code, context);
  return context.api;
}

export const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

export function loadStudioFocusCallback(file, context, root = process.env.STUDIO_SOURCE_ROOT || process.cwd()) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let call;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useFocusEffect"
      && node.getText(ast).includes("const loadChannel")) call = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(call, "Public Platform load is registered for focus refresh");
  let callback;
  const code = ts.transpileModule(`${call.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { ...context, useCallback: (fn) => fn, useFocusEffect: (fn) => { callback = fn; } });
  return callback;
}
