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

function openSession(applicationName, sql) {
  const child = spawn("docker", psql(transientDatabase), { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
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

function createTransientDatabase() {
  const created = runDocker(["exec", container, "createdb", "-U", "postgres", "-T", "template0", transientDatabase]);
  assert.equal(created.status, 0, "could not create isolated Premium concurrency database");
  transientDatabaseCreated = true;
  const dump = runDocker(["exec", container, "pg_dump", "-U", "postgres", "--no-owner", "--no-privileges", sourceDatabase], { encoding: null });
  assert.equal(dump.status, 0, "could not export the local reset database for isolated concurrency proof");
  const restored = runDocker(["exec", "-i", container, "psql", "-X", "-q", "-U", "postgres", "-d", transientDatabase], {
    encoding: null,
    input: dump.stdout,
  });
  assert.equal(restored.status, 0, "could not restore the isolated Premium concurrency database");
  assert.equal(query(`select (to_regprocedure('public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)') is not null and to_regprocedure('public.reconcile_revenuecat_premium_snapshot_atomic(text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text)') is not null and to_regclass('public.revenuecat_terminal_authority_quarantines') is not null)::text;`), "true");
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
    second.child.stdin.end("rollback;\n\\q\n");
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
try {
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

process.stdout.write(`RevenueCat Premium/quarantine concurrency: ${scenarios.length} scope + 3 lifecycle races passed\n`);
} finally {
  dropTransientDatabase();
  assert.equal(query(`select (select count(*) from auth.users)::text||':'||(select count(*) from public.revenuecat_terminal_authority_quarantines)::text;`, sourceDatabase), sourceFingerprint, "isolated concurrency proof mutated the local reset database");
}
