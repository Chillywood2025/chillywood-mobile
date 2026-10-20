import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync('app/admin.tsx', 'utf8');
const ast = ts.createSourceFile('app/admin.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
let resetEffect;
let discoverEffect;
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['loadFirstOwnerAuthority', 'firstOwnerControlsEnabled', 'canAccessBreakGlass', 'loadBreakGlass', 'runBreakGlassActivate', 'runBreakGlassEnd'].includes(node.name.getText(ast))) {
    declarations.set(node.name.getText(ast), node.initializer.getText(ast));
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
    && node.arguments[1]?.getText(ast) === '[firstOwnerReadAuthorityKey]') resetEffect = node.arguments[0].getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
    && node.arguments[1]?.getText(ast) === '[canAccessFirstOwnerTools, loadFirstOwnerAuthority]') discoverEffect = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const compiled = expression => ts.transpileModule(`exports.value = ${expression};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function harness() {
  const reads = [];
  const context = {
    exports: {}, useCallback: callback => callback, canAccessFirstOwnerTools: true,
    firstOwnerReadAuthorityKey: 'owner:session-a', firstOwnerLoadedAuthorityKey: 'owner:session-a',
    firstOwnerReadRef: { current: { authorityKey: 'owner:session-a', generation: 0 } },
    firstOwnerStatus: { controlsEnabled: true, actorIsFirstOwner: true }, firstOwnerRows: [{ id: 'old' }],
    firstOwnerPassword: 'synthetic-secret', firstOwnerPasscode: 'synthetic-passcode', firstOwnerChallenge: {},
    formatAdminOperationFailure: (_error, fallback) => fallback,
    readFirstOwnerAuthorityStatus() { const pending = deferred(); reads.push(pending); return pending.promise; },
  };
  for (const key of ['firstOwnerStatus', 'firstOwnerLoadedAuthorityKey', 'firstOwnerRows', 'firstOwnerBusy',
    'firstOwnerTargetEmail', 'firstOwnerReason', 'firstOwnerSuccessorEmail', 'firstOwnerPassword', 'firstOwnerChallenge',
    'firstOwnerPasscode', 'firstOwnerTypedConfirmation', 'firstOwnerDisplayedPasscode', 'ownerControlNotice',
    'breakGlassSessions', 'breakGlassActiveSessionId', 'breakGlassBusy']) {
    context[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => { context[key] = value; };
  }
  const evaluate = expression => { vm.runInNewContext(compiled(expression), context); return context.exports.value; };
  return { context, reads, load: () => evaluate(declarations.get('loadFirstOwnerAuthority'))(),
    enabled: () => evaluate(declarations.get('firstOwnerControlsEnabled')), reset: () => evaluate(resetEffect)(), evaluate,
    callback: name => evaluate(declarations.get(name)) };
}

test('refresh immediately locks cached First Owner authority and failed refresh stays locked', async () => {
  const h = harness(); assert.equal(h.enabled(), true);
  const pending = h.load();
  assert.equal(h.enabled(), false); assert.equal(h.context.firstOwnerRows.length, 0);
  h.reads[0].reject(new Error('offline')); await pending;
  assert.equal(h.enabled(), false); assert.equal(h.context.firstOwnerStatus, null);
  assert.equal(h.context.firstOwnerBusy, null);
});

test('out-of-order First Owner reads cannot overwrite newer status or unlock controls', async () => {
  const h = harness(); const a = h.load(); const b = h.load();
  h.reads[1].resolve({ status: { controlsEnabled: false, actorIsFirstOwner: false }, owners: [] }); await b;
  h.reads[0].resolve({ status: { controlsEnabled: true, actorIsFirstOwner: true }, owners: [{ id: 'old' }] }); await a;
  assert.equal(h.enabled(), false); assert.equal(h.context.firstOwnerRows.length, 0);
});

test('account or session change locks immediately and late reads cannot repopulate state', async () => {
  for (const key of ['other-owner:session-b', 'owner:session-b', null]) {
    const h = harness(); const pending = h.load();
    h.context.firstOwnerReadAuthorityKey = key;
    h.context.firstOwnerReadRef.current = { authorityKey: key, generation: 2 };
    assert.equal(h.enabled(), false);
    h.reset();
    h.reads[0].resolve({ status: { controlsEnabled: true, actorIsFirstOwner: true }, owners: [{ id: 'old' }] }); await pending;
    assert.equal(h.enabled(), false); assert.equal(h.context.firstOwnerStatus, null);
    assert.equal(h.context.firstOwnerPassword, ''); assert.equal(h.context.firstOwnerPasscode, '');
    assert.equal(h.context.firstOwnerChallenge, null); assert.equal(h.context.firstOwnerRows.length, 0);
  }
});

test('unmount retires First Owner reads; successful same-session read alone unlocks controls', async () => {
  const h = harness(); const cleanup = h.reset(); const pending = h.load(); cleanup();
  h.reads[0].resolve({ status: { controlsEnabled: true, actorIsFirstOwner: true }, owners: [] }); await pending;
  assert.equal(h.enabled(), false);
  const live = harness(); const read = live.load();
  live.reads[0].resolve({ status: { controlsEnabled: true, actorIsFirstOwner: true }, owners: [] }); await read;
  assert.equal(live.enabled(), true);
});

test('Break Glass gate rejects ordinary Owner, missing/stale authority, and non-owner', async () => {
  const h = harness();
  for (const [owner, verified] of [[true, false], [false, false], [false, true], [true, true]]) {
    h.context.isOwnerStaff = owner;
    h.context.firstOwnerControlsEnabled = verified;
    assert.equal(h.callback('canAccessBreakGlass'), owner && verified);
  }
  h.context.canAccessBreakGlass = false;
  h.context.breakGlassBusy = null;
  h.context.breakGlassActiveSessionId = null;
  h.context.breakGlassReason = 'Synthetic emergency reason';
  h.context.breakGlassCaseId = ''; h.context.breakGlassReportId = ''; h.context.breakGlassDuration = '1h';
  h.context.loadBreakGlass = () => { throw new Error('unexpected refresh'); };
  h.context.loadPlatformRoles = () => { throw new Error('unexpected role refresh'); };
  for (const name of ['loadBreakGlass', 'runBreakGlassActivate', 'runBreakGlassEnd']) {
    await h.callback(name)();
  }
});

test('First Owner discovery runs without visiting a hidden Break Glass tab', () => {
  const h = harness(); let reads = 0;
  h.context.operatorTab = 'home'; h.context.canAccessBreakGlass = false;
  h.context.loadFirstOwnerAuthority = () => { reads += 1; };
  h.evaluate(discoverEffect)();
  assert.equal(reads, 1);
  h.context.canAccessFirstOwnerTools = false;
  h.evaluate(discoverEffect)();
  assert.equal(reads, 1);
});
