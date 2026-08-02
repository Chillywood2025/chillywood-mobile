#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const root = process.cwd();
const container = process.env.SUPABASE_DB_CONTAINER || `supabase_db_${path.basename(root)}`;
const psql = ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const uuid = () => crypto.randomUUID();
const requiredRaces = Object.freeze(["source-renewal", "target-renewal", "source-refund", "source-revocation", "shared-source", "shared-target", "reversed-users", "duplicate", "after_source", "after_target"]);
const admin = (sql, capture = false) => spawnSync("docker", psql, { cwd: root, encoding: "utf8", input: sql, stdio: ["pipe", capture ? "pipe" : "ignore", "pipe"] });
const read = (sql) => {
  const result = admin(sql, true);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const session = (applicationName, sql) => {
  const child = spawn("docker", psql, { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
  const done = new Promise((resolve) => child.on("close", (code) => resolve({ code, stdout, stderr })));
  child.stdin.end(`set application_name=${literal(applicationName)};\n${sql}\n`);
  return { child, done };
};
const waitUntil = async (predicate, label) => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(25);
  }
  throw new Error(`bounded local barrier timeout: ${label}`);
};
const stopChild = async (child, done) => { for (const signal of ["SIGTERM", "SIGKILL"]) {
    if (child.exitCode !== null) return;
    child.kill(signal); await Promise.race([done, delay(1_000)]);
  }
  assert.notEqual(child.exitCode, null, "bounded local child cleanup failed");
};
const barrier = async (key) => {
  const holder = spawn("docker", psql, { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  let error = "";
  holder.stdout.setEncoding("utf8");
  holder.stderr.setEncoding("utf8");
  holder.stdout.on("data", (chunk) => { output += chunk; }); holder.stderr.on("data", (chunk) => { error += chunk; });
  const done = new Promise((resolve) => holder.on("close", resolve));
  holder.stdin.write(`select pg_advisory_lock(${key}); select 'BARRIER_READY';\n`);
  try { await waitUntil(() => output.includes("BARRIER_READY"), `barrier ${key} acquisition`); }
  catch (cause) { holder.stdin.destroy(); try { await stopChild(holder, done); } catch {} throw cause; }
  return {
    release: async () => {
      holder.stdin.end(`select pg_advisory_unlock(${key});\n\\q\n`);
      const code = await Promise.race([done, delay(2_000).then(() => null)]);
      if (code === null) { try { await stopChild(holder, done); } catch {} throw new Error(`bounded local barrier cleanup timeout: ${key}`); }
      assert.equal(code, 0, error);
    },
  };
};
const mappingSql = `from public.monetization_product_store_mappings mapping where mapping.provider='revenuecat_app_store' and mapping.provider_product_id='com.chillywood.premium.monthly' and mapping.environment='sandbox' and mapping.concept='premium' and mapping.platform='ios' and mapping.store='app_store' and mapping.status='sandbox' and mapping.unlocks_digital_access is true and mapping.grants_livekit_authority is false and mapping.creates_payable_balance is false limit 1`;
const eventSql = (user, eventId, eventType, occurredAt, status = "active") => `
select public.process_revenuecat_premium_event_atomic(
  'revenuecat_app_store',${literal(eventId)},${literal(eventType)},${literal(user)}::uuid,
  mapping.provider_product_id,null,'sandbox',${literal(status)},
  ${literal(occurredAt)}::timestamptz-interval '30 days',timestamptz '2099-12-31 00:00:00+00',
  ${literal(occurredAt)}::timestamptz,mapping.reference_price_minor,mapping.reference_currency,
  ${literal(hash(eventId))},'NORMAL','app_store','ios',mapping.id,mapping.product_id
) ${mappingSql};`;
const transferSql = (source, target, eventId, occurredAt, failpoint = null) => failpoint
  ? `select public.process_revenuecat_premium_transfer_ordered_internal(
      ${literal(eventId)},${literal(source)}::uuid,${literal(target)}::uuid,'sandbox',
      ${literal(occurredAt)}::timestamptz,${literal(hash(eventId))},${literal(failpoint)});`
  : `select public.process_revenuecat_premium_transfer_atomic(
      ${literal(eventId)},${literal(source)}::uuid,${literal(target)}::uuid,'sandbox',
      ${literal(occurredAt)}::timestamptz,${literal(hash(eventId))});`;
const raceUsers = [];
let mappedProductId; let firstTransferProductId;
const canonicalLockIdentity = (user, productId) => {
  const signed = BigInt(read(`select pg_catalog.hashtextextended('revenuecat-premium:'||${literal(user)}||':'||${literal(productId)},0)::text;`));
  const value = BigInt.asUintN(64, signed);
  return { classid: Number((value >> 32n) & 0xffffffffn), objid: Number(value & 0xffffffffn) };
};
const makeUsers = (count) => {
  const users = Array.from({ length: count }, uuid);
  raceUsers.push(...users);
  const result = admin(`insert into auth.users(id) select unnest(array[${users.map((id) => `${literal(id)}::uuid`).join(",")}]) on conflict(id) do nothing;`);
  assert.equal(result.status, 0, result.stderr);
  return users;
};
const seed = (user, label) => {
  const result = admin(eventSql(user, `seed-${label}`, "INITIAL_PURCHASE", "2026-07-30 10:00:00+00"));
  assert.equal(result.status, 0, result.stderr);
};
const activeOwnerCountSql = (users) => `
select count(*)::integer
from public.user_entitlements
where user_id=any(array[${users.map(literal).join(",")}])
  and entitlement_key='premium'
  and status in ('active','trialing','grace_period');`;
const safetySql = (users) => `
select json_build_object(
  'owners',(${activeOwnerCountSql(users).replace(/;$/u, "")}),
  'grantOwners',(select count(*) from public.access_grants grant_row where grant_row.user_id=any(array[${users.map((id) => `${literal(id)}::uuid`).join(",")}]) and grant_row.grant_type='premium' and grant_row.status in ('active','sandbox_only') and (grant_row.expires_at is null or grant_row.expires_at>now())),
  'payable',(select count(*) from public.money_access_ledger_events ledger
    join public.provider_events event on event.id=ledger.provider_event_id
    where event.user_id=any(array[${users.map((id) => `${literal(id)}::uuid`).join(",")}])
      and ledger.payable_state not in ('not_payable','refunded')),
  'authority',(select count(*) from public.access_grants grant_row
    where grant_row.user_id=any(array[${users.map((id) => `${literal(id)}::uuid`).join(",")}])
      and (coalesce((grant_row.metadata->>'authority_granted')::boolean,false)
        or coalesce((grant_row.metadata->>'payout_access')::boolean,false)))
)::text;`;
let barrierSequence = 9_100_000;
const runRace = async ({ id, users, canonicalUser, canonicalProduct, firstSql, secondSql, secondError = null, expectedOwners = 1 }) => {
  const firstApp = `b2-${id}-first`.slice(0, 60);
  const secondApp = `b2-${id}-second`.slice(0, 60);
  const key = barrierSequence++;
  const canonical = canonicalLockIdentity(canonicalUser, canonicalProduct);
  let gate; let first; let second; let failure;
  try {
    gate = await barrier(key);
    first = session(firstApp, `begin; set local statement_timeout='10s'; ${firstSql} select pg_advisory_xact_lock(${key}); commit;`);
    await waitUntil(() => {
    const value = read(`select count(*) from pg_stat_activity where application_name=${literal(firstApp)} and wait_event_type='Lock' and wait_event='advisory' and query like '%${key}%';`);
    return Number(value) === 1;
  }, `${id} first contender reached post-operation barrier`);
    second = session(secondApp, `begin; set local statement_timeout='10s'; ${secondSql} commit;`);
    await waitUntil(() => {
    const snapshot = JSON.parse(read(`
      select json_build_object(
        'firstGranted',(select count(*) from pg_locks lock_row join pg_stat_activity activity on activity.pid=lock_row.pid where activity.application_name=${literal(firstApp)} and lock_row.locktype='advisory' and lock_row.granted and lock_row.classid=${canonical.classid} and lock_row.objid=${canonical.objid}),
        'secondWaiting',(select count(*) from pg_locks lock_row join pg_stat_activity activity on activity.pid=lock_row.pid where activity.application_name=${literal(secondApp)} and lock_row.locktype='advisory' and not lock_row.granted and lock_row.classid=${canonical.classid} and lock_row.objid=${canonical.objid})
      )::text;`));
    return Number(snapshot.firstGranted) === 1 && Number(snapshot.secondWaiting) === 1;
  }, `${id} canonical lock handoff`);
    await gate.release(); gate = null;
    const [firstResult, secondResult] = await Promise.all([first.done, second.done]);
  assert.equal(firstResult.code, 0, firstResult.stderr);
  if (secondError) {
    assert.notEqual(secondResult.code, 0, `${id} second contender unexpectedly succeeded`);
    assert.match(secondResult.stderr, secondError);
  } else {
    assert.equal(secondResult.code, 0, secondResult.stderr);
  }
    const safety = JSON.parse(read(safetySql(users)));
  assert.equal(Number(safety.owners), expectedOwners, `${id} active owner count`);
  assert.equal(Number(safety.grantOwners), expectedOwners, `${id} active Premium grant owner count`);
  assert.equal(Number(safety.payable), 0, `${id} payable state`);
    assert.equal(Number(safety.authority), 0, `${id} LiveKit/payout authority`);
  } catch (cause) { failure = cause; }
  try { if (gate) await gate.release(); } catch (cause) { failure ??= cause; }
  for (const [app, contender] of [[firstApp, first], [secondApp, second]]) {
    if (!contender || contender.child.exitCode !== null) continue;
    const terminated = admin(`select pg_terminate_backend(pid) from pg_stat_activity where application_name=${literal(app)} and pid<>pg_backend_pid();`);
    if (terminated.status !== 0) failure ??= new Error(terminated.stderr);
    try { await stopChild(contender.child, contender.done); } catch (cause) { failure ??= cause; }
  }
  if (failure) throw failure;
};
const started = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", container], { encoding: "utf8" });
assert.equal(started.status, 0, `local Supabase database container unavailable: ${container}`);
assert.equal(started.stdout.trim(), "true", `local Supabase database container is not running: ${container}`);
const premiumProducts = JSON.parse(read("select json_build_object('productCount',count(*),'productIds',json_agg(id::text order by id))::text from public.monetization_products where product_type='premium_subscription';")); const premiumMapping = JSON.parse(read(`select json_build_object('mappingCount',count(*),'productCount',count(distinct mapping.product_id),'productId',min(mapping.product_id::text))::text ${mappingSql};`));
assert.ok(Number(premiumProducts.productCount)>0); assert.equal(premiumProducts.productIds.length,Number(premiumProducts.productCount)); assert.deepEqual([Number(premiumMapping.mappingCount),Number(premiumMapping.productCount)],[1,1]); mappedProductId=premiumMapping.productId; firstTransferProductId=premiumProducts.productIds[0]; assert.ok(premiumProducts.productIds.includes(mappedProductId)); assert.match(mappedProductId,/^[0-9a-f-]{36}$/u); assert.match(firstTransferProductId,/^[0-9a-f-]{36}$/u);
try {
  {
    const [source, target] = makeUsers(2); seed(source, "source-renewal");
    await runRace({ id: "source-renewal", users: [source, target], canonicalUser: source, canonicalProduct: mappedProductId, firstSql: eventSql(source, "older-source-renewal", "RENEWAL", "2026-07-30 12:00:00+00"), secondSql: transferSql(source, target, "newer-source-transfer", "2026-07-30 13:00:00+00") });
  }
  {
    const [source, target] = makeUsers(2); seed(source, "target-renewal-source"); seed(target, "target-renewal-target");
    await runRace({ id: "target-renewal", users: [source, target], canonicalUser: target, canonicalProduct: mappedProductId, firstSql: eventSql(target, "older-target-renewal", "RENEWAL", "2026-07-30 12:00:00+00"), secondSql: transferSql(source, target, "newer-target-transfer", "2026-07-30 13:00:00+00") });
  }
  for (const eventType of ["REFUND", "REVOCATION"]) {
    const [source, target] = makeUsers(2); seed(source, `source-${eventType}`);
    await runRace({ id: `source-${eventType.toLowerCase()}`, users: [source, target], canonicalUser: source, canonicalProduct: mappedProductId, firstSql: transferSql(source, target, `older-transfer-${eventType}`, "2026-07-30 12:00:00+00"), secondSql: eventSql(source, `newer-${eventType}`, eventType, "2026-07-30 13:00:00+00", "revoked"), expectedOwners: 1 });
  }
  {
    const [source, targetA, targetB] = makeUsers(3); seed(source, "shared-source");
    await runRace({ id: "shared-source", users: [source, targetA, targetB], canonicalUser: source, canonicalProduct: firstTransferProductId, firstSql: transferSql(source, targetA, "shared-source-a", "2026-07-30 12:00:00+00"), secondSql: transferSql(source, targetB, "shared-source-b", "2026-07-30 13:00:00+00"), secondError: /transfer_source_provider_grant_ambiguous/u });
  }
  {
    const [sourceA, sourceB, target] = makeUsers(3); seed(sourceA, "shared-target-a"); seed(sourceB, "shared-target-b");
    await runRace({ id: "shared-target", users: [sourceA, sourceB, target], canonicalUser: target, canonicalProduct: firstTransferProductId, firstSql: transferSql(sourceA, target, "shared-target-a", "2026-07-30 12:00:00+00"), secondSql: transferSql(sourceB, target, "shared-target-b", "2026-07-30 13:00:00+00") });
  }
  {
    const [left, right] = makeUsers(2); seed(left, "reverse-left"); seed(right, "reverse-right");
    await runRace({ id: "reversed-users", users: [left, right], canonicalUser: [left, right].sort()[0], canonicalProduct: firstTransferProductId, firstSql: transferSql(left, right, "reverse-a", "2026-07-30 12:00:00+00"), secondSql: transferSql(right, left, "reverse-b", "2026-07-30 13:00:00+00") });
  }
  {
    const [source, target] = makeUsers(2); seed(source, "duplicate");
    const exact = transferSql(source, target, "duplicate-race", "2026-07-30 12:00:00+00");
    await runRace({ id: "duplicate", users: [source, target], canonicalUser: [source, target].sort()[0], canonicalProduct: firstTransferProductId, firstSql: exact, secondSql: exact });
    assert.equal(Number(read(`select count(*) from public.provider_events where provider_event_id like 'transfer:duplicate-race:%';`)), 2);
  }
  for (const failpoint of ["after_source", "after_target"]) {
    const [source, target] = makeUsers(2); seed(source, `failpoint-${failpoint}`);
    const result = admin(transferSql(source, target, `failpoint-${failpoint}`, "2026-07-30 12:00:00+00", failpoint));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`forced_failure_after_transfer_${failpoint.slice(6)}`, "u"));
    assert.equal(Number(read(`select count(*) from public.provider_events where provider_event_id like ${literal(`transfer:failpoint-${failpoint}:%`)};`)), 0);
    assert.equal(Number(read(activeOwnerCountSql([source, target]))), 1);
  }
  process.stdout.write(`RevenueCat transfer concurrency and atomicity: ${requiredRaces.length}/${requiredRaces.length} passed\n`);
} finally {
  if (raceUsers.length) {
    const uuidArray = `array[${raceUsers.map((id) => `${literal(id)}::uuid`).join(",")}]`;
    const textArray = `array[${raceUsers.map(literal).join(",")}]`;
    const cleanup = admin(`
      begin; set local session_replication_role=replica;
      delete from public.money_access_ledger_events ledger using public.provider_events event where ledger.provider_event_id=event.id and event.user_id=any(${uuidArray});
      delete from public.access_grants where user_id=any(${uuidArray});
      delete from public.billing_events where user_id=any(${textArray});
      delete from public.user_entitlements where user_id=any(${textArray});
      delete from public.provider_events where user_id=any(${uuidArray});
      delete from auth.users where id=any(${uuidArray}); commit;`);
    assert.equal(cleanup.status, 0, cleanup.stderr);
  }
}
