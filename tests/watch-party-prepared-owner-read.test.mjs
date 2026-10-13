import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS };
const extract = (path, names) => {
  const source = fs.readFileSync(path, 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  return ast.statements.filter(node => ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)
    ? names.includes(node.name?.text)
    : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.includes(d.name.getText(ast))))
    .map(node => node.getText(ast)).join('\n');
};
const owner = (generation = 'session-a') => ({ userId: 'host', accountId: 'host', sessionGeneration: generation, state: 'ACTIVE', restoreOnly: false });
const same = (a, b) => !!a && !!b && ['userId', 'accountId', 'sessionGeneration', 'state', 'restoreOnly'].every(key => a[key] === b[key]);
const row = (age = 20 * 60_000) => ({
  party_id: 'PARTY42', room_type: 'title', host_user_id: 'host', title_id: 'title-a', source_type: 'platform_title', source_id: 'title-a',
  is_active: true, started_at: new Date(Date.now() - age).toISOString(), updated_at: new Date().toISOString(),
  last_activity_at: new Date(Date.now() - age).toISOString(), discovery_visibility: 'private', discovery_title: null, discovery_started_at: null,
  join_policy: 'open', content_access_rule: 'open', reactions_policy: 'enabled', capture_policy: 'best_effort',
});

function harness({ age, stored = row(age) } = {}) {
  const state = { authority: owner(), stored, queryError: null, reads: [], calls: [], read: null, server: null };
  const scope = { exports: {}, Date,
    WATCH_PARTY_ROOM_ACTIVE_WINDOW_MILLIS: 15 * 60_000,
    getCurrentAccountSessionAuthoritySnapshot: () => state.authority,
    sameAccountSessionAuthority: same,
    async captureAccountBoundSupabaseMutationSubject(expectedUserId) {
      assert.ok(state.authority?.state === 'ACTIVE' && !state.authority.restoreOnly);
      if (expectedUserId) assert.equal(expectedUserId, state.authority.userId);
      return { authority: state.authority, accessToken: 'modeled-current-session-token' };
    },
    async invokeAccountBoundSupabaseMutationRpc(subject, name, args) {
      scope.assertAccountBoundSupabaseMutationSubjectCurrent(subject);
      state.calls.push({ name, args });
      const data = state.server ? await state.server({ name, args }) : {
        partyId: args.p_party_id, sourceType: args.p_expected_source_type, sourceId: args.p_expected_source_id,
        visibility: args.p_visibility, title: args.p_title, published: false, startedAt: null, projectionId: null,
      };
      scope.assertAccountBoundSupabaseMutationSubjectCurrent(subject);
      return { data, error: null };
    },
    supabase: { from(table) {
      const query = { table, filters: [] };
      const builder = {
        select(columns) { query.columns = columns; return builder; },
        eq(key, value) { query.filters.push([key, value]); return builder; },
        returns() { return builder; },
        async maybeSingle() { state.reads.push(query); if (state.read) await state.read(); return { data: state.stored, error: state.queryError }; },
      };
      return builder;
    } },
  };
  const rules = extract('_lib/roomRules.ts', ['normalizeJoinPolicy', 'normalizeContentAccessRule', 'normalizeReactionsPolicy', 'normalizeCapturePolicy']);
  const subject = extract('_lib/accountBoundSupabaseMutation.ts', ['AccountBoundSupabaseMutationError', 'assertAccountBoundSupabaseMutationSubjectCurrent']);
  const source = extract('_lib/watchParty.ts', ['PARTY_ROOMS_TABLE', 'PARTY_ROOMS_LEGACY_BASE_SELECT', 'PARTY_ROOMS_BASE_SELECT', 'PARTY_ROOMS_POLICY_SELECT',
    'normalizeWatchPartyContentSourceType', 'normalizeWatchPartyDiscoveryVisibility', 'isMissingColumnError',
    'toTimeMillis', 'getWatchPartyRoomActivityMillis', 'isWatchPartyRoomActive', 'rowToState', 'fetchPartyRoomRow', 'getPartyRoom',
    'readOwnedPartyRoomForPreparation', 'getOwnedPartyRoomForPreparation', 'writePartyRoomDiscovery', 'setPartyRoomDiscoverySettings', 'publishPartyRoomDiscovery']);
  vm.runInNewContext(ts.transpileModule(`${rules}\n${subject}\n${source}\nObject.assign(exports, { rowToState });`, { compilerOptions: options }).outputText, scope);
  scope.assertAccountBoundSupabaseMutationSubjectCurrent = scope.exports.assertAccountBoundSupabaseMutationSubjectCurrent;
  return { state, api: scope.exports, expected: scope.exports.rowToState(stored) };
}

test('recent exact host settings still use the existing authoritative setter', async () => {
  const h = harness({ age: 60_000 });
  assert.ok(await h.api.setPartyRoomDiscoverySettings('PARTY42', { discoveryVisibility: 'public', discoveryTitle: 'Tonight' }, h.expected));
  assert.equal(h.state.calls.length, 1); assert.equal(h.state.calls[0].name, 'set_party_room_discovery');
});

for (const visibility of ['public', 'private']) test(`prepared host can save ${visibility} after the activity window without renewing or publishing`, async () => {
  const h = harness();
  const saved = await h.api.setPartyRoomDiscoverySettings('PARTY42', { discoveryVisibility: visibility, discoveryTitle: 'Tonight' }, h.expected);
  assert.ok(saved, 'exact active prepared room reaches the authoritative settings RPC');
  assert.equal(saved.lastActivityAt, h.expected.lastActivityAt);
  assert.equal(h.state.calls.length, 1); assert.equal(h.state.calls[0].name, 'set_party_room_discovery');
  assert.equal(h.state.calls[0].args.p_session_generation, 'session-a');
  assert.equal(h.state.reads[0].table, 'watch_party_rooms');
  assert.deepEqual(h.state.reads[0].filters, [['party_id', 'PARTY42']]);
});

test('general room reads and publication retain the activity-window rejection', async () => {
  const h = harness();
  assert.equal(await h.api.getPartyRoom('PARTY42'), null);
  assert.equal(await h.api.publishPartyRoomDiscovery(h.expected), null);
  assert.equal(h.state.calls.length, 0);
});

for (const [field, value] of [
  ['is_active', false], ['is_active', null], ['is_active', undefined], ['party_id', 'OTHER42'],
  ['host_user_id', 'other'], ['room_type', 'live'], ['source_type', 'creator_video'],
  ['source_type', 'spectator_playback'], ['source_id', 'replacement'], ['title_id', 'replacement'],
]) test(`fresh prepared ${field}=${String(value)} cannot dispatch settings`, async () => {
  const h = harness(); h.state.stored = { ...h.state.stored, [field]: value };
  assert.equal(await h.api.setPartyRoomDiscoverySettings('PARTY42', { discoveryVisibility: 'private' }, h.expected), null);
  assert.equal(h.state.calls.length, 0);
});

for (const [field, value] of [['isActive', false], ['hostUserId', 'other'], ['roomType', 'live'], ['sourceType', 'spectator_playback']])
  test(`invalid expected ${field} never gains prepared-room authority`, async () => {
    const h = harness(); h.expected = { ...h.expected, [field]: value };
    assert.equal(await h.api.setPartyRoomDiscoverySettings('PARTY42', { discoveryVisibility: 'private' }, h.expected), null);
    assert.equal(h.state.calls.length, 0); assert.equal(h.state.reads.length, 0);
  });

for (const mode of ['missing', 'error']) test(`unavailable ${mode} row does not dispatch or synthesize a room`, async () => {
  const h = harness(); h.state.stored = null;
  if (mode === 'error') h.state.queryError = { code: 'unavailable', message: 'read unavailable' };
  assert.equal(await h.api.setPartyRoomDiscoverySettings('PARTY42', { discoveryVisibility: 'private' }, h.expected), null);
  assert.equal(h.state.calls.length, 0);
});

for (const replacement of [null, { ...owner(), userId: 'other', accountId: 'other' }, owner('session-b'), { ...owner(), state: 'RESTRICTED' }])
  test(`held prepared read cannot dispatch after ${replacement?.userId ?? 'logout'}:${replacement?.sessionGeneration ?? ''}:${replacement?.state ?? ''}`, async () => {
    const h = harness(); let release;
    h.state.read = () => new Promise(resolve => { release = resolve; });
    const pending = h.api.setPartyRoomDiscoverySettings('PARTY42', { discoveryVisibility: 'public' }, h.expected);
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(release); h.state.authority = replacement; release();
    await assert.rejects(pending, error => error.code === 'account_changed');
    assert.equal(h.state.calls.length, 0);
  });

test('server source or Premium denial remains a failed save without retry or publication', async () => {
  const h = harness(); h.state.server = async () => null;
  assert.equal(await h.api.setPartyRoomDiscoverySettings('PARTY42', { discoveryVisibility: 'public' }, h.expected), null);
  assert.equal(h.state.calls.length, 1); assert.equal(h.state.calls[0].name, 'set_party_room_discovery');
});

test('account replacement after settings dispatch cannot return a successful saved room', async () => {
  const h = harness(); let release;
  h.state.server = () => new Promise(resolve => { release = resolve; });
  const pending = h.api.setPartyRoomDiscoverySettings('PARTY42', { discoveryVisibility: 'private' }, h.expected);
  await new Promise(resolve => setImmediate(resolve)); assert.ok(release);
  h.state.authority = owner('session-b'); release({ partyId: 'PARTY42', sourceType: 'platform_title', sourceId: 'title-a', visibility: 'private', title: null, published: false });
  await assert.rejects(pending, error => error.code === 'account_changed');
  assert.equal(h.state.calls.length, 1);
});
