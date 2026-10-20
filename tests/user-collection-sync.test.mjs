import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

function harness(shared) {
  let account = { userId: 'a', accountId: 'a', sessionGeneration: 'one', state: 'ACTIVE', restoreOnly: false };
  const storage = new Map();
  const remote = shared?.remote ?? { user_list: new Map(), watch_history: new Map() };
  const writes = [];
  const controls = { failWrite: false, failStorage: false, failRead: false, loseResponse: false, resolvedUnknown: false,
    errorCode: '42501', readGate: null, writeGate: null, authGate: null };
  const tokens = [];
  const versions = shared?.versions ?? { user_list: new Map(), watch_history: new Map() }, receipts = shared?.receipts ?? new Map();
  const canonical = (table, id) => {
    const row = remote[table].get(id);
    if (!row) return null;
    if (table === 'user_list') return { id, savedAt: Date.parse(row.updated_at) || 0 };
    return { positionMillis: row.last_position_millis ?? 0, updatedAt: Date.parse(row.updated_at) || 0,
      completed: row.completed === true, ...(row.duration_millis == null ? {} : { durationMillis: row.duration_millis }), playCount: row.play_count ?? 1 };
  };
  const client = { async rpc(name, args, accessToken) {
    const table = args.p_collection === 'saved' ? 'user_list' : 'watch_history';
    const authGate = controls.authGate; controls.authGate = null;
    if (authGate) { authGate.reached.resolve(); await authGate.release.promise; }
    if (accessToken) tokens.push(await accessToken());
    if (name === 'read_my_collection_state') {
      if (controls.failRead) return { data: null, error: new Error('unavailable') };
      const data = [...new Set([...remote[table].keys(), ...versions[table].keys()])]
        .filter(id => id > args.p_after_title_id).sort().slice(0, args.p_limit)
        .map(id => ({ title_id: id, revision: String(versions[table].get(id) ?? 0), value: canonical(table, id) }));
      const gate = controls.readGate; controls.readGate = null;
      if (gate) { gate.reached.resolve(); await gate.release.promise; }
      return { data, error: null };
    }
    assert.equal(name, 'mutate_my_collection_state');
    const id = args.p_title_id, value = args.p_value;
    writes.push({ table, action: value === null ? 'delete' : 'write', payload: value, id, request: structuredClone(args) });
    const gate = controls.writeGate; controls.writeGate = null;
    if (gate) { gate.reached.resolve(); await gate.release.promise; }
    if (controls.failWrite) return { data: null, error: { message: 'rejected', code: controls.errorCode }, status: 403 };
    if (controls.resolvedUnknown) return { data: null, error: { message: 'fetch failed', code: '' }, status: 0 };
    const old = receipts.get(args.p_operation_id);
    if (old) {
      assert.equal(JSON.stringify(args), old.request, 'retry must preserve exact UUID, revision and payload');
      return { data: structuredClone(old.receipt), error: null };
    }
    const revision = versions[table].get(id) ?? 0;
    if (args.p_expected_revision !== String(revision)) return { data: { status: 'conflict', revision: String(revision), value: canonical(table, id) }, error: null };
    if (table === 'user_list') {
      if (value === null) remote[table].delete(id);
      else remote[table].set(id, { title_id: id, updated_at: new Date().toISOString() });
    } else {
      const v = value ?? { positionMillis: 0, completed: true };
      const prior = remote[table].get(id);
      remote[table].set(id, { title_id: id, last_position_millis: v.positionMillis, duration_millis: v.durationMillis ?? null,
        completed: v.completed === true, updated_at: new Date().toISOString(),
        play_count: (prior?.play_count ?? 0) + (v.incrementPlayCount ? 1 : 0) });
    }
    versions[table].set(id, revision + 1);
    const receipt = { status: 'applied', revision: String(revision + 1), value: canonical(table, id) };
    receipts.set(args.p_operation_id, { request: JSON.stringify(args), receipt: structuredClone(receipt) });
    if (controls.loseResponse) throw new Error('response lost after commit');
    return { data: receipt, error: null };
  }, from(table, accessToken) {
    let action = 'read', payload, id, cursor = '', limit = Infinity;
    const query = {
      select() { return query; }, eq(key, value) { if (key === 'title_id') id = value; return query; },
      order() { return query; }, limit(n) { limit = n; return query; }, gt(key, value) { cursor = value; return query; },
      upsert(value) { action = 'write'; payload = value; return query; },
      delete() { action = 'delete'; return query; },
      returns() { return query; }, maybeSingle() { return query.then(r => ({ ...r, data: r.data?.[0] ?? null })); },
      async then(resolve, reject) {
        try {
          const authGate = controls.authGate; controls.authGate = null;
          if (authGate) { authGate.reached.resolve(); await authGate.release.promise; }
          if (accessToken) tokens.push(await accessToken());
          if (action === 'read') {
            if (controls.failRead) return resolve({ data: null, error: new Error('unavailable') });
            const data = [...remote[table].values()].filter(r => (!id || r.title_id === id) && r.title_id > cursor)
              .sort((a, b) => a.title_id.localeCompare(b.title_id)).slice(0, limit).map(r => ({ ...r }));
            const gate = controls.readGate; controls.readGate = null;
            if (gate) { gate.reached.resolve(); await gate.release.promise; }
            return resolve({ data, error: null });
          }
          writes.push({ table, action, payload, id });
          const gate = controls.writeGate; controls.writeGate = null;
          if (gate) { gate.reached.resolve(); await gate.release.promise; }
          if (controls.failWrite) return resolve({ data: null, error: { message: 'rejected', code: controls.errorCode }, status: 403 });
          if (controls.resolvedUnknown) return resolve({ data: null, error: { message: 'fetch failed', code: '' }, status: 0 });
          if (action === 'delete') remote[table].delete(id);
          else for (const row of [].concat(payload)) remote[table].set(row.title_id, { ...remote[table].get(row.title_id), ...row });
          if (controls.loseResponse) throw new Error('response lost after commit');
          return resolve({ data: null, error: null });
        } catch (error) { return reject(error); }
      },
    };
    return query;
  } };
  const modules = {};
  function load(name) {
    if (modules[name]) return modules[name];
    const exports = {};
    modules[name] = exports;
    let source = readFileSync(`_lib/${name}.ts`, 'utf8');
    const mutation = process.env.USER_COLLECTION_MUTATION;
    if (name === 'userCollectionSync') {
      if (mutation === 'revision') source = source.replaceAll('state.revision !== revision || ', '');
      if (mutation === 'persistence') source = source.replace(
        /if \(!await options\.write\(state\)\) throw new Error\([^;]+;/g,
        'await options.write(state);',
      );
      if (mutation === 'unknown') source = source.replace('(state.unsettled[id] && !retryUnknown) || !state.pending[id]', '!state.pending[id]');
      if (mutation === 'unknown') source = source.replace('(state.unsettled[id] && !retryUnknown)', 'false');
      if (mutation === 'stickyconflict') source = source.replace('state.conflicts[id] || ', '');
      if (mutation === 'events') source = source.replace('state.events[id]?.[0] ?? ', '');
    }
    if (name === 'userData' && mutation === 'completion') {
      source = source.replace('values[row.title_id] = row.value as T', 'values[row.title_id] = (collection === "watch" ? {...row.value as object, completed: false} : row.value) as T');
    }
    const code = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInNewContext(code, { exports, console, Date, Map, Set, Promise, crypto: webcrypto, require(path) {
      if (path === '@react-native-async-storage/async-storage') return { default: {
        async getItem(key) { return storage.get(key) ?? null; },
        async setItem(key, value) { if (controls.failStorage) throw new Error('disk full'); storage.set(key, value); },
      } };
      if (path === './supabase') return { supabase: client };
      if (path === '@supabase/supabase-js') return { createClient: (_url, _key, options) => ({
        from: table => client.from(table, options.accessToken),
        rpc: (name, args) => client.rpc(name, args, options.accessToken),
      }) };
      if (path === './accountBoundSupabaseMutation') return {
        captureAccountBoundSupabaseMutationSubject: async () => ({ authority: account, accessToken: `token:${account?.sessionGeneration}` }),
        assertAccountBoundSupabaseMutationSubjectCurrent: subject => {
          if (subject.authority?.userId !== account?.userId || subject.authority?.sessionGeneration !== account?.sessionGeneration) {
            throw new Error('Account changed');
          }
        },
      };
      if (path === './accountSessionAuthority') return {
        getCurrentAccountSessionAuthoritySnapshot: () => account,
        sameAccountSessionAuthority: (a, b) => a?.userId === b?.userId && a?.sessionGeneration === b?.sessionGeneration,
      };
      if (['./accountScopedStorage', './userCollectionSync'].includes(path)) return load(path.slice(2));
      return new Proxy({}, { get: () => value => value });
    } }, { filename: name });
    return exports;
  }
  const api = load('userData');
  const key = base => `${base}:account-v1:${account?.userId ?? 'anonymous'}`;
  return { api, remote, writes, controls, storage, tokens, key, shared: { remote, versions, receipts }, setAccount: value => { account = value; },
    restart() { for (const key of Object.keys(modules)) delete modules[key]; return load('userData'); },
    gate() { return { reached: deferred(), release: deferred() }; } };
}

test('cross-device conflict stays blocked through refresh, restart and newer local actions', async () => {
  const a = harness(), b = harness(a.shared);
  a.controls.failWrite = true;
  await a.api.setMyListTitleSaved('film', true);
  a.controls.failWrite = false;
  assert.equal((await b.api.setMyListTitleSaved('film', true)).syncStatus, 'synced');
  assert.equal((await b.api.setMyListTitleSaved('film', false)).syncStatus, 'synced');
  assert.equal((await a.api.readMyListState()).syncStatus, 'conflict');
  assert.equal(a.remote.user_list.has('film'), false);
  const count = a.writes.length;
  const restarted = a.restart();
  await restarted.readMyListState();
  await restarted.setMyListTitleSaved('film', true);
  assert.equal(a.writes.length, count, 'new local intent must not silently rebase a conflict');
  assert.equal(a.remote.user_list.has('film'), false);
  const resolved = await restarted.readMyListState({ useAccountVersion: true });
  assert.equal(resolved.syncStatus, 'synced');
  assert.deepEqual(Array.from(resolved.ids), []);
  assert.equal((await restarted.setMyListTitleSaved('film', true)).syncStatus, 'synced');
  assert.equal(a.writes.at(-1).request.p_expected_revision, '2');
});

test('late acknowledged predecessor cannot rebase a successor over another device', async () => {
  const a = harness(), b = harness(a.shared);
  a.controls.loseResponse = true;
  await a.api.setMyListTitleSaved('film', true);
  a.controls.loseResponse = false;
  await a.api.setMyListTitleSaved('film', false);
  await b.api.readMyListState();
  await b.api.setMyListTitleSaved('film', false);
  const result = await a.restart().readMyListState({ retryUnknown: true });
  assert.equal(result.syncStatus, 'conflict');
  assert.deepEqual(a.writes[1].request, a.writes[0].request);
  assert.equal(a.writes[2].request.p_expected_revision, '1');
  assert.equal(a.shared.versions.user_list.get('film'), 2);
  assert.equal(a.remote.user_list.has('film'), false);
});

test('account-version resolution does not discard local intent when its read fails', async () => {
  const a = harness(), b = harness(a.shared);
  await b.api.setMyListTitleSaved('film', true);
  assert.equal((await a.api.setMyListTitleSaved('film', false)).syncStatus, 'conflict');
  a.controls.failRead = true;
  const state = await a.api.readMyListState({ useAccountVersion: true });
  assert.equal(state.readStatus, 'offline');
  assert.equal(state.syncStatus, 'conflict');
  assert.deepEqual(Array.from(state.ids), []);
});

test('versioned pending operation survives process loss and exact retry without duplicate count', async () => {
  const a = harness(); a.controls.loseResponse = true;
  await a.api.recordPlaybackStart('film');
  const raw = JSON.parse(a.storage.get(a.key(a.api.WATCH_PROGRESS_KEY)));
  assert.equal(raw.collectionVersion, 2);
  assert.equal(raw.unsettled.film.value.incrementPlayCount, true);
  assert.equal(raw.unsettled.film.expectedRevision, '0');
  a.controls.loseResponse = false;
  const restarted = a.restart();
  assert.equal((await restarted.readWatchProgressState()).syncStatus, 'unknown');
  assert.equal(a.writes.length, 1);
  assert.equal((await restarted.readWatchProgressState({ retryUnknown: true })).syncStatus, 'synced');
  assert.deepEqual(a.writes[1].request, a.writes[0].request);
  assert.equal(a.remote.watch_history.get('film').play_count, 1);
});

test('unsent playback starts are durable events, not coalesced into later progress', async () => {
  const h = harness();
  h.remote.watch_history.set('film', { title_id: 'film', play_count: 4, completed: false });
  await Promise.all([h.api.recordPlaybackStart('film'), h.api.recordPlaybackStart('film'), h.api.writeProgressForTitle('film', 10)]);
  assert.equal(h.remote.watch_history.get('film').play_count, 6);
  assert.equal(h.remote.watch_history.get('film').last_position_millis, 10);
  assert.equal(h.writes.length, 3);
  assert.equal(h.writes.filter(w => w.payload.incrementPlayCount).length, 2);
  assert.equal((await h.api.readWatchProgressState()).syncStatus, 'synced');
});

test('unknown start followed by another start and progress retains both events across restart', async () => {
  const h = harness(); h.controls.loseResponse = true;
  await h.api.recordPlaybackStart('film');
  await h.api.recordPlaybackStart('film');
  await h.api.writeProgressForTitle('film', 10);
  assert.equal(h.writes.length, 1);
  const persisted = JSON.parse(h.storage.get(h.key(h.api.WATCH_PROGRESS_KEY)));
  assert.equal(persisted.events.film.length, 2);
  h.controls.loseResponse = false;
  const state = await h.restart().readWatchProgressState({ retryUnknown: true });
  assert.equal(state.syncStatus, 'synced');
  assert.equal(h.remote.watch_history.get('film').play_count, 2);
  assert.equal(h.remote.watch_history.get('film').last_position_millis, 10);
  assert.deepEqual(h.writes[1].request, h.writes[0].request);
  assert.equal(h.writes[2].request.p_expected_revision, '1');
  assert.equal(h.writes[3].request.p_expected_revision, '2');
});

test('successful Saved read replaces clean legacy cache without uploading deleted titles', async () => {
  const h = harness();
  h.storage.set(h.key(h.api.MY_LIST_KEY), JSON.stringify({ removed: { id: 'removed', savedAt: 100 } }));
  assert.deepEqual(Array.from(await h.api.readMyListIds()), []);
  assert.equal(h.writes.length, 0);
});

test('remote completion suppresses old local progress and is never uploaded as incomplete', async () => {
  const h = harness();
  h.storage.set(h.key(h.api.WATCH_PROGRESS_KEY), JSON.stringify({ film: { positionMillis: 100, updatedAt: 10 } }));
  h.remote.watch_history.set('film', { title_id: 'film', completed: true, updated_at: new Date(20).toISOString() });
  assert.deepEqual(Object.keys(await h.api.readMergedWatchProgress()), []);
  assert.equal(h.writes.length, 0);
});

test('failed Saved removal keeps a durable tombstone through refresh and retries only that intent', async () => {
  const h = harness();
  h.remote.user_list.set('film', { title_id: 'film', updated_at: new Date(10).toISOString() });
  await h.api.readMyListIds();
  h.controls.failWrite = true;
  const removed = await h.api.setMyListTitleSaved('film', false);
  assert.equal(removed.syncStatus, 'pending');
  assert.deepEqual(Array.from(removed.ids), []);
  assert.deepEqual(Array.from(await h.api.readMyListIds()), []);
  h.controls.failWrite = false;
  const restarted = h.restart();
  assert.deepEqual(Array.from(await restarted.readMyListIds()), []);
  assert.equal(h.remote.user_list.has('film'), false);
  assert.equal((await restarted.readMyListState()).syncStatus, 'synced');
});

test('local persistence failure rejects without claiming success or dispatching remote writes', async () => {
  const h = harness();
  h.controls.failStorage = true;
  await assert.rejects(h.api.setMyListTitleSaved('film', true), /could not be saved/);
  await assert.rejects(h.api.clearProgressForTitle('film'), /could not be saved/);
  assert.equal(h.writes.length, 0);
});

test('different-title concurrent local mutations never overwrite each other', async () => {
  const h = harness();
  h.controls.failWrite = true;
  await Promise.all([h.api.setMyListTitleSaved('a', true), h.api.setMyListTitleSaved('b', true)]);
  assert.deepEqual(Array.from(await h.api.readLocalMyListIds()).sort(), ['a', 'b']);
  await Promise.all([h.api.writeProgressForTitle('a', 12), h.api.writeProgressForTitle('b', 42)]);
  assert.deepEqual(Object.keys(await h.api.readLocalWatchProgress()).sort(), ['a', 'b']);
});

async function until(predicate) {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('expected asynchronous boundary was not reached');
}

test('late add acknowledgement cannot erase or overtake a newer remove', async () => {
  const h = harness();
  const gate = h.gate(); h.controls.writeGate = gate;
  const add = h.api.setMyListTitleSaved('film', true);
  await gate.reached.promise;
  const remove = h.api.setMyListTitleSaved('film', false);
  await until(() => JSON.parse(h.storage.get(h.key(h.api.MY_LIST_KEY))).pending.film?.value === null);
  assert.equal(h.writes.length, 1);
  gate.release.resolve();
  await Promise.all([add, remove]);
  assert.equal(h.remote.user_list.has('film'), false);
  assert.deepEqual(Array.from(await h.api.readLocalMyListIds()), []);
  assert.deepEqual(h.writes.map(w => w.action), ['write', 'delete']);
});

test('remote read started before a removal cannot restore the removed title', async () => {
  const h = harness();
  await h.api.setMyListTitleSaved('film', true);
  const gate = h.gate(); h.controls.readGate = gate;
  const reading = h.api.readMyListIds();
  await gate.reached.promise;
  await h.api.setMyListTitleSaved('film', false);
  gate.release.resolve();
  assert.deepEqual(Array.from(await reading), []);
});

test('completion follows in-flight progress and intentional rewatch can start afterward', async () => {
  const h = harness();
  const gate = h.gate(); h.controls.writeGate = gate;
  const progress = h.api.writeProgressForTitle('film', 50, 100);
  await gate.reached.promise;
  const complete = h.api.clearProgressForTitle('film');
  await until(() => JSON.parse(h.storage.get(h.key(h.api.WATCH_PROGRESS_KEY))).pending.film?.value.completed === true);
  gate.release.resolve();
  await Promise.all([progress, complete]);
  assert.equal(h.remote.watch_history.get('film').completed, true);
  assert.deepEqual(Object.keys(await h.api.readMergedWatchProgress()), []);
  await h.api.writeProgressForTitle('film', 7, 100);
  assert.equal(h.remote.watch_history.get('film').completed, false);
  assert.equal((await h.api.readMergedWatchProgress()).film.positionMillis, 7);
});

test('definitively rejected completion remains hidden and retries after restart', async () => {
  const h = harness();
  await h.api.writeProgressForTitle('film', 70, 100);
  h.controls.failWrite = true;
  await h.api.clearProgressForTitle('film');
  assert.deepEqual(Object.keys(await h.api.readMergedWatchProgress()), []);
  h.controls.failWrite = false;
  assert.deepEqual(Object.keys(await h.restart().readMergedWatchProgress()), []);
  assert.equal(h.remote.watch_history.get('film').completed, true);
});

test('unknown committed write blocks a conflicting successor and survives restart', async () => {
  const h = harness();
  h.controls.loseResponse = true;
  assert.equal((await h.api.setMyListTitleSaved('film', true)).syncStatus, 'unknown');
  h.controls.loseResponse = false;
  const restarted = h.restart();
  const removed = await restarted.setMyListTitleSaved('film', false);
  assert.equal(removed.syncStatus, 'unknown');
  assert.deepEqual(Array.from(removed.ids), []);
  await restarted.readMyListIds();
  assert.equal(h.writes.length, 1, 'no implicit retry or conflicting remote delete');
});

test('legacy in-flight marker without server identity is quarantined, not retried', async () => {
  const h = harness();
  h.storage.set(h.key(h.api.MY_LIST_KEY), JSON.stringify({ collectionVersion: 1, revision: 2, base: {},
    pending: { film: { sequence: 1, value: { id: 'film', savedAt: 10 } } }, unsettled: { film: 1 } }));
  const result = await h.api.readMyListState();
  assert.equal(result.syncStatus, 'conflict');
  assert.deepEqual(Array.from(result.ids), ['film']);
  assert.equal(h.writes.length, 0);
});

test('resolved Supabase transport error is unknown rather than a retryable server rejection', async () => {
  const h = harness(); h.controls.resolvedUnknown = true;
  assert.equal((await h.api.setMyListTitleSaved('film', true)).syncStatus, 'unknown');
  h.controls.resolvedUnknown = false;
  await h.api.setMyListTitleSaved('film', false);
  assert.equal(h.writes.length, 1);
});

test('SQL transaction-resolution and statement-completion unknown codes block retries', async () => {
  for (const code of ['08007', '40003']) {
    const h = harness(); h.controls.failWrite = true; h.controls.errorCode = code;
    assert.equal((await h.api.setMyListTitleSaved('film', true)).syncStatus, 'unknown');
    h.controls.failWrite = false;
    await h.restart().setMyListTitleSaved('film', false);
    assert.equal(h.writes.length, 1);
  }
});

test('delayed token resolution cannot dispatch as another account or a new same-user session', async () => {
  for (const replacement of [{ userId: 'b', sessionGeneration: 'two' }, { userId: 'a', sessionGeneration: 'two' }]) {
    const h = harness();
    const gate = h.gate(); h.controls.authGate = gate;
    const writing = h.api.setMyListTitleSaved('film', true);
    await gate.reached.promise;
    h.setAccount(replacement);
    gate.release.resolve();
    await assert.rejects(writing, /Account changed/);
    assert.equal(h.tokens.length, 0);
    assert.equal(h.writes.length, 0);
  }
  const h = harness();
  await h.api.setMyListTitleSaved('film', true);
  assert.deepEqual(h.tokens, ['token:one']);
});

test('an older overlapping refresh cannot replace the newer completed refresh', async () => {
  const h = harness();
  h.remote.user_list.set('old', { title_id: 'old', updated_at: new Date(10).toISOString() });
  const gate = h.gate(); h.controls.readGate = gate;
  const old = h.api.readMyListIds();
  await gate.reached.promise;
  h.remote.user_list.clear();
  h.remote.user_list.set('new', { title_id: 'new', updated_at: new Date(20).toISOString() });
  assert.deepEqual(Array.from(await h.api.readMyListIds()), ['new']);
  gate.release.resolve();
  assert.deepEqual(Array.from(await old), ['new']);
});

test('playback start whose commit response is lost is never retried or double-counted', async () => {
  const h = harness();
  h.remote.watch_history.set('film', { title_id: 'film', play_count: 2, completed: true });
  h.controls.loseResponse = true;
  await h.api.recordPlaybackStart('film');
  assert.equal(h.remote.watch_history.get('film').play_count, 3);
  h.controls.loseResponse = false;
  const restarted = h.restart();
  await restarted.readMergedWatchProgress();
  await restarted.writeProgressForTitle('film', 9);
  assert.equal(h.remote.watch_history.get('film').play_count, 3);
  assert.equal(h.writes.length, 1);
  assert.equal((await restarted.readWatchProgressState()).syncStatus, 'unknown');
  assert.equal((await restarted.readWatchProgressState({ retryUnknown: true })).syncStatus, 'synced');
  assert.equal(h.remote.watch_history.get('film').play_count, 3);
  assert.equal(h.remote.watch_history.get('film').last_position_millis, 9);
});

test('airplane-mode unknown failure can recover only through explicit account sync retry', async () => {
  const h = harness(); h.controls.resolvedUnknown = true;
  await h.api.setMyListTitleSaved('film', true);
  h.controls.resolvedUnknown = false;
  const restarted = h.restart();
  assert.equal((await restarted.readMyListState()).syncStatus, 'unknown');
  assert.equal(h.remote.user_list.has('film'), false);
  assert.equal((await restarted.readMyListState({ retryUnknown: true })).syncStatus, 'synced');
  assert.equal(h.remote.user_list.has('film'), true);
});

test('explicit retry reconciles the immutable predecessor before sending the opposite successor', async () => {
  const h = harness(); h.controls.loseResponse = true;
  await h.api.setMyListTitleSaved('film', true);
  await h.api.setMyListTitleSaved('film', false);
  assert.equal(h.writes.length, 1);
  assert.equal((await h.api.readMyListState({ retryUnknown: true })).syncStatus, 'unknown');
  assert.equal(h.remote.user_list.has('film'), false);
  assert.equal(h.writes[1].action, 'write');
  assert.deepEqual(h.writes[1].request, h.writes[0].request);
  assert.equal(h.writes[2].action, 'delete');
  assert.equal(h.writes[2].request.p_expected_revision, '1');
  h.controls.loseResponse = false;
  assert.equal((await h.api.readMyListState({ retryUnknown: true })).syncStatus, 'synced');
  assert.equal(h.remote.user_list.has('film'), false);
});

test('explicit retry never dispatches concurrently with an actually unsettled request', async () => {
  const h = harness();
  const gate = h.gate(); h.controls.writeGate = gate;
  const writing = h.api.setMyListTitleSaved('film', true);
  await gate.reached.promise;
  const retry = h.api.readMyListState({ retryUnknown: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.writes.length, 1);
  gate.release.resolve();
  await Promise.all([writing, retry]);
  assert.equal(h.writes.length, 1, 'successful predecessor needs no duplicate retry');
});

test('explicit retry of an unknown playback start keeps its immutable identity and counts only once', async () => {
  const h = harness(); h.controls.loseResponse = true;
  await h.api.recordPlaybackStart('film');
  assert.equal(h.remote.watch_history.get('film').play_count, 1);
  h.controls.loseResponse = false;
  await h.restart().readWatchProgressState({ retryUnknown: true });
  assert.equal(h.remote.watch_history.get('film').play_count, 1);
  assert.equal(h.writes[1].payload.incrementPlayCount, true);
  assert.deepEqual(h.writes[1].request, h.writes[0].request);
});

test('read unavailability is explicit even without cache and legacy offline cache remains usable', async () => {
  const h = harness(); h.controls.failRead = true;
  assert.equal((await h.api.readMyListState()).readStatus, 'offline');
  assert.equal((await h.api.readWatchProgressState()).readStatus, 'offline');
  h.storage.set(h.key(h.api.MY_LIST_KEY), JSON.stringify(['legacy']));
  assert.deepEqual(Array.from((await h.api.readMyListState()).ids), ['legacy']);
  assert.equal(h.writes.length, 0);
});

test('invalid durable envelopes reject without overwriting or dispatching', async () => {
  for (const bad of [null, { sequence: 1, value: 42 }, { sequence: -1, value: null }]) {
    const h = harness();
    const raw = JSON.stringify({ collectionVersion: 1, revision: 1, base: {}, pending: { film: bad } });
    h.storage.set(h.key(h.api.MY_LIST_KEY), raw);
    await assert.rejects(h.api.setMyListTitleSaved('film', true), /could not be read safely/);
    assert.equal(h.storage.get(h.key(h.api.MY_LIST_KEY)), raw);
    assert.equal(h.writes.length, 0);
  }
});

test('guest state remains isolated and an old player binding cannot write another account', async () => {
  const h = harness();
  const previous = { userId: 'a', accountId: 'a', sessionGeneration: 'one', state: 'ACTIVE', restoreOnly: false };
  h.setAccount(null);
  assert.equal((await h.api.setMyListTitleSaved('guest', true)).syncStatus, 'local');
  await assert.rejects(h.api.writeProgressForTitle('film', 3, 10, previous), /Account changed/);
  await h.api.writeProgressForTitle('guest', 4, 10, null);
  h.setAccount(previous);
  assert.deepEqual(Array.from(await h.api.readLocalMyListIds()), []);
  assert.deepEqual(Object.keys(await h.api.readLocalWatchProgress()), []);
  assert.equal(h.writes.length, 0);
});

test('account change during remote write rejects and never acknowledges into a replacement account', async () => {
  const h = harness();
  const gate = h.gate(); h.controls.writeGate = gate;
  const writing = h.api.setMyListTitleSaved('film', true);
  await gate.reached.promise;
  h.setAccount({ userId: 'b', sessionGeneration: 'two' });
  gate.release.resolve();
  await assert.rejects(writing, /Account changed/);
  assert.equal(h.storage.has(h.key(h.api.MY_LIST_KEY)), false);
});

test('Saved and Continue Watching read all pages', async () => {
  const h = harness();
  for (let i = 0; i < 405; i += 1) {
    const id = `film-${String(i).padStart(3, '0')}`;
    h.remote.user_list.set(id, { title_id: id, updated_at: new Date(20).toISOString() });
    h.remote.watch_history.set(id, { title_id: id, last_position_millis: 10, completed: false, updated_at: new Date(20).toISOString() });
  }
  assert.equal((await h.api.readMyListIds()).length, 405);
  assert.equal(Object.keys(await h.api.readMergedWatchProgress()).length, 405);
  assert.equal(h.writes.length, 0);
});
