import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const path = 'app/admin.tsx';
const source = process.env.ADMIN_LIVE_COST_BASELINE
  ? execFileSync('git', ['show', `${process.env.ADMIN_LIVE_COST_BASELINE}:${path}`], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  : readFileSync(path, 'utf8');
const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let initializer;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'runLiveCostGuardAction') initializer = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(initializer, 'production callback exists');
const compiled = ts.transpileModule(`exports.callback = ${initializer};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function harness() {
  const settings = { id: 'saved', mode: 'manual_approval', enabled: true };
  const context = {
    exports: {}, useCallback: callback => callback,
    canAccessLiveOps: true, liveCostGuardActionBusy: null,
    liveCostGuardLoading: false, liveCostGuardSaving: false,
    liveCostGuardActionReason: 'Investigate room', liveCostGuardRoomName: 'room', liveCostGuardParticipantIdentity: 'participant',
    liveCostGuardSettingsReadModel: { connected: true, settings }, liveCostGuardSettingsForm: { ...settings },
    formatModerationToken: value => value,
    formatAdminOperationFailure: (_error, fallback) => fallback,
    setLiveCostGuardNotice: value => { context.notice = value; },
    setLiveCostGuardActionBusy: value => { context.liveCostGuardActionBusy = value; },
    loadLiveCostGuard: async () => { context.notice = null; },
    requestLiveCostGuardAction: async input => { context.requests.push(input); return context.result; },
    requests: [], result: { id: 'receipt', success: true, after: { livekitApiCalled: true } },
    Alert: { alert: (_title, message, buttons) => { context.message = message; context.confirm = buttons.find(button => button.text === 'Confirm').onPress; } },
  };
  vm.runInNewContext(compiled, context);
  return {
    context,
    run: () => context.exports.callback('remove_participant'),
    confirm: async () => { context.confirm(); await new Promise(resolve => setImmediate(resolve)); },
  };
}

test('unsaved observe-only edit cannot misrepresent persisted enforcement mode', () => {
  const h = harness(); h.context.liveCostGuardSettingsForm.mode = 'observe_only'; h.run();
  assert.equal(h.context.confirm, undefined);
  assert.match(h.context.notice, /unsaved/);
  assert.equal(h.context.requests.length, 0);
});

test('missing, loading, or saving settings cannot open action confirmation', () => {
  for (const state of ['missing', 'loading', 'saving', 'disconnected']) {
    const h = harness();
    if (state === 'missing') h.context.liveCostGuardSettingsReadModel = null;
    if (state === 'loading') h.context.liveCostGuardLoading = true;
    if (state === 'saving') h.context.liveCostGuardSaving = true;
    if (state === 'disconnected') h.context.liveCostGuardSettingsReadModel.connected = false;
    h.run(); assert.equal(h.context.confirm, undefined, state);
    assert.match(h.context.notice, /Refresh saved/);
  }
});

test('confirmation describes saved state and server recheck without promising immutable observe-only state', () => {
  const h = harness(); h.run();
  assert.match(h.context.message, /Last loaded saved mode: manual_approval; enabled/);
  assert.match(h.context.message, /server rechecks current saved settings/);
});

test('backend not-applied reason survives history refresh', async () => {
  const h = harness(); h.context.result = { id: 'receipt', success: false, after: {}, errorMessage: 'Observe-only mode logs the request without running it.' };
  h.run(); await h.confirm();
  assert.match(h.context.notice, /recorded but not applied/);
  assert.match(h.context.notice, /Observe-only/);
  assert.equal(h.context.requests.length, 1);
});

test('null receipt warns against blind retry instead of reporting success', async () => {
  const h = harness(); h.context.result = null; h.run(); await h.confirm();
  assert.match(h.context.notice, /did not return an action receipt/);
});

test('distinguishes a recorded request from confirmed LiveKit change', async () => {
  const h = harness(); h.context.result.after = {}; h.run(); await h.confirm();
  assert.match(h.context.notice, /does not confirm a LiveKit change/);
  const applied = harness(); applied.run(); await applied.confirm();
  assert.match(applied.context.notice, /applied by LiveKit/);
});

test('permission denial still blocks action', () => {
  const h = harness(); h.context.canAccessLiveOps = false; h.run();
  assert.equal(h.context.confirm, undefined); assert.equal(h.context.requests.length, 0);
});
