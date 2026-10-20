// Invoked only inside the canonical runtime runner's generated database clone.
// Real GoTrue sessions, PostgREST clients, SQL functions and observed PG locks.
// No provider actions, authority substitutes, trigger bypass or remote target.
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {randomUUID, randomBytes, createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createClient} from '@supabase/supabase-js';
import * as legalPolicies from '../legal/policies.mjs';
import {declarations, withCloneHttp} from './lib/exact-subject-authority-http.mjs';

const reason = 'Synthetic disposable Owner Security qualification';
const sha = value => createHash('sha256').update(value).digest('hex');
const safeError = value => String(value ?? '').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu, '[JWT]');
const invalidRequestIds = [
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-7111-8111-111111111111',
  '11111111-1111-4111-7111-111111111111',
];
const formerStaffFunctions = [
  ['admin_grant_platform_staff_permission_by_email', 'text,text,text,timestamp with time zone'],
  ['admin_revoke_platform_staff_permission_by_email', 'text,text,text'],
  ['admin_update_platform_staff_permissions_by_email', 'text,text[],text,timestamp with time zone'],
];

function exactFormerStaffDefinitions() {
  const source = readFileSync(new URL('../supabase/migrations/202608250004_platform_role_exact_subject_closure.sql', import.meta.url), 'utf8');
  return formerStaffFunctions.map(([name]) => {
    const startMarker = `create or replace function public."${name}"(`;
    const start = source.indexOf(startMarker);
    assert.ok(start >= 0, `historical definition exists: ${name}`);
    assert.equal(source.indexOf(startMarker, start + 1), -1, 'historical definition is unique');
    const body = source.indexOf('\nas $$\n', start), end = source.indexOf('\n$$;', body + 1);
    assert.ok(body > start && end > body, 'historical dollar-quoted function is complete');
    const definition = source.slice(start, end + '\n$$;'.length);
    assert.equal((definition.match(/\$\$/gu) ?? []).length, 2, 'extract only one complete original function');
    assert.ok(definition.includes("or v_actor_role <> 'owner'"), 'original NULL-unsafe guard remains exact source');
    return definition;
  }).join('\n');
}

function actualCanaryAdapters() {
  const authority = declarations('supabase/functions/_shared/exact-subject-authority.ts',
    ['readExactCurrentSessionAuthority', 'normalizeExactSubjectId', 'readExactBreakGlassSessionId', 'readExactPermissionKeys', 'readExactPlatformRole']);
  const context = declarations('supabase/functions/_shared/security-request-context.ts',
    ['attachDeviceHashToSecurityContext', 'securityContextAuditMetadata']);
  const scope = declarations('supabase/functions/_shared/canary-proof-scope.ts',
    ['CANARY_PROOF_LABELS', 'createCanaryProofScope', 'recordCanaryProofUser', 'recordCanaryProofRole', 'recordCanaryProofGrant']);
  const policy = declarations('_lib/legalPolicies.ts', ['ACCOUNT_LEGAL_DOCUMENT_KEYS', 'LEGAL_DOCUMENTS'],
    {'../legal/policies.mjs': legalPolicies});
  return declarations('supabase/functions/admin-owner-controls/index.ts',
    ['readCanaryProofScope', 'ensureProofUser', 'cleanupProofAccess', 'authenticate', 'upsertCurrentOwnerDevice', 'revokeTemporaryOwnerGrant'], {
      '../_shared/exact-subject-authority.ts': authority, '../_shared/canary-proof-scope.ts': scope,
      '../../../_lib/legalPolicies.ts': policy, '../_shared/security-request-context.ts': context,
      'npm:@supabase/supabase-js@2': {createClient},
    });
}

export async function runOwnerSecurityGrantConcurrency(harness) {
  const {container, database, query, literal, openSession, waitUntil, terminate} = harness;
  assert.match(database, /^runtime_authority_[0-9]+_[a-f0-9]{12}$/u);
  assert.equal(query('select current_database();'), database, 'all test SQL targets generated clone');
  const adapters = actualCanaryAdapters();
  let checks = 0;
  await withCloneHttp({container, database}, async connection => {
    const users = [], clients = [];
    const nativeFetch = globalThis.fetch;
    const localFetch = (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      assert.equal(url.origin, connection.apiUrl, 'qualification cannot contact another stack/provider');
      return nativeFetch(input, {...init, redirect: 'error', signal: init?.signal ?? AbortSignal.timeout(15_000)});
    };
    const options = {auth: {autoRefreshToken: false, persistSession: false}, global: {fetch: localFetch}};
    const admin = createClient(connection.apiUrl, connection.serviceKey, options);
    const retainedClient = actor => createClient(connection.apiUrl, connection.anonKey,
      {...options, global: {...options.global, headers: {Authorization: `Bearer ${actor.token}`}}});
    const freshClient = () => {
      const client = createClient(connection.apiUrl, connection.anonKey, options); clients.push(client); return client;
    };
    const data = (result, label) => {
      assert.equal(result.error, null, `${label}: ${safeError(result.error?.message)}`);
      return result.data;
    };
    const pass = label => { checks++; console.log(`PASS Owner Security: ${label}`); };
    const claims = actor => `set local role authenticated;set local request.jwt.claim.role='authenticated';set local request.jwt.claims=${literal(JSON.stringify(actor.claims))};`;
    const denied = (result, message) => {
      assert.ok(result.error, 'actual request must fail');
      assert.equal(result.error.message, message, 'exact authority rejection, not infrastructure failure');
    };
    async function acceptLegal(person) {
      const read = data(await person.client.rpc('wave1_legal_requirements_readback', {p_capability: 'account'}), 'actual legal requirements');
      assert.equal(read.userId, person.user); assert.equal(read.accountId, person.user);
      assert.equal(read.sessionGeneration, person.session); assert.equal(read.state, 'ACTIVE');
      assert.equal(read.restoreOnly, false); assert.ok(read.requirements.length > 0);
      const acceptances = Object.fromEntries(read.requirements.map(row => [row.documentKey, row.version]));
      assert.equal(Object.keys(acceptances).length, read.requirements.length);
      const accepted = data(await person.client.rpc('wave1_accept_legal_documents', {
        p_acceptances: acceptances, p_market: 'UNITED_STATES', p_capability: 'account',
        p_expected_user_id: person.user, p_expected_account_id: person.user, p_session_generation: person.session,
      }), 'actual session-bound legal acceptance');
      assert.equal(accepted.allAccepted, true); assert.equal(accepted.sessionGeneration, person.session);
    }
    async function person(label, role, legal = true) {
      const email = `owner-security-${label}-${randomUUID()}@example.invalid`;
      const password = `Local-${randomBytes(24).toString('hex')}!`;
      const created = data(await admin.auth.admin.createUser({email, password, email_confirm: true}), 'create exact synthetic Auth subject');
      users.push(created.user.id);
      const client = createClient(connection.apiUrl, connection.anonKey, options); clients.push(client);
      const login = data(await client.auth.signInWithPassword({email, password}), 'real password login');
      const token = login.session.access_token;
      const jwt = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      assert.equal(jwt.sub, created.user.id); assert.equal(jwt.role, 'authenticated'); assert.ok(jwt.session_id);
      const value = {user: created.user.id, email, client, token, claims: jwt, session: jwt.session_id};
      assert.equal(query(`select count(*) from auth.sessions where id=${literal(value.session)} and user_id=${literal(value.user)};`),
        '1', 'real signed token names actual GoTrue session');
      if (role) data(await admin.from('platform_role_memberships').insert({
        user_id: value.user, email, role, status: 'active', notes: reason, granted_by: 'local-test',
      }), 'real exact role fixture through normal constraints');
      if (legal) await acceptLegal(value);
      if (role) assert.equal(data(await client.rpc('has_platform_role', {required_roles: [role]}), 'actual SQL role authority'), legal);
      return value;
    }
    const grantsSnapshot = () => query(`select jsonb_build_object(
      'grants',(select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]') from public.platform_staff_permission_grants g),
      'permissionAudit',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.platform_staff_permission_audit a),
      'securityAudit',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.security_audit_events a),
      'adminAudit',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.platform_admin_audit_logs a))::text;`);
    async function grant(owner, target, key = 'audit_review', expiresAt = new Date(Date.now() + 3_600_000).toISOString()) {
      const row = data(await owner.client.rpc('admin_grant_platform_staff_permission_by_email', {
        p_target_email: target.email, p_permission_key: key, p_reason: reason, p_expires_at: expiresAt,
      }), 'actual canonical Owner grant');
      assert.equal(row.userId, target.user); assert.equal(row.permissionKey, key);
      return row.id;
    }
    async function deviceContext(actor, mode = 'single') {
      const deviceHash = sha(`synthetic:${randomUUID()}`);
      const action = mode === 'single' ? 'revoke_temporary_owner_grant' : 'revoke_all_temporary_owner_grants';
      const device = data(await admin.from('owner_trusted_devices').insert({
        owner_user_id: actor.user, device_fingerprint_hash: deviceHash,
        trusted_at: new Date().toISOString(), trusted_by: actor.user, metadata: {disposable_test: true},
      }).select('id').single(), 'real trusted-device fixture');
      const context = data(await admin.from('security_request_context').insert({
        user_id: actor.user, device_hash: deviceHash, ip_hash: sha(`synthetic-ip:${randomUUID()}`),
        source: `admin-owner-controls:${action}`, capture_status: 'unavailable',
        metadata: {auth_session_id: actor.session, owner_security_action: action, disposable_test: true},
      }).select('id').single(), 'real server request-context fixture');
      return {device: device.id, context: context.id, deviceHash};
    }
    const argumentsFor = (binding, grantId, requestId = randomUUID(), mode = 'single') => ({
      p_request_id: requestId, p_mode: mode, p_grant_id: grantId, p_reason: reason,
      p_security_context_id: binding.context, p_device_id: binding.device,
    });
    const revokeSql = args => `select public.owner_security_revoke_grants(${literal(args.p_request_id)},${literal(args.p_mode)},
      ${args.p_grant_id ? literal(args.p_grant_id) : 'null'},${literal(args.p_reason)},
      ${literal(args.p_security_context_id)},${literal(args.p_device_id)})::text;`;
    const blocked = (holder, waiter) => query(`select count(*) from pg_stat_activity w join pg_stat_activity h
      on h.application_name=${literal(holder)} where w.datname=current_database() and h.datname=current_database()
      and w.application_name=${literal(waiter)} and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`) === '1';
    let primaryFailure;
    try {
      const owner = await person('owner', 'owner'), target = await person('target', 'operator');
      assert.equal(data(await owner.client.rpc('platform_staff_actor_role'), 'qualified Owner actor role'), 'owner');
      const noRole = await person('no-role'), noLegalOwner = await person('no-legal-owner', 'owner', false);
      const existing = await grant(owner, target);
      formerNullActorControl({actor: noRole, target, existing, claims, grantsSnapshot, query, literal});
      pass('exact former staff functions reproduce NULL-actor mutations then fully roll back');
      for (const actor of [noRole, noLegalOwner]) {
        assert.equal(data(await actor.client.rpc('platform_staff_actor_role'), 'null actor negative control'), null);
        const before = grantsSnapshot();
        for (const [rpc, args] of [
          ['admin_grant_platform_staff_permission_by_email', {p_target_email: target.email, p_permission_key: 'legal_review', p_reason: reason, p_expires_at: null}],
          ['admin_revoke_platform_staff_permission_by_email', {p_target_email: target.email, p_permission_key: 'audit_review', p_reason: reason}],
          ['admin_update_platform_staff_permissions_by_email', {p_target_email: target.email, p_permission_keys: ['legal_review'], p_reason: reason, p_expires_at: null}],
        ]) {
          denied(await actor.client.rpc(rpc, args), 'platform_staff_permission_owner_required');
          assert.equal(grantsSnapshot(), before, 'null actor cannot change grants or audits');
          pass(`${rpc} denies ${actor === noRole ? 'no role' : 'Owner without current legal authority'}`);
        }
      }
      const beforeDirect = grantsSnapshot();
      const direct = await admin.from('platform_staff_permission_grants').update({status: 'revoked'}).eq('id', existing);
      assert.equal(direct.error?.code, '42501');
      assert.equal(direct.error?.message, 'permission denied for function platform_staff_normalize_permission_key');
      assert.equal(grantsSnapshot(), beforeDirect);
      pass('direct service CHECK failure reproduced without widening ACL');
      const binding = await deviceContext(owner), args = argumentsFor(binding, existing);
      const beforeInvalidRequest = `${grantsSnapshot()}\n${query(
        "select coalesce(jsonb_agg(to_jsonb(r) order by request_id),'[]')::text from private.owner_security_revocation_receipts r;")}`;
      for (const id of invalidRequestIds) {
        const invalid = await owner.client.rpc('owner_security_revoke_grants', {...args, p_request_id: id});
        denied(invalid, 'owner_security_request_invalid'); assert.equal(invalid.error.code, '22023');
        assert.equal(`${grantsSnapshot()}\n${query(
          "select coalesce(jsonb_agg(to_jsonb(r) order by request_id),'[]')::text from private.owner_security_revocation_receipts r;")}`,
        beforeInvalidRequest, 'unsupported UUID cannot mutate grants, audits or durable receipts');
      }
      pass('revoke rejects nil, v7 and bad-variant request UUIDs without mutation');
      const result = data(await owner.client.rpc('owner_security_revoke_grants', args), 'actual repaired single revoke');
      assert.equal(result.ok, true); assert.equal(result.requestId, args.p_request_id);
      assert.equal(result.revokedCount, 1); assert.deepEqual(result.grantIds, [existing]);
      assert.equal(result.grant.id, existing); assert.equal(result.grant.status, 'revoked');
      assert.equal(result.grant.revoked_by, owner.user); assert.ok(result.revokedAt);
      const after = grantsSnapshot();
      const replay = data(await owner.client.rpc('owner_security_revoke_grants', args), 'retry after committed but unobserved response');
      assert.deepEqual(replay, result); assert.equal(grantsSnapshot(), after, 'receipt retry creates no duplicate mutation/audit');
      denied(await owner.client.rpc('owner_security_revoke_grants', {...args, p_reason: `${reason} changed`}), 'owner_security_request_conflict');
      assert.equal(grantsSnapshot(), after, 'same request identity cannot be rebound to changed intent');
      pass('canonical single revoke and identical receipt retry');
      const auth = await adapters.authenticate(new Request(`${connection.apiUrl}/functions/v1/qualification`, {
        headers: {authorization: `Bearer ${owner.token}`},
      }), admin, connection.apiUrl, connection.anonKey);
      assert.ok(auth.user); assert.equal(auth.user.id, owner.user); assert.equal(auth.user.authenticatedSessionId, owner.session);
      const edgeContext = data(await admin.from('security_request_context').insert({
        user_id: owner.user, source: 'admin-owner-controls:revoke_temporary_owner_grant',
        ip_hash: sha(`edge-synthetic-ip:${randomUUID()}`), capture_status: 'unavailable', metadata: {disposable_test: true},
      }).select('id').single(), 'actual Edge context fixture');
      auth.user.securityContext = {id: edgeContext.id, captureStatus: 'unavailable', networkProofState: 'missing', source: 'admin-owner-controls:revoke_temporary_owner_grant'};
      const edgeDeviceInput = {platform: 'ios', deviceName: `Synthetic-${randomUUID()}`, deviceLabel: 'Disposable qualification'};
      const edgeDevice = await adapters.upsertCurrentOwnerDevice(admin, auth.user, edgeDeviceInput);
      data(await admin.from('owner_trusted_devices').update({trusted_at: new Date().toISOString(), trusted_by: owner.user})
        .eq('id', edgeDevice.currentDevice.id), 'real trusted device precondition for actual handler');
      const edgeGrant = await grant(owner, target, 'legal_review');
      const edgeResponse = await adapters.revokeTemporaryOwnerGrant(admin, owner.client, auth.user, {
        requestId: randomUUID(), grantId: edgeGrant, reason, confirmation: 'REVOKE GRANT', deviceContext: edgeDeviceInput,
      });
      assert.equal(edgeResponse.status, 200); assert.equal((await edgeResponse.json()).grant.id, edgeGrant);
      const contextBinding = data(await admin.from('security_request_context').select('metadata,device_hash').eq('id', edgeContext.id).single(), 'actual handler context readback');
      assert.equal(contextBinding.metadata.auth_session_id, owner.session);
      assert.equal(contextBinding.metadata.owner_security_action, 'revoke_temporary_owner_grant');
      assert.equal(contextBinding.device_hash, edgeDevice.fingerprintHash);
      pass('actual Edge revoke binds verified session/device and consumes real transaction receipt');

      // The remaining cases share these actual clients/PG primitives. They are
      // kept in this function so fixtures can never escape the generated clone.
      await runMutationCases({owner, target, noRole, noLegalOwner, admin, data, grant, person, deviceContext, argumentsFor,
        revokeSql, claims, grantsSnapshot, query, literal, openSession, waitUntil, terminate, blocked, pass, denied});
      await runCanaryCases({owner, target, noRole, noLegalOwner, admin, data, person, users, retainedClient,
        adapters, freshClient, query, literal, openSession, waitUntil, terminate,
        serviceClaims: JSON.parse(Buffer.from(connection.serviceKey.split('.')[1], 'base64url').toString('utf8')), pass, denied});
    } catch (error) { primaryFailure = error; }
    finally {
      const failures = [];
      for (const client of clients) {
        try { data(await client.auth.signOut({scope: 'global'}), 'retire exact synthetic login'); } catch (error) { failures.push(error); }
      }
      for (const id of users) {
        try {
          const result = await admin.auth.admin.deleteUser(id);
          // Actual Edge cleanup may already have deleted this exact fixture.
          if (result.error) assert.equal(query(`select count(*) from auth.users where id=${literal(id)};`), '0',
            'failed Auth deletion must still prove exact subject already absent');
        } catch (error) { failures.push(error); }
      }
      // Append-only audit/receipt rows and synthetic SQL targets deliberately
      // remain inside the clone; its owning runner drops the whole clone in
      // finally. Never disable audit triggers to make fixture cleanup pass.
      if (primaryFailure || failures.length) throw new AggregateError([...(primaryFailure ? [primaryFailure] : []), ...failures],
        'Owner Security real authority qualification failed');
    }
  });
  assert.equal(checks, 58, 'all declared real-client, failure and concurrency cases executed');
  console.log(`Owner Security real Auth/PostgREST/PG: ${checks} cases passed; generated clone only`);
}

function formerNullActorControl({actor, target, existing, claims, grantsSnapshot, query, literal}) {
  const definitions = exactFormerStaffDefinitions();
  const functionsSnapshot = () => query(`select jsonb_agg(jsonb_build_object(
    'signature',p.oid::regprocedure::text,'definition',md5(pg_get_functiondef(p.oid)),
    'owner',p.proowner,'acl',to_jsonb(p.proacl)) order by p.oid)::text from pg_proc p where p.oid in (
      ${formerStaffFunctions.map(([name, args]) => `${literal(`public.${name}(${args})`)}::regprocedure`).join(',')});`);
  const beforeFunctions = functionsSnapshot(), beforeData = grantsSnapshot();
  assert.equal(JSON.parse(beforeFunctions).length, 3);
  const observedRows = label => `reset role;select jsonb_build_object('stage',${literal(label)},'rows',(
    select jsonb_agg(to_jsonb(g) order by id) from public.platform_staff_permission_grants g
    where target_user_id=${literal(target.user)}))::text;set local role authenticated;`;
  let evidence;
  try {
    // CREATE OR REPLACE and every mutation stay in this one transaction.
    // ON_ERROR_STOP closes the connection on failure; either path rolls back.
    evidence = query(`begin;
      ${definitions}
      ${claims(actor)}
      select jsonb_build_object('stage','actor','role',public.platform_staff_actor_role(),
        'userId',auth.uid(),'sessionId',auth.jwt()->>'session_id')::text;
      select jsonb_build_object('stage','grant','result',public.admin_grant_platform_staff_permission_by_email(
        ${literal(target.email)},'legal_review',${literal(reason)},now()+interval '1 hour'))::text;
      ${observedRows('afterGrant')}
      select jsonb_build_object('stage','revoke','result',public.admin_revoke_platform_staff_permission_by_email(
        ${literal(target.email)},'legal_review',${literal(reason)}))::text;
      ${observedRows('afterRevoke')}
      select jsonb_build_object('stage','update','result',public.admin_update_platform_staff_permissions_by_email(
        ${literal(target.email)},array['legal_hold']::text[],${literal(reason)},now()+interval '1 hour'))::text;
      ${observedRows('afterUpdate')}
      reset role;
      select jsonb_build_object('stage','audit','count',count(*))::text from public.platform_staff_permission_audit
        where actor_user_id=${literal(actor.user)} and target_user_id=${literal(target.user)} and reason=${literal(reason)};
      rollback;`).split('\n').map(line => JSON.parse(line));
  } finally {
    assert.equal(functionsSnapshot(), beforeFunctions, 'rollback restores exact repaired definitions, owners and ACLs');
    assert.equal(grantsSnapshot(), beforeData, 'rollback restores all grants and append-only audit contents');
  }
  assert.deepEqual(evidence.map(row => row.stage), ['actor', 'grant', 'afterGrant', 'revoke', 'afterRevoke', 'update', 'afterUpdate', 'audit']);
  assert.equal(evidence[0].role, null);
  assert.equal(evidence[0].userId, actor.user); assert.equal(evidence[0].sessionId, actor.session);
  const granted = evidence[1].result;
  assert.equal(granted.userId, target.user); assert.equal(granted.permissionKey, 'legal_review');
  assert.equal(granted.status, 'active');
  const inserted = evidence[2].rows.find(row => row.id === granted.id);
  assert.equal(inserted.status, 'active'); assert.equal(inserted.granted_by, actor.user);
  assert.equal(evidence[3].result.id, granted.id); assert.equal(evidence[3].result.status, 'revoked');
  const revoked = evidence[4].rows.find(row => row.id === granted.id);
  assert.equal(revoked.status, 'revoked'); assert.equal(revoked.revoked_by, actor.user);
  assert.equal(evidence[5].result.userId, target.user);
  assert.deepEqual(evidence[5].result.newPermissions, ['legal_hold']);
  const finalRows = evidence[6].rows;
  assert.equal(finalRows.find(row => row.id === existing).status, 'revoked');
  assert.deepEqual(finalRows.filter(row => row.status === 'active').map(row => row.permission_key), ['legal_hold']);
  assert.equal(finalRows.find(row => row.permission_key === 'legal_hold').granted_by, actor.user);
  assert.equal(Number(evidence[7].count), 4, 'former grant/revoke/update wrote four real permission audit entries');
}

async function runMutationCases(t) {
  const {owner, target, noRole, noLegalOwner, data, grant, person, deviceContext, argumentsFor,
    revokeSql, claims, grantsSnapshot, query, literal, openSession, waitUntil, terminate, blocked, pass, denied} = t;
  const snapshot = () => `${grantsSnapshot()}\n${query(
    "select coalesce(jsonb_agg(to_jsonb(r) order by request_id),'[]')::text from private.owner_security_revocation_receipts r;")}`;
  const grantRow = id => JSON.parse(query(`select to_jsonb(g)::text from public.platform_staff_permission_grants g where id=${literal(id)};`));
  const operator = await person('nonowner', 'operator');
  for (const [actor, error] of [[noRole, 'admin_mutation_staff_required'], [noLegalOwner, 'admin_mutation_staff_required'], [operator, 'owner_required']]) {
    const id = await grant(owner, target), context = await deviceContext(actor), before = snapshot();
    denied(await actor.client.rpc('owner_security_revoke_grants', argumentsFor(context, id)), error);
    assert.equal(snapshot(), before);
    pass(`actual Owner Security RPC denies ${error}`);
  }
  for (const change of ['device-revoked', 'device-owner', 'context-subject', 'context-session', 'context-action', 'context-hash', 'context-stale']) {
    const id = await grant(owner, target), binding = await deviceContext(owner);
    if (change === 'device-revoked') query(`update public.owner_trusted_devices set revoked_at=clock_timestamp() where id=${literal(binding.device)};`);
    else if (change === 'device-owner') query(`update public.owner_trusted_devices set owner_user_id=${literal(operator.user)} where id=${literal(binding.device)};`);
    else if (change === 'context-subject') query(`update public.security_request_context set user_id=${literal(operator.user)} where id=${literal(binding.context)};`);
    else if (change === 'context-session') query(`update public.security_request_context set metadata=jsonb_set(metadata,'{auth_session_id}',to_jsonb(${literal(operator.session)}::text)) where id=${literal(binding.context)};`);
    else if (change === 'context-action') query(`update public.security_request_context set metadata=jsonb_set(metadata,'{owner_security_action}','"revoke_all_temporary_owner_grants"') where id=${literal(binding.context)};`);
    else if (change === 'context-hash') query(`update public.security_request_context set device_hash=${literal(sha('wrong-device'))} where id=${literal(binding.context)};`);
    else query(`update public.security_request_context set created_at=clock_timestamp()-interval '6 minutes' where id=${literal(binding.context)};`);
    const before = snapshot();
    denied(await owner.client.rpc('owner_security_revoke_grants', argumentsFor(binding, id)),
      change.startsWith('device-') ? 'trusted_device_required' : 'owner_security_context_required');
    assert.equal(snapshot(), before);
    pass(`actual context/device binding rejects ${change}`);
  }
  // Preserve single-ID compatibility: the historical action could explicitly
  // revoke an active permanent or already-expired grant. Bulk is narrower.
  for (const kind of ['permanent', 'expired']) {
    const id = await grant(owner, target, 'legal_review', kind === 'permanent' ? null : new Date(Date.now() + 1000).toISOString());
    if (kind === 'expired') await waitUntil(() => query(`select expires_at<=clock_timestamp() from public.platform_staff_permission_grants where id=${literal(id)};`) === 't', 'actual grant expires');
    const binding = await deviceContext(owner);
    const result = data(await owner.client.rpc('owner_security_revoke_grants', argumentsFor(binding, id)), `explicit ${kind} revoke`);
    assert.equal(result.grant.id, id); assert.equal(result.revokedCount, 1);
    pass(`single exact ID preserves ${kind} grant revoke`);
  }
  const missingBinding = await deviceContext(owner);
  denied(await owner.client.rpc('owner_security_revoke_grants', argumentsFor(missingBinding, randomUUID())), 'temporary_grant_not_found');
  pass('single absent ID has exact not-found result');

  // Real trigger failures occur after an earlier mutation in this same
  // transaction. Existing triggers remain active; the temporary triggers only
  // add exact-fixture failure points and are removed in finally.
  for (const boundary of ['second-grant', 'permission-audit', 'security-audit', 'receipt']) {
    const first = await grant(owner, target, 'legal_review'), second = await grant(owner, target, 'legal_hold');
    const [early, late] = [first, second].sort();
    const mode = boundary === 'second-grant' ? 'bulk' : 'single';
    const binding = await deviceContext(owner, mode), args = argumentsFor(binding, mode === 'single' ? first : null, randomUUID(), mode);
    const suffix = randomUUID().replaceAll('-', ''), fn = `owner_security_fail_${suffix}`;
    const table = boundary === 'second-grant' ? 'public.platform_staff_permission_grants'
      : boundary === 'permission-audit' ? 'public.platform_staff_permission_audit'
        : boundary === 'security-audit' ? 'public.security_audit_events' : 'private.owner_security_revocation_receipts';
    const condition = boundary === 'second-grant' ? `new.id=${literal(late)}::uuid`
      : boundary === 'receipt' ? `new.request_id=${literal(args.p_request_id)}::uuid`
        : `new.actor_user_id::text=${literal(owner.user)}`;
    query(`create function private.${fn}() returns trigger language plpgsql as $$
      begin if ${condition} then
       if not exists(select 1 from public.platform_staff_permission_grants where id=${literal(boundary === 'second-grant' ? early : first)} and status='revoked')
        then raise exception 'fixture_failure_did_not_follow_mutation'; end if;
       raise exception 'owner_security_injected_${boundary.replaceAll('-', '_')}'; end if;return new;end $$;
      create trigger ${fn} before ${boundary === 'second-grant' ? 'update' : 'insert'} on ${table} for each row execute function private.${fn}();`);
    const before = snapshot();
    try {
      denied(await owner.client.rpc('owner_security_revoke_grants', args), `owner_security_injected_${boundary.replaceAll('-', '_')}`);
      assert.equal(snapshot(), before, 'all grants, audits and receipts roll back after real sink failure');
      pass(`atomic rollback after ${boundary} failure`);
    } finally { query(`drop trigger ${fn} on ${table};drop function private.${fn}();`); }
  }

  async function queued(boundary, change) {
    const actor = await person(`queue-${boundary}-${change}`, 'owner');
    const id = await grant(owner, target, 'legal_review');
    const binding = await deviceContext(actor), args = argumentsFor(binding, id);
    const holderName = `owner-security-holder-${randomUUID()}`, waiterName = `owner-security-waiter-${randomUUID()}`;
    let holder, waiter;
    const lock = boundary === 'advisory'
      ? `select pg_advisory_xact_lock(hashtextextended('owner-security-request:'||${literal(args.p_request_id)},0));`
      : boundary === 'grant' ? `select id from public.platform_staff_permission_grants where id=${literal(id)} for update;`
        : `lock table ${boundary === 'audit' ? 'public.platform_staff_permission_audit' : 'private.owner_security_revocation_receipts'} in share mode;`;
    const before = snapshot();
    try {
      holder = openSession(holderName, `begin;set local statement_timeout='35s';${lock}select 'HOLDER_READY';`);
      await waitUntil(() => holder.output().includes('HOLDER_READY'), 'actual holder acquired lock');
      if (boundary !== 'advisory' && change.endsWith('-expiry')) {
        query(change === 'session-expiry'
          ? `update auth.sessions set not_after=clock_timestamp()+interval '3 seconds' where id=${literal(actor.session)};`
          : `update public.platform_role_memberships set expires_at=clock_timestamp()+interval '3 seconds' where user_id=${literal(actor.user)} and role='owner';`);
      }
      waiter = openSession(waiterName, `begin;set local statement_timeout='35s';${claims(actor)}${revokeSql(args)}commit;\n\\q`);
      waiter.child.stdin.end();
      await waitUntil(() => blocked(holderName, waiterName), 'RPC waiting on independent actual holder PID');
      if (change === 'role-revoke') query(`update public.platform_role_memberships set status='revoked' where user_id=${literal(actor.user)} and role='owner';`);
      else if (change === 'session-revoke') query(`delete from auth.sessions where id=${literal(actor.session)};`);
      else if (change === 'legal-revoke') query(`update public.wave1_legal_acceptances set invalidated_at=clock_timestamp() where user_id=${literal(actor.user)};`);
      else if (change === 'device-revoke') query(`update public.owner_trusted_devices set revoked_at=clock_timestamp() where id=${literal(binding.device)};`);
      else if (change.endsWith('-expiry')) {
        const table = change === 'session-expiry' ? 'auth.sessions' : 'public.platform_role_memberships';
        const column = change === 'session-expiry' ? 'not_after' : 'expires_at';
        const predicate = change === 'session-expiry' ? `id=${literal(actor.session)}` : `user_id=${literal(actor.user)} and role='owner'`;
        if (boundary === 'advisory') query(`update ${table} set ${column}=clock_timestamp()+interval '500 milliseconds' where ${predicate};`);
        assert.equal(query(`select w.xact_start<a.${column} from pg_stat_activity w cross join ${table} a
          where w.application_name=${literal(waiterName)} and ${predicate};`), 't', 'queued transaction began before actual cutoff');
        await waitUntil(() => query(`select clock_timestamp()>=${column} from ${table} where ${predicate};`) === 't', 'wall-clock cutoff reached under lock');
      } else if (change === 'renewal') {
        // This producer deliberately keeps transaction-time timestamps; a
        // full row comparison must still detect changed expiry/reason.
        holder.child.stdin.write(`update public.platform_staff_permission_grants set expires_at=clock_timestamp()+interval '2 hours',
          reason='Synthetic independent renewal' where id=${literal(id)};select 'RENEWED';\n`);
        await waitUntil(() => holder.output().includes('RENEWED'), 'renewal uncommitted in lock holder');
      }
      assert.equal(blocked(holderName, waiterName), true, 'waiter remains blocked after independent change');
      holder.child.stdin.end('commit;\n\\q\n');
      const [held, result] = await Promise.all([holder.done, waiter.done]);
      assert.equal(held.code, 0, safeError(held.stderr));
      if (change === 'none') {
        assert.equal(result.code, 0, safeError(result.stderr)); assert.equal(grantRow(id).status, 'revoked');
      } else {
        assert.notEqual(result.code, 0, 'changed authority/scope must reject queued mutation');
        const error = change === 'renewal' ? 'owner_security_scope_changed'
          : change === 'device-revoke' ? 'trusted_device_required'
            : change.startsWith('session-') ? 'admin_mutation_current_session_required' : 'admin_mutation_staff_required';
        assert.match(result.stderr, new RegExp(`ERROR:\\s+${error}(?:\\r?\\n|$)`, 'u'), 'exact post-wait denial');
        if (change !== 'renewal') assert.equal(snapshot(), before, 'no grant/audit/receipt effects after queued denial');
        else {
          assert.equal(grantRow(id).status, 'active'); assert.equal(grantRow(id).reason, 'Synthetic independent renewal');
          assert.equal(query(`select count(*) from private.owner_security_revocation_receipts where request_id=${literal(args.p_request_id)};`), '0');
        }
      }
      pass(`${boundary} queue ${change}`);
    } finally { await terminate(holderName, holder); await terminate(waiterName, waiter); }
  }
  for (const change of ['none', 'role-revoke', 'session-revoke', 'legal-revoke', 'device-revoke', 'role-expiry', 'session-expiry']) await queued('advisory', change);
  await queued('grant', 'renewal');
  for (const boundary of ['grant', 'audit', 'receipt']) for (const change of ['role-expiry', 'session-expiry']) await queued(boundary, change);
  {
    const binding = await deviceContext(owner, 'bulk'), args = argumentsFor(binding, null, randomUUID(), 'bulk');
    const holderName = `owner-security-late-holder-${randomUUID()}`, waiterName = `owner-security-late-waiter-${randomUUID()}`;
    let holder, waiter;
    try {
      holder = openSession(holderName, `begin;set local statement_timeout='35s';
        select pg_advisory_xact_lock(hashtextextended('owner-security-request:'||${literal(args.p_request_id)},0));select 'HOLDER_READY';`);
      await waitUntil(() => holder.output().includes('HOLDER_READY'), 'bulk request lock holder ready');
      waiter = openSession(waiterName, `begin;set local statement_timeout='35s';${claims(owner)}${revokeSql(args)}commit;\n\\q`);
      waiter.child.stdin.end();
      await waitUntil(() => blocked(holderName, waiterName), 'bulk start time fixed before independent grant');
      const late = await grant(owner, target, 'reports_review');
      assert.equal(blocked(holderName, waiterName), true);
      holder.child.stdin.end('commit;\n\\q\n');
      const [held, result] = await Promise.all([holder.done, waiter.done]);
      assert.equal(held.code, 0, safeError(held.stderr)); assert.equal(result.code, 0, safeError(result.stderr));
      const receipt = JSON.parse(result.stdout.trim());
      assert.ok(Date.parse(grantRow(late).granted_at) > Date.parse(receipt.scopeAsOf), 'independent grant really committed after scope cutoff');
      assert.ok(!receipt.grantIds.includes(late)); assert.equal(grantRow(late).status, 'active');
      pass('bulk excludes grant committed after observed request start');
    } finally { await terminate(holderName, holder); await terminate(waiterName, waiter); }
  }
  {
    const lateTarget = await person('older-transaction-target', 'operator');
    const sentinel = await grant(owner, target, 'legal_review'), late = randomUUID();
    const binding = await deviceContext(owner, 'bulk'), args = argumentsFor(binding, null, randomUUID(), 'bulk');
    const holderName = `owner-security-older-holder-${randomUUID()}`, waiterName = `owner-security-older-waiter-${randomUUID()}`;
    let holder, waiter;
    try {
      holder = openSession(holderName, `begin;set local statement_timeout='35s';
        select pg_advisory_xact_lock(hashtextextended('owner-security-request:'||${literal(args.p_request_id)},0));select 'HOLDER_READY';`);
      await waitUntil(() => holder.output().includes('HOLDER_READY'), 'older producer transaction holds request lock');
      waiter = openSession(waiterName, `begin;set local statement_timeout='35s';${claims(owner)}${revokeSql(args)}commit;\n\\q`);
      waiter.child.stdin.end();
      await waitUntil(() => blocked(holderName, waiterName), 'bulk captured scope before older producer commits');
      assert.equal(query(`select h.xact_start<w.xact_start from pg_stat_activity h cross join pg_stat_activity w
        where h.application_name=${literal(holderName)} and w.application_name=${literal(waiterName)}
        and h.datname=current_database() and w.datname=current_database();`), 't', 'producer transaction predates request');
      // Defaults use the older transaction's now(). Timestamp filtering alone
      // would include this newly committed row after the advisory wait.
      holder.child.stdin.write(`insert into public.platform_staff_permission_grants
        (id,target_user_id,target_email,permission_key,status,reason,expires_at,granted_by)
        values(${literal(late)},${literal(lateTarget.user)},${literal(lateTarget.email)},'audit_review','active',
          ${literal(reason)},now()+interval '1 hour',${literal(owner.user)});
        select case when granted_at=transaction_timestamp() and updated_at=transaction_timestamp()
          then 'OLDER_TRANSACTION_INSERTED' else 'OLDER_TRANSACTION_TIMESTAMP_MISMATCH' end
        from public.platform_staff_permission_grants where id=${literal(late)};\n`);
      await waitUntil(() => holder.output().includes('OLDER_TRANSACTION_'), 'older producer inserted through normal constraints');
      assert.ok(holder.output().includes('OLDER_TRANSACTION_INSERTED'), 'normal defaults retain producer transaction timestamps');
      assert.equal(query(`select count(*) from public.platform_staff_permission_grants where id=${literal(late)};`), '0',
        'new grant remains uncommitted and invisible to independent observer');
      assert.equal(blocked(holderName, waiterName), true, 'request still waits while producer prepares commit');
      holder.child.stdin.end('commit;\n\\q\n');
      const [held, result] = await Promise.all([holder.done, waiter.done]);
      assert.equal(held.code, 0, safeError(held.stderr)); assert.equal(result.code, 0, safeError(result.stderr));
      const receipt = JSON.parse(result.stdout.trim());
      assert.equal(query(`select granted_at<${literal(receipt.scopeAsOf)}::timestamptz
        and updated_at<${literal(receipt.scopeAsOf)}::timestamptz
        from public.platform_staff_permission_grants where id=${literal(late)};`), 't', 'late-visible grant predates timestamp cutoff');
      assert.ok(receipt.grantIds.includes(sentinel)); assert.equal(grantRow(sentinel).status, 'revoked');
      assert.ok(!receipt.grantIds.includes(late)); assert.equal(grantRow(late).status, 'active');
      pass('bulk excludes later commit from older transaction despite pre-cutoff timestamps');
    } finally { await terminate(holderName, holder); await terminate(waiterName, waiter); }
  }

  // Over the UI's 200-row page size, with a complete independently computed
  // expected scope. Targets have real Auth rows and normal role/grant triggers.
  const bulkPrefix = randomUUID();
  query(`insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
    select gen_random_uuid(),'bulk-'||${literal(bulkPrefix)}||'-'||n||'@example.invalid',clock_timestamp(),false,false from generate_series(1,205) n;
    insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
    select 'operator',id::text,email,'active',${literal(reason)},'local-test' from auth.users where email like ${literal(`bulk-${bulkPrefix}-%`)};
    insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason,expires_at,granted_by)
    select id::text,email,'audit_review','active',${literal(reason)},clock_timestamp()+interval '1 hour',${literal(owner.user)}
    from auth.users where email like ${literal(`bulk-${bulkPrefix}-%`)};`);
  const excluded = [];
  excluded.push(await grant(owner, target, 'dmca_review', null));
  const expired = await grant(owner, target, 'evidence_preview', new Date(Date.now() + 1000).toISOString());
  await waitUntil(() => query(`select expires_at<=clock_timestamp() from public.platform_staff_permission_grants where id=${literal(expired)};`) === 't', 'bulk expired exclusion');
  excluded.push(expired);
  const beforeRows = JSON.parse(query("select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]')::text from public.platform_staff_permission_grants g;"));
  const binding = await deviceContext(owner, 'bulk'), args = argumentsFor(binding, null, randomUUID(), 'bulk');
  const result = data(await owner.client.rpc('owner_security_revoke_grants', args), 'actual complete bulk revoke');
  const cutoff = Date.parse(result.scopeAsOf);
  const expected = beforeRows.filter(g => g.status === 'active' && Date.parse(g.granted_at) <= cutoff && Date.parse(g.updated_at) <= cutoff
    && (g.expires_at == null || Date.parse(g.expires_at) > cutoff)
    && (g.expires_at != null || g.target_email.trim().toLowerCase().startsWith('liveops.proof+') || g.metadata?.canary_proof === true || g.metadata?.cleanup_required === true))
    .map(g => g.id).sort();
  assert.ok(expected.length > 200); assert.equal(result.revokedCount, expected.length);
  assert.deepEqual([...result.grantIds].sort(), expected);
  for (const id of excluded) assert.equal(grantRow(id).status, 'active', 'permanent and expired rows excluded from bulk');
  assert.equal(query(`select count(*) from public.platform_staff_permission_grants where id=any(${literal(`{${expected.join(',')}}`)}::uuid[]) and status='active';`), '0');
  const afterBulk = snapshot();
  assert.deepEqual(data(await owner.client.rpc('owner_security_revoke_grants', args), 'bulk retry'), result);
  assert.equal(snapshot(), afterBulk);
  pass('bulk exceeds 200 rows, excludes permanent/expired and retries without duplicates');
}

async function runCanaryCases(t) {
  const {owner, target, noRole, noLegalOwner, admin, data, person, users, retainedClient,
    adapters, freshClient, query, literal, openSession, waitUntil, terminate, serviceClaims, pass, denied} = t;
  const begin = async actor => {
    const runId = randomUUID(), result = data(await actor.client.rpc('begin_admin_canary_run', {p_run_id: runId}), 'begin bounded actual canary run');
    assert.equal(result.runId, runId); assert.equal(result.status, 'open');
    assert.equal(Date.parse(result.deadline) - Date.parse(result.startedAt), 15 * 60_000, 'server fixed TTL');
    assert.deepEqual(result.users.map(row => row.label).sort(), ['admin', 'granted-admin', 'moderator', 'target-moderator', 'viewer']);
    assert.equal(new Set(result.users.map(row => row.userId)).size, 5);
    return result;
  };
  async function create(run, label, overrides = {}) {
    const exact = run.users.find(row => row.label === label); assert.ok(exact);
    const result = data(await admin.auth.admin.createUser({
      id: exact.userId, email: exact.email, password: `Local-${randomBytes(24).toString('hex')}!`, email_confirm: true,
      app_metadata: {canary_proof: true, canary_proof_run_id: run.runId, proof_label: label, ...overrides},
    }), 'actual exact preallocated canary Auth creation');
    users.push(result.user.id); assert.equal(result.user.id, exact.userId);
    return exact;
  }
  const register = (run, row) => admin.rpc('register_admin_canary_user', {p_run_id: run.runId, p_label: row.label, p_user_id: row.userId});
  const provision = (actor, run, label, role = null, permission = null) => actor.client.rpc('provision_admin_canary_fixture', {
    p_run_id: run.runId, p_label: label, p_role: role, p_permission_key: permission,
  });
  const manifest = async run => data(await admin.rpc('read_admin_canary_manifest', {p_run_id: run.runId}), 'real private manifest readback');
  const cleanup = run => admin.rpc('cleanup_admin_canary_run', {p_run_id: run.runId, p_reason: reason});
  const state = run => query(`select jsonb_build_object(
    'roles',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.platform_role_memberships r
      join private.admin_canary_fixture_roles f on f.role_id=r.id where f.run_id=${literal(run.runId)}),
    'grants',(select coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]') from public.platform_staff_permission_grants g
      join private.admin_canary_fixture_grants f on f.grant_id=g.id where f.run_id=${literal(run.runId)}),
    'run',(select to_jsonb(r) from private.admin_canary_fixture_runs r where r.run_id=${literal(run.runId)}),
    'audits',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]') from public.security_audit_events a where target_id=${literal(run.runId)}))::text;`);
  const allManifestState = () => query(`select jsonb_build_object(
    'runs',(select coalesce(jsonb_agg(to_jsonb(r) order by run_id),'[]') from private.admin_canary_fixture_runs r),
    'users',(select coalesce(jsonb_agg(to_jsonb(u) order by run_id,label),'[]') from private.admin_canary_fixture_users u),
    'roles',(select coalesce(jsonb_agg(to_jsonb(r) order by run_id,role_id),'[]') from private.admin_canary_fixture_roles r),
    'grants',(select coalesce(jsonb_agg(to_jsonb(g) order by run_id,grant_id),'[]') from private.admin_canary_fixture_grants g),
    'actualRoles',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.platform_role_memberships r),
    'actualGrants',(select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]') from public.platform_staff_permission_grants g),
    'audits',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.security_audit_events a))::text;`);
  const beforeInvalidRun = allManifestState();
  for (const id of invalidRequestIds) {
    const invalid = await owner.client.rpc('begin_admin_canary_run', {p_run_id: id});
    denied(invalid, 'admin_canary_run_id_invalid'); assert.equal(invalid.error.code, '22023');
    assert.equal(allManifestState(), beforeInvalidRun, 'unsupported UUID cannot poison private manifest or grant authority');
  }
  pass('canary rejects nil, v7 and bad-variant run UUIDs without manifest mutation');
  for (const actor of [noRole, noLegalOwner, target]) {
    denied(await actor.client.rpc('begin_admin_canary_run', {p_run_id: randomUUID()}),
      actor === target ? 'audit_review_required' : 'admin_mutation_staff_required');
    pass('unqualified actor cannot begin synthetic canary authority');
  }
  // Exercise the two physical orders of an in-flight GoTrue create and close.
  // Neither case substitutes an Auth outcome: the HTTP request reaches GoTrue,
  // and the database observer proves which independent backend is blocked.
  {
    const run = await begin(owner), planned = run.users.find(u => u.label === 'viewer');
    const name = `canary-close-holder-${randomUUID()}`;
    let holder, pending;
    try {
      holder = openSession(name, `begin;set local statement_timeout='35s';set local role service_role;
        set local request.jwt.claim.role='service_role';set local request.jwt.claims=${literal(JSON.stringify(serviceClaims))};
        select public.cleanup_admin_canary_run(${literal(run.runId)},${literal(reason)});select 'HOLDER_READY';`);
      await waitUntil(() => holder.output().includes('HOLDER_READY'), 'actual closed run transaction uncommitted');
      pending = admin.auth.admin.createUser({id: planned.userId, email: planned.email, email_confirm: true,
        password: `Local-${randomBytes(24).toString('hex')}!`,
        app_metadata: {canary_proof: true, canary_proof_run_id: run.runId, proof_label: planned.label}});
      await waitUntil(() => query(`select count(*) from pg_stat_activity w join pg_stat_activity h
        on h.application_name=${literal(name)} where w.datname=current_database() and h.datname=current_database()
        and w.usename='supabase_auth_admin' and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`) === '1',
      'actual GoTrue insert blocked by earlier cleanup transaction');
      holder.child.stdin.end('commit;\n\\q\n');
      const [held, result] = await Promise.all([holder.done, pending]);
      assert.equal(held.code, 0, safeError(held.stderr)); assert.ok(result.error, 'late Auth create must fail after close commits');
      assert.equal(query(`select count(*) from auth.users where id=${literal(planned.userId)};`), '0');
      assert.equal((await manifest(run)).status, 'closed');
      pass('real queued Auth create after close cannot leave a late proof user');
    } finally {
      await terminate(name, holder); if (pending) await Promise.allSettled([pending]);
    }
  }
  {
    const run = await begin(owner), planned = run.users.find(u => u.label === 'viewer');
    const name = `canary-auth-holder-${randomUUID()}`, suffix = randomUUID().replaceAll('-', ''), fn = `canary_auth_wait_${suffix}`;
    const lockKey = `canary-auth-after-insert:${suffix}`;
    let holder, pendingCreate, pendingCleanup;
    query(`create function private.${fn}() returns trigger language plpgsql as $$begin
      if new.id=${literal(planned.userId)}::uuid then perform pg_advisory_xact_lock(hashtextextended(${literal(lockKey)},0));end if;
      return new;end $$;create trigger ${fn} after insert on auth.users for each row execute function private.${fn}();`);
    try {
      holder = openSession(name, `begin;set local statement_timeout='35s';select pg_advisory_xact_lock(hashtextextended(${literal(lockKey)},0));select 'HOLDER_READY';`);
      await waitUntil(() => holder.output().includes('HOLDER_READY'), 'synthetic after-insert stop acquired');
      pendingCreate = admin.auth.admin.createUser({id: planned.userId, email: planned.email, email_confirm: true,
        password: `Local-${randomBytes(24).toString('hex')}!`,
        app_metadata: {canary_proof: true, canary_proof_run_id: run.runId, proof_label: planned.label}});
      const authPid = () => query(`select w.pid from pg_stat_activity w join pg_stat_activity h on h.application_name=${literal(name)}
        where w.datname=current_database() and h.datname=current_database() and w.usename='supabase_auth_admin'
        and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`);
      await waitUntil(() => /^[0-9]+$/u.test(authPid()), 'actual GoTrue insert holds run before commit');
      const pid = authPid();
      pendingCleanup = Promise.resolve(cleanup(run));
      await waitUntil(() => query(`select count(*) from pg_stat_activity w where w.datname=current_database()
        and w.pid<>${pid} and w.wait_event_type='Lock' and ${pid}=any(pg_blocking_pids(w.pid));`) === '1',
      'actual service cleanup queued behind GoTrue run lock');
      holder.child.stdin.end('commit;\n\\q\n');
      const [held, created, cleaned] = await Promise.all([holder.done, pendingCreate, pendingCleanup]);
      assert.equal(held.code, 0, safeError(held.stderr)); users.push(data(created, 'queued real Auth creation').user.id);
      const result = data(cleaned, 'queued real service cleanup');
      assert.equal(result.status, 'closed');
      assert.equal(result.users.find(u => u.userId === planned.userId).authPresent, true);
      assert.equal(result.users.find(u => u.userId === planned.userId).registered, true);
      pass('cleanup queued behind real Auth create recovers its exact committed identity');
    } finally {
      await terminate(name, holder);
      await Promise.allSettled([pendingCreate, pendingCleanup].filter(Boolean));
      query(`drop trigger ${fn} on auth.users;drop function private.${fn}();`);
    }
  }
  // Execute the production Edge fixture adapter itself against real SDK
  // clients, including Auth UUID/app_metadata, registration and account legal
  // acceptance ordering. A failed cleanup transaction cannot authorize delete.
  const edgeRun = await begin(owner), edgeScope = adapters.readCanaryProofScope(edgeRun, edgeRun.runId);
  const edgeViewer = await adapters.ensureProofUser(admin, freshClient(), edgeScope, 'viewer');
  users.push(edgeViewer.userId);
  assert.equal(edgeViewer.userId, edgeRun.users.find(u => u.label === 'viewer').userId);
  assert.equal((await manifest(edgeRun)).users.find(u => u.label === 'viewer').registered, true);
  const edgeFn = `edge_cleanup_fail_${randomUUID().replaceAll('-', '')}`;
  query(`create function private.${edgeFn}() returns trigger language plpgsql as $$begin
    if new.target_id=${literal(edgeRun.runId)} then raise exception 'edge_cleanup_injected_failure';end if;return new;end $$;
    create trigger ${edgeFn} before insert on public.security_audit_events for each row execute function private.${edgeFn}();`);
  try {
    const failed = await adapters.cleanupProofAccess(admin, edgeScope, reason);
    assert.equal(failed.ok, false); assert.equal(failed.activeCount, null);
    assert.equal(data(await admin.auth.admin.getUserById(edgeViewer.userId), 'cleanup denial preserves Auth identity').user.id, edgeViewer.userId);
  } finally { query(`drop trigger ${edgeFn} on public.security_audit_events;drop function private.${edgeFn}();`); }
  const edgeCleanup = await adapters.cleanupProofAccess(admin, edgeScope, reason);
  assert.equal(edgeCleanup.ok, true); assert.equal(edgeCleanup.activeCount, 0);
  assert.equal(query(`select count(*) from auth.users where id=${literal(edgeViewer.userId)};`), '0');
  assert.equal((await adapters.cleanupProofAccess(admin, edgeScope, reason)).ok, true);
  pass('actual Edge Auth/registration/legal adapter and cleanup deletion gate');
  const run = await begin(owner), retry = data(await owner.client.rpc('begin_admin_canary_run', {p_run_id: run.runId}), 'begin retry');
  assert.equal(retry.created, false); assert.equal(retry.startedAt, run.startedAt); assert.equal(retry.deadline, run.deadline);
  assert.deepEqual(retry.users, run.users);
  const other = await person('other-canary-owner', 'owner');
  denied(await other.client.rpc('begin_admin_canary_run', {p_run_id: run.runId}), 'admin_canary_actor_mismatch');
  denied(await admin.rpc('register_admin_canary_user', {
    p_run_id: run.runId, p_label: 'granted-admin', p_user_id: target.user,
  }), 'admin_canary_subject_mismatch');
  denied(await admin.rpc('register_admin_canary_user', {
    p_run_id: randomUUID(), p_label: 'granted-admin', p_user_id: target.user,
  }), 'admin_canary_run_not_found');
  const unregistered = run.users.find(row => row.label === 'granted-admin');
  denied(await provision(owner, run, unregistered.label, 'operator'), 'admin_canary_user_not_registered');
  pass('fixed bounded manifest, actor/run binding, real-user registration and missing-user denials');

  const row = await create(run, 'granted-admin');
  const registered = data(await register(run, row), 'register actual marked synthetic Auth subject');
  assert.equal(registered.userId, row.userId);
  assert.deepEqual(data(await register(run, row), 'idempotent registration'), registered);
  const role = data(await provision(owner, run, row.label, 'operator'), 'bounded actual operator fixture');
  const beforeRetry = state(run);
  assert.deepEqual(data(await provision(owner, run, row.label, 'operator'), 'role fixture retry'), role);
  assert.equal(state(run), beforeRetry, 'role retry cannot renew lifetime or repeat audit');
  for (const invalidRole of ['owner', 'super_admin']) denied(await provision(owner, run, row.label, invalidRole), 'admin_canary_fixture_scope_invalid');
  for (const invalidPermission of ['audit_review', 'security_review', 'admin_grants']) {
    denied(await provision(owner, run, row.label, null, invalidPermission), 'admin_canary_fixture_scope_invalid');
  }
  denied(await provision(other, run, row.label, 'operator'), 'admin_canary_actor_mismatch');
  const grantIds = [];
  for (const permission of ['legal_review', 'evidence_export', 'legal_hold', 'legal_request_intake', 'dmca_review']) {
    const granted = data(await provision(owner, run, row.label, null, permission), 'bounded actual scoped fixture');
    assert.equal(granted.deadline, run.deadline); grantIds.push(granted.grantId);
    const before = state(run);
    assert.deepEqual(data(await provision(owner, run, row.label, null, permission), 'scoped fixture retry'), granted);
    assert.equal(state(run), before, 'grant retry creates no renewal or repeated audit');
  }
  assert.equal(query(`select count(*) from public.platform_staff_permission_grants where id=any(${literal(`{${grantIds.join(',')}}`)}::uuid[])
    and expires_at=${literal(run.deadline)}::timestamptz and status='active';`), '5');
  assert.equal(query(`select expires_at=${literal(run.deadline)}::timestamptz from public.platform_role_memberships where id=${literal(role.roleId)};`), 't');
  pass('only bounded synthetic role/scope allowlist; exact immutable TTL and no retry renewal');
  const foreign = data(await owner.client.rpc('admin_grant_platform_staff_permission_by_email', {
    p_target_email: row.email, p_permission_key: 'audit_review', p_reason: reason, p_expires_at: run.deadline,
  }), 'independent canonical grant within synthetic deadline');
  const beforeForeignCleanup = state(run);
  denied(await cleanup(run), 'admin_canary_unregistered_authority');
  assert.equal(state(run), beforeForeignCleanup);
  assert.equal(query(`select status from public.platform_staff_permission_grants where id=${literal(foreign.id)};`), 'active',
    'cleanup cannot adopt or revoke foreign authority');
  data(await owner.client.rpc('admin_revoke_platform_staff_permission_by_email', {
    p_target_email: row.email, p_permission_key: 'audit_review', p_reason: reason,
  }), 'independent canonical producer retires its own foreign grant');
  pass('foreign active authority blocks canary cleanup without being adopted');

  // The manifest exists before Auth creation. A create that committed before
  // its response was lost is recovered by service cleanup without registration.
  const unacknowledged = await create(run, 'viewer');
  assert.equal((await manifest(run)).users.find(u => u.label === 'viewer').registered, false);
  // A real sink failure must roll back all earlier grant/role revocations.
  const suffix = randomUUID().replaceAll('-', ''), fn = `canary_cleanup_fail_${suffix}`;
  query(`create function private.${fn}() returns trigger language plpgsql as $$begin
    if new.target_id=${literal(run.runId)} then
     if exists(select 1 from public.platform_staff_permission_grants where id=any(${literal(`{${grantIds.join(',')}}`)}::uuid[]) and status='active')
      then raise exception 'fixture_cleanup_failure_preceded_revoke';end if;
     raise exception 'canary_injected_cleanup_audit';end if;return new;end $$;
    create trigger ${fn} before insert on public.security_audit_events for each row execute function private.${fn}();`);
  const beforeFailure = state(run);
  try {
    denied(await cleanup(run), 'canary_injected_cleanup_audit');
    assert.equal(state(run), beforeFailure, 'cleanup sink failure rolls back roles/grants/closed receipt');
  } finally { query(`drop trigger ${fn} on public.security_audit_events;drop function private.${fn}();`); }
  pass('canary cleanup audit failure atomically rolls back temporary authority');

  // Worker restart/stale actor cannot impede narrowly scoped service cleanup.
  const staleOwner = {...owner, client: retainedClient(owner)};
  data(await owner.client.auth.signOut({scope: 'global'}), 'end actual initiating actor session');
  denied(await provision(staleOwner, run, row.label, 'operator'), 'admin_mutation_current_session_required');
  const outsideBefore = query(`select coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]')::text from public.platform_staff_permission_grants g
    where id<>all(${literal(`{${grantIds.join(',')}}`)}::uuid[]);`);
  const cleaned = data(await cleanup(run), 'service cleanup after actor session ended');
  assert.equal(cleaned.ok, true); assert.equal(cleaned.status, 'closed'); assert.equal(cleaned.activeCount, 0);
  assert.equal(cleaned.revokedRoleCount, 1); assert.equal(cleaned.revokedGrantCount, 5);
  assert.equal(cleaned.users.find(u => u.userId === unacknowledged.userId).registered, true, 'uncertain Auth creation recovered by exact marker');
  assert.equal(cleaned.users.find(u => u.userId === unacknowledged.userId).authPresent, true, 'database cleanup does not delete Auth identity');
  assert.equal(query(`select coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]')::text from public.platform_staff_permission_grants g
    where id<>all(${literal(`{${grantIds.join(',')}}`)}::uuid[]);`), outsideBefore, 'cleanup cannot affect unrelated real subject grants');
  const closed = state(run);
  assert.deepEqual(data(await cleanup(run), 'restarted cleanup repeat'), cleaned); assert.equal(state(run), closed);
  denied(await other.client.rpc('admin_grant_platform_role_by_email', {
    p_target_email: row.email, p_role: 'operator', p_reason: reason,
    p_operation_key: `staff-role-grant:${randomUUID().replaceAll('-', '')}`,
  }), 'admin_canary_run_closed');
  assert.equal(state(run), closed, 'closed run fences later normal authority producers');
  pass('stale actor service cleanup recovers unacknowledged Auth user and repeats without side effects');

  // Preallocated subject ID is necessary but insufficient: server app_metadata
  // must bind the exact run and label. This fails even though the user is real.
  const mismatched = await begin(other), mismatchUser = await create(mismatched, 'admin', {canary_proof_run_id: randomUUID()});
  denied(await register(mismatched, mismatchUser), 'admin_canary_auth_identity_mismatch');
  denied(await cleanup(mismatched), 'admin_canary_auth_identity_mismatch');
  assert.equal(data(await admin.auth.admin.getUserById(mismatchUser.userId), 'mismatched subject remains intact').user.id, mismatchUser.userId);
  assert.equal(query(`select count(*) from private.admin_canary_fixture_roles where run_id=${literal(mismatched.runId)};`), '0');
  pass('wrong-run Auth marker cannot acquire authority or be swept by cleanup');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.deepEqual(process.argv.slice(2), ['--check-source'], 'run only through canonical generated-clone suite');
  actualCanaryAdapters();
  exactFormerStaffDefinitions();
  console.log('Owner Security actual Edge adapter source wiring: PASS; database qualification NOT RUN');
}
