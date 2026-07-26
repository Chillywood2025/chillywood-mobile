import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";

const container = process.argv[2]
  ?? `supabase_db_${path.basename(process.cwd()).replace(/[^A-Za-z0-9_.-]/gu, "_")}`;
assert.match(container, /^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);

const suffix = randomBytes(8).toString("hex");
const roleName = `cognitive_hold_probe_${suffix}`;
const tableName = `cognitive_hold_probe_table_${suffix}`;
const functionName = `cognitive_hold_probe_function_${suffix}`;
const runtimePassword = randomBytes(48).toString("base64url");

const identifier = (value) => {
  assert.match(value, /^[a-z][a-z0-9_]{1,62}$/u);
  return `"${value}"`;
};
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

const adminPsqlArgs = [
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
const runDocker = (args, input, options = {}) =>
  spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 1024 * 1024,
    ...options,
  });

const tableId = `public.${identifier(tableName)}`;
const functionId = `public.${identifier(functionName)}`;
const roleId = identifier(roleName);

const setupSql = `
begin;

create role ${roleId}
  login
  nosuperuser
  nocreatedb
  nocreaterole
  noinherit
  noreplication
  nobypassrls
  password ${literal(runtimePassword)}
  valid until ${literal(new Date(Date.now() + 5 * 60 * 1000).toISOString())};

create table ${tableId}(
  switch_key text primary key,
  enabled boolean not null
);

insert into ${tableId}(switch_key,enabled)
values
  ('cognitive_research_enabled',false),
  ('cognitive_memory_enabled',false),
  ('cognitive_collective_deliberation_enabled',false);

create trigger ${identifier(`${tableName}_trigger`)}
before insert or update of enabled, switch_key
on ${tableId}
for each row
execute function public.governance_enforce_level01_activation_hold();

create function ${functionId}()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  key_value text;
  expected_error text;
begin
  foreach key_value in array array[
    'cognitive_research_enabled',
    'cognitive_memory_enabled',
    'cognitive_collective_deliberation_enabled'
  ]
  loop
    expected_error := case key_value
      when 'cognitive_collective_deliberation_enabled' then
        'model_independence_provider_required'
      else
        'cognitive_research_retention_processor_required'
    end;

    begin
      update ${tableId}
      set enabled = true
      where switch_key = key_value;
      raise exception 'activation_hold_security_definer_bypass:%', key_value
        using errcode = 'P0001';
    exception
      when sqlstate 'P0001' then
        if sqlerrm <> expected_error then
          raise;
        end if;
    end;
  end loop;

  if exists (select 1 from ${tableId} where enabled) then
    raise exception 'activation_hold_security_definer_persistence'
      using errcode = 'P0001';
  end if;

  return 'PASS';
end;
$$;

revoke all on function ${functionId}() from public,anon,authenticated,service_role;
grant usage on schema public to ${roleId};
grant execute on function ${functionId}() to ${roleId};

commit;
`;

const cleanupSql = `
begin;
drop function if exists ${functionId}();
drop table if exists ${tableId};
revoke usage on schema public from ${roleId};
drop role if exists ${roleId};
commit;
`;

let setupComplete = false;
try {
  const setup = runDocker(adminPsqlArgs, setupSql);
  assert.equal(setup.status, 0, setup.stderr.trim());
  assert.equal(setup.stderr.trim(), "");
  setupComplete = true;

  const runtime = runDocker(
    [
      "exec",
      "-i",
      "-e",
      "PGPASSWORD",
      container,
      "psql",
      "-X",
      "-q",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-h",
      "127.0.0.1",
      "-U",
      roleName,
      "-d",
      "postgres",
      "-c",
      `select ${functionId}();`,
    ],
    "",
    { env: { PATH: process.env.PATH, PGPASSWORD: runtimePassword } },
  );

  assert.equal(runtime.status, 0, runtime.stderr.trim());
  assert.equal(runtime.stderr.trim(), "");
  assert.equal(runtime.stdout.trim(), "PASS");
} finally {
  if (setupComplete) {
    const cleanup = runDocker(adminPsqlArgs, cleanupSql);
    assert.equal(cleanup.status, 0, cleanup.stderr.trim());
    assert.equal(cleanup.stderr.trim(), "");
  }
}

process.stdout.write(
  "cognitive activation-hold SECURITY DEFINER boundary: 3/3 passed\n",
);
