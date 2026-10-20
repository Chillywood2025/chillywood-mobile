import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const NOW = Date.parse('2026-10-20T12:00:00.000Z');
const SETTINGS = 'admin_live_cost_guard_settings';
const EVENTS = 'admin_live_cost_guard_events';
const ACTIONS = 'admin_live_cost_guard_actions';
const NORMAL_DECISION = { blockNewLiveRooms: false, reason: null, tokenTtlSeconds: null };
const compiled = Object.fromEntries([
  '_lib/adminLiveCostGuard.ts',
  'supabase/functions/_shared/live-cost-guard.ts',
].map(path => [path, ts.transpileModule(readFileSync(path, 'utf8'), {
  fileName: path,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText]));
const plain = value => JSON.parse(JSON.stringify(value));
const atAge = milliseconds => new Date(NOW - milliseconds).toISOString();
const settingsRow = (overrides = {}) => ({
  id: 'settings-id', mode: 'manual_approval', enabled: true,
  cooldown_seconds: 300, token_ttl_warning_seconds: 120, token_ttl_critical_seconds: 30,
  ...overrides,
});
const event = (severity, age = 0) => ({ severity, created_at: atAge(age) });
const action = (actionType, age = 0, success = true) => ({
  action_type: actionType, created_at: atAge(age), success,
});

function database({ row = settingsRow(), events = [], actions = [], readError = null } = {}) {
  const state = { row, events, actions, queries: [], writes: [] };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'admin-id' } }, error: null }) },
    functions: { invoke: () => { throw new Error('Unexpected Edge invocation'); } },
    from(table) {
      assert.ok([SETTINGS, EVENTS, ACTIONS].includes(table), `Unexpected table: ${table}`);
      const query = { table, filters: [], ordering: null, limit: null, operation: null, patch: null };
      state.queries.push(query);
      const execute = async single => {
        if (query.operation) {
          const patch = plain(query.patch);
          state.writes.push({ table, operation: query.operation, patch });
          if (table === SETTINGS) {
            if (query.operation === 'update') {
              assert.equal(query.filters.find(([column]) => column === 'id')?.[2], state.row.id);
            }
            state.row = { ...state.row, ...patch, id: state.row?.id ?? 'inserted-settings-id' };
            return { data: { ...state.row }, error: null };
          }
          assert.equal(table, ACTIONS);
          assert.equal(query.operation, 'insert');
          const inserted = { ...patch, id: `action-${state.actions.length}`, created_at: atAge(0) };
          state.actions.push(inserted);
          return { data: inserted, error: null };
        }
        if (table === SETTINGS) return { data: state.row && { ...state.row }, error: readError };
        let rows = [...(table === EVENTS ? state.events : state.actions)];
        for (const [column, operator, value] of query.filters) {
          rows = rows.filter(row => operator === 'gte' ? row[column] >= value : row[column] === value);
        }
        if (query.ordering) {
          const [column, { ascending }] = query.ordering;
          rows.sort((left, right) => left[column].localeCompare(right[column]) * (ascending ? 1 : -1));
        }
        if (query.limit !== null) rows = rows.slice(0, query.limit);
        return { data: single ? rows[0] ?? null : rows, error: null };
      };
      const builder = {
        select: () => builder,
        order: (column, options) => { query.ordering = [column, options]; return builder; },
        limit: count => { query.limit = count; return builder; },
        eq: (column, value) => { query.filters.push([column, 'eq', value]); return builder; },
        gte: (column, value) => { query.filters.push([column, 'gte', value]); return builder; },
        update: patch => { query.operation = 'update'; query.patch = patch; return builder; },
        insert: patch => { query.operation = 'insert'; query.patch = patch; return builder; },
        maybeSingle: () => execute(true),
        single: () => execute(true),
        then: (resolve, reject) => execute(false).then(resolve, reject),
      };
      return builder;
    },
  };
  return { state, client };
}

function harness(options) {
  const db = database(options);
  const providerCalls = [];
  const provider = class {
    async updateParticipant(...args) { providerCalls.push({ method: 'updateParticipant', args }); }
    async removeParticipant(...args) { providerCalls.push({ method: 'removeParticipant', args }); }
  };
  class FixedDate extends Date { static now() { return NOW; } }
  const env = {
    LIVEKIT_URL: 'https://livekit.test.invalid',
    LIVEKIT_API_KEY: 'test-fixture-key',
    LIVEKIT_API_SECRET: 'test-fixture-secret',
  };
  const load = path => {
    const context = {
      exports: {}, Date: FixedDate,
      Deno: { env: { get: key => env[key] } },
      require: id => {
        if (id === './supabase') return { supabase: db.client };
        if (id === 'npm:@supabase/supabase-js@2') return {
          createClient: () => { throw new Error('Unexpected Supabase connection'); },
        };
        if (id === 'npm:livekit-server-sdk@2') return { RoomServiceClient: provider };
        if (id === './exact-subject-authority.ts') return {};
        throw new Error(`Unexpected import: ${id}`);
      },
    };
    vm.runInNewContext(compiled[path], context, { filename: path });
    return context.exports;
  };
  return {
    ...db, providerCalls,
    frontend: load('_lib/adminLiveCostGuard.ts'),
    edge: load('supabase/functions/_shared/live-cost-guard.ts'),
  };
}

for (const [name, value, expected] of [
  ['zero', 0, 0], ['numeric string zero', '0', 0], ['positive integer', 45, 45],
  ['numeric string', '45', 45], ['fractional value', 45.9, 45],
  ['missing value', undefined, 300], ['null', null, 300], ['empty string', '', 300],
  ['whitespace', ' \t ', 300], ['negative', -1, 300], ['negative fraction', -0.1, 300],
  ['invalid string', 'invalid', 300], ['NaN', NaN, 300], ['Infinity', Infinity, 300],
  ['boolean', false, 300], ['array', [], 300], ['object', {}, 300],
]) {
  test(`client and Edge settings parse cooldown ${name} consistently`, async () => {
    const h = harness({ row: settingsRow({ cooldown_seconds: value }) });
    const clientRead = await h.frontend.getLiveCostGuardSettings();
    const edgeRead = await h.edge.readLiveCostGuardSettings(h.client);
    assert.equal(clientRead.connected, true);
    assert.equal(clientRead.settings.cooldownSeconds, expected);
    assert.equal(edgeRead.cooldownSeconds, expected);
  });
}

for (const operation of ['update', 'insert']) {
  test(`actual client ${operation} preserves zero in save response, reread, and Edge read`, async () => {
    const h = harness({ row: operation === 'insert' ? null : settingsRow() });
    const before = await h.frontend.getLiveCostGuardSettings();
    const saved = await h.frontend.updateLiveCostGuardSettings({ ...before.settings, cooldownSeconds: 0 });
    assert.equal(h.state.writes.length, 1);
    assert.equal(h.state.writes[0].operation, operation);
    assert.equal(h.state.writes[0].patch.cooldown_seconds, 0);
    assert.equal(h.state.writes[0].patch.updated_by, 'admin-id');
    assert.equal(saved.settings.cooldownSeconds, 0);
    assert.equal((await h.frontend.getLiveCostGuardSettings()).settings.cooldownSeconds, 0);
    assert.equal((await h.edge.readLiveCostGuardSettings(h.client)).cooldownSeconds, 0);
  });
}

test('cooldown zero does not allow zero or invalid token TTL settings', async () => {
  for (const value of [0, '0', null, undefined, '', -1, 'invalid']) {
    const h = harness({ row: settingsRow({
      cooldown_seconds: 0, token_ttl_warning_seconds: value, token_ttl_critical_seconds: value,
    }) });
    const clientRead = (await h.frontend.getLiveCostGuardSettings()).settings;
    const edgeRead = await h.edge.readLiveCostGuardSettings(h.client);
    for (const read of [clientRead, edgeRead]) {
      assert.equal(read.cooldownSeconds, 0);
      assert.equal(read.tokenTtlWarningSeconds, 300);
      assert.equal(read.tokenTtlCriticalSeconds, 60);
    }
  }
});

test('missing rows and failed settings reads keep disabled observe-only defaults', async () => {
  for (const options of [{ row: null }, { readError: { message: 'read unavailable' } }]) {
    const h = harness(options);
    const clientRead = await h.frontend.getLiveCostGuardSettings();
    const edgeRead = await h.edge.readLiveCostGuardSettings(h.client);
    assert.equal(clientRead.connected, !options.readError);
    for (const read of [clientRead.settings, edgeRead]) {
      assert.equal(read.cooldownSeconds, 300);
      assert.equal(read.enabled, false);
      assert.equal(read.mode, 'observe_only');
    }
    assert.deepEqual(plain(await h.edge.readLiveCostGuardTokenDecision(h.client, 'live-stage')), NORMAL_DECISION);
  }
});

test('zero cooldown has no token window even for same-time or future history', async () => {
  for (const surface of ['live-stage', 'watch-party-live']) {
    for (const age of [1, 0, -1]) {
      const h = harness({ row: settingsRow({ cooldown_seconds: 0 }),
        events: [event('emergency', age)], actions: [action('pause_new_live_rooms', age)] });
      assert.deepEqual(plain(await h.edge.readLiveCostGuardTokenDecision(h.client, surface)), NORMAL_DECISION);
      assert.deepEqual(h.state.queries.map(query => query.table), [SETTINGS]);
    }
  }
});

for (const [name, cooldown, duration] of [
  ['positive cooldown', 30, 30], ['null fallback', null, 300], ['invalid fallback', 'invalid', 300],
]) {
  test(`${name} enforces history through the inclusive boundary and expires beyond it`, async () => {
    for (const [age, active] of [[duration * 1000 - 1, true], [duration * 1000, true], [duration * 1000 + 1, false]]) {
      for (const surface of ['live-stage', 'watch-party-live']) {
        for (const kind of ['warning', 'critical', 'shorten_token_ttl', 'pause_new_live_rooms']) {
          const isEvent = ['warning', 'critical'].includes(kind);
          const h = harness({ row: settingsRow({ cooldown_seconds: cooldown }),
            events: isEvent ? [event(kind, age)] : [], actions: isEvent ? [] : [action(kind, age)] });
          const decision = plain(await h.edge.readLiveCostGuardTokenDecision(h.client, surface));
          if (!active) assert.deepEqual(decision, NORMAL_DECISION, `${surface}: ${kind}: ${age}`);
          else if (kind === 'pause_new_live_rooms') {
            assert.equal(decision.blockNewLiveRooms, true);
            assert.equal(decision.tokenTtlSeconds, null);
          } else {
            assert.equal(decision.blockNewLiveRooms, false);
            assert.equal(decision.tokenTtlSeconds, kind === 'critical' ? 30 : 120);
          }
          for (const query of h.state.queries.filter(query => query.table !== SETTINGS)) {
            assert.deepEqual(query.filters[0], ['created_at', 'gte', atAge(duration * 1000)]);
          }
        }
      }
    }
  });
}

test('restore and unsuccessful actions retain their existing token-decision semantics', async () => {
  const restored = harness({
    events: [event('critical', 2000)],
    actions: [action('pause_new_live_rooms', 2000), action('restore_normal_mode', 1000)],
  });
  assert.deepEqual(plain(await restored.edge.readLiveCostGuardTokenDecision(restored.client, 'live-stage')), NORMAL_DECISION);
  const failed = harness({ actions: [action('pause_new_live_rooms', 0, false), action('shorten_token_ttl', 0, false)] });
  assert.deepEqual(plain(await failed.edge.readLiveCostGuardTokenDecision(failed.client, 'live-stage')), NORMAL_DECISION);
});

test('disabled, observe-only, and unrelated surfaces never apply a token decision', async () => {
  for (const [row, surface] of [
    [settingsRow({ enabled: false }), 'live-stage'],
    [settingsRow({ mode: 'observe_only' }), 'watch-party-live'],
    [settingsRow(), 'chat-call'],
  ]) {
    const h = harness({ row, events: [event('critical')], actions: [action('pause_new_live_rooms')] });
    assert.deepEqual(plain(await h.edge.readLiveCostGuardTokenDecision(h.client, surface)), NORMAL_DECISION);
    assert.ok(h.state.queries.every(query => query.table === SETTINGS));
    assert.equal(h.providerCalls.length, 0);
  }
});

test('zero cooldown preserves immediate participant actions and observe-only suppression', async () => {
  for (const mode of ['manual_approval', 'auto_protect', 'observe_only']) {
    for (const actionType of ['restrict_publish', 'remove_participant']) {
      const h = harness({ row: settingsRow({ cooldown_seconds: 0, mode }) });
      const settings = await h.edge.readLiveCostGuardSettings(h.client);
      const receipt = await h.edge.applyLiveCostGuardAction(h.client, settings, {
        actionType, roomName: 'test-room', participantIdentity: 'test-participant', reason: 'Regression test',
      }, { actorType: 'admin', actorId: 'admin-id' });
      assert.equal(receipt.success, mode !== 'observe_only');
      assert.equal(h.state.writes.length, 1);
      assert.equal(h.state.writes[0].table, ACTIONS);
      if (mode === 'observe_only') {
        assert.equal(h.providerCalls.length, 0);
        assert.match(receipt.error_message, /Observe-only/);
      } else {
        assert.equal(h.providerCalls.length, 1);
        assert.equal(h.providerCalls[0].method, actionType === 'restrict_publish' ? 'updateParticipant' : 'removeParticipant');
        assert.deepEqual(h.providerCalls[0].args.slice(0, 2), ['test-room', 'test-participant']);
        assert.equal(receipt.after_json.livekitApiCalled, true);
      }
    }
  }
});
