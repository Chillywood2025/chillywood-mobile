#!/usr/bin/env node
// Native disposable-cluster proof only. No arbitrary database URL is accepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

assert.equal(process.argv.length, 4);
assert.equal(process.argv[2], '--local-bin');
const bin = process.argv[3];
assert.ok(path.isAbsolute(bin));
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const sourcePath = path.join(here, '../premium-authority.sql');
const fixturePath = path.join(here, 'premium-authority.fixture.sql');
const source = fs.readFileSync(sourcePath, 'utf8');
const factTables = ['user_entitlements', 'access_grants', 'provider_events',
  'revenuecat_premium_transaction_authority', 'monetization_products',
  'revenuecat_terminal_authority_quarantines', 'revenuecat_terminal_authority_quarantine_resolutions',
  'revenuecat_consumable_transaction_intents', 'revenuecat_unbound_initial_authority', 'revenuecat_unbound_terminal_authority'];
const directory = fs.mkdtempSync('/tmp/chw-premium-native-');
const data = path.join(directory, 'data');
const port = '59461';
const env = { PATH: '/usr/bin:/bin', LC_ALL: 'C', PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null' };
const connection = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-p', port, '-U', 'postgres', '-d', 'postgres'];
const command = (tool, args, input) => spawnSync(path.join(bin, tool), args,
  { input, encoding: 'utf8', env, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
const invoke = (tool, args, input) => {
  const r = command(tool, args, input);
  assert.equal(r.status, 0, `${tool}: ${r.error?.message ?? r.stderr}`);
  return r.stdout.trim();
};
const query = sql => invoke('psql', connection, sql);
const reject = (sql, pattern) => {
  const r = command('psql', connection, sql);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, pattern);
};
const id = "'11111111-1111-4111-8111-111111111111'::uuid";
const current = `sandbox_commerce_v1.premium_current(${id}, transaction_timestamp())`;
const legacy = `public.premium_subject_has_finite_authority_internal(${id}::text)`;
const qExact = `insert into public.revenuecat_terminal_authority_quarantines values
  ('66666666-6666-4666-8666-666666666666','revenuecat_google_play',${id},'sandbox','TRANSFER',
  'terminal_identity_invalid:transfer_store_identity_missing_or_unsupported',transaction_timestamp()-interval '2 days');`;
const later = `insert into public.provider_events select '77777777-7777-4777-8777-777777777777','premium-fixture-later',
  provider,product_id,user_id,environment,'processed','REFUND',transaction_timestamp(),transaction_timestamp(),repeat('b',64),metadata
  from public.provider_events;`;
const cases = [];
function graphCase(name, mutation, expected) {
  const result = JSON.parse(query(`begin; select premium_fixture.reset(); ${mutation}
    select jsonb_build_object('actual',${current},'legacy',${legacy},
      'bound',sandbox_commerce_v1.premium_valid_until(${id},transaction_timestamp()) =
        (select expires_at from public.user_entitlements where user_id=${id}::text and entitlement_key='premium'));
    rollback;`));
  assert.equal(result.actual, expected, name);
  assert.equal(result.legacy, expected, `${name}: exact legacy semantic parity`);
  if (expected) assert.equal(result.bound, true, `${name}: exact expiry bound`);
  cases.push(name);
}
const migrations = path.join(root, 'supabase/migrations');
const extract = (filename, name) => {
  const text = fs.readFileSync(path.join(migrations, filename), 'utf8');
  const start = text.indexOf(`create or replace function public."${name}"(`);
  assert.ok(start >= 0, `missing legacy oracle ${name}`);
  const end = text.indexOf('\n$$;', start);
  assert.ok(end > start);
  return text.slice(start, end + 4);
};
const ordering = '20260730170000_revenuecat_transfer_authoritative_ordering.sql';
const fresh = '20260908231500_pre_activation_premium_repurchase_quarantine_closure.sql';
const graph = '20260909015439_pre_activation_premium_fresh_generation_lifecycle.sql';
const oracle = [
  [ordering, 'revenuecat_premium_authority_rank_internal'],
  [ordering, 'revenuecat_premium_authority_is_newer_internal'],
  [fresh, 'revenuecat_premium_fresh_authority_allowed_internal'],
  [graph, 'revenuecat_premium_post_quarantine_generation_internal'],
  [graph, 'revenuecat_authority_quarantined_internal'],
  [graph, 'premium_subject_has_finite_authority_internal'],
].map(([file, name]) => extract(file, name)).join('\n');
let started = false;
let startAttempted = false;
let report;
const cleanup = { stopped: false, notRunningVerified: false, directoryRemoved: false };
try {
  const version = invoke('postgres', ['--version']);
  assert.match(version, /PostgreSQL\) 17\.6/u);
  invoke('initdb', ['-D', data, '-U', 'postgres', '--encoding=UTF8', '--no-locale', '--auth-local=trust', '--auth-host=reject']);
  startAttempted = true;
  invoke('pg_ctl', ['-D', data, '-w', '-t', '15', '-l', path.join(directory, 'server.log'), '-o',
    `-c listen_addresses='' -c unix_socket_directories=${directory} -p ${port} -c max_prepared_transactions=0 -c autovacuum=off`, 'start']);
  started = true;
  query(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create role sbx_v1_core_owner nologin nobypassrls; create role sbx_v1_authority_owner nologin nobypassrls;
    create schema sandbox_commerce_v1;
    grant usage,create on schema sandbox_commerce_v1 to sbx_v1_authority_owner;
    alter default privileges for role postgres grant execute on functions to anon,authenticated,service_role,sbx_v1_core_owner;
    ${fs.readFileSync(fixturePath, 'utf8')}
    ${factTables.map(table => `alter table public.${table} enable row level security; alter table public.${table} force row level security;`).join('\n')}
    create function public.is_account_access_restricted(text) returns boolean language sql as $$select false$$;
    ${oracle}
    begin; ${source} commit;`);

  assert.equal(query(`select count(*) from pg_class c where c.relnamespace='public'::regnamespace
    and c.relname in (${factTables.map(table => `'${table}'`).join(',')}) and c.relrowsecurity and c.relforcerowsecurity
    and not has_table_privilege('sbx_v1_authority_owner',c.oid,'SELECT')
    and not exists(select 1 from pg_policy p where p.polrelid=c.oid);`), '10');
  cases.push('all ten shared fact tables enforce FORCE RLS before function creation; install succeeds without installer SELECT grants or policies');

  const acl = JSON.parse(query(`select jsonb_build_object('count',count(*),
    'postgresOwners',bool_and(pg_get_userbyid(p.proowner)='postgres'),
    'invoker',bool_and(not p.prosecdef),
    'noRuntimeExecute',bool_and(not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not has_function_privilege('service_role',p.oid,'EXECUTE')
      and not has_function_privilege('sbx_v1_core_owner',p.oid,'EXECUTE')
      and not has_function_privilege('sbx_v1_authority_owner',p.oid,'EXECUTE')),
    'rowSecurityOff',bool_and('row_security=off'=any(p.proconfig)))
    from pg_proc p where p.pronamespace='sandbox_commerce_v1'::regnamespace;`));
  assert.deepEqual(acl, { count: 7, postgresOwners: true, invoker: true, noRuntimeExecute: true, rowSecurityOff: true });
  cases.push('fresh-role creation and owner transfer prevent inherited postgres default ACL leakage; all seven helpers deny all runtime/installer roles');
  reject(`set role sbx_v1_core_owner; select ${current};`, /permission denied/u);
  cases.push('direct core-role helper execution rejects');

  graphCase('exact sandbox Premium graph is current and returns its expiry', '', true);
  graphCase('production Premium graph remains eligible for sandbox', `update public.user_entitlements set metadata=metadata||'{"environment":"production"}';
    update public.access_grants set environment='production',status='active'; update public.provider_events set environment='production';
    update public.revenuecat_premium_transaction_authority set environment='production';`, true);
  for (const [name, mutation] of [
    ['missing entitlement', 'delete from public.user_entitlements;'],
    ['missing grant', 'delete from public.access_grants;'],
    ['missing provider event', 'delete from public.provider_events;'],
    ['missing transaction authority', 'delete from public.revenuecat_premium_transaction_authority;'],
    ['manual entitlement source', "update public.user_entitlements set source='operator_grant';"],
    ['pending entitlement', "update public.user_entitlements set status='pending';"],
    ['revoked entitlement', 'update public.user_entitlements set revoked_at=transaction_timestamp();'],
    ['expired exact period', "update public.user_entitlements set expires_at=transaction_timestamp(); update public.access_grants set expires_at=transaction_timestamp();"],
    ['not-yet-current period', "update public.user_entitlements set starts_at=transaction_timestamp()+interval '1 day'; update public.access_grants set starts_at=transaction_timestamp()+interval '1 day';"],
    ['mismatched grant expiry', "update public.access_grants set expires_at=expires_at+interval '1 second';"],
    ['wrong sandbox grant status', "update public.access_grants set status='active';"],
    ['refunded grant', 'update public.access_grants set refunded_at=transaction_timestamp();'],
    ['revoked grant', 'update public.access_grants set revoked_at=transaction_timestamp();'],
    ['provider event hash mismatch', "update public.provider_events set raw_payload_hash=repeat('b',64);"],
    ['invalid hash shape', "update public.user_entitlements set metadata=metadata||'{\"revenuecat_event_hash\":\"bad\"}'; update public.provider_events set raw_payload_hash='bad'; update public.revenuecat_premium_transaction_authority set latest_event_hash='bad';"],
    ['provider base-plan mismatch', "update public.revenuecat_premium_transaction_authority set current_provider_base_plan_id='other';"],
    ['transaction owner mismatch', "update public.revenuecat_premium_transaction_authority set user_id='88888888-8888-4888-8888-888888888888';"],
    ['blocked transaction', "update public.revenuecat_premium_transaction_authority set authority_state='blocked';"],
    ['unprocessed event', "update public.provider_events set status='ignored';"],
  ]) graphCase(`${name} rejects`, mutation, false);
  graphCase('retained transaction remains eligible', "update public.revenuecat_premium_transaction_authority set authority_state='retained';", true);
  graphCase('null base plan matches null exactly', "update public.revenuecat_premium_transaction_authority set current_provider_base_plan_id=null; update public.provider_events set metadata=metadata-'provider_base_plan_id';", true);
  graphCase('supported exact older TRANSFER quarantine preserves admitted generation', qExact, true);
  graphCase('different quarantine reason rejects', qExact + "update public.revenuecat_terminal_authority_quarantines set reason='different';", false);
  graphCase('global quarantine rejects', qExact + "update public.revenuecat_terminal_authority_quarantines set provider_scope='revenuecat_global',user_id=null,environment_scope=null;", false);
  graphCase('newer exact quarantine rejects old generation', qExact + 'update public.revenuecat_terminal_authority_quarantines set created_at=transaction_timestamp();', false);
  graphCase('resolved quarantine no longer blocks', qExact + "update public.revenuecat_terminal_authority_quarantines set reason='different'; insert into public.revenuecat_terminal_authority_quarantine_resolutions select id from public.revenuecat_terminal_authority_quarantines;", true);
  graphCase('wrong immutable first-event hash rejects quarantine exception', qExact + "update public.revenuecat_premium_transaction_authority set first_event_hash=repeat('b',64);", false);
  for (const table of ['revenuecat_consumable_transaction_intents', 'revenuecat_unbound_initial_authority', 'revenuecat_unbound_terminal_authority'])
    graphCase(`${table} reservation blocks fresh quarantine exception`, qExact + `insert into public.${table} values('revenuecat_google_play','premium-fixture-original');`, false);
  graphCase('exact current-customer reconciliation at quarantine time is admitted', qExact + `
    update public.provider_events set event_type='RECONCILIATION',created_at=transaction_timestamp()-interval '2 days',
      metadata=(metadata-'premium_fresh_authority_after_transfer_quarantine')||'{"reconciliation_source":"revenuecat_v2_current_customer","provider_snapshot_only":"true","provider_transaction_created":"false"}';`, true);
  graphCase('provider-transaction-created reconciliation cannot use exception', qExact + `
    update public.provider_events set event_type='RECONCILIATION',metadata=(metadata-'premium_fresh_authority_after_transfer_quarantine')||
      '{"reconciliation_source":"revenuecat_v2_current_customer","provider_snapshot_only":"true","provider_transaction_created":"true"}';`, false);
  graphCase('newer terminal event vetoes current authority', later, false);
  graphCase('ignored terminal without watermark does not veto', later + "update public.provider_events set status='ignored' where provider_event_id='premium-fixture-later';", true);
  graphCase('ignored terminal with watermark vetoes', later + "update public.provider_events set status='ignored',metadata=metadata||'{\"premium_authority_watermark\":\"true\"}' where provider_event_id='premium-fixture-later';", false);
  graphCase('production event veto has no provider or timestamp narrowing', later + "update public.provider_events set provider='revenuecat_app_store',environment='production',occurred_at=transaction_timestamp()-interval '30 days' where provider_event_id='premium-fixture-later';", false);
  graphCase('ambiguous missing later timestamp vetoes', later + "update public.provider_events set occurred_at=null where provider_event_id='premium-fixture-later';", false);
  graphCase('unknown later product does not fabricate Premium authority', later + "update public.provider_events set product_id=null where provider_event_id='premium-fixture-later';", true);
  graphCase('source-compatible infinite expiry is preserved for the parent to cap', "update public.user_entitlements set expires_at='infinity'; update public.access_grants set expires_at='infinity';", true);
  assert.equal(query(`begin;select premium_fixture.reset();select not sandbox_commerce_v1.premium_current(null,transaction_timestamp())
    and not sandbox_commerce_v1.premium_current(${id},null)
    and not sandbox_commerce_v1.premium_current(${id},'infinity');rollback;`), 't');
  cases.push('null subject, null evaluation time and infinite evaluation time deny');

  // Prove row_security=off errors instead of silently hiding authority facts.
  // This temporary diagnostic role/grant exists only in this disposable fixture.
  query(`create role fixture_filtered_reader nologin nobypassrls;
    grant usage on schema sandbox_commerce_v1 to fixture_filtered_reader;
    grant execute on all functions in schema sandbox_commerce_v1 to fixture_filtered_reader;
    grant select on all tables in schema public to fixture_filtered_reader;
    alter table public.user_entitlements enable row level security;
    alter table public.user_entitlements force row level security;`);
  reject(`set role fixture_filtered_reader;select ${current};`, /query would be affected by row-level security policy/u);
  cases.push('an invoker subject to forced RLS errors rather than receiving a silently filtered graph');
  report = { status: 'passed', native: true, version, cases, caseCount: cases.length,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    fixtureSha256: createHash('sha256').update(fs.readFileSync(fixturePath)).digest('hex'),
    harnessSha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
    scope: 'Disposable Unix-socket-only PG17.6; all ten projected synthetic Premium tables enforce FORCE RLS before function creation; real new helpers and extracted source legacy oracle; source account restriction stubbed false. Native graph, expiry, ACL/ownership, deferred-planning install and forced-RLS-error proof only. No full authority wrapper, auth/session, lock concurrency, provider, receipts, delivery, deployment or production compatibility proof.' };
} finally {
  if (startAttempted) {
    const status = () => command('pg_ctl', ['-D', data, 'status']);
    const before = status();
    assert.ok([0, 3].includes(before.status), `uncertain local cluster status; retained ${directory}`);
    if (before.status === 0) invoke('pg_ctl', ['-D', data, '-w', '-t', '15', '-m', 'fast', 'stop']);
    else assert.ok(started, `uncertain startup; retained ${directory}`);
    assert.equal(status().status, 3, `shutdown unverified; retained ${directory}`);
    cleanup.stopped = true; cleanup.notRunningVerified = true;
  }
  fs.rmSync(directory, { recursive: true, force: true });
  cleanup.directoryRemoved = !fs.existsSync(directory);
}
assert.ok(report && cleanup.stopped && cleanup.notRunningVerified && cleanup.directoryRemoved);
console.log(JSON.stringify({ ...report, cleanup }, null, 2));
