#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";

// Applies only the independently reviewed retention-lineage successor when an
// unrelated older local migration is intentionally absent from production.
// The migration and its history row are committed atomically. No connection
// string or database password is accepted or printed.

const PROJECT_REF = "bmkkhihfbmsnnmcqkoly";
const VERSION = "20260727093712";
const NAME = "cognitive_research_retention_pro_v3_lineage";
const EXPECTED_SHA256 =
  "5818c96dd5493603a6a43ce3ecb6c85882d3f345ec1cb2b16946015e357fc52b";
const migration = readFileSync(
  `supabase/migrations/${VERSION}_${NAME}.sql`,
  "utf8",
);
const token = process.env.SUPABASE_ACCESS_TOKEN ?? "";

const migrationHash = createHash("sha256").update(migration).digest("hex");
if (
  !token ||
  migrationHash !== EXPECTED_SHA256 ||
  !migration.includes("chillywood-research-retention-processor-v3") ||
  migration.includes("grant usage on schema net") ||
  migration.includes("revoke usage on schema net") ||
  migration.includes("cognitive_governance_switches")
) {
  process.stdout.write("BLOCKED\n");
  process.exit(1);
}

if (process.argv.includes("--readback")) {
  const readOne = async (query) => {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query,
          read_only: true,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const payload = await response.json();
    return response.ok && Array.isArray(payload) && payload.length === 1
      ? payload[0]
      : null;
  };
  let statuses = {};
  try {
    statuses = {
      ...await readOne(`
        select
          count(*) = 1 as migration_match,
          not exists (
            select 1
            from supabase_migrations.schema_migrations
            where version = '20260725224000'
          ) as unrelated_migration_absent
        from supabase_migrations.schema_migrations
        where version = '${VERSION}'
          and name = '${NAME}';
      `),
      ...await readOne(`
        select procedure.prosrc as v2_source
        from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace
          on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'public'
          and procedure.proname =
            'governance_research_retention_activation_hash'
          and procedure.pronargs = 7;
      `),
      ...await readOne(`
        select procedure.prosrc as v3_source
        from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace
          on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'public'
          and procedure.proname =
            'governance_research_retention_activation_hash_v3'
          and procedure.pronargs = 7;
      `),
      ...await readOne(`
        select pg_catalog.pg_get_functiondef(
          'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
            ::regprocedure
        ) like '%governance_research_retention_activation_hash_v3(%'
          as persistence_match;
      `),
      ...await readOne(`
        select
          not exists (
            select 1
            from public.cognitive_governance_switches
            where enabled and switch_key = 'cognitive_research_enabled'
          ) as research_inactive,
          not exists (
            select 1
            from public.cognitive_governance_switches
            where enabled
              and switch_key = 'cognitive_user_derived_memory_enabled'
          ) as memory_inactive;
      `),
    };
  } catch {
    statuses = {};
  }
  statuses.v2_match = typeof statuses.v2_source === "string" &&
    createHash("sha256").update(statuses.v2_source).digest("hex") ===
      "1680441d7f4680b325fffa5ae7209ab26f5d9f654330b905e2c26be8b7546b67";
  statuses.v3_match = typeof statuses.v3_source === "string" &&
    createHash("sha256").update(statuses.v3_source).digest("hex") ===
      "8c2ef9de3983a1fcb2cb8c828a7a39e2f0aedd18b5e7b0190ddecf352ddae6eb";
  const checks = [
    ["MIGRATION", statuses?.migration_match],
    ["UNRELATED_MIGRATION", statuses?.unrelated_migration_absent],
    ["V2", statuses?.v2_match],
    ["V3", statuses?.v3_match],
    ["PERSISTENCE", statuses?.persistence_match],
    ["RESEARCH", statuses?.research_inactive],
    ["MEMORY", statuses?.memory_inactive],
  ];
  for (const [label, passed] of checks) {
    process.stdout.write(`${label} ${passed ? "MATCH" : "MISMATCH"}\n`);
  }
  const passed = checks.every(([, value]) => value === true);
  process.stdout.write(`${passed ? "PASS" : "FAIL"}\n`);
  process.exit(passed ? 0 : 1);
}

const escapedMigration = migration.replaceAll("'", "''");
const query = `
  begin;
  do $history_preflight$
  begin
    if not exists (
      select 1
      from supabase_migrations.schema_migrations
      where version = '20260727090557'
    ) or exists (
      select 1
      from supabase_migrations.schema_migrations
      where version = '${VERSION}'
    ) then
      raise exception 'migration_history_preflight_rejected';
    end if;
  end;
  $history_preflight$;

  ${migration}

  insert into supabase_migrations.schema_migrations(
    version,statements,name
  ) values (
    '${VERSION}',
    array['${escapedMigration}'],
    '${NAME}'
  );
  commit;
`;

let passed = false;
try {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  const payload = await response.json();
  passed = response.ok && Array.isArray(payload);
} catch {
  passed = false;
}

process.stdout.write(`${passed ? "PASS" : "FAIL"}\n`);
process.exit(passed ? 0 : 1);
