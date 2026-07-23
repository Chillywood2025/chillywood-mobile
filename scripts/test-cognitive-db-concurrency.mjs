import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

const run = (args, input = "") => {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, "local Postgres test command failed");
  return result.stdout.trim();
};

const requestedContainer = process.argv[2]
  ?? `supabase_db_${path.basename(process.cwd()).replace(/[^A-Za-z0-9_.-]/gu, "_")}`;
assert.match(
  requestedContainer,
  /^supabase_db_[A-Za-z0-9_.-]{1,200}$/u,
  "explicit Supabase database container name is invalid",
);
const containers = run([
  "ps",
  "--filter",
  "label=com.supabase.cli.project",
  "--format",
  "{{.Names}}",
])
  .split("\n")
  .filter((name) => name.startsWith("supabase_db_"));
assert.ok(
  containers.includes(requestedContainer),
  `the selected project-local Supabase database must be running (${requestedContainer})`,
);
const container = requestedContainer;
const psqlArgs = [
  "exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
  "-U", "postgres", "-d", "postgres",
];

const projectId = randomUUID();
const taskId = randomUUID();

run(psqlArgs, `
insert into public.cognitive_projects(id,repository_full_name)
values ('${projectId}','Chillywood2025/chillywood-mobile');
insert into public.intelligence_tasks(
  id,project_id,platform,environment,repository_full_name,branch_name,
  task_key,objective_hash,actor_identity,deadman_at
) values (
  '${taskId}','${projectId}','shared','ci',
  'Chillywood2025/chillywood-mobile','codex/concurrency-fixture',
  'task-concurrency-fixture',repeat('a',64),'concurrency-fixture',now()+interval '1 hour'
);
`);

const findingSql = (evidenceCharacter) => `
begin;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.cognitive_actor','cognitive_control_plane',true);
select pg_sleep(0.25);
select public.cognitive_record_finding(
  '${taskId}','${projectId}','shared','ci',
  'concurrent-finding-key','concurrency','path:_lib/concurrent.ts','p1',
  repeat('${evidenceCharacter}',64)
);
commit;
`;

const concurrentCall = (evidenceCharacter) =>
  new Promise((resolve, reject) => {
    const child = spawn("docker", psqlArgs, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`concurrent local database call failed (${code}): ${stderr.slice(0, 160)}`));
    });
    child.stdin.end(findingSql(evidenceCharacter));
  });

await Promise.all([concurrentCall("b"), concurrentCall("c")]);
const result = run([...psqlArgs, "-A", "-t"], `
select occurrence_count from public.cognitive_current_findings
where task_id='${taskId}' and finding_key='concurrent-finding-key';
select count(*) from public.finding_lifecycle_events where task_id='${taskId}';
`)
  .split("\n")
  .filter(Boolean);
assert.deepEqual(
  result,
  ["2", "2"],
  "concurrent recurrence must retain one current row and two immutable events",
);
console.log("cognitive database concurrency verified (1 current finding, 2 occurrences, 2 immutable events)");
