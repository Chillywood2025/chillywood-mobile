// Preparation-only parser. It reads supplied source bytes, never imports or
// executes the production modules and never resolves or downloads packages.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ts = createRequire(path.join(process.argv[2], 'package.json'))('typescript');
const { manifest, sources, listener } = JSON.parse(fs.readFileSync(0, 'utf8'));
const files = new Map(Object.entries(sources).map(([name, raw]) => ['snapshot/' + name, raw]));
files.set('listener.ts', listener);
const visited = new Set(), external = new Set(), entries = new Set();
function visit(name) {
  if (visited.has(name)) return;
  assert.ok(files.has(name), 'Unpinned local dependency: ' + name);
  visited.add(name);
  const raw = files.get(name);
  if (name.endsWith('.json')) { JSON.parse(raw); return; }
  const parsed = ts.createSourceFile(name, raw, ts.ScriptTarget.Latest, true);
  assert.equal(parsed.parseDiagnostics.length, 0, 'Source parse failed: ' + name);
  assert.equal(parsed.referencedFiles.length + parsed.typeReferenceDirectives.length, 0, 'Unpinned reference directive: ' + name);
  const dependency = literal => {
    assert.ok(literal && ts.isStringLiteralLike(literal), 'Nonliteral dependency: ' + name);
    const specifier = literal.text;
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), specifier));
      assert.ok(target.startsWith('snapshot/'), 'Dependency escapes snapshot: ' + name);
      if (name === 'listener.ts') entries.add(target.slice('snapshot/'.length));
      visit(target);
    } else {
      assert.ok(manifest.externalImports.includes(specifier), 'Unpinned external dependency: ' + specifier);
      external.add(specifier);
    }
  };
  const walk = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) dependency(node.moduleSpecifier);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(node.expression) && node.expression.text === 'require')) dependency(node.arguments[0]);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) dependency(node.moduleReference.expression);
    if (ts.isImportTypeNode(node)) dependency(ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined);
    ts.forEachChild(node, walk);
  };
  walk(parsed);
}
visit('listener.ts');
const closure = [...visited].filter(name => name !== 'listener.ts').map(name => name.slice('snapshot/'.length)).sort();
assert.deepEqual([...entries].sort(), [...manifest.entries].sort(), 'Listener entry set changed');
assert.deepEqual(closure, manifest.entryDependencyClosure, 'Entry dependency closure changed');
assert.deepEqual([...external].sort(), manifest.entryExternalImports, 'Entry external imports changed');
process.stdout.write(JSON.stringify({ entryDependencyCount: closure.length, externalImports: [...external].sort() }) + '\n');
