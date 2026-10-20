import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const read = path => process.env.ADMIN_READ_TRUTH_BASELINE
  ? execFileSync('git', ['show', `${process.env.ADMIN_READ_TRUTH_BASELINE}:${path}`], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  : readFileSync(path, 'utf8');
function extract(path, name) {
  const source = read(path);
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let text;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) text = `exports.value = ${node.initializer.getText(ast)};`;
    if (ts.isFunctionDeclaration(node) && node.name?.getText(ast) === name) text = `${node.getText(ast)}; exports.value = ${name};`;
    if (name === 'effect' && ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && !text) text = `exports.value = ${node.arguments[0].getText(ast)};`;
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(text, name);
  return ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
}
function evaluate(code, mocks) {
  const context = { exports: {}, ...mocks }; vm.runInNewContext(code, context); return context.exports.value;
}
const canaryCode = extract('app/admin.tsx', 'summarizeCanaryRun');
test('empty or missing canary results remain unverified even with positive summary', () => {
  const summarize = evaluate(canaryCode, { normalizeCanaryStatus: value => value });
  for (const run of [{ results: [] }, { summary: { pass: 9 } }, { results: [], summary: {} }]) assert.equal(summarize(run).hasResults, false);
  assert.equal(summarize({ results: [{ status: 'pass' }] }).hasResults, true);
  const source = read('app/admin.tsx');
  assert.match(source, /No individual check evidence was returned/);
  assert.match(source, /!latestCanarySummary\.hasResults \? "No check evidence"/);
});

const photoCode = extract('_lib/officialRachi.ts', 'readOfficialRachiProfileImage');
test('Rachi read rejects unavailable profile while genuine empty avatar remains valid', async () => {
  const photo = profile => evaluate(photoCode, {
    readUserProfileByUserId: async () => profile,
    RACHI_OFFICIAL_ACCOUNT: { userId: 'official' }, toText: value => String(value ?? '').trim(),
  });
  await assert.rejects(photo(null)(), /unavailable/);
  assert.equal((await photo({ avatarUrl: null })()).avatarUrl, null);
  assert.equal((await photo({ avatarUrl: 'saved-photo' })()).avatarUrl, 'saved-photo');
});
test('Rachi rejected profile read propagates rather than becoming empty photo', async () => {
  const photo = evaluate(photoCode, {
    readUserProfileByUserId: async () => { throw new Error('offline'); },
    RACHI_OFFICIAL_ACCOUNT: { userId: 'official' }, toText: value => String(value ?? '').trim(),
  });
  await assert.rejects(photo(), /offline/);
});
test('Rachi admin failed refresh preserves last saved photo and exposes retry notice', async () => {
  let savedPhoto = 'cached-photo', notice;
  const callback = evaluate(extract('app/admin.tsx', 'loadRachiOfficialSurfaces'), {
    useCallback: callback => callback, canAccessContentProgramming: true,
    setRachiPosts() {}, setRachiOriginals() {}, setRachiPostsLoading() {}, setRachiOriginalsLoading() {},
    setRachiProfileImageSavedUrl: value => { savedPhoto = value; }, setRachiNotice: value => { notice = value; },
    readOfficialRachiPosts: async () => [], readOfficialRachiOriginals: async () => [],
    readOfficialRachiProfileImage: async () => { throw new Error('unavailable'); },
    formatAdminOperationFailure: (_error, fallback) => fallback,
  });
  await callback(); assert.equal(savedPhoto, 'cached-photo'); assert.match(notice, /Unable to load/);
});

const cognitivePath = 'components/admin/cognitive-control-center.tsx';
const cognitiveCode = extract(cognitivePath, 'effect');
test('Cognitive rendered instance is retired when admin session authority changes', () => {
  const source = read('app/admin.tsx');
  const ast = ts.createSourceFile('admin.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'CognitiveControlCenterFoundation') {
      let parent = node.parent;
      while (ts.isParenthesizedExpression(parent)) parent = parent.parent;
      expression = ts.isConditionalExpression(parent) ? parent.getText(ast) : node.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(expression);
  const code = ts.transpileModule(`exports.value = ${expression};`, {
    fileName: 'render.tsx', compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const render = authority => evaluate(code, {
    adminReadAuthorityKey: authority, operatorTab: 'cognitive', canAccessCognitiveSourceManifest: true, CognitiveControlCenterFoundation: 'Cognitive',
    React: { createElement: (type, props) => ({ type, props }) },
  });
  assert.equal(render(null), null);
  assert.equal(render('owner:session1').props.key, 'owner:session1');
  assert.equal(render('owner:session2').props.key, 'owner:session2');
});
test('Cognitive rejected invoke reaches unavailable state and next attempt can recover', async () => {
  let state, liveStatus = { old: true }, reject = true;
  const effect = evaluate(cognitiveCode, {
    setReadbackState: value => { state = value; }, setLiveStatus: value => { liveStatus = value; },
    parseLiveCognitiveStatusResponse: value => value,
    supabase: { functions: { invoke: async () => { if (reject) throw new Error('offline'); return { data: { connected: true }, error: null }; } } },
  });
  const cleanup = effect(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(state, 'source_only'); assert.equal(liveStatus, null);
  cleanup(); reject = false; effect(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(state, 'live'); assert.equal(liveStatus.connected, true);
  const source = read(cognitivePath);
  assert.match(source, /onPress=\{\(\) => setReadbackAttempt\(\(attempt\) => attempt \+ 1\)\}/);
  assert.match(source, /\}, \[readbackAttempt\]\)/);
});
test('Cognitive late read cannot update an unmounted attempt', async () => {
  let resolve, state;
  const effect = evaluate(cognitiveCode, {
    setReadbackState: value => { state = value; }, setLiveStatus() {}, parseLiveCognitiveStatusResponse: value => value,
    supabase: { functions: { invoke: () => new Promise(done => { resolve = done; }) } },
  });
  const cleanup = effect(); cleanup(); resolve({ data: { connected: true }, error: null });
  await new Promise(done => setImmediate(done)); assert.notEqual(state, 'live');
});
