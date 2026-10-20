import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const path = 'app/admin.tsx';
const source = process.env.ADMIN_DMCA_BASELINE
  ? execFileSync('git', ['show', `${process.env.ADMIN_DMCA_BASELINE}:${path}`], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  : readFileSync(path, 'utf8');
const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['loadDmcaCaseDetail', 'runDmcaStatusUpdate', 'refreshDmcaAfterAction'];
const declarations = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) declarations.set(node.name.getText(ast), node.initializer.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const detail = id => ({ case: { id } });
function harness() {
  const reads = [], writes = [];
  const context = {
    exports: {}, useCallback: callback => callback, canAccessDmca: true,
    dmcaDetailAuthorityKey: 'owner:dmca', dmcaDetailAuthorityRef: { current: 'owner:dmca' },
    dmcaDetailRequestRef: { current: { caseId: 'A', loaded: true } },
    dmcaCaseDetail: detail('A'), dmcaSelectedCaseId: 'A', dmcaDetailVisible: true,
    dmcaActionReason: 'A reason', dmcaAdminNotes: 'A notes', dmcaActionBusy: null,
    formatDmcaOperationFailure: (_error, fallback) => fallback, formatModerationToken: value => value,
    resetCounterNoticeForm() { context.counterCleared = true; },
    applyDmcaDetailDefaults(value) { context.defaults = value.case.id; },
    readAdminDmcaCaseDetail(id) { const pending = deferred(); reads.push({ id, ...pending }); return pending.promise; },
    adminDmcaSetCaseStatus: async input => { writes.push(input); },
    refreshDmcaAfterAction: async () => {}, loadDmcaCases: async () => {},
    user: { id: 'owner' }, session: { userId: 'owner', sessionGeneration: 'one', restoreOnly: false },
    getCurrentAccountSessionAuthoritySnapshot: () => context.session,
    sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId && a.sessionGeneration === b.sessionGeneration,
  };
  for (const [setter, key] of [['setDmcaCaseDetail', 'dmcaCaseDetail'], ['setDmcaSelectedCaseId', 'dmcaSelectedCaseId'], ['setDmcaDetailVisible', 'dmcaDetailVisible'], ['setDmcaActionReason', 'dmcaActionReason'], ['setDmcaAdminNotes', 'dmcaAdminNotes'], ['setDmcaActionBusy', 'dmcaActionBusy'], ['setDmcaNotice', 'notice']]) {
    context[setter] = value => { context[key] = value; };
  }
  const callback = name => {
    const code = ts.transpileModule(`exports.callback = ${declarations.get(name)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(code, context); return context.exports.callback;
  };
  context.loadDmcaCaseDetail = (...args) => callback('loadDmcaCaseDetail')(...args);
  return { context, callback, reads, writes };
}
test('DMCA selecting a new case clears old detail and drafts before the request resolves', async () => {
  const h = harness(); const pending = h.context.loadDmcaCaseDetail('B');
  assert.equal(h.context.dmcaCaseDetail, null);
  assert.equal(h.context.dmcaDetailVisible, false);
  assert.equal(h.context.dmcaActionReason, '');
  assert.equal(h.context.dmcaAdminNotes, '');
  assert.equal(h.context.counterCleared, true);
  h.reads[0].reject(new Error('failed')); await pending;
  assert.equal(h.context.dmcaCaseDetail, null);
});
test('DMCA old responses cannot overwrite new case defaults or release its loading state', async () => {
  const h = harness(); const b = h.context.loadDmcaCaseDetail('B'); const c = h.context.loadDmcaCaseDetail('C');
  h.reads[0].resolve(detail('B')); await b;
  assert.equal(h.context.dmcaCaseDetail, null);
  assert.equal(h.context.dmcaActionBusy, 'detail-C');
  h.reads[1].resolve(detail('C')); await c;
  assert.equal(h.context.dmcaCaseDetail.case.id, 'C');
  assert.equal(h.context.defaults, 'C');
});
test('DMCA role/account changes discard in-flight detail', async () => {
  const h = harness(); const pending = h.context.loadDmcaCaseDetail('B');
  h.context.dmcaDetailAuthorityRef.current = null;
  h.reads[0].resolve(detail('B')); await pending;
  assert.equal(h.context.dmcaCaseDetail, null);
  assert.equal(h.context.dmcaDetailVisible, false);
});
test('DMCA detail discards unrendered account/session replacements before applying data or loading state', async () => {
  for (const change of ['account','session']) {
    const h = harness(); const pending = h.context.loadDmcaCaseDetail('B');
    h.context.session = { userId: change==='account'?'other':'owner', sessionGeneration: 'two', restoreOnly: false };
    h.reads[0].resolve(detail('B')); await pending;
    assert.equal(h.context.dmcaCaseDetail,null); assert.equal(h.context.dmcaDetailVisible,false);
    assert.equal(h.context.dmcaActionBusy,'detail-B');
  }
});
test('DMCA mutation rejects stale case identity even when loading is false', async () => {
  const h = harness(); h.context.dmcaSelectedCaseId = 'B';
  await h.callback('runDmcaStatusUpdate')('closed');
  assert.equal(h.writes.length, 0);
});
test('DMCA mutation never falls back to an unloaded selected case', async () => {
  const h = harness(); h.context.dmcaCaseDetail = null; h.context.dmcaDetailRequestRef.current.loaded = false;
  await h.callback('runDmcaStatusUpdate')('closed');
  assert.equal(h.writes.length, 0);
});
test('DMCA post-action refresh cannot reopen a previous case after selection changes', async () => {
  const h = harness(); const list = deferred(); h.context.loadDmcaCases = () => list.promise;
  const pending = h.callback('refreshDmcaAfterAction')('A');
  h.context.dmcaDetailRequestRef.current = { caseId: 'B', loaded: true };
  h.context.loadDmcaCaseDetail = async id => { h.reads.push({ id }); };
  list.resolve(); await pending;
  assert.equal(h.reads.length, 0);
});
