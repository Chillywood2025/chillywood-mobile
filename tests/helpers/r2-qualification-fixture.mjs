// Offline test support only. No live client, credentials or provider requests.
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const root=new URL('../../supabase/functions/_shared/',import.meta.url);
const modules=new Set(['r2-disposable-qualification-manifest.ts','r2-disposable-qualification.ts',
  'r2-disposable-qualification-store.ts','r2-disposable-qualification-handler.ts',
  'r2-disposable-qualification-runtime.ts',
  'r2-disposable-qualification-origin.ts','content-inspection-private-origin.ts',
  'content-inspection-media.ts','media-upload-integrity.ts']);
const cache=new Map(),require=createRequire(import.meta.url);
// Node20 CI cannot import TypeScript directly. Compile the exact allowlisted
// source, preserving its imports and semantics, without patching production code.
export function loadQualificationModule(name) {
  assert.ok(modules.has(name),'test module must be explicitly allowlisted');
  if(cache.has(name))return cache.get(name);
  const source=readFileSync(new URL(name,root),'utf8');
  const compiled=ts.transpileModule(source,{fileName:name,reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
  assert.equal(compiled.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
  const exports={};cache.set(name,exports);
  const localRequire=specifier=>{
    if(specifier==='node:crypto')return require(specifier);
    assert.ok(specifier.startsWith('./'),'no external test dependency substitution');
    return loadQualificationModule(specifier.slice(2));
  };
  // The manifest can name the actual non-secret account, but this loader must
  // never inherit a real transport. Explicit synthetic request adapters only.
  const denyNetwork=()=>{throw Error('qualification_test_network_forbidden');};
  new Function('exports','require','crypto','fetch',compiled.outputText)(exports,localRequire,webcrypto,denyNetwork);
  return exports;
}

export const fixtureNow='2026-10-23T22:00:00.000Z';
export const proposalPath=new URL('../../supabase/proposals/r2-qualification-test-ledger.sql',import.meta.url);
export const proposalSource=readFileSync(proposalPath,'utf8');
export const proposalSha256=createHash('sha256').update(proposalSource).digest('hex');
assert.equal(proposalSha256,'e7020770b9bb8799ee7bfd34b62d836452684cbf511c013e4606f4a61a774bf3',
  'approved canonical proposal bytes must remain unchanged');
export const qualificationMigrationName='20261024175231_r2_qualification_test_ledger.sql';
export const qualificationMigrationPath=new URL(`../../supabase/migrations/${qualificationMigrationName}`,import.meta.url);
export const qualificationMigrationSource=readFileSync(qualificationMigrationPath,'utf8');
assert.equal(qualificationMigrationSource,proposalSource,'one byte-identical canonical forward migration');
const clockExpression='old.cleanup_approval_ref is not null,clock_timestamp())';
assert.equal(proposalSource.split(clockExpression).length,2,'one exact production admission clock');
// Only disposable test SQL receives a frozen clock. The manifest, deadline,
// authorization gates and canonical proposal bytes are NEVER rewritten.
export const fixtureProposalSQL=proposalSource.replace(clockExpression,
  `old.cleanup_approval_ref is not null,'${fixtureNow}'::timestamptz)`);
// Full-schema clones already contain the migration. Never execute its CREATEs
// again or drop/recreate the ledger. After canonical catalog parity and empty-row
// checks, only this exact trigger-function clock is replaced in disposable DBs.
const guard=proposalSource.match(/create function r2_qualification_test_private\.guard_run\(\)[\s\S]*?end; \$\$;/g);
assert.equal(guard?.length,1,'exactly one canonical admission trigger');
assert.equal(guard[0].split(clockExpression).length,2);
export const fixtureAdmissionClockSQL=guard[0].replace('create function ','create or replace function ')
  .replace(clockExpression,`old.cleanup_approval_ref is not null,'${fixtureNow}'::timestamptz)`);
export function assertClockOnlyCatalogChange(before,after) {
  assert.equal(before.split(clockExpression).length,2,'one exact catalog admission clock');
  assert.equal(after,before.replace(clockExpression,
    `old.cleanup_approval_ref is not null,'${fixtureNow}'::timestamptz)`),'only admission clock changed; definitions, ownership and privileges preserved');
}
export function assertProposalUnchanged() {
  assert.equal(createHash('sha256').update(readFileSync(proposalPath)).digest('hex'),proposalSha256);
  assert.equal(readFileSync(qualificationMigrationPath,'utf8'),proposalSource);
}

// Exact new-object catalog parity within the same PostgreSQL engine. Object
// and owner OIDs can differ between databases, so compare stable owner names,
// all non-owner ACL entries, definitions, RLS, constraints,
// defaults, policies, triggers and current rows must match a pristine canonical
// install. This cannot hide a missing schema/function or a seeded approval.
export const qualificationCatalogFingerprintSQL=`select jsonb_build_object(
 'schema',(select jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'grants',
   (select coalesce(jsonb_agg(jsonb_build_array(coalesce(r.rolname,'PUBLIC'),a.privilege_type,a.is_grantable)
     order by coalesce(r.rolname,'PUBLIC'),a.privilege_type),'[]')
    from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a left join pg_roles r on r.oid=a.grantee where a.grantee<>n.nspowner))
   from pg_namespace n where n.nspname='r2_qualification_test_private'),
 'relations',(select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
   'grants',(select coalesce(jsonb_agg(jsonb_build_array(coalesce(r.rolname,'PUBLIC'),a.privilege_type,a.is_grantable)
     order by coalesce(r.rolname,'PUBLIC'),a.privilege_type),'[]')
    from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a left join pg_roles r on r.oid=a.grantee where a.grantee<>c.relowner),
   'columns',(select coalesce(jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid),
     (select coalesce(jsonb_agg(jsonb_build_array(coalesce(r.rolname,'PUBLIC'),acl.privilege_type,acl.is_grantable)
       order by coalesce(r.rolname,'PUBLIC'),acl.privilege_type),'[]')
      from aclexplode(a.attacl) acl left join pg_roles r on r.oid=acl.grantee)) order by a.attnum),'[]')
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
   'constraints',(select coalesce(jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid)) order by k.conname),'[]') from pg_constraint k where k.conrelid=c.oid),
   'policies',(select coalesce(jsonb_agg(jsonb_build_array(p.polname,p.polcmd,p.polpermissive,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname),'[]') from pg_policy p where p.polrelid=c.oid),
   'triggers',(select coalesce(jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by t.tgname),'[]') from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)
 ) order by c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='r2_qualification_test_private'),
 'functions',(select coalesce(jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'definition',pg_get_functiondef(p.oid),
   'grants',(select coalesce(jsonb_agg(jsonb_build_array(coalesce(r.rolname,'PUBLIC'),a.privilege_type,a.is_grantable)
     order by coalesce(r.rolname,'PUBLIC'),a.privilege_type),'[]')
    from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a left join pg_roles r on r.oid=a.grantee where a.grantee<>p.proowner)
 ) order by p.oid::regprocedure::text),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='r2_qualification_test_private' or (n.nspname='public' and p.proname in ('read_r2_qualification_test_run','cas_r2_qualification_test_run'))),
 'rows',(select coalesce(jsonb_agg(to_jsonb(r) order by singleton),'[]') from r2_qualification_test_private.run r)
 )::text v;`;

// Excludes only the two NEW public RPCs; captures existing definition/ACL/RLS,
// role memberships, protected media/scan counts and retention settings.
export const existingDatabaseFingerprintSQL=`select jsonb_build_object(
 'relations',(select md5(coalesce(string_agg(n.nspname||'.'||c.relname||':'||c.relkind::text||':'||c.relrowsecurity||':'||c.relforcerowsecurity||':'||coalesce(c.relacl::text,''),'|' order by n.nspname,c.relname),'')) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','storage')),
 'functions',(select md5(coalesce(string_agg(p.oid::text||':'||p.prosrc||':'||coalesce(p.proconfig::text,'')||':'||p.prosecdef||':'||coalesce(p.proacl::text,''),'|' order by p.oid),'')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','auth','storage') and p.proname not in ('read_r2_qualification_test_run','cas_r2_qualification_test_run')),
 'memberships',(select coalesce(jsonb_agg(to_jsonb(m) order by roleid,member),'[]') from pg_auth_members m),
 'users',(select count(*) from auth.users),
 'media',(select count(*) from storage.objects),
 'scans',(select count(*) from public.media_scan_jobs),
 'retention',(select jsonb_agg(to_jsonb(s)) from private.deleted_content_retention_settings s),
 'fence',(select jsonb_agg(to_jsonb(s)) from private.deleted_media_reference_fence s)
 )::text;`;
