import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as proofPolicy from '../supabase/functions/_shared/ios-ordinary-push-internal-proof-policy.mjs';

// Execute the complete production HTTP handler and actual exact-subject auth
// helpers. Only Supabase transport and provider I/O are doubles; no credentials,
// network calls, fabricated production events or production data are used.
const file = process.env.DISPATCH_TEST_SOURCE_PATH ?? 'supabase/functions/notification-dispatch/index.ts';
const source = fs.readFileSync(file, 'utf8');
const compile = value => ts.transpileModule(value, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const executable = ast.statements.filter(n => !ts.isImportDeclaration(n)).map(n => n.getText(ast)).join('\n');
const authority = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync('supabase/functions/_shared/exact-subject-authority.ts', 'utf8')), authority);
const userId = 'ed410000-0000-4000-8000-000000000001';
const otherId = 'ed410000-0000-4000-8000-000000000002';
const sessionId = 'ed411000-0000-4000-8000-000000000001';

function harness(options = {}, code = executable) {
  const effects = [], authReads = [];
  let handler;
  const client = {
    auth: { getUser: async () => ({ data: { user: options.invalidUser ? null : { id: userId } }, error: null }) },
    async rpc(name) {
      assert.equal(name, 'wave1_session_authority_readback');
      authReads.push(name);
      return { data: { authoritative: true, state: options.staleSession ? 'RETIRED' : 'ACTIVE', restoreOnly: false,
        userId: options.wrongSessionActor ? otherId : userId, accountId: userId, sessionGeneration: sessionId }, error: null };
    },
    from(table) {
      (table === 'platform_role_memberships' ? authReads : effects).push(table);
      const q = { select: () => q, eq: () => q, in: () => q, limit: () => q, maybeSingle: () => q,
        then(resolve) { return Promise.resolve({ data: table === 'platform_role_memberships'
          ? [{ user_id: options.wrongRoleActor ? otherId : userId, role: options.role ?? 'owner',
            status: options.inactiveRole ? 'revoked' : 'active', expires_at: options.expiredRole ? '2000-01-01' : null }]
          : null, error: null }).then(resolve); } };
      return q;
    },
  };
  const context = { ...authority.exports, ...proofPolicy, exports: {}, Response, Request, TextEncoder, crypto,
    createClient: () => client,
    fetch: async () => { effects.push('provider'); throw new Error('Unexpected provider send'); },
    Deno: { env: { get: key => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'fixture-service' })[key] }, serve: fn => { handler = fn; } },
  };
  vm.runInNewContext(compile(code), context);
  return { effects, authReads, async run(payload, authorization = options.service ? 'Bearer fixture-service' : 'Bearer fixture-user') {
    const response = await handler(new Request('https://fixture.invalid/notification-dispatch', {
      method: 'POST', headers: authorization ? { authorization } : {},
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    }));
    return { status: response.status, body: await response.json() };
  } };
}

for (const role of ['owner', 'operator', 'service']) for (const triggerType of ['followed_creator_live', 'circle_friend_live']) {
  test(`${role}: retired ${triggerType} rejects every manual source/context without notification effects`, async () => {
    const h = harness({ role, service: role === 'service' });
    for (const sourceId of ['live-stage-id', 'party-room-id', 'broadcast-id', 'private-room', 'ended-room', 'nonexistent', { malformed: true }]) {
      for (const preference of [false, true, null]) {
        const result = await h.run({ triggerType, sourceId, timingKey: crypto.randomUUID(),
          actorUserId: otherId, recipientUserId: otherId, preferences: { liveStarts: preference, watchPartyStarts: preference } });
        assert.equal(result.status, 200);
        assert.deepEqual(result.body, { blockedReason: 'canonical_lifecycle_required', eligible: false, pushSent: false, triggerType });
      }
    }
    const alias = await h.run({ trigger_type: ` ${triggerType.toUpperCase()} `, source_id: 'source', timing_key: 'retry' });
    assert.equal(alias.body.blockedReason, 'canonical_lifecycle_required');
    assert.deepEqual(h.effects, [], 'no source/recipient/preference reads, dedupe, row insert, outbox enqueue or provider I/O');
    assert.ok(role === 'service' ? h.authReads.length === 0 : h.authReads.includes('wave1_session_authority_readback'));
  });
}

for (const [options, status] of [[{ invalidUser: true }, 401], [{ staleSession: true }, 401], [{ wrongSessionActor: true }, 401],
  [{ role: 'member' }, 403], [{ wrongRoleActor: true }, 403], [{ inactiveRole: true }, 403], [{ expiredRole: true }, 403]]) {
  test(`existing exact actor/session/role gate remains enforced: ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    assert.equal((await h.run({ triggerType: 'followed_creator_live', sourceId: 'source' })).status, status);
    assert.deepEqual(h.effects, []);
  });
}

test('missing auth, malformed requests and unknown start types fail closed', async () => {
  const h = harness();
  assert.equal((await h.run({}, '')).status, 401);
  for (const payload of ['{', '[]', '{}', { triggerType: 'live_room_member_joined', sourceId: 'source' },
    { triggerType: 'watch_party_starts_soon', sourceId: 'source' }, { triggerType: 'followed_creator_live' }]) {
    assert.equal((await h.run(payload)).status, 400);
  }
  assert.deepEqual(h.effects, []);
});

test('unrelated manual kinds still enter their existing plan, not the retirement gate', async () => {
  for (const triggerType of ['public_upload', 'replay_later', 'event_starts_soon']) {
    const h = harness();
    const response = await h.run({ triggerType, sourceId: 'missing-source' });
    assert.equal(response.status, 200);
    assert.equal(response.body.blockedReason, triggerType === 'event_starts_soon' ? 'event_not_found' : 'discovery_item_not_found');
    assert.deepEqual(h.effects, [triggerType === 'event_starts_soon' ? 'creator_events' : 'discovery_feed_items']);
  }
  const h = harness({ service: true });
  assert.equal((await h.run({ action: 'deliver-internal-ios-proof', recipientUserId: userId })).body.error, 'internal_ios_proof_not_allowed');
  assert.deepEqual(h.effects, [], 'separate proof remains governed by its own disabled-by-default policy');
});

test('negative control: removing the HTTP retirement gate reaches legacy source reads', async () => {
  const start = executable.indexOf('// Retired manual start actions:');
  const end = executable.indexOf('const plan = await buildDispatchPlan', start);
  assert.ok(start > 0 && end > start);
  const h = harness({ service: true }, executable.slice(0, start) + executable.slice(end));
  const response = await h.run({ triggerType: 'followed_creator_live', sourceId: 'source' });
  assert.notEqual(response.body.blockedReason, 'canonical_lifecycle_required');
  assert.deepEqual(h.effects, ['discovery_feed_items'], 'the zero-side-effect oracle detects gate removal');
});
