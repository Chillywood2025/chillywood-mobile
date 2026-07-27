import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const requestedContainer = process.argv[2] ??
  `supabase_db_${
    path.basename(process.cwd()).replace(/[^A-Za-z0-9_.-]/gu, "_")
  }`;
assert.match(
  requestedContainer,
  /^supabase_db_[A-Za-z0-9_.-]{1,200}$/u,
  "explicit Supabase database container name is invalid",
);

const psqlArgs = [
  "exec",
  "-i",
  requestedContainer,
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

const docker = (args, input = "") => {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 2 * 1024 * 1024,
  });
  const diagnostic = result.stderr
    .split("\n")
    .find((line) => line.includes("ERROR:"))
    ?.replaceAll(/'[^']*'/gu, "'<redacted>'")
    .replaceAll(/[A-Za-z0-9_-]{40,}/gu, "<redacted>") ??
    "no_sanitized_postgres_error";
  assert.equal(
    result.status,
    0,
    `local Postgres test command failed: ${diagnostic}`,
  );
  return result.stdout.trim();
};

const containers = docker([
  "ps",
  "--filter",
  "label=com.supabase.cli.project",
  "--format",
  "{{.Names}}",
]).split("\n");
assert.ok(
  containers.includes(requestedContainer),
  `project-local database is not running (${requestedContainer})`,
);

const query = (sql) => docker(psqlArgs, sql);
const runSession = (sql) =>
  new Promise((resolve, reject) => {
    const child = spawn("docker", psqlArgs, {
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
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code,
        stderr: stderr.trim(),
        stdout: stdout.trim(),
      });
    });
    child.stdin.end(sql);
  });

const observedHash = query(`
select cognitive_runtime.net_acl_guard_snapshot()
  ->>'observed_acl_sha256';
`);
assert.match(observedHash, /^[a-f0-9]{64}$/u);

const initialCount = query(`
select count(*)
from public.owner_command_requests request
where request.metadata->>'request_source' = 'cognitive_net_acl_guard'
  and request.metadata->>'observed_acl_sha256' = '${observedHash}'
  and request.status in (
    'received','classified','planned','preflight_pending',
    'approval_required','approved','executing','blocked'
  );
`);
assert.equal(
  initialCount,
  "0",
  "concurrency fixture requires a fresh local database",
);

const sessionSql = `
begin;
set local role service_role;
select (
  public.cognitive_record_net_acl_guard_readback()
    ->>'owner_command_created'
)::boolean;
select pg_catalog.pg_sleep(0.75);
commit;
`;

const results = await Promise.all([
  runSession(sessionSql),
  runSession(sessionSql),
]);
for (const result of results) {
  const diagnostic = result.stderr
    .split("\n")
    .find((line) => line.includes("ERROR:"))
    ?.replaceAll(/'[^']*'/gu, "'<redacted>'")
    .replaceAll(/[A-Za-z0-9_-]{40,}/gu, "<redacted>") ??
    "no_sanitized_postgres_error";
  assert.equal(
    result.code,
    0,
    `ACL guard concurrency session failed: ${diagnostic}`,
  );
}

const creationStates = results
  .flatMap((result) => result.stdout.split("\n"))
  .filter((value) => value === "t" || value === "f")
  .sort();
assert.deepEqual(
  creationStates,
  ["f", "t"],
  "exactly one concurrent call must route the Owner Command",
);

const counts = query(`
select concat_ws(
  '|',
  (
    select count(*)
    from public.security_required_review_flags review
    where review.system_id = 'security_owner_operator'
      and review.flag_type = 'cognitive_net_acl_drift'
      and review.review_status = 'open'
      and review.metadata->>'observed_acl_sha256' = '${observedHash}'
  ),
  (
    select count(*)
    from public.owner_command_requests request
    where request.metadata->>'request_source' =
      'cognitive_net_acl_guard'
      and request.metadata->>'observed_acl_sha256' = '${observedHash}'
  ),
  (
    select count(*)
    from public.owner_command_blockers blocker
    join public.owner_command_requests request
      on request.id = blocker.command_id
    where request.metadata->>'request_source' =
      'cognitive_net_acl_guard'
      and request.metadata->>'observed_acl_sha256' = '${observedHash}'
      and blocker.blocker_code = 'COGNITIVE_NET_ACL_DRIFT'
  )
);
`);
assert.equal(
  counts,
  "1|1|1",
  "concurrent guard calls must create one flag, command, and blocker",
);

console.log("cognitive net ACL guard concurrency PASS");
