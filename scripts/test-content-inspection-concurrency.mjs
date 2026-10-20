#!/usr/bin/env node
// Real PostgreSQL sessions and observed lock queues, never mocked authority.
// Only a generated disposable clone of a local Supabase CLI database is writable.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {randomUUID, createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

if (process.argv.includes('--help')) {
  console.log('After local Supabase reset, run node scripts/test-content-inspection-concurrency.mjs. Optional SUPABASE_DB_CONTAINER selects a local supabase_db_* CLI container. No remote URLs accepted; only a generated disposable clone is changed and dropped.');
  process.exit(0);
}
assert.equal(process.argv.length, 2, 'no database URLs or positional arguments accepted');
const root = process.cwd();
const project = readFileSync(path.join(root, 'supabase/config.toml'), 'utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"\s*(?:#.*)?$/mu)?.[1];
assert.ok(project, 'safe local Supabase project_id required');
const container = process.env.SUPABASE_DB_CONTAINER || `supabase_db_${project}`;
assert.match(container, /^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database = `inspection_queue_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
assert.match(database, /^inspection_queue_[0-9]+_[a-f0-9]{12}$/u);
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const psqlArgs = (target = database) => ['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', target];
const docker = (args, input, encoding = 'utf8') => spawnSync('docker', args, {cwd: root, input, encoding, maxBuffer: 256 * 1024 * 1024, timeout: 120_000});
const success = (result, label) => {
  assert.equal(result.status, 0, `${label}: ${result.error?.message || String(result.stderr || '').replaceAll(/[A-Za-z0-9_-]{40,}/gu, '<redacted>')}`);
  return result.stdout;
};
const query = (sql, target = database) => success(docker(psqlArgs(target), `${target === 'postgres' ? 'set default_transaction_read_only=on;' : ''}set statement_timeout='15s';set timezone='UTC';${sql}`), 'local PostgreSQL query').trim();
const admin = (args, input, encoding = 'utf8') => docker(['exec', ...(input === undefined ? [] : ['-i']), container, 'sh', '-lc', 'PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"', 'inspection-queue-admin', ...args], input, encoding);
const claims = person => `set local role authenticated;set local request.jwt.claim.role='authenticated';set local request.jwt.claims=${literal(JSON.stringify({role: 'authenticated', sub: person.user, session_id: person.session, email: person.email}))};`;
const reason = 'Synthetic concurrency inspection';
const readCall = (fixture, request) => `select public.admin_read_content_inspection(${literal(fixture.context)},'profile_post',${literal(fixture.target)},${literal(reason)},${literal(request)})::text;`;
const revokeCall = (fixture, request) => `select public.admin_revoke_content_inspection_access(${literal(fixture.grant)},${literal(reason)},${literal(request)})::text;`;
const invoke = (person, sql) => JSON.parse(query(`begin;${claims(person)}${sql}commit;`));
let checks = 0;

function openSession(name, sql, finish = false) {
  const child = spawn('docker', psqlArgs(), {cwd: root, stdio: ['pipe', 'pipe', 'pipe']});
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', value => { stdout += value; });
  child.stderr.on('data', value => { stderr += value; });
  const done = new Promise(resolve => {
    child.on('error', error => resolve({code: -1, stdout, stderr: error.message}));
    child.on('close', code => resolve({code, stdout, stderr}));
  });
  // Do not leave an idle transaction forever if an assertion or runner fails.
  child.stdin.on('error', () => {});
  child.stdin.write(`set application_name=${literal(name)};set timezone='UTC';begin;set local statement_timeout='40s';set local idle_in_transaction_session_timeout='60s';${sql}\n`);
  if (finish) child.stdin.end('commit;\n\\q\n');
  return {child, done, output: () => stdout};
}
async function waitUntil(predicate, label) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) { if (predicate()) return; await delay(25); }
  throw new Error(`inspection queue timeout: ${label}`);
}
async function terminate(name, session) {
  if (!session || session.child.exitCode !== null) return;
  query(`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name=${literal(name)} and pid<>pg_backend_pid();`);
  session.child.kill('SIGTERM');
  await Promise.race([session.done, delay(1000)]);
}
function blocked(holder, waiter) {
  return query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${literal(holder)}
    where w.datname=current_database() and h.datname=current_database() and w.application_name=${literal(waiter)}
    and w.pid<>h.pid and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`) === '1';
}
function seedPerson(role) {
  const person = {user: randomUUID(), session: randomUUID(), role};
  person.email = `inspection-${person.user}@example.test`;
  query(`insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values(${literal(person.user)},${literal(person.email)},now(),false,false);
    insert into auth.sessions(id,user_id,not_after) values(${literal(person.session)},${literal(person.user)},now()+interval '1 day');
    insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
    select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,
      coalesce(nullif(lower(trim(p.channel_role)),''),'member'),d.capability,s.id::text,'service_reconciliation'
    from auth.sessions s left join public.user_profiles p on p.user_id=s.user_id::text
    cross join public.wave1_legal_document_versions d where s.id=${literal(person.session)}
      and d.active and d.market='UNITED_STATES' and d.capability='account';
    ${role ? `insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
      values(${literal(role)},${literal(person.user)},${literal(person.email)},'active','Synthetic inspection fixture','test');` : ''}`);
  return person;
}
function seedFixture() {
  const owner = seedPerson('owner'), operator = seedPerson('operator'), author = seedPerson();
  const target = randomUUID(), body = `Exact synthetic stored body ${target}\n`;
  query(`insert into public.profile_posts(id,user_id,body,visibility,moderation_status,deleted_at)
    values(${literal(target)},${literal(author.user)},${literal(body)},'draft','removed',clock_timestamp());`);
  const context = invoke(owner, `select public.admin_create_content_inspection_context(${literal(reason)},${literal(JSON.stringify([{targetType: 'profile_post', targetId: target}]))}::jsonb,${literal(randomUUID())})::text;`).contextId;
  const grant = invoke(owner, `select public.admin_grant_content_inspection_access(${literal(context)},'profile_post',${literal(target)},${literal(operator.user)},clock_timestamp()+interval '1 hour',${literal(reason)},${literal(randomUUID())})::text;`).grantId;
  assert.ok(context && grant, 'real public RPCs create context and delegated grant');
  const fixture = {owner, operator, author, target, body, context, grant};
  assert.equal(invoke(operator, readCall(fixture, randomUUID())).content.body, body, 'real authority helpers accept legal/session fixture');
  return fixture;
}
const events = fixture => JSON.parse(query(`select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb)::text from private.content_inspection_access_events e where context_id=${literal(fixture.context)};`));
function assertRead(result, fixture) {
  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim().split('\n').find(line => line.startsWith('{')));
  assert.equal(payload.content.body, fixture.body, 'exact current stored content returned');
  assert.equal(payload.contextId, fixture.context);
  assert.equal(payload.targetId, fixture.target);
  assert.equal(payload.availability, 'available');
  assert.ok(payload.storedVersion, 'returned content has a current version token');
  return payload;
}
function assertDenied(result, fixture) {
  assert.notEqual(result.code, 0, 'invalid authority must fail');
  assert.match(result.stderr, /ERROR:\s+content_inspection_denied(?:\r?\n|$)/u, 'authority denial, not infrastructure error');
  assert.ok(!result.stdout.includes(fixture.body.trim()), 'denied call emits no content');
  assert.ok(!result.stdout.includes('"content"'), 'denied call emits no result envelope');
}
function assertReadEvent(fixture, request, payload) {
  const matching = events(fixture).filter(event => event.request_id === request);
  assert.equal(matching.length, 1, 'one committed read event');
  const event = matching[0];
  assert.deepEqual([event.actor,event.session_id,event.actor_role,event.operation,event.target_type,event.target_id,event.grant_id,Number(event.grant_revision),event.result],
    [fixture.operator.user,fixture.operator.session,'operator','read','profile_post',fixture.target,fixture.grant,1,'available']);
  assert.ok(event.stored_version, 'event binds returned stored version');
  assert.equal(event.stored_version, payload.storedVersion, 'audit version equals exact delivered version');
}

async function orderingCase(readFirst) {
  const fixture = seedFixture(), readRequest = randomUUID(), revokeRequest = randomUUID();
  const holderName = `inspection-order-holder-${checks}-${process.pid}`, waiterName = `inspection-order-waiter-${checks}-${process.pid}`;
  let holder, waiter;
  try {
    holder = openSession(holderName, `${claims(readFirst ? fixture.operator : fixture.owner)}${readFirst ? readCall(fixture, readRequest) : revokeCall(fixture, revokeRequest)}select 'HOLDER_READY';`);
    await waitUntil(() => holder.output().includes('HOLDER_READY'), 'first real RPC finished but transaction uncommitted');
    waiter = openSession(waiterName, `${claims(readFirst ? fixture.owner : fixture.operator)}${readFirst ? revokeCall(fixture, revokeRequest) : readCall(fixture, readRequest)}`, true);
    await waitUntil(() => blocked(holderName, waiterName), 'second RPC blocked by first RPC on another backend');
    holder.child.stdin.end('commit;\n\\q\n');
    const [first, second] = await Promise.all([holder.done, waiter.done]);
    assert.equal(first.code, 0, first.stderr);
    if (readFirst) { const payload = assertRead(first, fixture); assert.equal(second.code, 0, second.stderr); assertReadEvent(fixture, readRequest, payload); }
    else { assertDenied(second, fixture); assert.equal(events(fixture).filter(event => event.request_id === readRequest).length, 0); }
    const revokes = events(fixture).filter(event => event.request_id === revokeRequest);
    assert.equal(revokes.length, 1, 'one committed revoke event');
    assert.equal(revokes[0].operation, 'revoke');
    assert.equal(Number(revokes[0].grant_revision), 2);
    assert.equal(query(`select revoked_at is not null and revision=2 from private.content_inspection_grants where id=${literal(fixture.grant)};`), 't');
    checks++; console.log(`PASS ${readFirst ? 'read then revoke: first read completes, revoke waits' : 'revoke then read: queued read denied without event'}`);
  } finally { await terminate(holderName, holder); await terminate(waiterName, waiter); }
}

function expiryDescriptor(change, fixture, actor) {
  if (change === 'grant-expiry') return {table: 'private.content_inspection_grants', column: 'expires_at', where: `id=${literal(fixture.grant)}`};
  if (change === 'role-expiry') return {table: 'public.platform_role_memberships', column: 'expires_at', where: `user_id=${literal(actor.user)} and role=${literal(actor.role)}`};
  return {table: 'auth.sessions', column: 'not_after', where: `id=${literal(actor.session)}`};
}
async function queueCase({boundary = 'context', change = 'none', owner = false}) {
  const fixture = seedFixture(), actor = owner ? fixture.owner : fixture.operator, request = randomUUID();
  const holderName = `inspection-holder-${checks}-${process.pid}`, waiterName = `inspection-waiter-${checks}-${process.pid}`;
  const before = events(fixture);
  let holder, waiter, descriptor;
  try {
    holder = openSession(holderName, `${boundary === 'audit'
      ? 'lock table private.content_inspection_access_events in share mode;'
      : `select id from private.content_inspection_contexts where id=${literal(fixture.context)} for update;`}select 'HOLDER_READY';`);
    await waitUntil(() => holder.output().includes('HOLDER_READY'), 'holder ready');
    // In the audit case the function has copied the grant row before it waits.
    // Establish a real finite lifetime BEFORE that copy, then observe expiry.
    if (boundary === 'audit' && change.endsWith('-expiry')) {
      descriptor = expiryDescriptor(change, fixture, actor);
      query(`update ${descriptor.table} set ${descriptor.column}=clock_timestamp()+interval '8 seconds' where ${descriptor.where};`);
    }
    waiter = openSession(waiterName, `${claims(actor)}${readCall(fixture, request)}`, true);
    await waitUntil(() => blocked(holderName, waiterName), 'exact holder PID blocking independent read backend');
    if (change === 'session-revoke') {
      assert.equal(query(`delete from auth.sessions where id=${literal(actor.session)} returning id;`), actor.session);
    } else if (change.endsWith('-expiry')) {
      descriptor ??= expiryDescriptor(change, fixture, actor);
      if (boundary !== 'audit') query(`update ${descriptor.table} set ${descriptor.column}=clock_timestamp()+interval '500 milliseconds' where ${descriptor.where};`);
      assert.equal(query(`select w.xact_start<t.${descriptor.column} from pg_stat_activity w cross join ${descriptor.table} t
        where w.datname=current_database() and w.application_name=${literal(waiterName)} and ${descriptor.where};`), 't', 'queued transaction started before expiry');
      await waitUntil(() => query(`select clock_timestamp()>=${descriptor.column} from ${descriptor.table} where ${descriptor.where};`) === 't', 'wall-clock authority expiry observed');
    }
    assert.equal(blocked(holderName, waiterName), true, 'read remains blocked after independent authority change');
    holder.child.stdin.end('commit;\n\\q\n');
    const [held, result] = await Promise.all([holder.done, waiter.done]);
    assert.equal(held.code, 0, held.stderr);
    if (change === 'none') {
      const payload = assertRead(result, fixture);
      if (owner) assert.deepEqual(events(fixture), before, 'exact Owner view is inspection-event exempt');
      else { assertReadEvent(fixture, request, payload); assert.equal(events(fixture).length, before.length + 1); }
    } else {
      assertDenied(result, fixture);
      assert.deepEqual(events(fixture), before, 'denial rolls back any attempted access event');
    }
    checks++; console.log(`PASS ${owner ? 'Owner' : 'operator'} ${boundary} queue ${change}`);
  } finally { await terminate(holderName, holder); await terminate(waiterName, waiter); }
}

function addRole(person, role) {
  query(`insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
    values(${literal(role)},${literal(person.user)},${literal(person.email)},'active','Synthetic transition fixture','test');`);
}

async function roleTransitionCase(promoteAuthor) {
  const fixture = seedFixture();
  let actor = fixture.owner;
  if (promoteAuthor) {
    actor = seedPerson('super_admin');
    fixture.context = invoke(actor, `select public.admin_create_content_inspection_context(${literal(reason)},
      ${literal(JSON.stringify([{targetType: 'profile_post', targetId: fixture.target}]))}::jsonb,${literal(randomUUID())})::text;`).contextId;
    assert.equal(invoke(actor, readCall(fixture, randomUUID())).content.body, fixture.body, 'Super Admin can initially read own context');
  } else {
    addRole(actor, 'super_admin');
    assert.equal(invoke(actor, readCall(fixture, randomUUID())).content.body, fixture.body, 'Owner initially takes highest-role exemption despite additional Super Admin role');
  }
  const before = events(fixture), request = randomUUID();
  const holderName = `inspection-transition-holder-${checks}-${process.pid}`, waiterName = `inspection-transition-waiter-${checks}-${process.pid}`;
  let holder, waiter;
  try {
    holder = openSession(holderName, `${promoteAuthor
      ? 'lock table private.content_inspection_access_events in share mode;'
      : 'lock table public.profile_posts in access exclusive mode;'}select 'HOLDER_READY';`);
    await waitUntil(() => holder.output().includes('HOLDER_READY'), 'transition lock holder ready');
    waiter = openSession(waiterName, `${claims(actor)}${readCall(fixture, request)}`, true);
    await waitUntil(() => blocked(holderName, waiterName), 'read reached exact post-authority audit/source lock');
    if (promoteAuthor) {
      addRole(fixture.author, 'owner');
      assert.equal(query(`select count(*) from public.platform_role_memberships where user_id=${literal(fixture.author.user)} and role='owner' and status='active';`), '1', 'source author promotion committed independently');
    } else {
      assert.equal(query(`update public.platform_role_memberships set status='revoked' where user_id=${literal(actor.user)} and role='owner' returning status;`), 'revoked', 'Owner revocation committed while source read waits');
      assert.equal(query(`select count(*) from public.platform_role_memberships where user_id=${literal(actor.user)} and role='super_admin' and status='active';`), '1', 'caller still has live Super Admin fallback');
    }
    assert.equal(blocked(holderName, waiterName), true, 'source/audit lock still holds after role transition');
    holder.child.stdin.end('commit;\n\\q\n');
    const [held, result] = await Promise.all([holder.done, waiter.done]);
    assert.equal(held.code, 0, held.stderr);
    assertDenied(result, fixture);
    assert.deepEqual(events(fixture), before, 'transition denial releases no content and commits no access event');
    checks++; console.log(`PASS ${promoteAuthor ? 'Super Admin audit wait: source author promoted Owner' : 'Owner source wait: exact highest role downgraded to Super Admin'}`);
  } finally { await terminate(holderName, holder); await terminate(waiterName, waiter); }
}

function seedMediaFixture() {
  const owner = seedPerson('owner'), author = seedPerson(), target = randomUUID();
  const objectKey = `${author.user}/${target}/source.mp4`;
  query(`insert into public.media_upload_reservations(owner_user_id,surface_type,storage_provider,storage_bucket,storage_object_key,
    expected_mime_type,expected_size_bytes,status,expires_at,observed_mime_type,observed_size_bytes,verified_at)
    values(${literal(author.user)},'creator_video','cloudflare_r2','chillywood-media-origin',${literal(objectKey)},
      'video/mp4',1024,'verified',now()+interval '1 hour','video/mp4',1024,now());
    insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes)
    values(${literal(target)},${literal(author.user)},'Synthetic original','draft','clean','cloudflare_r2','chillywood-media-origin',
      ${literal(objectKey)},${literal(objectKey)},'video/mp4',1024);`);
  assert.equal(query(`begin;${claims(author)}select public.consume_verified_media_upload('creator_video','cloudflare_r2','chillywood-media-origin',
    ${literal(objectKey)},'video/mp4',1024,${literal(target)});commit;`), 't', 'real verified reservation consumed');
  assert.equal(query(`select count(*) from public.media_scan_jobs where target_table='videos' and target_column='source' and target_id=${literal(target)};`), '1', 'one real source scan job');
  query(`begin;set local role service_role;set local request.jwt.claims='{"role":"service_role"}';
    select public.complete_media_scan_job((select id from public.media_scan_jobs where target_table='videos' and target_column='source'
      and target_id=${literal(target)}),'clean','clamav','synthetic','synthetic-signatures',null,null,5);commit;`);
  assert.equal(query(`select scan_status from public.videos where id=${literal(target)};`), 'clean', 'real scanner propagated clean source');
  const context = invoke(owner, `select public.admin_create_content_inspection_context(${literal(reason)},
    ${literal(JSON.stringify([{targetType: 'creator_video', targetId: target}]))}::jsonb,${literal(randomUUID())})::text;`).contextId;
  const receipt = invoke(owner, `select public.admin_prepare_content_inspection_media(${literal(context)},'creator_video',${literal(target)},${literal(reason)},${literal(randomUUID())})::text;`);
  assert.equal(receipt.availability, 'ready', 'real clean, reserved media preparation is ready');
  return {owner, target, objectKey, context, receipt};
}

async function metadataAuthorityCase(operation, change) {
  const fixture = seedFixture(), actor = fixture.owner;
  addRole(actor, 'super_admin');
  const request = randomUUID();
  const call = id => operation === 'list_contexts'
    ? `select public.admin_list_content_inspection_contexts(${literal(reason)},${literal(id)})::text;`
    : `select public.admin_list_content_inspection_scope(${literal(fixture.context)},${literal(reason)},${literal(id)})::text;`;
  const positive = invoke(actor, call(randomUUID()));
  if (operation === 'list_contexts') {
    assert.equal(positive.accessAuditMode, 'owner_view_exempt', 'positive metadata call uses exact Owner exemption');
    assert.equal(positive.canDelegate, true);
  } else {
    assert.ok(positive.targets.some(target => target.targetId === fixture.target), 'positive Owner scope includes exact target');
    assert.ok(positive.grants.some(grant => grant.grantId === fixture.grant), 'positive Owner scope includes exact delegated grant');
  }
  const actorEvents = () => query(`select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb)::text
    from private.content_inspection_access_events e where actor=${literal(actor.user)};`);
  const before = actorEvents();
  const holderName = `inspection-metadata-holder-${checks}-${process.pid}`, waiterName = `inspection-metadata-waiter-${checks}-${process.pid}`;
  // Context-list actor/audit checks precede its first context SELECT. Scope-list
  // locks the context before actor checks, so block its later target SELECT.
  const relation = operation === 'list_contexts' ? 'private.content_inspection_contexts' : 'private.content_inspection_context_targets';
  let holder, waiter;
  try {
    holder = openSession(holderName, `lock table ${relation} in access exclusive mode;select 'HOLDER_READY';`);
    await waitUntil(() => holder.output().includes('HOLDER_READY'), 'metadata source lock ready');
    waiter = openSession(waiterName, `${claims(actor)}${call(request)}`, true);
    await waitUntil(() => blocked(holderName, waiterName), 'metadata SELECT reached source lock after actor/audit checks');
    assert.equal(query(`select count(*) from pg_locks l join pg_stat_activity s on s.pid=l.pid
      where s.datname=current_database() and s.application_name=${literal(waiterName)} and l.relation=${literal(relation)}::regclass
      and l.mode='AccessShareLock' and not l.granted;`), '1', 'exact metadata SELECT relation is blocked');
    if (change === 'session-revoke') {
      assert.equal(query(`delete from auth.sessions where id=${literal(actor.session)} returning id;`), actor.session, 'exact caller session deleted independently');
    } else {
      assert.equal(query(`update public.platform_role_memberships set status='revoked' where user_id=${literal(actor.user)} and role='owner' returning status;`), 'revoked', 'Owner revoked after metadata actor decision');
      assert.equal(query(`select count(*) from public.platform_role_memberships where user_id=${literal(actor.user)} and role='super_admin' and status='active';`), '1', 'live Super Admin fallback retained');
    }
    assert.equal(blocked(holderName, waiterName), true, 'metadata source remains blocked after independent authority mutation');
    holder.child.stdin.end('commit;\n\\q\n');
    const [held, result] = await Promise.all([holder.done, waiter.done]);
    assert.equal(held.code, 0, held.stderr);
    assertDenied(result, fixture);
    assert.ok(!result.stdout.includes('"contexts"') && !result.stdout.includes('"targets"') && !result.stdout.includes('"grants"'), 'no privileged metadata envelope escapes');
    assert.equal(actorEvents(), before, 'failed Owner metadata view leaves inspection events unchanged, including context-null list events');
    checks++; console.log(`PASS ${operation} post-actor SELECT wait: ${change === 'session-revoke' ? 'session deleted' : 'Owner downgraded to Super Admin'}`);
  } finally { await terminate(holderName, holder); await terminate(waiterName, waiter); }
}

async function resolverExpiryCase() {
  const fixture = seedMediaFixture();
  const authorization = invoke(fixture.owner, `select public.admin_authorize_content_inspection_media(${literal(fixture.receipt.receiptId)},
    ${literal(randomUUID())},${literal(fixture.receipt.storedVersion)})::text;`);
  assert.equal(authorization.allowed, true);
  const before = events(fixture);
  const holderName = `inspection-resolver-holder-${checks}-${process.pid}`, waiterName = `inspection-resolver-waiter-${checks}-${process.pid}`;
  let holder, waiter;
  try {
    // Exact Owner receipt skips protected-author lookup in receipt_valid, so
    // this lock is first encountered by binding AFTER the initial expiry test.
    holder = openSession(holderName, "lock table public.videos in access exclusive mode;select 'HOLDER_READY';");
    await waitUntil(() => holder.output().includes('HOLDER_READY'), 'media source lock ready');
    waiter = openSession(waiterName, `set local role service_role;set local request.jwt.claims='{"role":"service_role"}';
      select public.admin_resolve_content_inspection_media(${literal(authorization.authorizationId)},${literal(fixture.owner.user)},${literal(fixture.owner.session)})::text;`, true);
    await waitUntil(() => blocked(holderName, waiterName), 'real service resolver blocked on source binding');
    assert.equal(query(`select w.xact_start<a.expires_at from pg_stat_activity w cross join private.content_inspection_media_authorizations a
      where w.datname=current_database() and w.application_name=${literal(waiterName)} and a.id=${literal(authorization.authorizationId)};`), 't', 'resolver began before five-second expiry');
    await waitUntil(() => query(`select clock_timestamp()>=expires_at from private.content_inspection_media_authorizations where id=${literal(authorization.authorizationId)};`) === 't', 'five-second authorization expired while source lookup blocked');
    assert.equal(blocked(holderName, waiterName), true, 'resolver still blocked after expiry');
    holder.child.stdin.end('commit;\n\\q\n');
    const [held, result] = await Promise.all([holder.done, waiter.done]);
    assert.equal(held.code, 0, held.stderr);
    assert.notEqual(result.code, 0, 'expired queued resolver must fail');
    assert.match(result.stderr, /ERROR:\s+content_inspection_denied(?:\r?\n|$)/u);
    assert.ok(!result.stdout.includes(fixture.objectKey) && !result.stdout.includes('"objectKey"'), 'expired resolver emits no locator');
    assert.equal(query(`select consumed_at is null from private.content_inspection_media_authorizations where id=${literal(authorization.authorizationId)};`), 't', 'failed final check rolls back consumption');
    assert.deepEqual(events(fixture), before, 'expired resolver creates no inspection event');
    checks++; console.log('PASS service resolver source wait: five-second authorization expiry denies locator and rolls back consumption');
  } finally { await terminate(holderName, holder); await terminate(waiterName, waiter); }
}

async function scopeRetainedTargetExpiryCase() {
  const fixture = seedFixture(), media = seedMediaFixture();
  const targets = [{targetType: 'profile_post', targetId: fixture.target}, {targetType: 'creator_video', targetId: media.target}];
  fixture.context = invoke(fixture.owner, `select public.admin_create_content_inspection_context(${literal(reason)},${literal(JSON.stringify(targets))}::jsonb,${literal(randomUUID())})::text;`).contextId;
  const grantTarget = target => invoke(fixture.owner, `select public.admin_grant_content_inspection_access(${literal(fixture.context)},
    ${literal(target.targetType)},${literal(target.targetId)},${literal(fixture.operator.user)},clock_timestamp()+interval '1 hour',
    ${literal(reason)},${literal(randomUUID())})::text;`).grantId;
  fixture.grant = grantTarget(targets[0]);
  const videoGrant = grantTarget(targets[1]);
  const call = request => `select public.admin_list_content_inspection_scope(${literal(fixture.context)},${literal(reason)},${literal(request)})::text;`;
  const positive = invoke(fixture.operator, call(randomUUID()));
  assert.equal(positive.targets.length, 2, 'operator initially sees both exact target grants');
  assert.equal(positive.grants.length, 2);
  const before = events(fixture), request = randomUUID();
  const sequential = 'set local enable_seqscan=on;set local enable_indexscan=off;set local enable_indexonlyscan=off;set local enable_bitmapscan=off;set local max_parallel_workers_per_gather=0;set local synchronize_seqscans=off;';
  // Inspect the same target predicate used by the real RPC, with literal values
  // substituted for its PL/pgSQL parameters. EXPLAIN never replaces the RPC.
  // Match the RPC's definer execution role for EXPLAIN; retain caller JWT claims.
  const definerClaims = claims(fixture.operator).replace('set local role authenticated;', '');
  const plan = JSON.parse(query(`begin;${definerClaims}${sequential}explain(format json,costs off)
    select coalesce(jsonb_agg(jsonb_build_object('targetType',t.target_type,'targetId',t.target_id) order by t.target_type,t.target_id),'[]'::jsonb)
    from private.content_inspection_context_targets t where t.context_id=${literal(fixture.context)}
      and (private.content_inspection_context_owned(${literal(fixture.context)},'operator') or exists(
        select 1 from private.content_inspection_grants g where g.context_id=t.context_id and g.target_type=t.target_type
          and g.target_id=t.target_id and private.content_inspection_grant_valid(g)));commit;`));
  const nodes = [];
  const visit = node => { nodes.push(node); for (const child of node.Plans || []) visit(child); };
  visit(plan[0].Plan);
  for (const relation of ['content_inspection_context_targets', 'content_inspection_grants']) {
    assert.ok(nodes.some(node => node['Node Type'] === 'Seq Scan' && node['Relation Name'] === relation), `ordered fixture requires sequential ${relation} scan`);
  }
  assert.ok(!nodes.some(node => /Index|Bitmap|Gather/u.test(node['Node Type'])), 'no index, bitmap or parallel scan can change fixture visit order');
  const holderName = `inspection-retained-target-holder-${checks}-${process.pid}`, waiterName = `inspection-retained-target-waiter-${checks}-${process.pid}`;
  let holder, waiter;
  try {
    holder = openSession(holderName, "lock table public.videos in access exclusive mode;select 'HOLDER_READY';");
    await waitUntil(() => holder.output().includes('HOLDER_READY'), 'second target source barrier ready');
    // UPDATE can move heap tuples. Move both in the same intended scan order
    // and assert physical order before starting the real list_scope RPC.
    query(`update private.content_inspection_grants set expires_at=clock_timestamp()+interval '8 seconds' where id=${literal(fixture.grant)};
      update private.content_inspection_grants set expires_at=clock_timestamp()+interval '1 hour' where id=${literal(videoGrant)};`);
    assert.deepEqual(JSON.parse(query(`select jsonb_agg(target_id order by ctid)::text from private.content_inspection_context_targets where context_id=${literal(fixture.context)};`)),
      [fixture.target, media.target], 'target heap visit order is profile then video');
    assert.deepEqual(JSON.parse(query(`select jsonb_agg(id order by ctid)::text from private.content_inspection_grants where context_id=${literal(fixture.context)};`)),
      [fixture.grant, videoGrant], 'initial EXISTS encounters valid profile grant before video grant');
    waiter = openSession(waiterName, `${claims(fixture.operator)}${sequential}${call(request)}`, true);
    await waitUntil(() => blocked(holderName, waiterName), 'real scope target projection reaches second source videos barrier');
    assert.equal(query(`select count(*) from pg_locks l join pg_stat_activity s on s.pid=l.pid
      where s.datname=current_database() and s.application_name=${literal(waiterName)} and l.relation='public.videos'::regclass
        and l.mode='AccessShareLock' and not l.granted;`), '1', 'exact second source SELECT is blocked');
    // A committed row is deliberately not required here: its INSERT belongs to
    // the blocked RPC and must remain invisible until that RPC succeeds.
    assert.equal(query(`select count(*) from pg_locks l join pg_stat_activity s on s.pid=l.pid
      where s.datname=current_database() and s.application_name=${literal(waiterName)}
        and l.relation='private.content_inspection_access_events'::regclass and l.mode='RowExclusiveLock' and l.granted;`), '1',
      'waiter passed initial grant EXISTS and inserted audit before reaching target projection');
    assert.equal(query(`select expires_at>clock_timestamp() from private.content_inspection_grants where id=${literal(fixture.grant)};`), 't', 'first target grant still valid when second target blocks');
    await waitUntil(() => query(`select expires_at<=clock_timestamp() from private.content_inspection_grants where id=${literal(fixture.grant)};`) === 't', 'first accepted target grant expires while later source projection is blocked');
    assert.equal(query(`select c.status='open' and g.revoked_at is null and g.expires_at>clock_timestamp()
      from private.content_inspection_contexts c join private.content_inspection_grants g on g.context_id=c.id
      where c.id=${literal(fixture.context)} and g.id=${literal(videoGrant)};`), 't', 'other grant and open context remain valid');
    assert.equal(blocked(holderName, waiterName), true, 'second source barrier persists through first grant expiry');
    holder.child.stdin.end('commit;\n\\q\n');
    const [held, result] = await Promise.all([holder.done, waiter.done]);
    assert.equal(held.code, 0, held.stderr);
    assertDenied(result, fixture);
    assert.ok(!result.stdout.includes('"targets"') && !result.stdout.includes('"grants"'), 'expired retained target cannot escape in metadata');
    assert.deepEqual(events(fixture), before, 'denied mixed-expiry scope rolls back its inserted access event');
    const after = invoke(fixture.operator, call(randomUUID()));
    assert.deepEqual(after.targets, [{targetType: 'creator_video', targetId: media.target}], 'fresh scope still succeeds for exactly the surviving grant');
    assert.equal(after.grants.length, 1);
    assert.equal(after.grants[0].grantId, videoGrant);
    checks++; console.log('PASS scope retained target expiry: earlier projected target expires during later source wait; final exact-target guard denies and audit rolls back');
  } finally { await terminate(holderName, holder); await terminate(waiterName, waiter); }
}

const migration = readFileSync(path.join(root, 'supabase/migrations/20261020010608_owner_content_inspection_disabled.sql'), 'utf8');
const fingerprintSql = `select jsonb_build_object('users',(select count(*) from auth.users),'sessions',(select count(*) from auth.sessions),
  'roles',(select count(*) from public.platform_role_memberships),'posts',(select count(*) from public.profile_posts),
  'settings',(select jsonb_agg(to_jsonb(s)) from private.content_inspection_settings s),
  'contexts',(select count(*) from private.content_inspection_contexts),'grants',(select count(*) from private.content_inspection_grants),
  'events',(select count(*) from private.content_inspection_access_events),
  'read',md5(pg_get_functiondef('public.admin_read_content_inspection(uuid,text,text,text,uuid)'::regprocedure)))::text;`;
let cloned = false, sourceFingerprint;
try {
  if (process.env.DOCKER_HOST) assert.match(process.env.DOCKER_HOST, /^(unix|npipe):\/\//u, 'remote Docker forbidden');
  assert.match(success(docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']), 'local Docker required').trim(), /^(unix|npipe):\/\//u, 'remote Docker context forbidden');
  const containers = success(docker(['ps', '--filter', 'label=com.supabase.cli.project', '--format', '{{.Names}}']), 'local CLI discovery').trim().split('\n');
  assert.ok(containers.includes(container), 'selected local Supabase CLI database must be running');
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261020010608');", 'postgres'), 't', 'reset local source through inspection migration first');
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261020011354');", 'postgres'), 't', 'reset local source through verified media migration first');
  sourceFingerprint = query(fingerprintSql, 'postgres');
  success(docker(['exec', container, 'createdb', '-U', 'postgres', '-T', 'template0', database]), 'create only generated disposable clone'); cloned = true;
  success(docker(psqlArgs(), 'create schema vault;create extension supabase_vault with schema vault;'), 'initialize clone extension');
  const dump = admin(['pg_dump', '-U', 'supabase_admin', '--exclude-extension=pg_cron', '--exclude-extension=supabase_vault', '--exclude-extension=pg_graphql', '--exclude-schema=cron', '--exclude-schema=realtime', '--exclude-schema=_realtime', '--exclude-schema=vault', '--exclude-schema=graphql', '--exclude-schema=graphql_public', 'postgres'], undefined, null);
  success(dump, 'read-only local source export');
  success(admin(['psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', database], dump.stdout, null), 'restore disposable clone');
  assert.equal(query('select not enabled from private.content_inspection_settings where singleton;'), 't', 'source-only feature must start disabled');
  query('update private.content_inspection_settings set enabled=true where singleton;');
  await orderingCase(true);
  await orderingCase(false);
  for (const owner of [false, true]) {
    for (const change of ['none', 'session-expiry', 'session-revoke', 'role-expiry']) await queueCase({owner, change});
  }
  for (const change of ['none', 'grant-expiry', 'session-expiry', 'role-expiry']) await queueCase({boundary: 'audit', change});
  await roleTransitionCase(true);
  await roleTransitionCase(false);
  await resolverExpiryCase();
  for (const operation of ['list_contexts', 'list_scope']) {
    for (const change of ['role-downgrade', 'session-revoke']) await metadataAuthorityCase(operation, change);
  }
  await scopeRetainedTargetExpiryCase();
  assert.equal(checks, 22, 'every declared two-backend queue case executed');
  console.log(`Inspection native PostgreSQL: ${checks} deterministic queue cases passed; source migration SHA256 ${createHash('sha256').update(migration).digest('hex')}`);
} finally {
  if (cloned) success(docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', database]), 'drop only generated disposable clone');
  if (sourceFingerprint !== undefined) assert.equal(query(fingerprintSql, 'postgres'), sourceFingerprint, 'local source database changed');
}
