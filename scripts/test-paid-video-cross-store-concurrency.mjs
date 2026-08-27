#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const projectId = readFileSync("supabase/config.toml", "utf8")
  .match(/^project_id\s*=\s*"([^"]+)"/mu)?.[1];
assert.ok(projectId, "supabase/config.toml must declare project_id");
const container = process.env.SUPABASE_DB_CONTAINER ??
  `supabase_db_${projectId}`;
const psql = [
  "exec",
  "-i",
  container,
  "psql",
  "-X",
  "-q",
  "-A",
  "-t",
  "-v",
  "ON_ERROR_STOP=1",
  "-U",
  "postgres",
  "-d",
  "postgres",
];
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const admin = (sql, capture = false) =>
  spawnSync("docker", psql, {
    cwd: root,
    encoding: "utf8",
    input: sql,
    stdio: ["pipe", capture ? "pipe" : "ignore", "pipe"],
  });
const read = (sql) => {
  const result = admin(sql, true);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const session = (applicationName, sql) => {
  const child = spawn("docker", psql, {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const done = new Promise((resolve) =>
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  );
  child.stdin.end(
    `set application_name=${literal(applicationName)};\n${sql}\n`,
  );
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
const stopChild = async (child, done) => {
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    if (child.exitCode !== null) return;
    child.kill(signal);
    await Promise.race([done, delay(1_000)]);
  }
  assert.notEqual(child.exitCode, null, "bounded local child cleanup failed");
};
const barrier = async (key) => {
  const holder = spawn("docker", psql, {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  let error = "";
  holder.stdout.setEncoding("utf8");
  holder.stderr.setEncoding("utf8");
  holder.stdout.on("data", (chunk) => {
    output += chunk;
  });
  holder.stderr.on("data", (chunk) => {
    error += chunk;
  });
  const done = new Promise((resolve) => holder.on("close", resolve));
  holder.stdin.write(
    `select pg_catalog.pg_advisory_lock(${key}); select 'BARRIER_READY';\n`,
  );
  try {
    await waitUntil(
      () => output.includes("BARRIER_READY"),
      `barrier ${key} acquisition`,
    );
  } catch (cause) {
    holder.stdin.destroy();
    try {
      await stopChild(holder, done);
    } catch {
      // Preserve the acquisition failure.
    }
    throw cause;
  }
  return {
    release: async () => {
      holder.stdin.end(`select pg_catalog.pg_advisory_unlock(${key});\n\\q\n`);
      const code = await Promise.race([
        done,
        delay(2_000).then(() => null),
      ]);
      if (code === null) {
        try {
          await stopChild(holder, done);
        } catch {
          // Report the bounded cleanup timeout below.
        }
        throw new Error(`bounded local barrier cleanup timeout: ${key}`);
      }
      assert.equal(code, 0, error);
    },
  };
};
const waitForLock = (applicationName) =>
  waitUntil(() =>
    Number(read(`
      select count(*)
      from pg_catalog.pg_stat_activity
      where application_name=${literal(applicationName)}
        and wait_event_type='Lock'
        and wait_event='advisory';
    `)) === 1, `${applicationName} advisory lock wait`);
const waitForDatabaseLock = (applicationName) =>
  waitUntil(() =>
    Number(read(`
      select count(*)
      from pg_catalog.pg_stat_activity
      where application_name=${literal(applicationName)}
        and wait_event_type='Lock';
    `)) === 1, `${applicationName} database lock wait`);
const exactSourceLockWaitCount = (holderName, waiterName, lockText) =>
  Number(read(`
    with expected as (
      select pg_catalog.hashtextextended(${literal(lockText)},0) as lock_key
    ), lock_parts as (
      select
        ((lock_key >> 32) & 4294967295)::bigint as class_id,
        (lock_key & 4294967295)::bigint as object_id
      from expected
    )
    select count(*)
    from pg_catalog.pg_stat_activity holder_activity
    join pg_catalog.pg_locks holder_lock
      on holder_lock.pid=holder_activity.pid
     and holder_lock.locktype='advisory'
     and holder_lock.granted
    join lock_parts
      on holder_lock.classid::bigint=lock_parts.class_id
     and holder_lock.objid::bigint=lock_parts.object_id
     and holder_lock.objsubid=1
    join pg_catalog.pg_stat_activity waiter_activity
      on waiter_activity.application_name=${literal(waiterName)}
     and waiter_activity.wait_event_type='Lock'
     and waiter_activity.wait_event='advisory'
    join pg_catalog.pg_locks waiter_lock
      on waiter_lock.pid=waiter_activity.pid
     and waiter_lock.locktype='advisory'
     and not waiter_lock.granted
     and waiter_lock.classid=holder_lock.classid
     and waiter_lock.objid=holder_lock.objid
     and waiter_lock.objsubid=holder_lock.objsubid
    where holder_activity.application_name=${literal(holderName)};
  `));
const cleanupSessions = async (contenders) => {
  for (const [applicationName, contender] of contenders) {
    if (!contender || contender.child.exitCode !== null) continue;
    admin(`
      select pg_catalog.pg_terminate_backend(pid)
      from pg_catalog.pg_stat_activity
      where application_name=${literal(applicationName)}
        and pid<>pg_catalog.pg_backend_pid();
    `);
    try {
      await stopChild(contender.child, contender.done);
    } catch {
      // Preserve the primary race assertion.
    }
  }
};

const started = spawnSync(
  "docker",
  ["inspect", "-f", "{{.State.Running}}", container],
  { encoding: "utf8" },
);
assert.equal(
  started.status,
  0,
  `local Supabase database container unavailable: ${container}`,
);
assert.equal(
  started.stdout.trim(),
  "true",
  `local Supabase database is not running: ${container}`,
);

const suffix = crypto.randomUUID();
const buyerId = crypto.randomUUID();
const buyerSessionId = crypto.randomUUID();
const creatorSessionId = crypto.randomUUID();
const videoId = crypto.randomUUID();
const priceId = crypto.randomUUID();
const creatorEventId = crypto.randomUUID();
const paidEventId = crypto.randomUUID();
const buyerEmail = `paid-video-race-${suffix}@example.test`;
const creatorEmail = `paid-video-creator-${suffix}@example.test`;
const creatorId = read(`
  select candidate_id::text
  from (
    select pg_catalog.md5(
      ${literal(`paid-video-cross-store-${suffix}:`)}||candidate::text
    )::uuid as candidate_id
    from pg_catalog.generate_series(1,10000) candidate
  ) candidates
  where pg_catalog.mod(pg_catalog.hashtextextended(
    'chillywood-wave1-us-rollout-v1:'||candidate_id::text,20260814
  ),100)=0
  limit 1;
`);
assert.match(creatorId, /^[0-9a-f-]{36}$/u, "rollout creator fixture missing");

const switchKeys = [
  "revenuecat_app_store_enabled",
  "revenuecat_google_play_enabled",
  "provider_webhooks_enabled",
  "digital_sales_enabled",
  "paid_content_enabled",
  "creator_monetization_enabled",
  "live_money_enabled",
  "payouts_enabled",
];
const originalSwitchStates = JSON.parse(read(`
  select pg_catalog.jsonb_object_agg(switch_row."key",switch_row."state")::text
  from public."platform_money_kill_switches" switch_row
  where switch_row."key" in (${switchKeys.map(literal).join(",")});
`));
assert.deepEqual(
  Object.keys(originalSwitchStates).sort(),
  [...switchKeys].sort(),
  "Paid Video rail switch fixture is incomplete",
);
const restoreSwitches = Object.entries(originalSwitchStates)
  .map(([key, state]) => `(${literal(key)},${literal(state)})`)
  .join(",");

const seed = admin(`
  begin;
  update public."platform_money_kill_switches" switch_row
  set "state"=case
    when switch_row."key" in (
      'revenuecat_app_store_enabled','revenuecat_google_play_enabled',
      'provider_webhooks_enabled','digital_sales_enabled',
      'paid_content_enabled','creator_monetization_enabled'
    ) then 'sandbox_only'
    else 'off'
  end
  where switch_row."key" in (${switchKeys.map(literal).join(",")});

  set local session_replication_role=replica;
  insert into auth.users(
    id,email,email_confirmed_at,is_sso_user,is_anonymous
  ) values (
    ${literal(buyerId)}::uuid,${literal(buyerEmail)},timezone('utc'::text,now()),false,false
  ),(
    ${literal(creatorId)}::uuid,${literal(creatorEmail)},timezone('utc'::text,now()),false,false
  );
  insert into auth.sessions(id,user_id,not_after) values (
    ${literal(buyerSessionId)}::uuid,${literal(buyerId)}::uuid,
    timezone('utc'::text,now())+interval '1 day'
  ),(
    ${literal(creatorSessionId)}::uuid,${literal(creatorId)}::uuid,
    timezone('utc'::text,now())+interval '1 day'
  );
  insert into public."sandbox_monetization_testers"(
    user_id,email,status,note,expires_at
  ) values (
    ${literal(buyerId)},${literal(buyerEmail)},'active',
    'Paid Video cross-store concurrency fixture',
    timezone('utc'::text,now())+interval '1 day'
  );
  insert into public."wave1_legal_acceptances"(
    user_id,subject_hash,document_key,document_version,market,role_key,
    capability,session_generation,authority_source
  )
  select
    ${literal(buyerId)}::uuid,public."wave1_sha256"(${literal(buyerId)}),
    document."document_key",document."version",document."market",'member',
    document."capability",${literal(buyerSessionId)},'service_reconciliation'
  from public."wave1_legal_document_versions" document
  where document."active" and document."market"='UNITED_STATES'
    and document."capability"='account';
  insert into public."wave1_legal_acceptances"(
    user_id,subject_hash,document_key,document_version,market,role_key,
    capability,session_generation,authority_source
  )
  select
    ${literal(creatorId)}::uuid,public."wave1_sha256"(${literal(creatorId)}),
    document."document_key",document."version",document."market",'member',
    document."capability",${literal(creatorSessionId)},'service_reconciliation'
  from public."wave1_legal_document_versions" document
  where document."active" and document."market"='UNITED_STATES'
    and document."capability" in ('account','creator','creator_money');
  insert into public."wave1_creator_eligibility"(
    creator_user_id,state,account_status,age_18_plus,legal_accepted,
    creator_role,moderation_state,market,rollout_eligible,platform_capability,
    provider_eligible,kyc_complete,tax_complete,sanctions_clear,payout_eligible,
    authority_source,last_operation_key
  ) values (
    ${literal(creatorId)}::uuid,'VERIFIED','ACTIVE',true,true,true,'CLEAR',
    'UNITED_STATES',true,true,true,true,true,true,true,
    'paid-video-concurrency-harness',${literal(`paid-video-race-${suffix}`)}
  );
  insert into public."videos"(
    id,owner_id,title,visibility,moderation_status,storage_provider,
    storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes,
    vip_access_required
  ) values (
    ${literal(videoId)}::uuid,${literal(creatorId)}::uuid,
    'Paid Video cross-store race','public','clean','cloudflare_r2',
    'chillywood-media-origin',
    ${literal(`${creatorId}/${videoId}/source.mp4`)},
    ${literal(`${creatorId}/${videoId}/source.mp4`)},'video/mp4',1024,false
  );
  update public."videos"
  set scan_status='clean',scan_provider='concurrency_fixture',
      scan_result='clean',scanned_at=timezone('utc'::text,now()),
      quarantined_at=null
  where id=${literal(videoId)}::uuid;
  insert into public."creator_content_prices"(
    id,creator_id,content_type,content_id,is_paid,price_cents,currency,status,
    provider,provider_product_id,provider_product_key,metadata
  ) values (
    ${literal(priceId)}::uuid,${literal(creatorId)}::uuid,'creator_video',
    ${literal(videoId)}::uuid,true,99,'usd','sandbox',
    'revenuecat_google_play','cw_paid_content_access_sandbox_099',
    'paid_content_access_sandbox_099',
    '{"sandbox_only":true,"not_payable":true}'::jsonb
  );
  insert into public."creator_events"(
    id,host_user_id,event_title,event_type,status,starts_at,ends_at
  ) values (
    ${literal(creatorEventId)}::uuid,${literal(creatorId)}::uuid,
    'Event source-intent race','live_first','scheduled',
    timezone('utc'::text,now())+interval '1 day',
    timezone('utc'::text,now())+interval '2 days'
  );
  insert into public."paid_creator_events"(
    id,creator_event_id,creator_id,title,event_type,starts_at,ends_at,
    price_cents,currency,status,provider,provider_product_key,
    provider_product_id,metadata
  ) values (
    ${literal(paidEventId)}::uuid,${literal(creatorEventId)}::uuid,
    ${literal(creatorId)}::uuid,'Event source-intent race','live_first',
    timezone('utc'::text,now())+interval '1 day',
    timezone('utc'::text,now())+interval '2 days',99,'usd','sandbox',
    'revenuecat_google_play','event_pass_sandbox_099',
    'cw_event_pass_sandbox_099',
    '{"sandbox_only":true,"not_payable":true}'::jsonb
  );
  commit;
`);
assert.equal(seed.status, 0, seed.stderr);

const barrierKey = read(`
  select pg_catalog.hashtextextended(${literal(`paid-video-race-barrier:${suffix}`)},0);
`);
assert.match(barrierKey, /^-?[0-9]+$/u, "barrier key is invalid");
const sourceLockText = `creator-money-source-intent:${buyerId}:paid_content:${videoId}`;
const androidApp = `paid-video-android-${suffix}`.slice(0, 60);
const iosApp = `paid-video-ios-${suffix}`.slice(0, 60);
let gate;
let android;
let ios;
let eventAndroid;
let eventIos;
let eventProviderOne;
let eventProviderTwo;
let eventIssuer;
let linkBlocker;
let terminalProvider;
let activeProvider;
let providerEventId;
let providerOriginalId;
let terminalEventId;
let activeReplayEventId;

try {
  gate = await barrier(barrierKey);
  android = session(
    androidApp,
    `
      begin;
      set local statement_timeout='15s';
      set local role authenticated;
      select set_config(
        'request.jwt.claims',
        ${literal(JSON.stringify({
          role: "authenticated",
          sub: buyerId,
          session_id: buyerSessionId,
        }))},true
      );
      select set_config(
        'request.headers','{"x-chillywood-platform":"android"}',true
      );
      select public."create_money_purchase_intent"(
        'paid_content_access_sandbox_099','paid_content',
        ${literal(videoId)}::uuid,'{}'::jsonb
      )::text;
      select pg_catalog.pg_advisory_xact_lock(${barrierKey});
      commit;
    `,
  );
  await waitForLock(androidApp);

  ios = session(
    iosApp,
    `
      begin;
      set local statement_timeout='15s';
      set local role authenticated;
      select set_config(
        'request.jwt.claims',
        ${literal(JSON.stringify({
          role: "authenticated",
          sub: buyerId,
          session_id: buyerSessionId,
        }))},true
      );
      select set_config(
        'request.headers','{"x-chillywood-platform":"ios"}',true
      );
      select public."create_ios_creator_money_purchase_intent"(
        'paid_video',${literal(videoId)}::uuid,99,'{}'::jsonb
      )::text;
      commit;
    `,
  );

  await waitUntil(() => Number(read(`
    with expected as (
      select pg_catalog.hashtextextended(${literal(sourceLockText)},0) as lock_key
    ), lock_parts as (
      select
        ((lock_key >> 32) & 4294967295)::bigint as class_id,
        (lock_key & 4294967295)::bigint as object_id
      from expected
    )
    select count(*)
    from pg_catalog.pg_stat_activity holder_activity
    join pg_catalog.pg_locks holder_lock
      on holder_lock.pid=holder_activity.pid
     and holder_lock.locktype='advisory'
     and holder_lock.granted
    join lock_parts
      on holder_lock.classid::bigint=lock_parts.class_id
     and holder_lock.objid::bigint=lock_parts.object_id
     and holder_lock.objsubid=1
    join pg_catalog.pg_stat_activity waiter_activity
      on waiter_activity.application_name=${literal(iosApp)}
     and waiter_activity.wait_event_type='Lock'
     and waiter_activity.wait_event='advisory'
     and holder_activity.pid=any(pg_catalog.pg_blocking_pids(waiter_activity.pid))
    join pg_catalog.pg_locks waiter_lock
      on waiter_lock.pid=waiter_activity.pid
     and waiter_lock.locktype='advisory'
     and not waiter_lock.granted
     and waiter_lock.classid=holder_lock.classid
     and waiter_lock.objid=holder_lock.objid
     and waiter_lock.objsubid=holder_lock.objsubid
    where holder_activity.application_name=${literal(androidApp)};
  `)) === 1, "iOS exact buyer/video source-lock wait");

  await gate.release();
  gate = null;
  const [androidResult, iosResult] = await Promise.all([
    android.done,
    ios.done,
  ]);
  assert.equal(androidResult.code, 0, androidResult.stderr);
  assert.notEqual(
    iosResult.code,
    0,
    "iOS unexpectedly minted a second cross-store Paid Video intent",
  );
  assert.match(
    iosResult.stderr,
    /source_purchase_intent_already_pending/u,
    "iOS cross-store loser did not fail closed for the exact pending source",
  );

  const outcome = JSON.parse(read(`
    select pg_catalog.jsonb_build_object(
      'pendingCount',count(*),
      'androidCount',count(*) filter (
        where intent."provider"='revenuecat_google_play'
          and intent."provider_product_id"='cw_paid_content_access_sandbox_099'
          and intent."product_key"='paid_content_access_sandbox_099'
          and intent."amount_minor"=99
          and lower(intent."currency")='usd'
          and intent."creator_id"=${literal(creatorId)}::uuid
      ),
      'iosCount',count(*) filter (
        where intent."provider"='revenuecat_app_store'
      )
    )::text
    from public."money_purchase_intents" intent
    where intent."user_id"=${literal(buyerId)}::uuid
      and intent."source_type"='paid_content'
      and intent."source_id"=${literal(videoId)}::uuid
      and intent."status"='pending'
      and intent."expires_at">timezone('utc'::text,now());
  `));
  assert.deepEqual(outcome, {
    pendingCount: 1,
    androidCount: 1,
    iosCount: 0,
  });

  process.stdout.write(
    "Paid Video Android/iOS source-intent concurrency: 3/3 passed\n",
  );

  const eventBarrierKey = read(`
    select pg_catalog.hashtextextended(
      ${literal(`event-source-intent-barrier:${suffix}`)},0
    );
  `);
  const eventSourceLockText =
    `creator-money-source-intent:${buyerId}:event:${creatorEventId}`;
  const eventAndroidApp = `event-direct-generic-${suffix}`.slice(0, 60);
  const eventIosApp = `event-specialized-ios-${suffix}`.slice(0, 60);

  gate = await barrier(eventBarrierKey);
  eventAndroid = session(
    eventAndroidApp,
    `
      begin;
      set local statement_timeout='15s';
      set local role authenticated;
      select set_config(
        'request.jwt.claims',
        ${literal(JSON.stringify({
          role: "authenticated",
          sub: buyerId,
          session_id: buyerSessionId,
        }))},true
      );
      select set_config(
        'request.headers','{"x-chillywood-platform":"android"}',true
      );
      select public."create_money_purchase_intent"(
        'event_pass_sandbox_099','event',
        ${literal(creatorEventId)}::uuid,'{}'::jsonb
      )::text;
      select pg_catalog.pg_advisory_xact_lock(${eventBarrierKey});
      commit;
    `,
  );
  await waitForLock(eventAndroidApp);

  eventIos = session(
    eventIosApp,
    `
      begin;
      set local statement_timeout='15s';
      set local role authenticated;
      select set_config(
        'request.jwt.claims',
        ${literal(JSON.stringify({
          role: "authenticated",
          sub: buyerId,
          session_id: buyerSessionId,
        }))},true
      );
      select set_config(
        'request.headers','{"x-chillywood-platform":"ios"}',true
      );
      select public."create_paid_creator_event_pass_purchase_intent"(
        ${literal(paidEventId)}::uuid
      )::text;
      commit;
    `,
  );
  await waitUntil(
    () =>
      exactSourceLockWaitCount(
        eventAndroidApp,
        eventIosApp,
        eventSourceLockText,
      ) === 1,
    "specialized iOS Event exact-source wait behind direct generic issuance",
  );
  await gate.release();
  gate = null;
  const [eventAndroidResult, eventIosResult] = await Promise.all([
    eventAndroid.done,
    eventIos.done,
  ]);
  assert.equal(eventAndroidResult.code, 0, eventAndroidResult.stderr);
  assert.notEqual(
    eventIosResult.code,
    0,
    "specialized Event checkout unexpectedly reused a generic live intent",
  );
  assert.match(
    eventIosResult.stderr,
    /source_purchase_intent_already_pending/u,
    "specialized Event checkout did not fail closed on the generic live intent",
  );
  assert.deepEqual(JSON.parse(read(`
    select pg_catalog.jsonb_build_object(
      'pendingCount',count(*),
      'googleCount',count(*) filter (
        where intent."provider"='revenuecat_google_play'
          and intent."provider_product_id"='cw_event_pass_sandbox_099'
          and intent."creator_id"=${literal(creatorId)}::uuid
          and intent."amount_minor"=99
          and lower(intent."currency")='usd'
      ),
      'appStoreCount',count(*) filter (
        where intent."provider"='revenuecat_app_store'
      )
    )::text
    from public."money_purchase_intents" intent
    where intent."user_id"=${literal(buyerId)}::uuid
      and intent."source_type"='event'
      and intent."source_id"=${literal(creatorEventId)}::uuid
      and intent."status"='pending'
      and intent."expires_at">timezone('utc'::text,now());
  `)), {
    pendingCount: 1,
    googleCount: 1,
    appStoreCount: 0,
  });

  const providerBarrierKey = read(`
    select pg_catalog.hashtextextended(
      ${literal(`event-provider-barrier:${suffix}`)},0
    );
  `);
  providerEventId = `event-source-provider-${suffix}`;
  providerOriginalId = `event-source-original-${suffix}`;
  const providerHash = crypto.createHash("sha256")
    .update(`event-source-provider:${suffix}`)
    .digest("hex");
  const eventProviderOneApp = `event-provider-one-${suffix}`.slice(0, 60);
  const eventProviderTwoApp = `event-provider-two-${suffix}`.slice(0, 60);
  const eventIssuerApp = `event-issuer-race-${suffix}`.slice(0, 60);
  const providerCall = `
    select public."process_revenuecat_google_play_event_atomic"(
      ${literal(providerEventId)},'NON_RENEWING_PURCHASE',
      ${literal(buyerId)}::uuid,'cw_event_pass_sandbox_099','sandbox',
      timezone('utc'::text,now()),null,99,'usd',${literal(providerHash)},
      ${literal(providerOriginalId)},null
    )::text;
  `;

  gate = await barrier(providerBarrierKey);
  eventProviderOne = session(
    eventProviderOneApp,
    `
      begin;
      set local statement_timeout='15s';
      set local role service_role;
      ${providerCall}
      select pg_catalog.pg_advisory_xact_lock(${providerBarrierKey});
      commit;
    `,
  );
  await waitForLock(eventProviderOneApp);

  eventProviderTwo = session(
    eventProviderTwoApp,
    `
      begin;
      set local statement_timeout='15s';
      set local role service_role;
      ${providerCall}
      commit;
    `,
  );
  await waitUntil(
    () =>
      exactSourceLockWaitCount(
        eventProviderOneApp,
        eventProviderTwoApp,
        eventSourceLockText,
      ) === 1,
    "duplicate provider callback exact-source wait",
  );

  eventIssuer = session(
    eventIssuerApp,
    `
      begin;
      set local statement_timeout='15s';
      set local role authenticated;
      select set_config(
        'request.jwt.claims',
        ${literal(JSON.stringify({
          role: "authenticated",
          sub: buyerId,
          session_id: buyerSessionId,
        }))},true
      );
      select set_config(
        'request.headers','{"x-chillywood-platform":"android"}',true
      );
      select public."create_money_purchase_intent"(
        'event_pass_sandbox_099','event',
        ${literal(creatorEventId)}::uuid,'{}'::jsonb
      )::text;
      commit;
    `,
  );
  await waitUntil(
    () =>
      exactSourceLockWaitCount(
        eventProviderOneApp,
        eventIssuerApp,
        eventSourceLockText,
      ) === 1,
    "issuance exact-source wait behind provider reconciliation",
  );

  await gate.release();
  gate = null;
  const [providerOneResult, providerTwoResult, eventIssuerResult] =
    await Promise.all([
      eventProviderOne.done,
      eventProviderTwo.done,
      eventIssuer.done,
    ]);
  assert.equal(providerOneResult.code, 0, providerOneResult.stderr);
  assert.equal(providerTwoResult.code, 0, providerTwoResult.stderr);
  assert.notEqual(
    eventIssuerResult.code,
    0,
    "issuance racing provider completion unexpectedly minted another intent",
  );
  assert.match(
    eventIssuerResult.stderr,
    /source_access_already_established/u,
    "post-lock issuance did not recheck exact historical Event authority",
  );
  assert.deepEqual(JSON.parse(read(`
    select pg_catalog.jsonb_build_object(
      'providerEvents',(
        select count(*) from public."provider_events" event
        where event."provider"='revenuecat_google_play'
          and event."provider_event_id"=${literal(providerEventId)}
          and event."status"='processed'
      ),
      'transactionLinks',(
        select count(*)
        from public."revenuecat_consumable_transaction_intents" link
        where link."provider"='revenuecat_google_play'
          and link."original_transaction_id"=${literal(providerOriginalId)}
          and link."binding_state"='exact'
      ),
      'ledgerEvents',(
        select count(*) from public."money_access_ledger_events" ledger
        join public."provider_events" event on event."id"=ledger."provider_event_id"
        where event."provider_event_id"=${literal(providerEventId)}
      ),
      'accessGrants',(
        select count(*) from public."access_grants" grant_row
        where grant_row."user_id"=${literal(buyerId)}::uuid
          and grant_row."grant_type"='event_pass'
          and grant_row."source_id"=${literal(creatorEventId)}::uuid
          and grant_row."status"='sandbox_only'
      ),
      'consumedIntents',(
        select count(*) from public."money_purchase_intents" intent
        where intent."user_id"=${literal(buyerId)}::uuid
          and intent."source_type"='event'
          and intent."source_id"=${literal(creatorEventId)}::uuid
          and intent."status"='consumed'
      ),
      'pendingIntents',(
        select count(*) from public."money_purchase_intents" intent
        where intent."user_id"=${literal(buyerId)}::uuid
          and intent."source_type"='event'
          and intent."source_id"=${literal(creatorEventId)}::uuid
          and intent."status"='pending'
          and intent."expires_at">timezone('utc'::text,now())
      )
    )::text;
  `)), {
    providerEvents: 1,
    transactionLinks: 1,
    ledgerEvents: 1,
    accessGrants: 1,
    consumedIntents: 1,
    pendingIntents: 0,
  });

  const terminalBarrierKey = read(`
    select pg_catalog.hashtextextended(
      ${literal(`event-terminal-order-barrier:${suffix}`)},0
    );
  `);
  terminalEventId = `event-source-terminal-${suffix}`;
  activeReplayEventId = `event-source-active-replay-${suffix}`;
  const terminalHash = crypto.createHash("sha256")
    .update(`event-source-terminal:${suffix}`)
    .digest("hex");
  const activeReplayHash = crypto.createHash("sha256")
    .update(`event-source-active-replay:${suffix}`)
    .digest("hex");
  const linkBlockerApp = `event-link-blocker-${suffix}`.slice(0, 60);
  const terminalProviderApp = `event-terminal-provider-${suffix}`.slice(0, 60);
  const activeProviderApp = `event-active-provider-${suffix}`.slice(0, 60);

  gate = await barrier(terminalBarrierKey);
  linkBlocker = session(
    linkBlockerApp,
    `
      begin;
      set local statement_timeout='15s';
      select 1
      from public."revenuecat_consumable_transaction_intents" link
      where link."provider"='revenuecat_google_play'
        and link."original_transaction_id"=${literal(providerOriginalId)}
      for update;
      select pg_catalog.pg_advisory_xact_lock(${terminalBarrierKey});
      commit;
    `,
  );
  await waitForLock(linkBlockerApp);

  terminalProvider = session(
    terminalProviderApp,
    `
      begin;
      set local statement_timeout='15s';
      set local role service_role;
      select public."process_revenuecat_terminal_event_atomic"(
        'revenuecat_google_play',${literal(terminalEventId)},'REFUND',
        ${literal(buyerId)}::uuid,'cw_event_pass_sandbox_099',null,
        'sandbox','refunded',null,null,timezone('utc'::text,now()),
        ${literal(terminalHash)},'NORMAL','google_play','android',
        ${literal(providerOriginalId)}
      )::text;
      commit;
    `,
  );
  await waitForDatabaseLock(terminalProviderApp);

  activeProvider = session(
    activeProviderApp,
    `
      begin;
      set local statement_timeout='15s';
      set local role service_role;
      select public."process_revenuecat_google_play_event_atomic"(
        ${literal(activeReplayEventId)},'NON_RENEWING_PURCHASE',
        ${literal(buyerId)}::uuid,'cw_event_pass_sandbox_099','sandbox',
        timezone('utc'::text,now()),null,99,'usd',
        ${literal(activeReplayHash)},${literal(providerOriginalId)},null
      )::text;
      commit;
    `,
  );
  await waitForLock(activeProviderApp);
  assert.equal(
    Number(read(`
      with expected as (
        select pg_catalog.hashtextextended(${literal(eventSourceLockText)},0)
          as lock_key
      ), lock_parts as (
        select ((lock_key >> 32) & 4294967295)::bigint as class_id,
          (lock_key & 4294967295)::bigint as object_id
        from expected
      )
      select count(*)
      from pg_catalog.pg_stat_activity activity
      join pg_catalog.pg_locks held on held.pid=activity.pid
        and held.locktype='advisory' and held.granted
      join lock_parts on held.classid::bigint=lock_parts.class_id
        and held.objid::bigint=lock_parts.object_id and held.objsubid=1
      where activity.application_name=${literal(activeProviderApp)};
    `)),
    1,
    "active provider callback did not hold the exact source before original lock",
  );

  await gate.release();
  gate = null;
  const [linkBlockerResult, terminalResult, activeReplayResult] =
    await Promise.all([
      linkBlocker.done,
      terminalProvider.done,
      activeProvider.done,
    ]);
  assert.equal(linkBlockerResult.code, 0, linkBlockerResult.stderr);
  assert.equal(terminalResult.code, 0, terminalResult.stderr);
  assert.equal(activeReplayResult.code, 0, activeReplayResult.stderr);
  assert.deepEqual(JSON.parse(read(`
    select pg_catalog.jsonb_build_object(
      'terminalStatus',(
        select event."status" from public."provider_events" event
        where event."provider"='revenuecat_google_play'
          and event."provider_event_id"=${literal(terminalEventId)}
      ),
      'activeReplayStatus',(
        select event."status" from public."provider_events" event
        where event."provider"='revenuecat_google_play'
          and event."provider_event_id"=${literal(activeReplayEventId)}
      ),
      'activeReplayReason',(
        select event."metadata"->>'final_reason'
        from public."provider_events" event
        where event."provider"='revenuecat_google_play'
          and event."provider_event_id"=${literal(activeReplayEventId)}
      ),
      'terminalLink',(
        select link."terminal"
        from public."revenuecat_consumable_transaction_intents" link
        where link."provider"='revenuecat_google_play'
          and link."original_transaction_id"=${literal(providerOriginalId)}
      )
    )::text;
  `)), {
    terminalStatus: "refunded",
    activeReplayStatus: "ignored",
    activeReplayReason: "original_transaction_already_bound",
    terminalLink: true,
  });
  process.stdout.write(
    "Active/terminal provider lock-order concurrency: 4/4 passed\n",
  );
  process.stdout.write(
    "Event generic/iOS/provider source-intent concurrency: 7/7 passed\n",
  );
} finally {
  if (gate) await gate.release();
  await cleanupSessions([
    [androidApp, android],
    [iosApp, ios],
    [`event-direct-generic-${suffix}`.slice(0, 60), eventAndroid],
    [`event-specialized-ios-${suffix}`.slice(0, 60), eventIos],
    [`event-provider-one-${suffix}`.slice(0, 60), eventProviderOne],
    [`event-provider-two-${suffix}`.slice(0, 60), eventProviderTwo],
    [`event-issuer-race-${suffix}`.slice(0, 60), eventIssuer],
    [`event-link-blocker-${suffix}`.slice(0, 60), linkBlocker],
    [`event-terminal-provider-${suffix}`.slice(0, 60), terminalProvider],
    [`event-active-provider-${suffix}`.slice(0, 60), activeProvider],
  ]);
  const cleanup = admin(`
    begin;
    set local session_replication_role=replica;
    delete from public."creator_event_transactions"
    where "creator_event_id"=${literal(creatorEventId)}::uuid;
    delete from public."paid_creator_event_passes"
    where "creator_event_id"=${literal(creatorEventId)}::uuid;
    delete from public."access_grants"
    where "user_id"=${literal(buyerId)}::uuid
      and "grant_type"='event_pass'
      and "source_id"=${literal(creatorEventId)}::uuid;
    delete from public."money_access_ledger_events"
    where "user_id"=${literal(buyerId)}::uuid
      and "source_type"='event'
      and "source_id"=${literal(creatorEventId)}::uuid;
    delete from public."revenuecat_provider_reconciliation_obligations"
    where "user_id"=${literal(buyerId)}::uuid
      and "original_transaction_id"=${literal(providerOriginalId)};
    delete from public."revenuecat_consumable_transaction_intents"
    where "provider"='revenuecat_google_play'
      and "original_transaction_id"=${literal(providerOriginalId)};
    delete from public."provider_events"
    where "provider"='revenuecat_google_play'
      and "provider_event_id" in (
        ${literal(providerEventId)},${literal(terminalEventId)},
        ${literal(activeReplayEventId)}
      );
    delete from public."money_purchase_intents"
    where "user_id"=${literal(buyerId)}::uuid
      and "source_id" in (
        ${literal(videoId)}::uuid,${literal(creatorEventId)}::uuid
      );
    delete from public."paid_creator_events"
    where "id"=${literal(paidEventId)}::uuid;
    delete from public."creator_events"
    where "id"=${literal(creatorEventId)}::uuid;
    delete from public."creator_content_prices"
    where "id"=${literal(priceId)}::uuid;
    delete from public."videos" where "id"=${literal(videoId)}::uuid;
    delete from public."wave1_creator_eligibility"
    where "creator_user_id"=${literal(creatorId)}::uuid;
    delete from public."wave1_legal_acceptances"
    where "user_id" in (
      ${literal(buyerId)}::uuid,${literal(creatorId)}::uuid
    );
    delete from public."sandbox_monetization_testers"
    where "user_id"=${literal(buyerId)};
    delete from auth.sessions where "id" in (
      ${literal(buyerSessionId)}::uuid,${literal(creatorSessionId)}::uuid
    );
    delete from auth.users where "id" in (
      ${literal(buyerId)}::uuid,${literal(creatorId)}::uuid
    );
    update public."platform_money_kill_switches" switch_row
    set "state"=original."state"
    from (values ${restoreSwitches}) as original("key","state")
    where switch_row."key"=original."key";
    commit;
  `);
  assert.equal(cleanup.status, 0, cleanup.stderr);
}
