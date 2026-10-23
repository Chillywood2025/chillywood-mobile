// Offline test support only. No live client, credentials or provider requests.
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const root=new URL('../../supabase/functions/_shared/',import.meta.url);
const modules=new Set(['r2-disposable-qualification-manifest.ts','r2-disposable-qualification.ts',
  'r2-disposable-qualification-store.ts','r2-disposable-qualification-handler.ts',
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
  new Function('exports','require','crypto',compiled.outputText)(exports,localRequire,webcrypto);
  return exports;
}

export const fixtureNow='2026-10-23T22:00:00.000Z';
export const proposalPath=new URL('../../supabase/proposals/r2-qualification-test-ledger.sql',import.meta.url);
export const proposalSource=readFileSync(proposalPath,'utf8');
export const proposalSha256=createHash('sha256').update(proposalSource).digest('hex');
const clockExpression='old.cleanup_approval_ref is not null,clock_timestamp())';
assert.equal(proposalSource.split(clockExpression).length,2,'one exact production admission clock');
// Only disposable test SQL receives a frozen clock. The manifest, deadline,
// authorization gates and canonical proposal bytes are NEVER rewritten.
export const fixtureProposalSQL=proposalSource.replace(clockExpression,
  `old.cleanup_approval_ref is not null,'${fixtureNow}'::timestamptz)`);
export function assertProposalUnchanged() {
  assert.equal(createHash('sha256').update(readFileSync(proposalPath)).digest('hex'),proposalSha256);
}

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
