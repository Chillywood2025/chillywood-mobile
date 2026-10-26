#!/usr/bin/env node
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
// Native PostgreSQL only: actual distinct backend sessions and observed lock
// waits. Requires a reset, fully migrated LOCAL Supabase Docker container.
// All fixture writes occur in a disposable pg_dump/restore clone. No database
// URL, remote Docker endpoint, provider call, or production mutation is used.
// Run: node scripts/test-platform-studio-authority-concurrency.mjs
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { runStudioRollingHttp } from "./studio-rolling-http-fixture.mjs";

if (process.argv.includes("--help")) {
  console.log("Run against a local, fully migrated Supabase Docker container. Optional SUPABASE_DB_CONTAINER must name a running supabase_db_* CLI container. The script clones postgres, tests actual lock waits, and drops only its generated clone. No remote endpoints accepted.");
  process.exit(0);
}
assert.equal(process.argv.length, 2, "no database URL or positional arguments are accepted");
const root = process.cwd();
const projectId = readFileSync(path.join(root, "supabase/config.toml"), "utf8")
  .match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"\s*(?:#.*)?$/mu)?.[1];
assert.ok(projectId, "local supabase/config.toml must declare a safe project_id");
const container = process.env.SUPABASE_DB_CONTAINER
  || `supabase_db_${projectId}`;
assert.match(container, /^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const cloneGuardRestore = createBrandGuardCloneRestorer({container});
const database = `codex_studio_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
assert.match(database, /^codex_studio_[0-9]+_[a-f0-9]{12}$/u);
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const psqlArgs = (target = database) => ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
  "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", target];
const docker = (args, input, encoding = "utf8") => spawnSync("docker", args, {
  cwd: root, encoding, input, maxBuffer: 256 * 1024 * 1024,
});
function success(result, label) {
  assert.equal(result.status, 0, `${label}: ${result.error?.message || String(result.stderr || "").replaceAll(/[A-Za-z0-9_-]{40,}/gu, "<redacted>")}`);
  return result.stdout;
}
function query(sql, target = database) {
  return success(docker(psqlArgs(target), sql), "local PostgreSQL assertion").trim();
}
const admin = (args, input, encoding = "utf8") => docker([
  "exec", ...(input === undefined ? [] : ["-i"]), container, "sh", "-lc",
  'PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"', "studio-concurrency-admin", ...args,
], input, encoding);
function openSession(name, sql) {
  const child = spawn("docker", psqlArgs(), { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data", (part) => { stdout += part; });
  child.stderr.on("data", (part) => { stderr += part; });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  child.stdin.write(`set application_name=${literal(name)};\n${sql}\n`);
  return { child, done, output: () => stdout };
}
async function waitUntil(predicate, label) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(25);
  }
  throw new Error(`native PostgreSQL concurrency timeout: ${label}`);
}
async function terminate(name, session) {
  if (!session || session.child.exitCode !== null) return;
  query(`select pg_terminate_backend(pid) from pg_stat_activity
    where datname=current_database() and application_name=${literal(name)} and pid<>pg_backend_pid();`);
  session.child.kill("SIGTERM");
  await Promise.race([session.done, delay(1_000)]);
}
const actor = () => ({ user: randomUUID(), session: randomUUID() });
const owner = actor(), otherOwner = actor(), follower = actor(), requester = actor(), secondRequester = actor();
const actors = [owner, otherOwner, follower, requester, secondRequester];
const claims = (person) => `set local role authenticated;
  select set_config('request.jwt.claim.role','authenticated',true);
  select set_config('request.jwt.claims',${literal(JSON.stringify({ role: "authenticated", sub: person.user, session_id: person.session }))},true);`;
const full = (person, patch = {}) => ({ ...{"owner_user_id":"","hero_image_asset_id":null,"hero_video_asset_id":null,"hero_poster_asset_id":null,"background_image_asset_id":null,"avatar_asset_id":null,"logo_asset_id":null,"watermark_asset_id":null,"spotlight_video_id":null,"theme_preset":"city_night","accent_color":"#DC143C","hero_fit_mode":"fill","hero_focal_x":0.5,"hero_focal_y":0.5,"hero_crop_scale":1,"background_fit_mode":"fill","background_focal_x":0.5,"background_focal_y":0.5,"overlay_strength":0.7,"blur_strength":0}, owner_user_id: person.user, ...patch });
const publish = (person, patch) => `${claims(person)}
  select public.publish_platform_brand_profile(${literal(JSON.stringify(full(person, patch)))}::jsonb);`;
const review = (id, status) => `${claims(owner)}
  select public.review_channel_audience_request(${id},${literal(status)});`;
// These are the two separate writes made by the historical Audience helper.
// The first request must never create a relationship before the exact-id review.
const legacyFollowerPreflight = (person) => `${claims(owner)}
  insert into public.channel_followers(channel_user_id,follower_user_id,updated_at)
    values(${literal(owner.user)},${literal(person.user)},clock_timestamp());`;
const legacyReview = (id, status, person = owner) => `${claims(person)}
  update public.channel_audience_requests set status=${literal(status)},
    reviewed_at=clock_timestamp(),reviewed_by=${literal(person.user)},updated_at=clock_timestamp()
    where id=${id} returning id,status;`;
const legacyDraft = (person, patch, publishedAt) => {
  const payload = { ...full(person, patch), published_at: publishedAt };
  const columns = Object.keys(payload);
  return `${claims(person)}
    insert into public.platform_brand_profiles(${columns.join(",")})
      select ${columns.join(",")} from jsonb_populate_record(null::public.platform_brand_profiles,
        ${literal(JSON.stringify(payload))}::jsonb)
    on conflict(owner_user_id) do update set ${columns.filter(column => column !== "owner_user_id")
      .map(column => `${column}=excluded.${column}`).join(",")};`;
};
let checks = 0;
const pass = (label) => { checks++; console.log(`PASS ${label}`); };
async function serializedRace(label, firstSql, secondSql, { secondError = null, inspectHeld = null, whileBlocked = null } = {}) {
  const firstName = `studio-${label}-first-${process.pid}`, secondName = `studio-${label}-second-${process.pid}`;
  let first, second;
  try {
    first = openSession(firstName, `begin; set local statement_timeout='20s';\n${firstSql}\nselect 'STUDIO_HOLDER_READY';`);
    await waitUntil(() => first.output().includes("STUDIO_HOLDER_READY"), `${label}: first operation`);
    if (inspectHeld) inspectHeld();
    second = openSession(secondName, `begin; set local statement_timeout='20s';\n${secondSql}\ncommit;\n\\q\n`);
    second.child.stdin.end();
    await waitUntil(() => query(`select count(*) from pg_stat_activity where datname=current_database()
      and application_name=${literal(secondName)} and wait_event_type='Lock';`) === "1", `${label}: real lock wait`);
    if (whileBlocked) await whileBlocked();
    first.child.stdin.end("commit;\n\\q\n");
    const [a, b] = await Promise.all([first.done, second.done]);
    assert.equal(a.code, 0, a.stderr);
    if (secondError) {
      assert.notEqual(b.code, 0, `${label}: conflicting operation unexpectedly succeeded`);
      assert.match(b.stderr, secondError);
    } else assert.equal(b.code, 0, b.stderr);
    pass(`${label}: second backend waited on a real lock`);
  } finally {
    await terminate(firstName, first);
    await terminate(secondName, second);
  }
}
const sourceFingerprintSql = `select jsonb_build_object(
  'auth_users',(select count(*) from auth.users),
  'requests',(select count(*) from public.channel_audience_requests),
  'followers',(select count(*) from public.channel_followers),
  'drafts',(select count(*) from public.platform_brand_profiles),
  'publications',(select count(*) from public.platform_brand_publications),
  'policy',(select datallowconn::text||':'||datistemplate::text||':'||datconnlimit::text
    from pg_database where datname=current_database()))::text;`;
let cloned = false;
let sourceFingerprint;
try {
  if (process.env.DOCKER_HOST) assert.match(process.env.DOCKER_HOST, /^(unix|npipe):\/\//u, "remote Docker is forbidden");
  const endpoint = success(docker(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]), "local Docker required").trim();
  assert.match(endpoint, /^(unix|npipe):\/\//u, "remote Docker context is forbidden");
  const containers = success(docker(["ps", "--filter", "label=com.supabase.cli.project", "--format", "{{.Names}}"]), "local Supabase container discovery").trim().split("\n");
  assert.ok(containers.includes(container), "selected local Supabase CLI database is not running");
  assert.equal(query("select to_regprocedure('public.publish_platform_brand_profile(jsonb)') is not null;", "postgres"), "t", "local source must include the migration");
  sourceFingerprint = query(sourceFingerprintSql, "postgres");
  success(docker(["exec", container, "createdb", "-U", "postgres", "-T", "template0", database]), "create disposable clone");
  cloned = true;
  success(docker(psqlArgs(), "create schema vault; create extension supabase_vault with schema vault;"), "initialize clone extensions");
  const dump = admin(["pg_dump", "-U", "supabase_admin",
    "--exclude-extension=pg_cron", "--exclude-extension=supabase_vault", "--exclude-extension=pg_graphql",
    "--exclude-schema=cron", "--exclude-schema=realtime", "--exclude-schema=_realtime",
    "--exclude-schema=vault", "--exclude-schema=graphql", "--exclude-schema=graphql_public", "postgres"], undefined, null);
  success(dump, "read-only export of local source");
  success(admin(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database], cloneGuardRestore.prepare(dump.stdout, database), null), "restore disposable clone");

  for (const [index, person] of actors.entries()) {
    query(`insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at)
      values(${literal(person.user)},false,false,now());`);
    assert.equal(query(`select count(*) from public.user_profiles where user_id=${literal(person.user)};`), "1",
      "real auth signup trigger must create the fixture Profile before customization");
    query(`insert into auth.sessions(id,user_id,not_after) values(${literal(person.session)},${literal(person.user)},now()+interval '1 day');
      insert into public.user_profiles(user_id,username,display_name,platform_access_visibility,follower_surface_enabled)
        values(${literal(person.user)},${literal("studioc" + person.user.replaceAll("-", "").slice(0, 15))},'Concurrency fixture','public',true)
        on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name,
          platform_access_visibility=excluded.platform_access_visibility,follower_surface_enabled=excluded.follower_surface_enabled;
      insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
        select ${literal(person.user)}::uuid,public.wave1_sha256(${literal(person.user)}),d.document_key,d.version,d.market,
          'member',d.capability,${literal(person.session)},'service_reconciliation'
        from public.wave1_legal_document_versions d where d.active and d.market='UNITED_STATES' and d.capability='account';`);
    assert.deepEqual(JSON.parse(query(`select jsonb_build_object('username',username,'display_name',display_name,
      'platform_access_visibility',platform_access_visibility,'follower_surface_enabled',follower_surface_enabled)::text
      from public.user_profiles where user_id=${literal(person.user)};`)), {
      username: "studioc" + person.user.replaceAll("-", "").slice(0, 15), display_name: "Concurrency fixture",
      platform_access_visibility: "public", follower_surface_enabled: true,
    }, "native fixture must override every intended signup-created Profile field");
    if (index < 2) {
      query("update public.platform_money_kill_switches set state='sandbox_only' where key in ('revenuecat_google_play_enabled','provider_webhooks_enabled');");
      assert.equal(query(`select public.process_revenuecat_premium_event_atomic(
        'revenuecat_google_play',${literal("studio-event-" + person.user)},'INITIAL_PURCHASE',${literal(person.user)}::uuid,
        p.provider_product_id,p.provider_base_plan_id,'sandbox','active',now()-interval '1 minute',now()+interval '1 day',
        now(),999,'usd',repeat('1',64),'NORMAL','google_play','android',null,p.id,${literal("studio-original-" + person.user)})->>'status'
        from public.monetization_products p where p.provider='revenuecat_google_play' and p.environment='sandbox'
          and p.product_type='premium_subscription' and p.status='sandbox' order by p.created_at,p.id limit 1;`), "processed", "fixture Premium must use canonical provider projector");
      query(`begin; ${publish(person, {})} commit;`);
    }
  }
  await runStudioRollingHttp({ container, database, owner, requester, query, full, pass });
  query(`begin; ${publish(owner, {})} commit;`);
  const newRequest = (person) => query(`insert into public.channel_audience_requests(channel_user_id,requester_user_id)
    values(${literal(owner.user)},${literal(person.user)}) returning id;`);
  const requestId = newRequest(requester);
  await serializedRace("approve-decline", review(requestId, "approved"), review(requestId, "declined"), {
    secondError: /audience_request_not_pending/u,
    inspectHeld: () => {
      assert.equal(query(`select status from public.channel_audience_requests where id=${requestId};`), "pending");
      assert.equal(query(`select count(*) from public.channel_followers where channel_user_id=${literal(owner.user)} and follower_user_id=${literal(requester.user)};`), "0");
    },
  });
  assert.equal(query(`select status from public.channel_audience_requests where id=${requestId};`), "approved");
  assert.equal(query(`select count(*) from public.channel_followers where channel_user_id=${literal(owner.user)} and follower_user_id=${literal(requester.user)};`), "1");

  const secondId = newRequest(secondRequester);
  await serializedRace("duplicate-approval", review(secondId, "approved"), review(secondId, "approved"));
  assert.equal(query(`select count(*) from public.channel_followers where channel_user_id=${literal(owner.user)} and follower_user_id=${literal(secondRequester.user)};`), "1");
  const thirdId = newRequest(follower);
  await serializedRace("decline-approve", review(thirdId, "declined"), review(thirdId, "approved"), { secondError: /audience_request_not_pending/u });
  assert.equal(query(`select count(*) from public.channel_followers where channel_user_id=${literal(owner.user)} and follower_user_id=${literal(follower.user)};`), "0");

  const resetAudience = (person) => {
    query(`delete from public.channel_audience_requests where channel_user_id=${literal(owner.user)}
      and requester_user_id=${literal(person.user)};
      delete from public.channel_followers where channel_user_id=${literal(owner.user)}
      and follower_user_id=${literal(person.user)};`);
    return newRequest(person);
  };
  const audienceState = (id, person) => JSON.parse(query(`select jsonb_build_object(
    'status',(select status from public.channel_audience_requests where id=${id}),
    'followers',(select count(*) from public.channel_followers where channel_user_id=${literal(owner.user)}
      and follower_user_id=${literal(person.user)}))::text;`));
  let legacyId = resetAudience(requester);
  query(`begin; ${legacyFollowerPreflight(requester)} commit;`);
  assert.deepEqual(audienceState(legacyId, requester), { status: "pending", followers: 0 },
    "interrupted old first request cannot commit a follower or review");
  query(`begin; ${review(legacyId, "approved")} commit;`);
  query(`begin; ${legacyReview(legacyId, "approved")} commit;`);
  assert.deepEqual(audienceState(legacyId, requester), { status: "approved", followers: 1 },
    "a lost final response followed by an old/new retry remains idempotent");
  pass("legacy preflight interruption and mixed-version retry preserve one atomic approval");

  for (const [label, firstLegacy, firstStatus, secondStatus] of [
    ["legacy-approve-rpc-decline", true, "approved", "declined"],
    ["rpc-decline-legacy-approve", false, "declined", "approved"],
    ["legacy-approve-rpc-approve", true, "approved", "approved"],
    ["rpc-approve-legacy-approve", false, "approved", "approved"],
  ]) {
    legacyId = resetAudience(requester);
    query(`begin; ${legacyFollowerPreflight(requester)} commit;`);
    const first = firstLegacy ? legacyReview(legacyId, firstStatus) : review(legacyId, firstStatus);
    const second = firstLegacy ? review(legacyId, secondStatus) : legacyReview(legacyId, secondStatus);
    await serializedRace(label, first, second, {
      secondError: firstStatus === secondStatus ? null : /audience_request_not_pending/u,
      inspectHeld: () => assert.deepEqual(audienceState(legacyId, requester), { status: "pending", followers: 0 },
        "neither request state nor follower leaks before the winning transaction commits"),
    });
    assert.deepEqual(audienceState(legacyId, requester), {
      status: firstStatus, followers: firstStatus === "approved" ? 1 : 0,
    });
  }

  legacyId = resetAudience(requester);
  query(`begin; ${legacyFollowerPreflight(requester)} commit;
    begin; ${claims(requester)} delete from public.channel_audience_requests where id=${legacyId}; commit;`);
  const replacementId = newRequest(requester);
  assert.notEqual(replacementId, legacyId);
  query(`begin; ${legacyReview(legacyId, "approved")} commit;`);
  assert.deepEqual(audienceState(replacementId, requester), { status: "pending", followers: 0 },
    "old exact-id review cannot approve a canceled request's replacement");
  query(`begin; ${review(replacementId, "approved")} commit;`);
  assert.deepEqual(audienceState(replacementId, requester), { status: "approved", followers: 1 });
  pass("cancellation and recreation cannot retarget an interrupted old approval");

  legacyId = resetAudience(requester);
  const legacyLock = `select id from public.channel_audience_requests where id=${legacyId} for update;`;
  for (const [label, operation] of [
    ["queued-legacy-review-session-cutoff", legacyReview(legacyId, "approved")],
  ]) {
    await serializedRace(label, legacyLock, operation, {
      secondError: /audience_review_current_session_required/u,
      whileBlocked: () => query(`update auth.sessions set not_after=clock_timestamp()
        where id=${literal(owner.session)};`),
    });
    assert.deepEqual(audienceState(legacyId, requester), { status: "pending", followers: 0 });
    query(`update auth.sessions set not_after=now()+interval '1 day' where id=${literal(owner.session)};`);
  }
  await serializedRace("legacy-review-follower-wait-session-cutoff",
    `${claims(requester)} insert into public.channel_followers(channel_user_id,follower_user_id)
      values(${literal(owner.user)},${literal(requester.user)});`, legacyReview(legacyId, "approved"), {
      secondError: /audience_review_current_session_required/u,
      whileBlocked: () => query(`update auth.sessions set not_after=clock_timestamp()
        where id=${literal(owner.session)};`),
    });
  assert.deepEqual(audienceState(legacyId, requester), { status: "pending", followers: 1 },
    "legitimate self-follow commits, but expired queued legacy review must stay pending");
  query(`update auth.sessions set not_after=now()+interval '1 day' where id=${literal(owner.session)};
    delete from public.channel_followers where channel_user_id=${literal(owner.user)}
      and follower_user_id=${literal(requester.user)};
    insert into public.platform_role_memberships(user_id,role,status,expires_at)
      values(${literal(otherOwner.user)},'operator','active',clock_timestamp()+interval '1 day');`);
  await serializedRace("queued-legacy-review-role-cutoff", legacyLock, legacyReview(legacyId, "approved", otherOwner), {
    secondError: /audience_review_forbidden/u,
    whileBlocked: async () => {
      query(`update public.platform_role_memberships set expires_at=clock_timestamp()+interval '250 milliseconds'
        where user_id=${literal(otherOwner.user)} and role='operator';`);
      await waitUntil(() => query(`select clock_timestamp()>=expires_at from public.platform_role_memberships
        where user_id=${literal(otherOwner.user)} and role='operator';`) === "t", "legacy review role expiry reached");
    },
  });
  assert.deepEqual(audienceState(legacyId, requester), { status: "pending", followers: 0 });
  query(`delete from public.platform_role_memberships where user_id=${literal(otherOwner.user)} and role='operator';`);
  query(`delete from public.channel_audience_requests where id=${legacyId};`);

  const oldCachedPublicationAt = query(`select published_at from public.platform_brand_profiles
    where owner_user_id=${literal(owner.user)};`);
  const a = { accent_color: "#112233", hero_fit_mode: "fit", overlay_strength: 0.2 };
  const b = { accent_color: "#445566", hero_fit_mode: "center", overlay_strength: 0.8 };
  await serializedRace("two-publishes", publish(owner, a), publish(owner, b), {
    inspectHeld: () => {
      assert.equal(query(`select accent_color from public.platform_brand_publications where owner_user_id=${literal(owner.user)};`), "#DC143C",
        "uncommitted publication cannot change public snapshot");
      assert.equal(query(`select accent_color from public.platform_brand_profiles where owner_user_id=${literal(owner.user)};`), "#DC143C",
        "uncommitted publication cannot partially expose draft changes");
    },
  });
  assert.equal(query(`select accent_color||':'||hero_fit_mode||':'||overlay_strength::text from public.platform_brand_publications
    where owner_user_id=${literal(owner.user)};`), "#445566:center:0.8", "last complete publish wins without mixed fields");

  const draft = `${claims(owner)} update public.platform_brand_profiles set accent_color='#778899',hero_fit_mode='fill'
    where owner_user_id=${literal(owner.user)};`;
  await serializedRace("publish-then-draft", publish(owner, a), draft);
  assert.equal(query(`select accent_color from public.platform_brand_publications where owner_user_id=${literal(owner.user)};`), "#112233");
  assert.equal(query(`select accent_color from public.platform_brand_profiles where owner_user_id=${literal(owner.user)};`), "#778899");
  await serializedRace("draft-then-publish", draft, publish(owner, b));
  assert.equal(query(`select accent_color||':'||hero_fit_mode from public.platform_brand_publications where owner_user_id=${literal(owner.user)};`), "#445566:center");

  const cachedDraft = legacyDraft(owner, { accent_color: "#AABBCC", hero_fit_mode: "fill" }, oldCachedPublicationAt);
  await serializedRace("rpc-publish-then-old-cached-draft", publish(owner, a), cachedDraft);
  assert.equal(query(`select accent_color from public.platform_brand_publications where owner_user_id=${literal(owner.user)};`), "#112233",
    "old cached publication metadata cannot publish the delayed draft");
  assert.equal(query(`select accent_color from public.platform_brand_profiles where owner_user_id=${literal(owner.user)};`), "#AABBCC");
  assert.equal(query(`select draft.published_at=live.published_at from public.platform_brand_profiles draft
    join public.platform_brand_publications live using(owner_user_id) where owner_user_id=${literal(owner.user)};`), "t",
    "accepted cached draft cannot roll back canonical publication metadata");
  await serializedRace("old-cached-draft-then-rpc-publish", cachedDraft, publish(owner, b));
  assert.equal(query(`select accent_color||':'||hero_fit_mode from public.platform_brand_publications
    where owner_user_id=${literal(owner.user)};`), "#445566:center",
    "new complete publication wins without mixing the prior legacy draft");

  // Independence is positive evidence: another owner's publish must finish
  // while the first owner's transaction deliberately continues holding locks.
  const heldName = `studio-independent-holder-${process.pid}`;
  let held, independent;
  try {
    held = openSession(heldName, `begin; set local statement_timeout='20s'; ${publish(owner, a)} select 'STUDIO_HOLDER_READY';`);
    await waitUntil(() => held.output().includes("STUDIO_HOLDER_READY"), "independent first owner ready");
    independent = openSession(`studio-independent-other-${process.pid}`, `begin; set local statement_timeout='5s'; ${publish(otherOwner, b)} commit; \\q`);
    independent.child.stdin.end();
    const result = await independent.done;
    assert.equal(result.code, 0, result.stderr);
    assert.equal(query(`select accent_color from public.platform_brand_publications where owner_user_id=${literal(otherOwner.user)};`), "#445566");
    held.child.stdin.end("commit;\n\\q\n");
    const holderResult = await held.done;
    assert.equal(holderResult.code, 0, holderResult.stderr);
    pass("independent owner publishes while first owner retains its locks");
  } finally {
    await terminate(heldName, held);
    await terminate(`studio-independent-other-${process.pid}`, independent);
  }

  const lockDraft = (person) => `select owner_user_id from public.platform_brand_profiles
    where owner_user_id=${literal(person.user)} for update;`;
  const beforeRevokedPublish = query(`select to_jsonb(p)::text from public.platform_brand_publications p where owner_user_id=${literal(owner.user)};`);
  await serializedRace("queued-publish-revoked-session", lockDraft(owner), publish(owner, b), {
    secondError: /brand_publish_current_session_required/u,
    whileBlocked: () => query(`delete from auth.sessions where id=${literal(owner.session)};`),
  });
  assert.equal(query(`select to_jsonb(p)::text from public.platform_brand_publications p where owner_user_id=${literal(owner.user)};`),
    beforeRevokedPublish, "revoked queued publish changed snapshot");
  query(`insert into auth.sessions(id,user_id,not_after) values(${literal(owner.session)},${literal(owner.user)},now()+interval '1 day');`);
  await serializedRace("queued-publish-session-cutoff", lockDraft(owner), publish(owner, b), {
    secondError: /brand_publish_current_session_required/u,
    // The waiter transaction began earlier. now() alone would still accept
    // this cutoff; the new guard must use the wall clock after its wait.
    whileBlocked: () => query(`update auth.sessions set not_after=clock_timestamp() where id=${literal(owner.session)};`),
  });
  query(`update auth.sessions set not_after=now()+interval '1 day' where id=${literal(owner.session)};`);

  const queuedReviewId = newRequest(follower);
  const lockRequest = `select id from public.channel_audience_requests where id=${queuedReviewId} for update;`;
  await serializedRace("queued-review-revoked-session", lockRequest, review(queuedReviewId, "approved"), {
    secondError: /audience_review_current_session_required/u,
    whileBlocked: () => query(`delete from auth.sessions where id=${literal(owner.session)};`),
  });
  assert.equal(query(`select status from public.channel_audience_requests where id=${queuedReviewId};`), "pending");
  assert.equal(query(`select count(*) from public.channel_followers where channel_user_id=${literal(owner.user)} and follower_user_id=${literal(follower.user)};`), "0");
  query(`insert into auth.sessions(id,user_id,not_after) values(${literal(owner.session)},${literal(owner.user)},now()+interval '1 day');`);
  await serializedRace("queued-review-session-cutoff", lockRequest, review(queuedReviewId, "approved"), {
    secondError: /audience_review_current_session_required/u,
    whileBlocked: () => query(`update auth.sessions set not_after=clock_timestamp() where id=${literal(owner.session)};`),
  });
  query(`update auth.sessions set not_after=now()+interval '1 day' where id=${literal(owner.session)};`);
  await serializedRace("queued-publish-premium-revocation", lockDraft(otherOwner), publish(otherOwner, a), {
    secondError: /brand_publish_premium_required/u,
    whileBlocked: () => query(`update public.user_entitlements set revoked_at=clock_timestamp(),status='revoked'
      where user_id=${literal(otherOwner.user)} and entitlement_key='premium';`),
  });
  query(`insert into public.platform_role_memberships(user_id,role,status,expires_at)
    values(${literal(otherOwner.user)},'operator','active',clock_timestamp()+interval '1 day');`);
  await serializedRace("queued-review-role-cutoff", lockRequest,
    `${claims(otherOwner)} select public.review_channel_audience_request(${queuedReviewId},'approved');`, {
      secondError: /audience_review_forbidden/u,
      whileBlocked: async () => {
        // The real role trigger rejects already-expired active grants. Set a
        // valid finite cutoff, then observe expiry before releasing the lock.
        query(`update public.platform_role_memberships set expires_at=clock_timestamp()+interval '250 milliseconds'
          where user_id=${literal(otherOwner.user)} and role='operator';`);
        await waitUntil(() => query(`select clock_timestamp()>=expires_at from public.platform_role_memberships
          where user_id=${literal(otherOwner.user)} and role='operator';`) === "t", "queued role expiry reached");
      },
    });
  assert.equal(query(`select status from public.channel_audience_requests where id=${queuedReviewId};`), "pending");
  console.log(`Platform Studio native PostgreSQL concurrency: ${checks} deterministic cases passed.`);
} finally {
  try {
  if (cloned) success(docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database]), "drop disposable clone");
  if (sourceFingerprint !== undefined) assert.equal(query(sourceFingerprintSql, "postgres"), sourceFingerprint, "source database fingerprint changed");
  } finally { cloneGuardRestore.assertSourceUnchanged(); }
}
