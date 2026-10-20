import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const path = 'app/admin.tsx';
const source = process.env.ADMIN_LEGAL_BASELINE
  ? execFileSync('git', ['show', `${process.env.ADMIN_LEGAL_BASELINE}:${path}`], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  : readFileSync(path, 'utf8');
const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['openLegalRequestDetail', 'addLegalRequestNote', 'updateSelectedLegalRequestStatus', 'linkLegalRequestToEvidence', 'refreshLegalRequestAfterEvidence', 'loadMoreLegalHistory'];
const declarations = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) declarations.set(node.name.getText(ast), node.initializer.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const compile = name => ts.transpileModule(`exports.callback = ${declarations.get(name)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const detail = id => ({ request: { id }, events: [], holds: [], evidenceRequests: [], historyPages: { events: { nextCursor: 'older-events', hasMore: true }, holds: { nextCursor: null, hasMore: false }, evidenceRequests: { nextCursor: null, hasMore: false } } });
function harness() {
  const reads = [], writes = [];
  const context = {
    exports: {}, useCallback: callback => callback,
    canAccessLegalIntake: true, canAccessLegalEvidence: true, canReadLegalHistory: true, isOwnerStaff: true, user: { id: 'owner' },
    legalDetailAuthorityKey: 'owner:true:true', legalDetailAuthorityRef: { current: 'owner:true:true' },
    legalDetailRequestRef: { current: { generation: 0, requestId: 'A', loaded: true } },
    legalHistoryRequestRef: { current: null }, setLegalHistoryBusy() {},
    getCurrentAccountSessionAuthoritySnapshot: () => ({ userId: 'owner', sessionGeneration: 'one' }),
    sameAccountSessionAuthority: (a, b) => a.userId === b.userId && a.sessionGeneration === b.sessionGeneration,
    legalNoteBusyRef: { current: false }, selectedLegalRequestId: 'A', selectedLegalRequestDetail: detail('A'),
    legalRequestNote: 'Note about A', legalRequestDetailBusy: false,
    formatAdminOperationFailure: (_error, fallback) => fallback,
    formatCompactIdentifier: id => id,
    formatLegalStatus: value => value,
    legalRequestPrimaryTarget: () => ({ id: 'target', targetType: 'user' }),
    setLegalSubsection() {}, setLegalTargetType() {}, setLegalTargetId() {}, setLegalNotice() {},
    setLegalRequestStatusUpdate(value) { context.status = value; },
    setOwnerControlNotice(value) { context.notice = value; },
    setLegalRequests(value) { context.requests = value; },
    readLegalRequestDetail(input) { const pending = deferred(); reads.push({ ...input, ...pending }); return pending.promise; },
    updateLegalRequest(input) { writes.push(input); return Promise.resolve(); },
    loadLegalIntake: async () => {}, listLegalRequests: async () => [],
    legalRequestStatusFilter: 'all', legalRequestSearch: '',
    loadLegalHistoryPage: async read => read(null), listLegalRequestsPage: async () => ({ items: [], hasMore: false, nextCursor: null }),
  };
  for (const [setter, key] of [['setSelectedLegalRequestId', 'selectedLegalRequestId'], ['setSelectedLegalRequestDetail', 'selectedLegalRequestDetail'], ['setLegalRequestNote', 'legalRequestNote'], ['setLegalRequestDetailBusy', 'legalRequestDetailBusy']]) {
    context[setter] = value => { context[key] = typeof value === 'function' ? value(context[key]) : value; };
  }
  const callback = name => { vm.runInNewContext(compile(name), context); return context.exports.callback; };
  context.openLegalRequestDetail = (...args) => callback('openLegalRequestDetail')(...args);
  return { context, reads, writes, callback };
}

test('opening another legal request immediately clears previous detail and note, including failed reads', async () => {
  const h = harness();
  const pending = h.context.openLegalRequestDetail('B');
  assert.equal(h.context.selectedLegalRequestDetail, null);
  assert.equal(h.context.legalRequestNote, '');
  h.reads[0].reject(new Error('unavailable'));
  await pending;
  assert.equal(h.context.selectedLegalRequestDetail, null);
  assert.equal(h.context.legalRequestDetailBusy, false);
});

test('out-of-order details preserve the latest selected request and busy state', async () => {
  const h = harness();
  const b = h.context.openLegalRequestDetail('B');
  const c = h.context.openLegalRequestDetail('C');
  h.reads[0].resolve(detail('B')); await b;
  assert.equal(h.context.selectedLegalRequestDetail, null);
  assert.equal(h.context.legalRequestDetailBusy, true);
  h.reads[1].resolve(detail('C')); await c;
  assert.equal(h.context.selectedLegalRequestDetail.request.id, 'C');
});

test('late authority-bound details cannot repopulate another account', async () => {
  const h = harness();
  const pending = h.context.openLegalRequestDetail('B');
  h.context.legalDetailAuthorityRef.current = 'new-owner:true:true';
  h.reads[0].resolve(detail('B')); await pending;
  assert.equal(h.context.selectedLegalRequestDetail, null);
});

test('Add Note rejects displayed/selected mismatch and pending target reads', async () => {
  const h = harness();
  h.context.openLegalRequestDetail = async () => {};
  h.context.selectedLegalRequestId = 'B';
  await h.callback('addLegalRequestNote')();
  assert.equal(h.writes.length, 0);
  h.context.selectedLegalRequestId = 'A';
  h.context.legalRequestDetailBusy = true;
  await h.callback('addLegalRequestNote')();
  assert.equal(h.writes.length, 0);
});

test('an in-flight note mutation cannot reopen or clear a newer request', async () => {
  const h = harness(); const mutation = deferred();
  h.context.updateLegalRequest = input => { h.writes.push(input); return mutation.promise; };
  const pending = h.callback('addLegalRequestNote')();
  const newer = h.context.openLegalRequestDetail('B');
  h.reads[0].resolve(detail('B')); await newer;
  h.context.legalRequestNote = 'Note about B';
  h.context.openLegalRequestDetail = async id => { h.reads.push({ id }); h.context.selectedLegalRequestId = id; };
  mutation.resolve(); await pending;
  assert.equal(h.writes[0].id, 'A');
  assert.equal(h.context.selectedLegalRequestId, 'B');
  assert.equal(h.context.legalRequestNote, 'Note about B');
  assert.equal(h.reads.length, 1);
});

test('linking evidence invalidates an older detail request', async () => {
  const h = harness(); const pending = h.context.openLegalRequestDetail('B');
  h.callback('linkLegalRequestToEvidence')({ id: 'C' });
  h.reads[0].resolve(detail('B')); await pending;
  assert.equal(h.context.selectedLegalRequestId, 'C');
  assert.equal(h.context.selectedLegalRequestDetail, null);
});

test('a mismatched backend detail is rejected rather than displayed', async () => {
  const h = harness(); const pending = h.context.openLegalRequestDetail('B');
  h.reads[0].resolve(detail('A')); await pending;
  assert.equal(h.context.selectedLegalRequestDetail, null);
  assert.match(h.context.notice, /Failed to open/);
});

test('legal status updates reject a stale displayed request', async () => {
  const h = harness(); h.context.openLegalRequestDetail = async () => {};
  h.context.legalDetailRequestRef.current = { generation: 1, requestId: 'B', loaded: true };
  await h.callback('updateSelectedLegalRequestStatus')('A', 'closed');
  assert.equal(h.writes.length, 0);
});

test('evidence refresh cannot replace details after a request switch', async () => {
  const h = harness();
  const pending = h.callback('refreshLegalRequestAfterEvidence')('A');
  h.context.legalDetailRequestRef.current = { generation: 1, requestId: 'B', loaded: true };
  h.context.selectedLegalRequestId = 'B'; h.context.selectedLegalRequestDetail = detail('B');
  h.reads[0].resolve(detail('A')); await pending;
  assert.equal(h.context.selectedLegalRequestDetail.request.id, 'B');
});

test('legal history load-more latches rapid clicks and appends deduplicated matching records', async () => {
  const h = harness(); h.context.selectedLegalRequestDetail.events = [{ id: 'existing' }];
  const pending = h.callback('loadMoreLegalHistory')('events');
  await h.callback('loadMoreLegalHistory')('events');
  assert.equal(h.reads.length, 1); assert.equal(h.reads[0].cursor, 'older-events');
  h.reads[0].resolve({ ...detail('A'), events: [{ id: 'existing' }, { id: 'older' }], historyPages: { ...detail('A').historyPages, events: { hasMore: false, nextCursor: null } } });
  await pending;
  assert.deepEqual(Array.from(h.context.selectedLegalRequestDetail.events, row => row.id), ['existing', 'older']);
  assert.equal(h.context.legalHistoryRequestRef.current, null);
});

test('legal history continuation cannot overwrite a new selection or account', async () => {
  for (const kind of ['selection', 'account']) {
    const h = harness(); const pending = h.callback('loadMoreLegalHistory')('events');
    if (kind === 'selection') {
      h.context.legalDetailRequestRef.current = { generation: 2, requestId: 'B', loaded: true };
      h.context.selectedLegalRequestDetail = detail('B');
    } else h.context.getCurrentAccountSessionAuthoritySnapshot = () => ({ userId: 'other', sessionGeneration: 'two' });
    h.reads[0].resolve({ ...detail('A'), events: [{ id: 'stale' }] }); await pending;
    assert.equal(h.context.selectedLegalRequestDetail.events.length, 0);
  }
});

test('initial detail and evidence refresh discard unrendered account/session replacements', async () => {
  for (const name of ['openLegalRequestDetail', 'refreshLegalRequestAfterEvidence']) {
    for (const replacement of [{ userId: 'other', sessionGeneration: 'two' }, { userId: 'owner', sessionGeneration: 'two' }]) {
      const h = harness(); const pending = h.callback(name)('A');
      h.context.getCurrentAccountSessionAuthoritySnapshot = () => replacement;
      h.reads[0].resolve({ ...detail('A'), marker: 'stale' }); await pending;
      assert.notEqual(h.context.selectedLegalRequestDetail?.marker, 'stale');
    }
  }
});

test('initial detail and evidence refresh do not read for restore-only or mismatched sessions', async () => {
  for (const name of ['openLegalRequestDetail', 'refreshLegalRequestAfterEvidence']) {
    for (const session of [null, { userId: 'other', sessionGeneration: 'two' }, { userId: 'owner', sessionGeneration: 'one', restoreOnly: true }]) {
      const h = harness(); h.context.getCurrentAccountSessionAuthoritySnapshot = () => session;
      await h.callback(name)('A'); assert.equal(h.reads.length, 0);
    }
  }
});
