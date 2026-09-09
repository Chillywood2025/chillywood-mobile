#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const container = process.env.SUPABASE_DB_CONTAINER
  || `supabase_db_${path.basename(root).replace(/[^A-Za-z0-9_.-]/gu, "_")}`;
assert.match(container, /^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const sourceDatabase = "postgres";
const transientDatabase = `codex_premium_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
assert.match(transientDatabase, /^codex_premium_[0-9]+_[a-f0-9]{12}$/u);
const failedCloneDatabase = `${transientDatabase}_failed`;
assert.match(failedCloneDatabase, /^codex_premium_[0-9]+_[a-f0-9]{12}_failed$/u);
let transientDatabaseCreated = false;
const psql = (database) => [
  "exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
  "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database,
];
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (value) => createHash("sha256").update(value).digest("hex");

function query(sql, database = transientDatabase) {
  const result = spawnSync("docker", psql(database), {
    cwd: root,
    encoding: "utf8",
    input: sql,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr.replaceAll(/[A-Za-z0-9_-]{40,}/gu, "<redacted>"));
  return result.stdout.trim();
}

function openSession(applicationName, sql, database = transientDatabase) {
  const child = spawn("docker", psql(database), { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const done = new Promise((resolve) => child.on("close", (code) => resolve({ code, stdout, stderr })));
  child.stdin.write(`set application_name=${literal(applicationName)};\n${sql}\n`);
  return { child, done, output: () => stdout };
}

async function waitUntil(predicate, label) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(25);
  }
  throw new Error(`bounded local concurrency timeout: ${label}`);
}

async function terminate(applicationName, session) {
  if (!session || session.child.exitCode !== null) return;
  query(`select pg_terminate_backend(pid) from pg_stat_activity where application_name=${literal(applicationName)} and pid<>pg_backend_pid();`);
  session.child.kill("SIGTERM");
  await Promise.race([session.done, delay(1_000)]);
}

function runDocker(args, options = {}) {
  return spawnSync("docker", args, {
    cwd: root,
    encoding: options.encoding ?? "utf8",
    input: options.input,
    maxBuffer: 256 * 1024 * 1024,
  });
}

function runAdmin(args, options = {}) {
  return runDocker([
    "exec", ...(options.input === undefined ? [] : ["-i"]), container, "sh", "-lc",
    'PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"', "codex-premium-admin", ...args,
  ], options);
}

function createEmptyDatabase(target) {
  assert.match(target, /^codex_premium_[0-9]+_[a-f0-9]{12}(?:_failed)?$/u);
  const created = runDocker(["exec", container, "createdb", "-U", "postgres", "-T", "template0", target]);
  assert.equal(created.status, 0, "could not create isolated Premium concurrency database");
}

function restoreSourceSnapshot(target) {
  const initialized = runDocker([
    "exec", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", target, "-c",
    "create schema vault; create extension supabase_vault with schema vault;",
  ]);
  assert.equal(initialized.status, 0, "could not initialize isolated Supabase extension dependencies");
  const dump = runAdmin([
    "pg_dump", "-U", "supabase_admin",
    "--exclude-extension=pg_cron", "--exclude-extension=supabase_vault", "--exclude-extension=pg_graphql",
    "--exclude-schema=cron", "--exclude-schema=realtime", "--exclude-schema=_realtime",
    "--exclude-schema=vault", "--exclude-schema=graphql", "--exclude-schema=graphql_public",
    sourceDatabase,
  ], { encoding: null });
  assert.equal(dump.status, 0, "could not export the read-only local reset snapshot");
  const restored = runAdmin([
    "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", target,
  ], { encoding: null, input: dump.stdout });
  assert.equal(restored.status, 0, "could not restore the isolated Premium concurrency database");
}

function proveRestoreFailureCleanup(sourcePolicyFingerprint, sentinelName) {
  let failedRestoreDatabaseCreated = false;
  try {
    createEmptyDatabase(failedCloneDatabase);
    failedRestoreDatabaseCreated = true;
    const failedRestore = runDocker([
      "exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", failedCloneDatabase,
    ], { input: "select from;" });
    assert.notEqual(failedRestore.status, 0, "invalid restore input must fail closed");
    assert.equal(query(`select count(*)::text from pg_stat_activity where application_name=${literal(sentinelName)};`, sourceDatabase), "1");
    assert.equal(query("select datallowconn::text||':'||datistemplate::text||':'||datconnlimit::text from pg_database where datname=current_database();", sourceDatabase), sourcePolicyFingerprint);
  } finally {
    if (failedRestoreDatabaseCreated) {
      const dropped = runDocker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", failedCloneDatabase]);
      assert.equal(dropped.status, 0, "could not clean forced restore-failure database");
    }
  }
  assert.equal(query(`select count(*)::text from pg_database where datname=${literal(failedCloneDatabase)};`, "template1"), "0");
}

function assertTransientAuthorityGraph() {
  assert.equal(query(`
select (
  to_regprocedure('public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)') is not null
  and to_regprocedure('public.reconcile_revenuecat_premium_snapshot_atomic(text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text)') is not null
  and to_regprocedure('public.reconcile_revenuecat_premium_current_owner_snapshot_atomic(text,uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text)') is not null
  and to_regprocedure('public.lock_revenuecat_premium_owner_users_internal(uuid,uuid)') is not null
  and to_regprocedure('public.quarantine_revenuecat_terminal_authority(text,text,text,uuid,text,text,text)') is not null
  and to_regprocedure('public.lock_revenuecat_premium_quarantine_scopes_internal(text,uuid,text)') is not null
  and to_regprocedure('public.premium_subject_has_finite_authority_internal(text)') is not null
  and to_regclass('public.provider_events') is not null
  and to_regclass('public.access_grants') is not null
  and to_regclass('public.user_entitlements') is not null
  and to_regclass('public.money_access_ledger_events') is not null
  and to_regclass('public.platform_money_kill_switches') is not null
  and to_regclass('public.monetization_products') is not null
  and to_regclass('public.monetization_product_store_mappings') is not null
  and to_regclass('public.revenuecat_premium_transaction_authority') is not null
  and to_regclass('public.revenuecat_terminal_authority_quarantines') is not null
  and exists (select 1 from pg_constraint where conrelid='public.revenuecat_premium_transaction_authority'::regclass and conname='revenuecat_premium_product_change_projection_event_shape')
  and (select relforcerowsecurity from pg_class where oid='public.revenuecat_premium_transaction_authority'::regclass)
  and (select relforcerowsecurity from pg_class where oid='public.revenuecat_terminal_authority_quarantines'::regclass)
  and exists (select 1 from pg_trigger where tgrelid='public.revenuecat_terminal_authority_quarantines'::regclass and tgname='serialize_revenuecat_terminal_quarantine_insert' and tgenabled='O')
  and exists (select 1 from pg_trigger where tgrelid='public.revenuecat_terminal_authority_quarantines'::regclass and tgname='block_revenuecat_terminal_quarantine_mutation' and tgenabled='O')
  and not has_function_privilege('anon','public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)','execute')
  and not has_function_privilege('authenticated','public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)','execute')
  and has_function_privilege('service_role','public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)','execute')
  and not has_function_privilege('anon','public.reconcile_revenuecat_premium_snapshot_atomic(text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text)','execute')
  and not has_function_privilege('authenticated','public.reconcile_revenuecat_premium_snapshot_atomic(text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text)','execute')
  and has_function_privilege('service_role','public.reconcile_revenuecat_premium_snapshot_atomic(text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text)','execute')
  and not has_function_privilege('anon','public.reconcile_revenuecat_premium_current_owner_snapshot_atomic(text,uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text)','execute')
  and not has_function_privilege('authenticated','public.reconcile_revenuecat_premium_current_owner_snapshot_atomic(text,uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text)','execute')
  and has_function_privilege('service_role','public.reconcile_revenuecat_premium_current_owner_snapshot_atomic(text,uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text)','execute')
  and not has_function_privilege('service_role','public.lock_revenuecat_premium_owner_users_internal(uuid,uuid)','execute')
  and not has_function_privilege('service_role','public.process_revenuecat_premium_event_pre_owner_serialization(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)','execute')
  and not has_function_privilege('service_role','public.reconcile_revenuecat_premium_snapshot_pre_owner_serialization(text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text)','execute')
  and not has_function_privilege('service_role','public.process_revenuecat_premium_transfer_pre_owner_serialization(text,uuid,uuid,text,timestamptz,text)','execute')
  and has_function_privilege('service_role','public.process_revenuecat_premium_transfer_atomic(text,uuid,uuid,text,timestamptz,text)','execute')
  and not has_function_privilege('anon','public.quarantine_revenuecat_terminal_authority(text,text,text,uuid,text,text,text)','execute')
  and not has_function_privilege('authenticated','public.quarantine_revenuecat_terminal_authority(text,text,text,uuid,text,text,text)','execute')
  and has_function_privilege('service_role','public.quarantine_revenuecat_terminal_authority(text,text,text,uuid,text,text,text)','execute')
  and (select count(*) from public.monetization_product_store_mappings where provider='revenuecat_app_store' and environment='sandbox' and concept='premium' and provider_product_id in ('com.chillywood.premium.monthly','com.chillywood.premium.yearly'))=2
  and exists (select 1 from public.monetization_products where provider='revenuecat_google_play' and environment='sandbox' and product_type='premium_subscription' and status='sandbox')
)::text;`), "true", "isolated clone is missing required Premium authority graph state");
}

function createTransientDatabase() {
  createEmptyDatabase(transientDatabase);
  transientDatabaseCreated = true;
  restoreSourceSnapshot(transientDatabase);
  assertTransientAuthorityGraph();
}

function dropTransientDatabase() {
  if (!transientDatabaseCreated) return;
  const dropped = runDocker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", transientDatabase]);
  assert.equal(dropped.status, 0, "could not remove isolated Premium concurrency database");
  transientDatabaseCreated = false;
}

async function raceExactCall(id, sql, expectedFirst, expectedSecond) {
  const firstName = `premium-first-${id}`;
  const secondName = `premium-second-${id}`;
  let first;
  let second;
  try {
    first = openSession(firstName, `begin; set local statement_timeout='15s'; select 'FIRST_RESULT:'||(${sql}); select 'FIRST_READY';`);
    await waitUntil(() => first.output().includes("FIRST_READY"), `${id} first projector`);
    second = openSession(secondName, `begin; set local statement_timeout='15s'; select 'SECOND_RESULT:'||(${sql}); select 'SECOND_READY';`);
    await waitUntil(() => Number(query(`select count(*) from pg_stat_activity where application_name=${literal(secondName)} and wait_event_type='Lock' and wait_event='advisory';`)) === 1, `${id} duplicate serialization`);
    first.child.stdin.end("commit;\n\\q\n");
    const firstResult = await first.done;
    assert.equal(firstResult.code, 0, firstResult.stderr);
    await waitUntil(() => second.output().includes("SECOND_READY"), `${id} duplicate completion`);
    second.child.stdin.end("commit;\n\\q\n");
    const secondResult = await second.done;
    assert.equal(secondResult.code, 0, secondResult.stderr);
    const firstObserved = firstResult.stdout.match(/FIRST_RESULT:([a-z_]+:(?:true|false))/u)?.[1] ?? "missing";
    const secondObserved = secondResult.stdout.match(/SECOND_RESULT:([a-z_]+:(?:true|false))/u)?.[1] ?? "missing";
    assert.equal(firstObserved, expectedFirst, `${id} first result did not match`);
    assert.equal(secondObserved, expectedSecond, `${id} second result did not match`);
  } catch (error) {
    await terminate(firstName, first);
    await terminate(secondName, second);
    throw error;
  }
}

const started = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", container], { encoding: "utf8" });
assert.equal(started.status, 0, `local Supabase database container unavailable: ${container}`);
assert.equal(started.stdout.trim(), "true", "local Supabase database container is not running");

const sourceFingerprint = query(`select (select count(*) from auth.users)::text||':'||(select count(*) from public.revenuecat_terminal_authority_quarantines)::text;`, sourceDatabase);
const sourcePolicyFingerprint = query("select datallowconn::text||':'||datistemplate::text||':'||datconnlimit::text from pg_database where datname=current_database();", sourceDatabase);
const sourceSentinelName = `premium-source-sentinel-${process.pid}`;
let sourceSentinel;
try {
sourceSentinel = openSession(sourceSentinelName, "begin; select 'SOURCE_SENTINEL_READY';", sourceDatabase);
await waitUntil(() => sourceSentinel.output().includes("SOURCE_SENTINEL_READY"), "source sentinel session");
proveRestoreFailureCleanup(sourcePolicyFingerprint, sourceSentinelName);
createTransientDatabase();
const subject = randomUUID();
const scenarios = [
  { id: "exact", provider: "revenuecat_app_store", user: `${literal(subject)}::uuid`, environment: "sandbox" },
  { id: "provider-user", provider: "revenuecat_app_store", user: `${literal(subject)}::uuid`, environment: "unknown" },
  { id: "provider-environment", provider: "revenuecat_app_store", user: "null", environment: "sandbox" },
  { id: "provider", provider: "revenuecat_app_store", user: "null", environment: "unknown" },
  { id: "global", provider: "revenuecat", user: "null", environment: "unknown" },
];

for (const scenario of scenarios) {
  const holderName = `premium-quarantine-holder-${scenario.id}`;
  const quarantineName = `premium-quarantine-waiter-${scenario.id}`;
  const rawHash = hash(`premium-quarantine-concurrency:${scenario.id}:${subject}`);
  let holder;
  let quarantine;
  try {
    if (scenario.id === "exact") {
      query(`insert into auth.users(id,is_sso_user,is_anonymous) values (${literal(subject)}::uuid,false,false) on conflict(id) do nothing;`);
      query(`select public.quarantine_revenuecat_terminal_authority(
        ${literal(scenario.provider)},${literal(`race-${scenario.id}`)},'TRANSFER',${scenario.user},${literal(scenario.environment)},${literal(rawHash)},
        'terminal_identity_invalid:transfer_store_identity_missing_or_unsupported');`);
    }
    holder = openSession(holderName, `
begin;
set local statement_timeout='10s';
select public.lock_revenuecat_premium_quarantine_scopes_internal(
  'revenuecat_app_store',${literal(subject)}::uuid,'sandbox'
);
select 'PREMIUM_SCOPE_READY';`);
    await waitUntil(() => holder.output().includes("PREMIUM_SCOPE_READY"), `${scenario.id} Premium scope lock`);

    quarantine = openSession(quarantineName, `
begin;
set local statement_timeout='10s';
select public.quarantine_revenuecat_terminal_authority(
  ${literal(scenario.provider)},${literal(`race-${scenario.id}`)},'TRANSFER',
  ${scenario.user},${literal(scenario.environment)},${literal(rawHash)},
  'terminal_identity_invalid:transfer_store_identity_missing_or_unsupported'
);
rollback;
\\q`);
    quarantine.child.stdin.end();

    await waitUntil(() => Number(query(`
select count(*) from pg_stat_activity
where application_name=${literal(quarantineName)}
  and wait_event_type='Lock' and wait_event='advisory';`)) === 1, `${scenario.id} quarantine serialization`);

    holder.child.stdin.end("rollback;\n\\q\n");
    const [holderResult, quarantineResult] = await Promise.all([holder.done, quarantine.done]);
    assert.equal(holderResult.code, 0, holderResult.stderr);
    assert.equal(quarantineResult.code, 0, quarantineResult.stderr);
    assert.equal(Number(query(`select count(*) from public.revenuecat_terminal_authority_quarantines where raw_payload_hash=${literal(rawHash)};`)), scenario.id === "exact" ? 1 : 0);
  } catch (error) {
    await terminate(holderName, holder);
    await terminate(quarantineName, quarantine);
    throw error;
  }
}

const googleUser = randomUUID();
const googleOriginal = `concurrent-google-${randomUUID()}`;
const googleQuarantineHash = hash(`quarantine:${googleOriginal}`);
const initialHash = hash(`initial:${googleOriginal}`);
query(`
insert into auth.users(id,is_sso_user,is_anonymous) values (${literal(googleUser)}::uuid,false,false);
update public.platform_money_kill_switches set state=case when key in ('revenuecat_google_play_enabled','revenuecat_app_store_enabled','provider_webhooks_enabled') then 'sandbox_only' when key in ('live_money_enabled','payouts_enabled','cashout_enabled') then 'off' else state end where key in ('revenuecat_google_play_enabled','revenuecat_app_store_enabled','provider_webhooks_enabled','live_money_enabled','payouts_enabled','cashout_enabled');
select public.quarantine_revenuecat_terminal_authority('revenuecat_google_play',${literal(`quarantine-${googleOriginal}`)},'TRANSFER',${literal(googleUser)}::uuid,'sandbox',${literal(googleQuarantineHash)},'terminal_identity_invalid:transfer_store_identity_missing_or_unsupported');
select public.process_revenuecat_premium_event_atomic('revenuecat_google_play',${literal(`initial-${googleOriginal}`)},'INITIAL_PURCHASE',${literal(googleUser)}::uuid,product.provider_product_id,product.provider_base_plan_id,'sandbox','active',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 days',clock_timestamp(),999,'usd',${literal(initialHash)},'NORMAL','google_play','android',null,product.id,${literal(googleOriginal)}) from public.monetization_products product where product.provider='revenuecat_google_play' and product.environment='sandbox' and product.product_type='premium_subscription' and product.status='sandbox' order by product.created_at,product.id limit 1;
`);

const renewalId = `concurrent-renewal-${randomUUID()}`;
const renewalHash = hash(renewalId);
const renewalCall = `select result->>'status'||':'||coalesce(result->>'duplicateEvent','false') from (select public.process_revenuecat_premium_event_atomic('revenuecat_google_play',${literal(renewalId)},'RENEWAL',${literal(googleUser)}::uuid,product.provider_product_id,product.provider_base_plan_id,'sandbox','active',clock_timestamp()-interval '30 seconds',clock_timestamp()+interval '30 days',clock_timestamp(),999,'usd',${literal(renewalHash)},'NORMAL','google_play','android',null,product.id,${literal(googleOriginal)}) result from public.monetization_products product where product.provider='revenuecat_google_play' and product.environment='sandbox' and product.product_type='premium_subscription' and product.status='sandbox' order by product.created_at,product.id limit 1) projected`;
await raceExactCall("renewal", renewalCall, "processed:false", "processed:true");
assert.equal(query(`select (select count(*) from public.provider_events where provider_event_id=${literal(renewalId)})::text||':'||(select latest_event_id from public.revenuecat_premium_transaction_authority where provider='revenuecat_google_play' and original_transaction_id=${literal(googleOriginal)})||':'||(select authority_state from public.revenuecat_premium_transaction_authority where provider='revenuecat_google_play' and original_transaction_id=${literal(googleOriginal)})||':'||(select coalesce(product_change_projection_event_id,'clear') from public.revenuecat_premium_transaction_authority where provider='revenuecat_google_play' and original_transaction_id=${literal(googleOriginal)})||':'||(select count(*) from public.access_grants grant_row join public.provider_events event on event.id=grant_row.provider_event_id where event.provider_event_id=${literal(renewalId)})::text||':'||(select count(*) from public.money_access_ledger_events ledger join public.provider_events event on event.id=ledger.provider_event_id where event.provider_event_id=${literal(renewalId)})::text||':'||public.premium_subject_has_finite_authority_internal(${literal(googleUser)})::text;`), `1:${renewalId}:active:clear:1:1:true`);

const changedProductId = randomUUID();
const changedProviderProduct = `test.changed.${randomUUID()}`;
query(`insert into public.monetization_products(id,product_key,product_type,display_name,provider,provider_product_id,provider_base_plan_id,revenuecat_entitlement,environment,status,is_android_digital,metadata) values (${literal(changedProductId)}::uuid,${literal(`test_changed_${changedProductId}`)},'premium_subscription','Transient Premium Product Change','revenuecat_google_play',${literal(changedProviderProduct)},'test-base-plan','premium','sandbox','sandbox',true,'{"test_only":true}'::jsonb);`);
const productChangeId = `concurrent-product-change-${randomUUID()}`;
const productChangeHash = hash(productChangeId);
const productChangeCall = `select result->>'status'||':'||coalesce(result->>'duplicateEvent','false') from (select public.process_revenuecat_premium_event_atomic('revenuecat_google_play',${literal(productChangeId)},'PRODUCT_CHANGE',${literal(googleUser)}::uuid,product.provider_product_id,product.provider_base_plan_id,'sandbox','active',clock_timestamp()-interval '15 seconds',clock_timestamp()+interval '30 days',clock_timestamp(),999,'usd',${literal(productChangeHash)},'NORMAL','google_play','android',null,product.id,${literal(googleOriginal)}) result from public.monetization_products product where product.id=${literal(changedProductId)}::uuid) projected`;
await raceExactCall("product-change", productChangeCall, "processed:false", "processed:true");
assert.equal(query(`select (select count(*) from public.provider_events where provider_event_id=${literal(productChangeId)})::text||':'||(select current_provider_product_id from public.revenuecat_premium_transaction_authority where provider='revenuecat_google_play' and original_transaction_id=${literal(googleOriginal)})||':'||(select latest_event_id from public.revenuecat_premium_transaction_authority where provider='revenuecat_google_play' and original_transaction_id=${literal(googleOriginal)})||':'||(select coalesce(product_change_projection_event_id,'clear') from public.revenuecat_premium_transaction_authority where provider='revenuecat_google_play' and original_transaction_id=${literal(googleOriginal)})||':'||(select count(*) from public.access_grants grant_row join public.provider_events event on event.id=grant_row.provider_event_id where event.provider_event_id=${literal(productChangeId)})::text||':'||(select count(*) from public.money_access_ledger_events ledger join public.provider_events event on event.id=ledger.provider_event_id where event.provider_event_id=${literal(productChangeId)})::text;`), `1:${changedProviderProduct}:${productChangeId}:clear:1:1`);

const appStoreUser = randomUUID();
const appStoreOriginal = `concurrent-app-store-${randomUUID()}`;
const firstSnapshotId = `snapshot-first-${randomUUID()}`;
query(`
insert into auth.users(id,is_sso_user,is_anonymous) values (${literal(appStoreUser)}::uuid,false,false);
select public.quarantine_revenuecat_terminal_authority('revenuecat_app_store',${literal(`quarantine-${appStoreOriginal}`)},'TRANSFER',${literal(appStoreUser)}::uuid,'sandbox',${literal(hash(`quarantine:${appStoreOriginal}`))},'terminal_identity_invalid:transfer_store_identity_missing_or_unsupported');
select public.reconcile_revenuecat_premium_snapshot_atomic(${literal(firstSnapshotId)},${literal(appStoreUser)}::uuid,${literal(`subscription-${appStoreOriginal}`)},${literal(appStoreOriginal)},mapping.provider_product_id,'active',clock_timestamp()-interval '2 days',clock_timestamp()+interval '29 days',clock_timestamp(),${literal(hash(firstSnapshotId))}) from public.monetization_product_store_mappings mapping where mapping.provider='revenuecat_app_store' and mapping.environment='sandbox' and mapping.concept='premium' and mapping.provider_product_id='com.chillywood.premium.monthly';
`);
const restoreId = `concurrent-restore-${randomUUID()}`;
const restoreHash = hash(restoreId);
const restoreCall = `select result->>'status'||':'||coalesce(result->>'duplicateEvent','false') from (select public.reconcile_revenuecat_premium_snapshot_atomic(${literal(restoreId)},${literal(appStoreUser)}::uuid,${literal(`subscription-${appStoreOriginal}`)},${literal(appStoreOriginal)},mapping.provider_product_id,'active',clock_timestamp()-interval '1 day',clock_timestamp()+interval '29 days',clock_timestamp(),${literal(restoreHash)}) result from public.monetization_product_store_mappings mapping where mapping.provider='revenuecat_app_store' and mapping.environment='sandbox' and mapping.concept='premium' and mapping.provider_product_id='com.chillywood.premium.monthly') projected`;
await raceExactCall("restore", restoreCall, "processed:false", "duplicate_ignored:true");
assert.equal(query(`select (select count(*) from public.provider_events where provider_event_id=${literal(restoreId)})::text||':'||(select latest_event_id from public.revenuecat_premium_transaction_authority where provider='revenuecat_app_store' and original_transaction_id=${literal(appStoreOriginal)})||':'||(select current_provider_product_id from public.revenuecat_premium_transaction_authority where provider='revenuecat_app_store' and original_transaction_id=${literal(appStoreOriginal)})||':'||(select count(*) from public.access_grants grant_row join public.provider_events event on event.id=grant_row.provider_event_id where event.provider_event_id=${literal(restoreId)})::text||':'||(select count(*) from public.money_access_ledger_events ledger join public.provider_events event on event.id=ledger.provider_event_id where event.provider_event_id=${literal(restoreId)})::text||':'||public.premium_subject_has_finite_authority_internal(${literal(appStoreUser)})::text;`), `1:${restoreId}:com.chillywood.premium.monthly:1:1:true`);

const transferSource = randomUUID();
const transferTarget = randomUUID();
const currentOwnerOriginal = `current-owner-${randomUUID()}`;
const currentOwnerSourceSnapshot = `current-owner-source-${randomUUID()}`;
const currentOwnerTransfer = `current-owner-transfer-${randomUUID()}`;
const currentOwnerSnapshot = `current-owner-target-${randomUUID()}`;
const currentOwnerHash = hash(currentOwnerSnapshot);
query(`
insert into auth.users(id,is_sso_user,is_anonymous) values
  (${literal(transferSource)}::uuid,false,false),
  (${literal(transferTarget)}::uuid,false,false);
select public.reconcile_revenuecat_premium_snapshot_atomic(
  ${literal(currentOwnerSourceSnapshot)},${literal(transferSource)}::uuid,
  ${literal(`subscription-${currentOwnerOriginal}`)},${literal(currentOwnerOriginal)},
  mapping.provider_product_id,'active',clock_timestamp()-interval '2 days',
  clock_timestamp()+interval '1 day',clock_timestamp()-interval '1 day',
  ${literal(hash(currentOwnerSourceSnapshot))}
) from public.monetization_product_store_mappings mapping
where mapping.provider='revenuecat_app_store' and mapping.environment='sandbox'
  and mapping.concept='premium'
  and mapping.provider_product_id='com.chillywood.premium.monthly';
update public.user_entitlements set expires_at=clock_timestamp()-interval '1 minute'
where user_id=${literal(transferSource)} and entitlement_key='premium';
update public.access_grants set expires_at=clock_timestamp()-interval '1 minute'
where user_id=${literal(transferSource)}::uuid and grant_type='premium';
insert into public.provider_events(
  provider_event_id,provider,product_id,product_key,user_id,app_user_id,
  environment,event_type,status,occurred_at,idempotency_key,raw_payload_hash,metadata
) values (
  ${literal(currentOwnerTransfer)},'revenuecat_app_store',null,null,
  ${literal(transferTarget)}::uuid,${literal(transferTarget)},'sandbox','TRANSFER','ignored',
  clock_timestamp()-interval '30 seconds',${literal(`TRANSFER:${currentOwnerTransfer}`)},
  ${literal(hash(currentOwnerTransfer))},jsonb_build_object(
    'source_user_id',${literal(transferSource)},'target_user_id',${literal(transferTarget)},
    'reported_occurred_at',clock_timestamp()-interval '30 seconds',
    'transfer_time_valid',true,'transfer_applied',false,
    'final_reason','premium_transfer_source_transaction_authority_missing',
    'provider_payload_stored',false,'money_action',false
  )
);
`);
const currentOwnerCall = `select result->>'status'||':'||coalesce(result->>'duplicateEvent','false') from (
  select public.reconcile_revenuecat_premium_current_owner_snapshot_atomic(
    ${literal(currentOwnerSnapshot)},${literal(transferTarget)}::uuid,${literal(transferSource)},
    ${literal(`subscription-${currentOwnerOriginal}`)},${literal(currentOwnerOriginal)},
    mapping.provider_product_id,'active',clock_timestamp()-interval '10 minutes',
    clock_timestamp()+interval '30 days',clock_timestamp(),${literal(currentOwnerHash)}
  ) result from public.monetization_product_store_mappings mapping
  where mapping.provider='revenuecat_app_store' and mapping.environment='sandbox'
    and mapping.concept='premium'
    and mapping.provider_product_id='com.chillywood.premium.monthly'
) projected`;
await raceExactCall("current-owner", currentOwnerCall, "processed:false", "duplicate_ignored:true");
assert.equal(query(`select
  (select count(*) from public.provider_events where provider_event_id=${literal(currentOwnerSnapshot)})::text||':'||
  (select metadata->>'transfer_applied' from public.provider_events where provider_event_id=${literal(currentOwnerTransfer)})||':'||
  (select user_id::text from public.revenuecat_premium_transaction_authority where provider='revenuecat_app_store' and original_transaction_id=${literal(currentOwnerOriginal)})||':'||
  public.premium_subject_has_finite_authority_internal(${literal(transferSource)})::text||':'||
  public.premium_subject_has_finite_authority_internal(${literal(transferTarget)})::text||':'||
  (select count(*) from public.money_access_ledger_events ledger join public.provider_events event on event.id=ledger.provider_event_id where event.provider_event_id=${literal(currentOwnerSnapshot)} and ledger.payable_state='not_payable')::text;
`), `1:true:${transferTarget}:false:true:1`);

// Exact three-user ordering proof. While S -> T current-owner reconciliation
// is still uncommitted, a newer signed T -> U transfer must wait on T's shared
// owner lock. After S -> T commits, the transfer re-observes T as authoritative
// and moves the exact binding to U instead of durably ignoring the newer event.
const chainSource = randomUUID();
const chainTarget = randomUUID();
const chainNextTarget = randomUUID();
const chainOriginal = `current-owner-chain-${randomUUID()}`;
const chainSourceSnapshot = `current-owner-chain-source-${randomUUID()}`;
const chainFirstTransfer = `current-owner-chain-first-transfer-${randomUUID()}`;
const chainSnapshot = `current-owner-chain-target-${randomUUID()}`;
const chainNextTransfer = `current-owner-chain-next-transfer-${randomUUID()}`;
query(`
insert into auth.users(id,is_sso_user,is_anonymous) values
  (${literal(chainSource)}::uuid,false,false),
  (${literal(chainTarget)}::uuid,false,false),
  (${literal(chainNextTarget)}::uuid,false,false);
select public.reconcile_revenuecat_premium_snapshot_atomic(
  ${literal(chainSourceSnapshot)},${literal(chainSource)}::uuid,
  ${literal(`subscription-${chainOriginal}`)},${literal(chainOriginal)},
  mapping.provider_product_id,'active',clock_timestamp()-interval '2 days',
  clock_timestamp()+interval '1 day',clock_timestamp()-interval '1 day',
  ${literal(hash(chainSourceSnapshot))}
) from public.monetization_product_store_mappings mapping
where mapping.provider='revenuecat_app_store' and mapping.environment='sandbox'
  and mapping.concept='premium'
  and mapping.provider_product_id='com.chillywood.premium.monthly';
update public.user_entitlements set expires_at=clock_timestamp()-interval '1 minute'
where user_id=${literal(chainSource)} and entitlement_key='premium';
update public.access_grants set expires_at=clock_timestamp()-interval '1 minute'
where user_id=${literal(chainSource)}::uuid and grant_type='premium';
insert into public.provider_events(
  provider_event_id,provider,product_id,product_key,user_id,app_user_id,
  environment,event_type,status,occurred_at,idempotency_key,raw_payload_hash,metadata
) values (
  ${literal(chainFirstTransfer)},'revenuecat_app_store',null,null,
  ${literal(chainTarget)}::uuid,${literal(chainTarget)},'sandbox','TRANSFER','ignored',
  clock_timestamp()-interval '30 seconds',${literal(`TRANSFER:${chainFirstTransfer}`)},
  ${literal(hash(chainFirstTransfer))},jsonb_build_object(
    'source_user_id',${literal(chainSource)},'target_user_id',${literal(chainTarget)},
    'reported_occurred_at',clock_timestamp()-interval '30 seconds',
    'transfer_time_valid',true,'transfer_applied',false,
    'final_reason','premium_transfer_source_transaction_authority_missing',
    'provider_payload_stored',false,'money_action',false
  )
);
`);

const chainHolderName = "premium-current-owner-chain-holder";
const chainTransferName = "premium-current-owner-chain-transfer";
let chainHolder;
let chainTransfer;
try {
  chainHolder = openSession(chainHolderName, `
begin;
set local statement_timeout='15s';
select 'CHAIN_OWNER_RESULT:'||(result->>'status') from (
  select public.reconcile_revenuecat_premium_current_owner_snapshot_atomic(
    ${literal(chainSnapshot)},${literal(chainTarget)}::uuid,${literal(chainSource)},
    ${literal(`subscription-${chainOriginal}`)},${literal(chainOriginal)},
    mapping.provider_product_id,'active',clock_timestamp()-interval '10 minutes',
    clock_timestamp()+interval '30 days',clock_timestamp(),${literal(hash(chainSnapshot))}
  ) result from public.monetization_product_store_mappings mapping
  where mapping.provider='revenuecat_app_store' and mapping.environment='sandbox'
    and mapping.concept='premium'
    and mapping.provider_product_id='com.chillywood.premium.monthly'
) projected;
select 'CHAIN_OWNER_READY';`);
  await waitUntil(() => chainHolder.output().includes("CHAIN_OWNER_READY"), "current-owner chain projection");

  chainTransfer = openSession(chainTransferName, `
begin;
set local statement_timeout='15s';
select 'CHAIN_TRANSFER_RESULT:'||(public.process_revenuecat_premium_transfer_atomic(
  ${literal(chainNextTransfer)},${literal(chainTarget)}::uuid,
  ${literal(chainNextTarget)}::uuid,'sandbox',clock_timestamp(),
  ${literal(hash(chainNextTransfer))}
)->>'status');
commit;
\\q`);
  chainTransfer.child.stdin.end();
  await waitUntil(() => Number(query(`
select count(*) from pg_stat_activity
where application_name=${literal(chainTransferName)}
  and wait_event_type='Lock' and wait_event='advisory';`)) === 1, "newer transfer waits for current-owner projection");

  chainHolder.child.stdin.end("commit;\n\\q\n");
  const [chainHolderResult, chainTransferResult] = await Promise.all([
    chainHolder.done, chainTransfer.done,
  ]);
  assert.equal(chainHolderResult.code, 0, chainHolderResult.stderr);
  assert.equal(chainTransferResult.code, 0, chainTransferResult.stderr);
  assert.match(chainHolderResult.stdout, /CHAIN_OWNER_RESULT:processed/u);
  assert.match(chainTransferResult.stdout, /CHAIN_TRANSFER_RESULT:processed/u);
} catch (error) {
  await terminate(chainHolderName, chainHolder);
  await terminate(chainTransferName, chainTransfer);
  throw error;
}
assert.equal(query(`select
  (select user_id::text from public.revenuecat_premium_transaction_authority
    where provider='revenuecat_app_store' and original_transaction_id=${literal(chainOriginal)})||':'||
  public.premium_subject_has_finite_authority_internal(${literal(chainSource)})::text||':'||
  public.premium_subject_has_finite_authority_internal(${literal(chainTarget)})::text||':'||
  public.premium_subject_has_finite_authority_internal(${literal(chainNextTarget)})::text||':'||
  (select metadata->>'transfer_applied' from public.provider_events
    where provider_event_id=${literal(chainFirstTransfer)})||':'||
  (select metadata->>'transfer_applied' from public.provider_events
    where provider_event_id=${literal(chainNextTransfer)});
`), `${chainNextTarget}:false:false:true:true:true`);
assert.equal(query(`select count(*)::text from pg_stat_activity where application_name=${literal(sourceSentinelName)};`, sourceDatabase), "1", "read-only source sentinel did not survive isolated proof");

process.stdout.write(`RevenueCat Premium/quarantine concurrency: ${scenarios.length} scope + 5 lifecycle races passed\n`);
} finally {
  dropTransientDatabase();
  if (sourceSentinel) {
    if (sourceSentinel.child.exitCode === null) sourceSentinel.child.stdin.end("rollback;\n\\q\n");
    const sourceSentinelResult = await sourceSentinel.done;
    assert.equal(sourceSentinelResult.code, 0, sourceSentinelResult.stderr);
  }
  assert.equal(query(`select (select count(*) from auth.users)::text||':'||(select count(*) from public.revenuecat_terminal_authority_quarantines)::text;`, sourceDatabase), sourceFingerprint, "isolated concurrency proof mutated the local reset database");
  assert.equal(query("select datallowconn::text||':'||datistemplate::text||':'||datconnlimit::text from pg_database where datname=current_database();", sourceDatabase), sourcePolicyFingerprint, "isolated concurrency proof mutated the local reset database policy");
  assert.equal(query(`select count(*)::text from pg_stat_activity where application_name=${literal(sourceSentinelName)};`, sourceDatabase), "0", "read-only source sentinel session remained after proof");
}
