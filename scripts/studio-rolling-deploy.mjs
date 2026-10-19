#!/usr/bin/env node
// Exact, atomic Studio/Audience rollout. No write is sent without --apply.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PROJECT = 'bmkkhihfbmsnnmcqkoly';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = 'scripts/studio-rolling-deployment-manifest.json';
const HELD_HASH = '51f4bb3324e0dedb3691b4d961d00fcd14a0619ea7c056a041b6564eb3dd2a10';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const requireThat = (ok, code) => { if (!ok) throw new Error(code); };
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const hashSql = value => `encode(sha256(convert_to(${value},'UTF8')),'hex')`;
const rowHashSql = alias => hashSql(`array_to_json(${alias}.statements)::text`);
const git = (root, ...args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

export function sourceBinding(root, source) {
  requireThat(/^[a-f0-9]{40}$/.test(source ?? ''), 'EXACT_SOURCE_REQUIRED');
  requireThat(git(root, 'rev-parse', 'HEAD') === source, 'SOURCE_HEAD_MISMATCH');
  requireThat(git(root, 'status', '--porcelain', '--untracked-files=no') === '', 'TRACKED_SOURCE_DIRTY');
  for (const file of ['scripts/studio-rolling-deploy.mjs', MANIFEST]) {
    requireThat(git(root, 'ls-files', '--error-unmatch', file) === file, 'TOOL_NOT_COMMITTED');
  }
  return { source, tree: git(root, 'rev-parse', 'HEAD^{tree}') };
}

// These exact bodies are compared with pg_proc before COMMIT and on readback.
// Fail closed on a new SQL spelling instead of silently skipping a function.
export function functionContracts(sql) {
  const results = [];
  const pattern = /create(?:\s+or\s+replace)?\s+function\s+public\."?(\w+)"?\s*\(([\s\S]*?)\)\s*returns\b([\s\S]*?)\bas\s*\$\$([\s\S]*?)\$\$\s*;/gi;
  for (const match of sql.matchAll(pattern)) {
    const header = match[3];
    const searchPath = header.match(/set\s+search_path\s*=\s*(''|public)(?:\s|$)/i)?.[1];
    requireThat(searchPath !== undefined, 'FUNCTION_SEARCH_PATH_UNSUPPORTED');
    const argumentTypes = match[2].trim() ? match[2].split(',').map(argument => {
      const type = argument.trim().match(/^\w+\s+(text|uuid\[\]|uuid|jsonb|bigint|integer|timestamptz)(?:\s+default\b[\s\S]*)?$/i)?.[1];
      requireThat(type, 'FUNCTION_ARGUMENTS_UNSUPPORTED');
      return type.toLowerCase() === 'timestamptz' ? 'timestamp with time zone' : type.toLowerCase();
    }).join(', ') : '';
    const language = header.match(/\blanguage\s+(sql|plpgsql)\b/i)?.[1]?.toLowerCase();
    requireThat(language, 'FUNCTION_LANGUAGE_UNSUPPORTED');
    const returns = header.split(/\blanguage\b/i)[0].replace(/"([a-z_][a-z0-9_]*)"/g, '$1')
      .replace(/\btimestamptz\b/gi, 'timestamp with time zone').replace(/\s/g, '').toLowerCase();
    results.push({ name: match[1], bodySha256: sha256(match[4]), argumentTypes, language, returns,
      securityDefiner: /security\s+definer/i.test(header),
      volatility: /\bstable\b/i.test(header) ? 's' : /\bimmutable\b/i.test(header) ? 'i' : 'v',
      searchPath: searchPath === "''" ? 'search_path=""' : 'search_path=public' });
  }
  requireThat(results.length === [...sql.matchAll(/create(?:\s+or\s+replace)?\s+function\b/gi)].length,
    'FUNCTION_CONTRACT_PARSE_FAILED');
  return results;
}

export function loadBundle(root = ROOT, source) {
  const sourceFiles = [];
  const readSource = file => {
    let value;
    if (source !== undefined) {
      requireThat(/^[a-f0-9]{40}$/.test(source), 'EXACT_SOURCE_REQUIRED');
      requireThat(git(root, 'ls-files', '--error-unmatch', file) === file, 'SOURCE_FILE_NOT_COMMITTED');
      value = execFileSync('git', ['show', `${source}:${file}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } else value = fs.readFileSync(path.join(root, file), 'utf8');
    sourceFiles.push({ file, sha256: sha256(value) });
    return value;
  };
  const manifest = JSON.parse(readSource(MANIFEST));
  requireThat(manifest.schema === 1 && manifest.project === PROJECT && manifest.migrations.length === 3,
    'MANIFEST_INVALID');
  const versions = ['20261015073423', '20261019020049', '20261019020052'];
  const names = ['platform_studio_publication_and_audience_authority', 'platform_studio_rolling_brand_compatibility', 'platform_studio_rolling_audience_compatibility'];
  const migrations = manifest.migrations.map((entry, index) => {
    requireThat(entry.version === versions[index] && entry.name === names[index], 'MIGRATION_SCOPE_INVALID');
    const file = `supabase/migrations/${entry.version}_${entry.name}.sql`;
    const body = readSource(file);
    requireThat(/^[a-f0-9]{64}$/.test(entry.sha256) && sha256(body) === entry.sha256, 'MIGRATION_HASH_MISMATCH');
    requireThat(!/^\s*(?:begin|commit|rollback)\s*;/im.test(body), 'MIGRATION_TRANSACTION_CONTROL_FORBIDDEN');
    return { ...entry, file, body, statementsSha256: sha256(JSON.stringify([body])) };
  });
  requireThat(migrations[0].sha256 === HELD_HASH, 'HELD_MIGRATION_CHANGED');
  const functions = new Map();
  for (const migration of migrations) for (const item of functionContracts(migration.body)) functions.set(item.name, item);
  const newFunctionNames = [...new Set(migrations.flatMap(item => [...item.body.matchAll(/create\s+function\s+public\."?(\w+)"?/gi)].map(match => match[1])))]
    .filter(name => name !== 'publish_platform_brand_profile_assets');
  newFunctionNames.push('publish_platform_brand_profile_assets_internal');
  const predecessor = functionContracts(readSource(
    'supabase/migrations/20260615142151_platform_brand_owner_publish_assets_rpc.sql'))[0];
  functions.set('publish_platform_brand_profile_assets_internal', { ...predecessor, name: 'publish_platform_brand_profile_assets_internal' });
  const triggers = new Map();
  for (const migration of migrations) {
    for (const match of migration.body.matchAll(/create\s+trigger\s+(\w+)\s+(before|after)\s+(insert|update|delete)(?:\s+or\s+(insert|update|delete))?\s+on\s+public\."?(\w+)"?\s+for\s+each\s+row\s+execute\s+function\s+public\."?(\w+)"?\(\)\s*;/gi)) {
      const event = name => ({ insert: 4, update: 16, delete: 8 })[name?.toLowerCase()] ?? 0;
      const item = { name: match[1], table: match[5], function: match[6], type: 1 + (match[2].toLowerCase() === 'before' ? 2 : 0) + event(match[3]) + event(match[4]) };
      triggers.set(`${item.table}.${item.name}`, item);
    }
  }
  requireThat(triggers.size === 5, 'TRIGGER_CONTRACT_PARSE_FAILED');
  requireThat(Array.isArray(manifest.prerequisites) && manifest.prerequisites.length >= 6, 'PREREQUISITES_MISSING');
  requireThat(Array.isArray(manifest.policies) && manifest.policies.length === 2
    && manifest.policies.every(item => /^[a-z_]+$/.test(item.table) && /^[a-z_]+$/.test(item.name) && /^[a-f0-9]{64}$/.test(item.sha256)), 'POLICY_CONTRACTS_MISSING');
  return { manifest, migrations, functions: [...functions.values()], triggers: [...triggers.values()], predecessor, sourceFiles, newFunctionNames };
}

const historyHash = `(select ${hashSql("coalesce(jsonb_agg(jsonb_build_array(version,name,statements) order by version)::text,'[]')")} from supabase_migrations.schema_migrations)`;
const catalogHash = `(select ${hashSql("coalesce(jsonb_agg(item order by item::text)::text,'[]')")} from (
  select jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl::text,p.proowner::regrole::text) item
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','storage','auth') and p.prokind in ('f','p')
  union all select jsonb_build_array('policy',to_jsonb(p)) from pg_catalog.pg_policies p where schemaname in ('public','storage','auth')
  union all select jsonb_build_array('relation',n.nspname,c.relname,c.relkind,c.relowner::regrole::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity)
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','storage','auth') and c.relkind in ('r','p','v','S')
  union all select jsonb_build_array('trigger',t.tgrelid::regclass::text,t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) from pg_catalog.pg_trigger t where not t.tgisinternal
  union all select jsonb_build_array('column',a.attrelid::regclass::text,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text)
    from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','storage','auth') and c.relkind in ('r','p','v') and a.attnum>0 and not a.attisdropped
  union all select jsonb_build_array('constraint',c.conrelid::regclass::text,c.conname,pg_get_constraintdef(c.oid)) from pg_catalog.pg_constraint c where c.conrelid<>0
) catalog_items)`;

function historyMatch(entry) {
  return `exists(select 1 from supabase_migrations.schema_migrations m where m.version=${literal(entry.version)} and m.name=${literal(entry.name)} and ${rowHashSql('m')}=${literal(entry.statementsSha256)})`;
}
function finalChecks(bundle) {
  const functions = bundle.functions.map(entry => `(select count(*)=1 and coalesce(bool_and(
    ${hashSql('p.prosrc')}=${literal(entry.bodySha256)} and p.prosecdef=${entry.securityDefiner}
    and p.prokind='f' and oidvectortypes(p.proargtypes)=${literal(entry.argumentTypes)}
    and (select lanname from pg_catalog.pg_language where oid=p.prolang)=${literal(entry.language)}
    and lower(regexp_replace(pg_get_function_result(p.oid),'[[:space:]]','','g'))=${literal(entry.returns)}
    and p.proowner=(select relowner from pg_catalog.pg_class where oid=to_regclass('public.platform_brand_profiles'))
    and p.provolatile=${literal(entry.volatility)} and p.proconfig=array[${literal(entry.searchPath)}]::text[]
  ),false) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=${literal(entry.name)})`).join(' and ');
  const triggers = bundle.triggers.map(entry => `exists(select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid=t.tgfoid
    where t.tgrelid=to_regclass(${literal(`public.${entry.table}`)}) and t.tgname=${literal(entry.name)}
      and t.tgtype=${entry.type} and t.tgenabled='O' and p.proname=${literal(entry.function)})`).join(' and ');
  const privilege = (role, signature) => `coalesce(has_function_privilege(${literal(role)},to_regprocedure(${literal(signature)}),'EXECUTE'),false)`;
  const clientFunctions = ['public.publish_platform_brand_profile(jsonb)', 'public.review_channel_audience_request(bigint,text)', 'public.preflight_legacy_channel_audience_follow(text,text)', 'public.platform_brand_publication_metadata_read_allowed(text)'];
  const acl = clientFunctions.map(signature => `(${privilege('authenticated', signature)} and not ${privilege('anon', signature)} and not ${privilege('service_role', signature)})`);
  for (const entry of bundle.functions.filter(item => item.name.endsWith('_internal') && item.name !== 'publish_platform_brand_profile_assets_internal')) {
    acl.push(`not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=${literal(entry.name)} and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE')))`);
  }
  acl.push(`not ${privilege('authenticated', 'public.publish_platform_brand_profile_assets_internal(uuid[],text)')}`);
  acl.push(`not ${privilege('anon', 'public.publish_platform_brand_profile_assets_internal(uuid[],text)')}`);
  acl.push(privilege('service_role', 'public.publish_platform_brand_profile_assets_internal(uuid[],text)'));
  acl.push(`(${privilege('authenticated', 'public.publish_platform_brand_profile_assets(uuid[],text)')} and ${privilege('service_role', 'public.publish_platform_brand_profile_assets(uuid[],text)')} and not ${privilege('anon', 'public.publish_platform_brand_profile_assets(uuid[],text)')})`);
  for (const entry of bundle.functions.filter(item => item.returns === 'trigger')) acl.push(`not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=${literal(entry.name)} and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE')))`);
  acl.push(`not has_table_privilege('authenticated','public.channel_audience_requests','UPDATE')`);
  for (const column of ['status', 'reviewed_at', 'reviewed_by', 'updated_at']) acl.push(`has_column_privilege('authenticated','public.channel_audience_requests',${literal(column)},'UPDATE')`);
  for (const column of ['id', 'channel_user_id', 'requester_user_id', 'request_kind', 'note', 'created_at']) acl.push(`not has_column_privilege('authenticated','public.channel_audience_requests',${literal(column)},'UPDATE')`);
  for (const table of ['platform_brand_publications', 'platform_brand_publication_metadata']) {
    acl.push(`exists(select 1 from pg_catalog.pg_class where oid=to_regclass('public.${table}') and relrowsecurity and relforcerowsecurity)`);
    acl.push(`not coalesce(has_any_column_privilege('anon',to_regclass('public.${table}'),'SELECT,INSERT,UPDATE,REFERENCES'),false)`);
    acl.push(`not coalesce(has_table_privilege('authenticated',to_regclass('public.${table}'),'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER'),false)`);
    acl.push(`coalesce(has_table_privilege('service_role',to_regclass('public.${table}'),'SELECT'),false)`);
  }
  acl.push(`not coalesce(has_table_privilege('authenticated',to_regclass('public.platform_brand_publications'),'SELECT'),false)`);
  acl.push(`coalesce(has_table_privilege('authenticated',to_regclass('public.platform_brand_publication_metadata'),'SELECT'),false)`);
  acl.push(`(select count(*)=2 and bool_and(attnotnull) from pg_catalog.pg_attribute where attrelid=to_regclass('public.platform_brand_publication_metadata') and attnum>0 and not attisdropped)`);
  for (const [table, keys] of [['platform_brand_publications', ['owner_user_id']], ['platform_brand_publication_metadata', ['owner_user_id', 'published_at']]]) {
    acl.push(`exists(select 1 from pg_catalog.pg_constraint c where c.conrelid=to_regclass('public.${table}') and c.contype='p'
      and (select array_agg(a.attname::text order by k.ordinality) from unnest(c.conkey) with ordinality k(attnum,ordinality)
        join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)=array[${keys.map(literal).join(',')}]::text[])`);
    const foreignKeys = [{ field: 'owner_user_id', target: 'platform_brand_profiles', targetField: 'owner_user_id', deletion: 'c' }];
    if (table === 'platform_brand_publications') for (const field of ['hero_image_asset_id','hero_video_asset_id','hero_poster_asset_id','background_image_asset_id','avatar_asset_id','logo_asset_id','watermark_asset_id']) foreignKeys.push({ field, target: 'platform_brand_assets', targetField: 'id', deletion: 'n' });
    acl.push(`(select count(*)=${foreignKeys.length} from pg_catalog.pg_constraint where conrelid=to_regclass('public.${table}') and contype='f')`);
    for (const key of foreignKeys) acl.push(`exists(select 1 from pg_catalog.pg_constraint c
      join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and c.conkey=array[a.attnum]::smallint[]
      join pg_catalog.pg_attribute b on b.attrelid=c.confrelid and c.confkey=array[b.attnum]::smallint[]
      where c.conrelid=to_regclass('public.${table}') and c.confrelid=to_regclass('public.${key.target}') and c.contype='f'
        and a.attname=${literal(key.field)} and b.attname=${literal(key.targetField)} and c.confdeltype=${literal(key.deletion)} and c.convalidated)`);
  }
  const policies = bundle.manifest.policies.map(item => `exists(select 1 from pg_catalog.pg_policy p
    where p.polrelid=to_regclass(${literal(`public.${item.table}`)}) and p.polname=${literal(item.name)}
      and ${hashSql("jsonb_build_array(p.polcmd,p.polpermissive,(select array_agg(r::regrole::text order by r::regrole::text) from unnest(p.polroles) r),pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid))::text")}=${literal(item.sha256)})`).join(' and ');
  return { functions, triggers, grants: acl.join(' and '), policies };
}

export function readbackSql(bundle) {
  const versions = bundle.migrations.map(entry => literal(entry.version)).join(',');
  const checks = finalChecks(bundle);
  const prerequisites = bundle.manifest.prerequisites.map(historyMatch).join(' and ');
  return `set local search_path=''; select jsonb_build_object(
    'schema',1,'database',current_database(),'historySha256',${historyHash},'catalogSha256',${catalogHash},
    'prerequisites',(${prerequisites}),
    'relationsReady',to_regclass('storage.objects') is not null and to_regclass('auth.users') is not null and to_regclass('auth.sessions') is not null
      and (select count(*)=4 and bool_and(relrowsecurity) from pg_catalog.pg_class where oid in (
        to_regclass('public.channel_audience_requests'),to_regclass('public.channel_followers'),to_regclass('public.platform_brand_profiles'),to_regclass('public.platform_brand_assets'))),
    'preexistingPendingFollowers',(select count(*) from public.channel_audience_requests request
      join public.channel_followers follower on follower.channel_user_id=request.channel_user_id and follower.follower_user_id=request.requester_user_id
      where request.request_kind='follow' and request.status='pending'),
    'targets',(select coalesce(jsonb_agg(jsonb_build_object('version',m.version,'name',m.name,'statementsSha256',${rowHashSql('m')}) order by m.version),'[]') from supabase_migrations.schema_migrations m where m.version in (${versions})),
    'objectsAbsent',to_regclass('public.platform_brand_publications') is null and to_regclass('public.platform_brand_publication_metadata') is null
      and not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${bundle.newFunctionNames.map(literal).join(',')}))
      and not exists(select 1 from pg_catalog.pg_trigger t where ${bundle.triggers.map(item => `(t.tgname=${literal(item.name)} and t.tgrelid=to_regclass(${literal(`public.${item.table}`)}))`).join(' or ')}),
    'predecessorFunction',exists(select 1 from pg_catalog.pg_proc p where p.oid=to_regprocedure('public.publish_platform_brand_profile_assets(uuid[],text)') and ${hashSql('p.prosrc')}=${literal(bundle.predecessor.bodySha256)} and p.prosecdef
      and p.proconfig=array[${literal(bundle.predecessor.searchPath)}]::text[] and p.provolatile=${literal(bundle.predecessor.volatility)}),
    'final',jsonb_build_object(${Object.entries(checks).map(([key, value]) => `${literal(key)},coalesce((${value}),false)`).join(',')})
  ) as state;`;
}

export function classifyState(bundle, state) {
  requireThat(state?.schema === 1 && state.database === 'postgres' && /^[a-f0-9]{64}$/.test(state.historySha256 ?? '')
    && /^[a-f0-9]{64}$/.test(state.catalogSha256 ?? '') && Array.isArray(state.targets), 'READBACK_INVALID');
  requireThat(state.prerequisites === true, 'PREREQUISITE_HISTORY_MISMATCH');
  requireThat(state.relationsReady === true, 'PREREQUISITE_RELATIONS_INVALID');
  if (state.targets.length === 0) {
    requireThat(state.objectsAbsent === true && state.predecessorFunction === true, 'PARTIAL_CATALOG_OR_PREDECESSOR_DRIFT');
    return 'ready';
  }
  requireThat(state.targets.length === bundle.migrations.length && bundle.migrations.every(expected => state.targets.some(actual => actual.version === expected.version
    && actual.name === expected.name && actual.statementsSha256 === expected.statementsSha256)), 'PARTIAL_OR_DIFFERENT_MIGRATION_HISTORY');
  requireThat(Object.keys(state.final ?? {}).length === 4 && Object.values(state.final).every(value => value === true), 'FINAL_CATALOG_MISMATCH');
  return 'applied';
}

export function buildApplySql(bundle, baseline) {
  requireThat(classifyState(bundle, baseline) === 'ready', 'APPLY_REQUIRES_ABSENT_TARGETS');
  const checks = Object.values(finalChecks(bundle)).map(value => `coalesce((${value}),false)`).join(' and ');
  return `begin;
set local search_path='';
set local standard_conforming_strings=on;
set local lock_timeout='5s';
set local statement_timeout='45s';
set local idle_in_transaction_session_timeout='60s';
select pg_advisory_xact_lock(hashtextextended('chillywood-studio-rolling-deployment',0));
lock table supabase_migrations.schema_migrations in share row exclusive mode;
lock table public.channel_audience_requests, public.channel_followers,
  public.platform_brand_profiles, public.platform_brand_assets, storage.objects in share row exclusive mode;
do $studio_preflight$ begin
  if ${historyHash} <> ${literal(baseline.historySha256)} or ${catalogHash} <> ${literal(baseline.catalogSha256)}
    or exists(select 1 from supabase_migrations.schema_migrations where version in (${bundle.migrations.map(item => literal(item.version)).join(',')}))
    or to_regclass('public.platform_brand_publications') is not null
    or to_regclass('public.platform_brand_publication_metadata') is not null then
    raise exception 'studio_rolling_baseline_changed';
  end if;
end $studio_preflight$;
${bundle.migrations.map(item => `${item.body}\ninsert into supabase_migrations.schema_migrations(version,name,statements)
  values(${literal(item.version)},${literal(item.name)},array[${literal(item.body)}]::text[]);`).join('\n')}
do $studio_postflight$ begin
  if not (${checks} and ${bundle.migrations.map(historyMatch).join(' and ')}) then
    raise exception 'studio_rolling_final_catalog_mismatch';
  end if;
end $studio_postflight$;
notify pgrst, 'reload schema';
commit;`;
}

export async function deploy({ bundle, apply = false, query, recheckSource = () => {} }) {
  const before = await query(readbackSql(bundle), true);
  const mode = classifyState(bundle, before);
  if (!apply || mode === 'applied') return { status: mode === 'applied' ? 'already_applied_verified' : 'plan_ready', wrote: false, before };
  recheckSource();
  let responseConfirmed = false;
  try { await query(buildApplySql(bundle, before), false); responseConfirmed = true; }
  catch { /* A lost response is not a safe reason to retry a write. */ }
  let after;
  try { after = await query(readbackSql(bundle), true); }
  catch { return { status: 'apply_unconfirmed', wrote: true, responseConfirmed }; }
  try {
    if (classifyState(bundle, after) === 'applied') return { status: 'applied_verified', wrote: true, responseConfirmed, after };
  } catch { return { status: 'apply_unconfirmed', wrote: true, responseConfirmed, after }; }
  return { status: 'not_applied_readback', wrote: true, responseConfirmed, after };
}

export function managementQuery(token, fetcher = fetch) {
  requireThat(typeof token === 'string' && token.length > 0, 'SUPABASE_ACCESS_TOKEN_REQUIRED');
  return async (query, readOnly) => {
    const response = await fetcher(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query, read_only: readOnly }), signal: AbortSignal.timeout(readOnly ? 30_000 : 65_000),
    });
    requireThat(response.ok, 'MANAGEMENT_REQUEST_FAILED');
    const text = await response.text();
    requireThat(text.length <= 2 * 1024 * 1024, 'MANAGEMENT_RESPONSE_TOO_LARGE');
    let rows; try { rows = JSON.parse(text); } catch { throw new Error('MANAGEMENT_RESPONSE_INVALID'); }
    requireThat(Array.isArray(rows), 'MANAGEMENT_RESPONSE_INVALID');
    if (!readOnly) return undefined;
    requireThat(rows.length === 1 && rows[0]?.state, 'MANAGEMENT_READBACK_INVALID');
    return rows[0].state;
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: node scripts/studio-rolling-deploy.mjs --source FULL_COMMIT_SHA [--apply]\nDefault: read-only plan or verified already-applied readback. --apply sends exactly one atomic transaction. Requires existing SUPABASE_ACCESS_TOKEN. Never retries a write.\n');
    return;
  }
  requireThat(args.filter(arg => arg === '--source').length === 1 && args.indexOf('--source') + 1 < args.length, 'EXACT_SOURCE_REQUIRED');
  const source = args[args.indexOf('--source') + 1];
  const remaining = args.filter((_, index) => index !== args.indexOf('--source') && index !== args.indexOf('--source') + 1);
  requireThat(remaining.length === 0 || (remaining.length === 1 && remaining[0] === '--apply'), 'ARGUMENT_INVALID');
  const binding = sourceBinding(ROOT, source), bundle = loadBundle(ROOT, source);
  const result = await deploy({ bundle, apply: remaining.includes('--apply'), query: managementQuery(process.env.SUPABASE_ACCESS_TOKEN),
    recheckSource: () => { sourceBinding(ROOT, source);
      requireThat(JSON.stringify(loadBundle(ROOT, source).sourceFiles) === JSON.stringify(bundle.sourceFiles), 'SOURCE_BYTES_CHANGED'); } });
  const state = result.after ?? result.before;
  process.stdout.write(`${JSON.stringify({ project: PROJECT, ...binding, status: result.status, wrote: result.wrote,
    responseConfirmed: result.responseConfirmed, migrations: bundle.migrations.map(({ version, name, sha256: hash }) => ({ version, name, sha256: hash })),
    historySha256: state?.historySha256, catalogSha256: state?.catalogSha256,
    preexistingPendingFollowers: state?.preexistingPendingFollowers })}\n`);
  if (!['plan_ready', 'already_applied_verified', 'applied_verified'].includes(result.status)) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Never echo provider payloads, SQL, tokens, or arbitrary exception text.
    const code = /^[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'STUDIO_ROLLING_DEPLOY_BLOCKED';
    process.stderr.write(`${JSON.stringify({ status: 'blocked', code })}\n`); process.exitCode = 1;
  });
}
