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
const container = process.env.SUPABASE_DB_CONTAINER ?? `supabase_db_${projectId}`;
const psql = [
  "exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
  "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres",
];
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const admin = (sql, capture = false) => spawnSync("docker", psql, {
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
  const child = spawn("docker", psql, { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
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
  throw new Error(`bounded local concurrency timeout: ${label}`);
};
const barrier = async (lockText) => {
  const holder = spawn("docker", psql, { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  holder.stdout.setEncoding("utf8");
  holder.stderr.setEncoding("utf8");
  holder.stdout.on("data", (chunk) => { stdout += chunk; });
  holder.stderr.on("data", (chunk) => { stderr += chunk; });
  const done = new Promise((resolve) => holder.on("close", resolve));
  holder.stdin.write(
    `select pg_catalog.pg_advisory_lock(pg_catalog.hashtextextended(${literal(lockText)},0));\nselect 'BARRIER_READY';\n`,
  );
  await waitUntil(() => stdout.includes("BARRIER_READY"), `${lockText} barrier acquisition`);
  return {
    release: async () => {
      holder.stdin.end(
        `select pg_catalog.pg_advisory_unlock(pg_catalog.hashtextextended(${literal(lockText)},0));\n\\q\n`,
      );
      const code = await Promise.race([done, delay(2_000).then(() => null)]);
      assert.equal(code, 0, stderr || `barrier cleanup failed for ${lockText}`);
    },
  };
};
const waitForBothContenders = (applicationNames) => waitUntil(() => Number(read(`
  select count(*)
  from pg_catalog.pg_stat_activity
  where application_name in (${applicationNames.map(literal).join(",")})
    and wait_event_type='Lock'
    and wait_event='advisory';
`)) === applicationNames.length, `${applicationNames.join(",")} advisory waits`);

const running = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", container], { encoding: "utf8" });
assert.equal(running.status, 0, `local Supabase database unavailable: ${container}`);
assert.equal(running.stdout.trim(), "true", `local Supabase database is not running: ${container}`);

const suffix = crypto.randomUUID();
const ownerId = crypto.randomUUID();
const staffId = crypto.randomUUID();
const strikeTargetId = crypto.randomUUID();
const sessionId = crypto.randomUUID();
const caseId = crypto.randomUUID();
const ownerEmail = `privileged-idempotency-owner-${suffix}@example.test`;
const staffEmail = `privileged-idempotency-staff-${suffix}@example.test`;
const staffOperationKey = `staff-role-grant:${crypto.randomBytes(16).toString("hex")}`;
const strikeOperationKey = `dmca-strike:${crypto.randomBytes(16).toString("hex")}`;
const jwt = JSON.stringify({ role: "authenticated", sub: ownerId, session_id: sessionId, email: ownerEmail });
const authPrefix = `begin; select set_config('request.jwt.claims',${literal(jwt)},true);`;

admin(`
  insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values
    (${literal(ownerId)}::uuid,${literal(ownerEmail)},now(),false,false),
    (${literal(staffId)}::uuid,${literal(staffEmail)},now(),false,false),
    (${literal(strikeTargetId)}::uuid,${literal(`privileged-idempotency-target-${suffix}@example.test`)},now(),false,false);
  insert into auth.sessions(id,user_id) values (${literal(sessionId)}::uuid,${literal(ownerId)}::uuid);
  insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
    values ('owner',${literal(ownerId)},${literal(ownerEmail)},'active','Concurrency owner fixture','local-test');
  insert into public.dmca_cases(
    id,case_number,status,reporter_name,reporter_email,copyrighted_work_description,
    allegedly_infringing_content_type,allegedly_infringing_content_id,uploader_user_id,
    good_faith_statement,accuracy_penalty_perjury_statement,electronic_signature,source
  ) values (
    ${literal(caseId)}::uuid,${literal(`CW-CONCURRENCY-${suffix}`)},'content_disabled','Rights Owner',
    ${literal(`rights-owner-${suffix}@example.test`)},'Exact copyrighted work','creator_video',
    'concurrency-video',${literal(strikeTargetId)},true,true,'Rights Owner','admin_created'
  );
`);

try {
  const staffLockText = `staff-role-grant:${ownerId}:${staffOperationKey}`;
  const staffBarrier = await barrier(staffLockText);
  const staffNames = [`staff-grant-a-${suffix}`, `staff-grant-b-${suffix}`];
  const staffSql = `${authPrefix}
    select public.admin_grant_platform_role_by_email(
      ${literal(staffEmail)},'moderator','Concurrent exact staff grant',${literal(staffOperationKey)}
    )->>'id'; commit;`;
  const staffContenders = staffNames.map((name) => session(name, staffSql));
  await waitForBothContenders(staffNames);
  await staffBarrier.release();
  const staffResults = await Promise.all(staffContenders.map((contender) => contender.done));
  assert.ok(staffResults.every((result) => result.code === 0), staffResults.map((result) => result.stderr).join("\n"));
  assert.equal(new Set(staffResults.map((result) => result.stdout.trim())).size, 1, "staff retries must return one target result");
  assert.equal(Number(read(`
    select count(*) from public.privileged_mutation_operation_receipts
    where operation_family='staff_role_grant' and actor_user_id=${literal(ownerId)}
      and operation_key=${literal(staffOperationKey)};
  `)), 1, "concurrent staff retries must create one receipt");
  assert.equal(Number(read(`
    select count(*) from public.platform_role_memberships
    where user_id=${literal(staffId)} and role='moderator' and status='active';
  `)), 1, "concurrent staff retries must create one active membership");

  const strikeLockText = `dmca-strike:${ownerId}:${strikeOperationKey}`;
  const strikeBarrier = await barrier(strikeLockText);
  const strikeNames = [`dmca-strike-a-${suffix}`, `dmca-strike-b-${suffix}`];
  const strikeSql = `${authPrefix}
    select (public.admin_dmca_add_strike(
      ${literal(caseId)}::uuid,${literal(strikeTargetId)},null,'creator_video','concurrency-video',
      'standard','Concurrent exact strike',${literal(strikeOperationKey)}
    )).id; commit;`;
  const strikeContenders = strikeNames.map((name) => session(name, strikeSql));
  await waitForBothContenders(strikeNames);
  await strikeBarrier.release();
  const strikeResults = await Promise.all(strikeContenders.map((contender) => contender.done));
  assert.ok(strikeResults.every((result) => result.code === 0), strikeResults.map((result) => result.stderr).join("\n"));
  assert.equal(new Set(strikeResults.map((result) => result.stdout.trim())).size, 1, "DMCA retries must return one strike");
  assert.equal(Number(read(`
    select count(*) from public.dmca_strikes
    where dmca_case_id=${literal(caseId)}::uuid and user_id=${literal(strikeTargetId)}
      and content_id='concurrency-video' and strike_status='active';
  `)), 1, "concurrent DMCA retries must create one active strike");
  assert.equal(Number(read(`
    select count(*) from public.privileged_mutation_operation_receipts
    where operation_family='dmca_strike' and actor_user_id=${literal(ownerId)}
      and operation_key=${literal(strikeOperationKey)};
  `)), 1, "concurrent DMCA retries must create one receipt");

  console.log("Privileged mutation idempotency concurrency passed: 2 staff contenders, 2 DMCA contenders, 1 authoritative result per intent.");
} finally {
  const cleanup = admin(`
    begin;
    set local session_replication_role=replica;
    delete from public.privileged_mutation_operation_receipts where actor_user_id=${literal(ownerId)};
    delete from public.dmca_audit_log where dmca_case_id=${literal(caseId)}::uuid;
    delete from public.dmca_strikes where dmca_case_id=${literal(caseId)}::uuid;
    delete from public.dmca_cases where id=${literal(caseId)}::uuid;
    delete from public.platform_admin_audit_logs where actor_user_id=${literal(ownerId)};
    delete from public.platform_role_memberships where user_id in (${literal(ownerId)},${literal(staffId)});
    delete from auth.sessions where id=${literal(sessionId)}::uuid;
    delete from auth.users where id in (${literal(ownerId)}::uuid,${literal(staffId)}::uuid,${literal(strikeTargetId)}::uuid);
    commit;
  `, true);
  assert.equal(cleanup.status, 0, cleanup.stderr);
}
