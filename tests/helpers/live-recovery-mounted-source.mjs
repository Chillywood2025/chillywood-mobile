import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import React from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

// These are deliberately minimal production compositions, not routed screens.
// Each selected statement is copied verbatim from the screen, including its
// actual hook dependency array. React owns rerenders, effects and cleanup; tests
// may control external services and clocks, never call an effect manually.
export const noop = () => {};
const document = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml",
  nodeName: "DIV", nodeType: 1, ownerDocument: document, parentNode: null, tagName: "DIV" });
document.documentElement = container();
globalThis.document = document;
globalThis.window = globalThis;
globalThis.HTMLIFrameElement = class {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export const held = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
export const settle = async (run = noop) => React.act(async () => { await run(); for (let i = 0; i < 30; i++) await Promise.resolve(); });

export function clock() {
  let serial = 0;
  const timeouts = new Map(), intervals = new Map();
  return { timeouts, intervals,
    setTimeout: (callback, delay) => { const id = ++serial; timeouts.set(id, { callback, delay }); return id; },
    clearTimeout: id => timeouts.delete(id),
    setInterval: (callback, delay) => { const id = ++serial; intervals.set(id, { callback, delay }); return id; },
    clearInterval: id => intervals.delete(id),
    async nextTimeout() { assert.ok(timeouts.size, "production scheduled a timeout"); const [id, timer] = timeouts.entries().next().value; timeouts.delete(id); await settle(timer.callback); },
    async tickIntervals() { await settle(() => { for (const timer of [...intervals.values()]) timer.callback(); }); },
  };
}

export function sourceComposition(path, screenName, mutation = value => value) {
  const raw = mutation(fs.readFileSync(path, "utf8"));
  const ast = ts.createSourceFile(path, raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const screen = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === screenName);
  assert.ok(screen?.body, `${screenName} is a production function`);
  const chosen = new Set();
  function one(nodes, description) { assert.equal(nodes.length, 1, description); chosen.add(nodes[0]); return nodes[0]; }
  return {
    constant(name) { return one(ast.statements.filter(node => ts.isVariableStatement(node)
      && node.declarationList.declarations.some(declaration => declaration.name.getText(ast) === name)), `one production constant/helper: ${name}`); },
    declaration(name) { return one(screen.body.statements.filter(node => ts.isVariableStatement(node)
      && node.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name)
        ? declaration.name.text === name
        : ts.isArrayBindingPattern(declaration.name) && declaration.name.elements.some(element => element.name?.getText(ast) === name))), `one declaration: ${name}`); },
    effect(fragment) { return one(screen.body.statements.filter(node => ts.isExpressionStatement(node)
      && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === "useEffect"
      && node.expression.arguments[0]?.getText(ast).includes(fragment)), `one complete effect: ${fragment}`); },
    assignment(fragment) { return one(screen.body.statements.filter(node => ts.isExpressionStatement(node)
      && node.getText(ast).startsWith(fragment)), `one assignment: ${fragment}`); },
    compile({ inputs, outputs, globals = {} }) {
      const statements = [...chosen].sort((a, b) => a.pos - b.pos).map(node => node.getText(ast)).join("\n");
      const source = `globalThis.Component = function ProductionRecoveryComposition({ values, observe }) {
        const { ${inputs.join(", ")} } = values;
        ${statements}
        observe({ ${outputs.join(", ")} });
        return null;
      };`;
      const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true });
      assert.equal(compiled.diagnostics.length, 0, "production composition transpiles");
      const scope = { ...React, ...globals };
      vm.runInNewContext(compiled.outputText, scope, { filename: path });
      return scope.Component;
    },
  };
}

export function productionModule(path) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { exports }, { filename: path });
  return exports;
}

export async function mountComposition(t, Component, initialValues, { strict = false } = {}) {
  let values = initialValues, current, mounted = true, renders = 0;
  const root = createRoot(container());
  const observe = snapshot => { current = snapshot; renders++; assert.ok(renders < 200, "production render/effect loop is bounded"); };
  async function update(patch = {}) {
    values = { ...values, ...patch };
    await settle(() => root.render(strict
      ? React.createElement(React.StrictMode, null, React.createElement(Component, { values, observe }))
      : React.createElement(Component, { values, observe })));
  }
  async function unmount() { if (mounted) { mounted = false; await settle(() => root.unmount()); } }
  t.after(unmount);
  await update();
  return { update, unmount, get current() { return current; }, get renders() { return renders; } };
}
