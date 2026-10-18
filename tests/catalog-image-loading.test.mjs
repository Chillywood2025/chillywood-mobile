import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';

// Evaluate the actual Title hero JSX and its source-selection declarations.
// The image lifecycle itself is covered by the mounted StableImage suite.
const path = 'app/title/[id].tsx';
const source = process.env.CATALOG_IMAGE_BASELINE
  ? execFileSync('git', ['show', `${process.env.CATALOG_IMAGE_BASELINE}:${path}`], { encoding: 'utf8' })
  : readFileSync(path, 'utf8');
const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let hero;
const declarations = new Map();
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'StableImage' && !hero) hero = node.getText(ast);
  if (ts.isVariableDeclaration(node) && ['posterUrl', 'posterSource'].includes(node.name.getText(ast))) {
    declarations.set(node.name.getText(ast), `const ${node.getText(ast)};`);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(hero, 'the production Title hero uses StableImage');
const javascript = ts.transpileModule([
  ...['posterUrl', 'posterSource'].map(name => declarations.get(name) ?? ''),
  `exports.image = (${hero});`,
].join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;

function titleHero(title, localMatch) {
  const context = { exports: {}, React, title, localMatch, StableImage: 'StableImage', styles: { hero: {} } };
  vm.runInNewContext(javascript, context);
  return context.exports.image;
}

test('Title hero renders a known remote poster through the actual StableImage JSX', () => {
  const hero = titleHero({ poster_url: 'https://images.example/title.jpg' });
  assert.equal(hero.props.source?.uri, 'https://images.example/title.jpg');
  assert.equal(hero.props.expectedHeight, 420);
  assert.equal(hero.props.resizeMode, 'cover');
});

test('Title preserves bundled poster precedence and trims an otherwise valid remote URL', () => {
  assert.equal(titleHero({ poster_url: 'https://images.example/remote.jpg' }, { poster: 42 }).props.source, 42);
  assert.equal(titleHero({ poster_url: '  https://images.example/title.jpg  ' }).props.source?.uri, 'https://images.example/title.jpg');
});

test('Title has a genuine missing source for absent or unsupported remote artwork', () => {
  for (const poster_url of [null, undefined, '', '   ', 'file:///private/image.jpg', 'javascript:alert(1)', 'not-an-image-url']) {
    assert.equal(titleHero({ poster_url }).props.source, null);
  }
});

test('Title replacement and missing metadata are passed immediately rather than retaining an older title poster', () => {
  assert.equal(titleHero({ poster_url: 'https://images.example/first.jpg' }).props.source?.uri, 'https://images.example/first.jpg');
  assert.equal(titleHero({ poster_url: 'https://images.example/next.jpg' }).props.source?.uri, 'https://images.example/next.jpg');
  assert.equal(titleHero({ poster_url: null }).props.source, null);
});
