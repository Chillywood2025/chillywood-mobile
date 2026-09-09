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
const psql = [
  "exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
  "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres",
];
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (value) => createHash("sha256").update(value).digest("hex");

function query(sql) {
  const result = spawnSync("docker", psql, {
    cwd: root,
    encoding: "utf8",
    input: sql,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr.replaceAll(/[A-Za-z0-9_-]{40,}/gu, "<redacted>"));
  return result.stdout.trim();
}

function openSession(applicationName, sql) {
  const child = spawn("docker", psql, { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
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

const started = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", container], { encoding: "utf8" });
assert.equal(started.status, 0, `local Supabase database container unavailable: ${container}`);
assert.equal(started.stdout.trim(), "true", "local Supabase database container is not running");

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
    assert.equal(Number(query(`select count(*) from public.revenuecat_terminal_authority_quarantines where raw_payload_hash=${literal(rawHash)};`)), 0);
  } catch (error) {
    await terminate(holderName, holder);
    await terminate(quarantineName, quarantine);
    throw error;
  }
}

process.stdout.write(`RevenueCat Premium/quarantine covering-scope concurrency: ${scenarios.length}/${scenarios.length} passed\n`);
