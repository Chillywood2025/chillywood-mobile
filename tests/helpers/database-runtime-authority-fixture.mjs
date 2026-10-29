// Test-only schema replay for the October runtime-authority repair. No provider network,
// production rows or production credentials. Managed services are local doubles.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {managedRequestContextSQL, managedExtensionUsageSQL, managedStorageObjectIDDefaultSQL} from './database-managed-request-context.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const migrationDirectory = path.join(root, 'supabase/migrations');
const repairName = fs.readdirSync(migrationDirectory).find(name => name.endsWith('_runtime_authority_forward_repair.sql'));
export const repairMigrationPath = repairName ? path.join(migrationDirectory, repairName) : null;
export const liveSnapshotPath = path.join(root, 'tests/fixtures/database-runtime-production-20261015.sql');
export const heldStudioVersion = '20261015073423';
// The rolling migrations depend on the held publication/Audience schema and
// are deployed with it. Replay either the entire bundle or the pre-Studio state.
export const heldStudioBundleVersions = Object.freeze([
  heldStudioVersion, '20261019020049', '20261019020052',
]);
// Post-monetization physical storefront successors, in dependency order. A
// historical pre-monetization checkpoint must explicitly exclude this bundle
// too: its inventory wrapper requires the retained merch settlement lifecycle.
// Normal/full-chain fixtures always replay all three files.
export const merchStorefrontFiles = Object.freeze([
  '20261029191508_creator_merch_storefront.sql',
  '20261029195422_creator_merch_sku_inventory.sql',
  '20261029195448_creator_merch_product_photos.sql',
]);

// PostgreSQL-aware statement boundaries: strings, quoted identifiers, tagged
// dollar bodies, nested block comments and line comments are kept intact.
export function splitSQL(source) {
  const statements = [];
  let start = 0, index = 0, quote = null, block = 0, line = false;
  while (index < source.length) {
    if (line) { if (source[index] === '\n') line = false; index++; continue; }
    if (block) {
      if (source.slice(index, index + 2) === '/*') { block++; index += 2; }
      else if (source.slice(index, index + 2) === '*/') { block--; index += 2; }
      else index++;
      continue;
    }
    if (quote) {
      if (source.startsWith(quote, index)) {
        if (quote.length === 1 && source[index + 1] === quote) { index += 2; continue; }
        index += quote.length; quote = null;
      } else if (quote === "'" && source[index] === '\\') index += 2;
      else index++;
      continue;
    }
    if (source.slice(index, index + 2) === '--') { line = true; index += 2; continue; }
    if (source.slice(index, index + 2) === '/*') { block = 1; index += 2; continue; }
    if (source[index] === "'" || source[index] === '"') { quote = source[index++]; continue; }
    if (source[index] === '$') {
      const match = source.slice(index).match(/^\$[a-zA-Z_0-9]*\$/u);
      if (match) { quote = match[0]; index += quote.length; continue; }
    }
    if (source[index] === ';') { statements.push(source.slice(start, index + 1)); start = index + 1; }
    index++;
  }
  if (source.slice(start).trim()) statements.push(source.slice(start));
  return statements;
}

export async function createDatabase({overlayLiveDrift = false, applyRepair = false, includeHeldStudio = false,
  implicitApiGrants = true, excludeMigrations = [], databaseFactory = null} = {}) {
  // A test-supplied native adapter must expose the same exec/query/close methods.
  // Default replay and every statement/double below remain unchanged.
  const db = databaseFactory ? await databaseFactory() : new PGlite({extensions: {pgcrypto, pg_trgm}});
  const replayReport = {files: [], statements: 0, skipped: [], implicitApiGrants, excludedMigrations: [...excludeMigrations],
    infrastructure: 'Empty catalog-derived auth/storage; controlled cron/vault/realtime; no provider transport'};
  try {
    await db.exec(`set check_function_bodies=false; set time zone 'UTC';
      create role anon; create role authenticated; create role service_role bypassrls;
      create role supabase_admin; create role supabase_auth_admin; create role supabase_storage_admin;
      create schema auth; create schema storage; create schema extensions; create schema vault;
      create schema cron; create schema net; create schema realtime;
      create extension pgcrypto with schema extensions; set search_path=public,extensions;
      -- False is the strict fresh-schema table/sequence opt-in fixture. Function
      -- defaults are unchanged: their separate PUBLIC-execute boundary is not
      -- part of the October 30 new-table readiness assertion.
      ${implicitApiGrants ? `alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;` : ''}
      alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
      create table realtime.messages(id bigint,extension text,topic text,payload jsonb,event text,private boolean,inserted_at timestamptz,updated_at timestamptz);
      create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
      create table realtime.fixture_outbox(payload jsonb,event text,topic text,private boolean);
      create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$insert into realtime.fixture_outbox values($1,$2,$3,$4)$$;
    `);
    const columns = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/database-managed-schema-20261015.json'), 'utf8'));
    const groups = columns.reduce((result, column) => {
      const key = `${column.schema}.${column.table_name}`;
      (result[key] ??= []).push(column);
      return result;
    }, {});
    const quoteIdentifier = value => `"${value.replaceAll('"', '""')}"`;
    for (const [name, group] of Object.entries(groups)) {
      const definitions = group.map(column => `${quoteIdentifier(column.column_name)} ${/^(auth|storage)\./u.test(column.type) ? 'text' : column.type}${column.column_name === 'id' ? ' primary key' : ''}`);
      await db.exec(`create table ${name.split('.').map(quoteIdentifier).join('.')} (${definitions.join(',')});`);
    }
    await db.exec(`
      ${managedRequestContextSQL}
      ${managedStorageObjectIDDefaultSQL}
      create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
      create function storage.filename(text) returns text language sql immutable as $$select reverse(split_part(reverse($1),'/',1))$$;
      create function storage.extension(text) returns text language sql immutable as $$select reverse(split_part(reverse($1),'.',1))$$;
      grant usage on schema auth,storage to anon,authenticated,service_role;
      ${managedExtensionUsageSQL}
      create publication supabase_realtime;
      create table cron.job(jobid bigint generated always as identity primary key,jobname text,schedule text,command text,active bool default true,username text default 'postgres',database text default 'postgres');
      create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid$$;
      create function cron.unschedule(bigint) returns boolean language plpgsql as $$begin delete from cron.job where jobid=$1; return true;end$$;
      create table vault.secrets(id uuid default gen_random_uuid(),secret text,name text,description text,created_at timestamptz default now());
      create view vault.decrypted_secrets as select *,secret as decrypted_secret from vault.secrets;
      create function vault.create_secret(text,text,text) returns uuid language sql as $$insert into vault.secrets(secret,name,description) values($1,$2,$3) returning id$$;
    `);
    const files = fs.readdirSync(migrationDirectory).filter(name => name.endsWith('.sql') && name !== repairName
      && !excludeMigrations.includes(name)
      && (includeHeldStudio || !heldStudioBundleVersions.some(version => name.startsWith(`${version}_`)))).sort();
    for (const file of files) {
      const statements = splitSQL(fs.readFileSync(path.join(migrationDirectory, file), 'utf8'));
      for (let index = 0; index < statements.length; index++) {
        const sql = statements[index];
        const head = sql.replace(/--[^\n]*/gu, '').replace(/\/\*[\s\S]*?\*\//gu, '').trim();
        if (!head || /^(begin|commit|rollback)\s*;?$/iu.test(head)) continue;
        replayReport.statements++;
        if (/^create extension.*\b(pg_cron|pg_net)\b/iu.test(head)) {
          replayReport.skipped.push({file, index, reason: 'Managed scheduling/network extension replaced by local doubles'}); continue;
        }
        if (/^select public\.recover_media_scan_jobs\((20, 100|5, 100)\);$/iu.test(head)
          && /^(20260718211432|20260718214102)_/u.test(file)) {
          replayReport.skipped.push({file, index, reason: 'Data-only recovery call, irrelevant to empty isolated schema'}); continue;
        }
        try { await db.exec(/^lock table/iu.test(head) ? `begin;${sql};commit;` : sql); }
        catch (error) { throw new Error(`Schema replay failed at ${file}:${index}: ${error.message}`, {cause: error}); }
      }
      replayReport.files.push(file);
    }
    if (overlayLiveDrift) await db.exec(fs.readFileSync(liveSnapshotPath, 'utf8'));
    const repairSql = repairMigrationPath ? fs.readFileSync(repairMigrationPath, 'utf8') : '';
    if (applyRepair) {
      if (!repairSql.trim()) throw new Error('Repair migration is not available');
      await db.exec(repairSql);
    }
    return {db, replayReport, repairSql};
  } catch (error) { await db.close(); throw error; }
}
