import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function assertNode20Imports(source, file) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const visit = node => {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(node.expression) && node.expression.text === 'require')) specifier = node.arguments[0];
    if (specifier && ts.isStringLiteralLike(specifier)) {
      assert.doesNotMatch(specifier.text, /\.tsx?$/u, `${file}: Node 20 must compile production TypeScript through an explicit harness`);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
}

test('creator-money Node suites never depend on implicit TypeScript import support', () => {
  for (const file of fs.readdirSync('tests/creator-money').filter(file => file.endsWith('.mjs'))) {
    assertNode20Imports(fs.readFileSync(`tests/creator-money/${file}`, 'utf8'), file);
  }
});

test('runtime compatibility guard rejects static, re-exported, dynamic and require TypeScript imports', () => {
  for (const source of ["import {x} from './production.ts';", "export {x} from './production.ts';",
    "const x = await import('./production.ts');", "const x = require('./production.ts');"]) {
    assert.throws(() => assertNode20Imports(source, 'negative-control.mjs'), assert.AssertionError);
  }
  assertNode20Imports("const source = 'production.ts'; import {loader} from './harness.mjs';", 'compiled-source.mjs');
});
