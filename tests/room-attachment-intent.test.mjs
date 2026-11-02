import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const snapshot = () => ({ room: { partyId: 'room', isActive: true, roomGeneration: 'generation', startedAt: 'start', roomType: 'title', sourceType: 'platform_title', sourceId: 'title', titleId: 'title', hostUserId: 'host', contentAccessRule: 'free' },
  memberships: [{ partyId: 'room', userId: 'user', joinedAt: 'admission', membershipState: 'active', leftAt: null }] });
function fixture() {
  const state = { active: true, current: true, snapshot: snapshot(), reads: 0, listeners: new Set(), timers: new Set(), read: null };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/roomAttachmentIntent.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: module.exports, setTimeout: callback => { state.timers.add(callback); return callback; }, clearTimeout: callback => state.timers.delete(callback) });
  const options = { snapshot: state.snapshot, userId: 'user', current: () => state.current, foreground: () => state.active,
    subscribeForeground: listener => { state.listeners.add(listener); return () => state.listeners.delete(listener); },
    read: async () => { state.reads++; return state.read ? state.read() : state.snapshot; } };
  return { state, create: () => module.exports.createRoomAttachmentIntent(options), app: active => { state.active = active; for (const listener of state.listeners) listener(); } };
}

test('native presentation keeps only selection intent while foreground teardown can continue', async () => {
  const h = fixture(), intent = h.create(); assert.ok(intent); assert.equal(intent.retainWhileHidden(), false);
  assert.equal(intent.beginNative(), true); h.app(false);
  assert.equal(intent.retainWhileHidden(), true); let applied = false;
  const pending = intent.verifyBeforeApply().then(result => { applied = result; return result; });
  await Promise.resolve(); assert.equal(h.state.reads, 0); assert.equal(applied, false);
  h.state.snapshot.memberships[0].membershipState = 'reconnecting'; h.app(true);
  assert.equal(await pending, true); assert.equal(h.state.reads, 1); assert.equal(intent.retainWhileHidden(), false);
  assert.equal(h.state.listeners.size, 0); assert.equal(h.state.timers.size, 0);
});

for (const reason of ['room', 'source', 'generation', 'host', 'content', 'admission', 'left', 'removed', 'missing', 'unavailable']) {
  test(`fresh canonical ${reason} change permanently rejects the original attachment intent`, async () => {
    const h = fixture(), intent = h.create(); intent.beginNative(); h.app(false);
    const pending = intent.verifyBeforeApply();
    h.state.snapshot = snapshot();
    const roomFields = { room: 'partyId', source: 'sourceId', generation: 'roomGeneration', host: 'hostUserId', content: 'contentAccessRule' };
    if (roomFields[reason]) h.state.snapshot.room[roomFields[reason]] = 'replacement';
    else if (reason === 'admission') h.state.snapshot.memberships[0].joinedAt = 'rejoined';
    else if (reason === 'left') h.state.snapshot.memberships[0].leftAt = 'now';
    else if (reason === 'removed') h.state.snapshot.memberships[0].membershipState = 'removed';
    else if (reason === 'missing') h.state.snapshot.memberships = [];
    else h.state.snapshot = null;
    h.app(true); assert.equal(await pending, false);
    h.state.snapshot = snapshot(); assert.equal(intent.current(), false); assert.equal(await intent.verifyBeforeApply(), false);
  });
}

test('account/route retirement while waiting or reading never accepts late canonical success', async () => {
  for (const duringRead of [false, true]) {
    const h = fixture(), held = deferred(), intent = h.create(); intent.beginNative();
    if (duringRead) h.state.read = () => held.promise; else h.app(false);
    const pending = intent.verifyBeforeApply(); intent.retire(); h.state.current = false;
    held.resolve(snapshot()); h.app(true);
    assert.equal(await pending, false); assert.equal(h.state.listeners.size, 0); assert.equal(h.state.timers.size, 0);
  }
});

test('background completion of a canonical read must be reread after return', async () => {
  const h = fixture(), held = deferred(), intent = h.create(); intent.beginNative(); h.state.read = () => held.promise;
  const pending = intent.verifyBeforeApply(); h.app(false); held.resolve(snapshot());
  for (let n = 0; n < 8; n++) await Promise.resolve();
  assert.equal(h.state.reads, 1); h.state.read = null; h.app(true);
  assert.equal(await pending, true); assert.equal(h.state.reads, 2);
});

test('foreground or canonical read deadline fails closed without waiting for native again', async () => {
  for (const duringRead of [false, true]) {
    const h = fixture(), intent = h.create(); intent.beginNative();
    if (duringRead) h.state.read = () => deferred().promise; else h.app(false);
    const pending = intent.verifyBeforeApply(); for (const timeout of [...h.state.timers]) timeout();
    assert.equal(await pending, false); assert.equal(intent.current(), false); assert.equal(h.state.listeners.size, 0);
  }
});

test('unverified generations and admissions cannot start a native selection', () => {
  for (const field of ['roomGeneration', 'startedAt', 'joinedAt']) {
    const h = fixture(); delete (field === 'joinedAt' ? h.state.snapshot.memberships[0] : h.state.snapshot.room)[field];
    assert.equal(h.create(), null);
  }
  const h = fixture(); h.app(false); assert.equal(h.create(), null);
});

test('observed canonical admission change retires immediately and cannot be revived before native settlement', async () => {
  const h = fixture(), intent = h.create(); intent.beginNative();
  const changed = snapshot(); changed.memberships[0].joinedAt = 'replacement';
  assert.equal(intent.observe(changed), false); assert.equal(intent.current(), false);
  assert.equal(intent.observe(snapshot()), false); assert.equal(await intent.verifyBeforeApply(), false);
});

test('verified selection distinguishes foreground application from unchanged logical identity during an explicit send', async () => {
  const h = fixture(), intent = h.create(); intent.beginNative(); assert.equal(await intent.verifyBeforeApply(), true);
  h.app(false); assert.equal(intent.current(), false); assert.equal(intent.identityCurrent(), true);
  assert.equal(intent.observe(snapshot()), true, 'same canonical admission can be observed without applying native UI in background');
  const changed = snapshot(); changed.room.roomGeneration = 'replacement';
  assert.equal(intent.observe(changed), false); assert.equal(intent.identityCurrent(), false);
});

test('explicit send revalidates original admission without granting background picker application', async () => {
  const h = fixture(), intent = h.create();
  assert.equal(await intent.verifyBeforeMutation(), false, 'native selection must first have completed canonical validation');
  intent.beginNative(); assert.equal(await intent.verifyBeforeApply(), true); h.app(false);
  assert.equal(await intent.verifyBeforeMutation(), true); assert.equal(intent.current(), false);
  h.state.snapshot = null; assert.equal(await intent.verifyBeforeMutation(), false); assert.equal(intent.identityCurrent(), false);
});

test('explicit send validation cannot outlive retirement or a bounded authority read', async () => {
  for (const timeout of [false, true]) {
    const h = fixture(), intent = h.create(); intent.beginNative(); await intent.verifyBeforeApply();
    h.state.read = () => deferred().promise; const pending = intent.verifyBeforeMutation();
    if (timeout) for (const fire of [...h.state.timers]) fire(); else intent.retire();
    assert.equal(await pending, false); assert.equal(h.state.timers.size, 0);
  }
});
