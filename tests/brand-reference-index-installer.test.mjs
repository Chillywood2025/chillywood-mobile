import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {BOUNDS,sourceContract,validateCatalog,validateIndex,runBrandReferenceIndexInstaller} from '../scripts/brand-reference-index-installer.mjs';

const source=readFileSync(new URL('../scripts/brand-reference-index-installer.mjs',import.meta.url),'utf8');
function catalog(){
 const contract=sourceContract(),owner=10;
 return {database:{version:'170006',role:'postgres'},owner,functions:contract.functions.map(f=>({proname:f.name,prosrc:f.body,language:f.language,provolatile:f.volatility,
  prosecdef:f.definer,proleakproof:false,proparallel:'u',proisstrict:false,proowner:owner,arguments:f.arguments,result:f.result,proconfig:['search_path=""'],
  acl:(['platform_brand_index_normalize_v1','platform_brand_index_jsonb_bytes_v1'].includes(f.name)?[[owner,0,'EXECUTE',false]]:[]).concat([[owner,owner,'EXECUTE',false]])})),
  registry:{rls:true,force:true,owner,ownerOnly:true,noPolicies:true},extension:{opclass:50},guards:[{enabled:'O',definer:false,expected:true,event:'ddl_command_end'},{enabled:'O',definer:false,expected:true,event:'sql_drop'}]};
}
test('undeployed migration loses only its bulk build block; reviewed SQL remains byte identical',()=>{
 const migration='supabase/migrations/20261025141347_platform_brand_reference_candidate_indexes.sql';
 const before=execFileSync('git',['show','b802fc19237b65ac81448400a441a2aab1b85cb8:'+migration],{encoding:'utf8'});
 const after=readFileSync(migration,'utf8');
 const oldStart=before.indexOf('-- Each qualifying table gets an ordinary native expression index');
 const newStart=after.indexOf('-- Construction is a separately authorized');
 const next='create or replace function private.platform_brand_retention_references_clear';
 assert.equal(after.slice(0,newStart),before.slice(0,oldStart));
 assert.equal(after.slice(after.indexOf(next)),before.slice(before.indexOf(next)));
 assert.ok(!after.slice(newStart,after.indexOf(next)).includes('create index'));
});
test('initial semantic acceptance is source-bound, including signature, grants and actual guard binding',()=>{
 validateCatalog(catalog());
 for(const mutate of [c=>c.functions[0].prosrc+=' ',c=>c.functions[0].arguments='wrong text',c=>c.functions[0].result='jsonb',c=>c.functions[0].proowner=20,
  c=>c.functions[0].acl.push([10,0,'EXECUTE',false]),c=>c.functions[0].proconfig=['search_path=public'],c=>c.functions[0].provolatile='v',c=>c.guards[0].expected=false,
  c=>c.guards[0].enabled='D',c=>c.guards.pop(),c=>c.registry.force=false,c=>c.registry.ownerOnly=false,c=>c.registry.owner=20,c=>c.registry.noPolicies=false,c=>c.database.version='170007']){
  const c=catalog();mutate(c);assert.throws(()=>validateCatalog(c));
 }
});
test('index registration requires exact identity, owner, expression and complete structural contract',()=>{
 const target={oid:30,owner:10},extension={opclass:50};
 const original={oid:40,table:30,owner:10,am:'gin',unique:false,attrs:1,keys:1,key:0,predicate:null,expression:'expected',opclass:50,collation:100,live:true};
 validateIndex(original,target,'expected',extension,40);
 for(const [key,value] of Object.entries({oid:41,table:31,owner:11,am:'btree',unique:true,attrs:2,keys:2,key:1,predicate:'true',expression:'different',opclass:51,collation:101,live:false}))
  assert.throws(()=>validateIndex({...original,[key]:value},target,'expected',extension,40),key);
});
test('installer keeps hard server budgets, standalone CIC and snapshot-free heartbeat',()=>{
 assert.deepEqual(BOUNDS,{statement:90000,lock:2000,transaction:120000,idle:15000,analyze:10000,heartbeat:3000,minimumLifetime:130000});
 assert.match(source,/await builder\.query\(`create index concurrently/);
 assert.ok(!/drop index|create index.*if not exists|retention_lock\(/i.test(source));
 assert.match(source,/await guard\.query\("set local idle_in_transaction_session_timeout='15s';"\)/);
 assert.ok(!source.includes("guard.query('select 1;')"));
 assert.match(source,/begin isolation level read committed;/);
 assert.match(source,/ANOTHER_INSTALLER_ACTIVE/);
 assert.match(source,/UNCERTAIN_PRIOR_BUILD_REQUIRES_RECONCILIATION/);
 assert.match(source,/INVALID_INDEX_REQUIRES_EXPLICIT_RESUME/);
});
test('no provider connection is opened without explicit durable checkpoint and supported mode',async()=>{
 let calls=0;const adapter={connect:async()=>{calls++;},cancel:async()=>{}};
 await assert.rejects(runBrandReferenceIndexInstaller({adapter,mode:'apply'}),/DURABLE_CHECKPOINT_REQUIRED/);
 await assert.rejects(runBrandReferenceIndexInstaller({adapter,mode:'auto',checkpoint:async()=>{}}),/INVALID_MODE/);
 assert.equal(calls,0);
});

test('rejected session cleanup cannot return successful planning and preserves any earlier failure',async()=>{
 let rejectEnd=false,changedCatalog=false;const snapshots=[];
 const adapter={cancel:async()=>{},connect:async()=>({end:async()=>{if(rejectEnd)throw new Error('private driver detail');},query:async sql=>{
  if(sql.includes("'bounds'"))return{rows:[{value:{pid:1,backendStart:'synthetic',applicationName:'brand_index_guard',bounds:{statement_timeout:[90000,'ms'],lock_timeout:[2000,'ms'],transaction_timeout:[120000,'ms'],idle_in_transaction_session_timeout:[15000,'ms']}}}]};
  if(sql.includes("'database'")){const result=catalog();if(changedCatalog)result.functions[0].prosrc+=' changed';return{rows:[{value:result}]};}
  if(sql.includes('cross join lateral'))return{rows:[{value:[]}]};
  return{rows:[]};
 }})};
 const checkpoint=async snapshot=>snapshots.push(structuredClone(snapshot));
 const initial=await runBrandReferenceIndexInstaller({adapter,checkpoint});
 rejectEnd=true;
 await assert.rejects(runBrandReferenceIndexInstaller({adapter,checkpoint}),/OWNED_SESSION_CLEANUP_FAILED/);
 assert.equal(snapshots.at(-1).journal.status,'cleanup_failed');
 assert.deepEqual(snapshots.at(-1).journal.cleanupFailure,{priorStatus:'planned',failedSessions:['guard']});
 assert.equal(snapshots.at(-1).journal.error.code,'OWNED_SESSION_CLEANUP_FAILED');
 changedCatalog=true;
 await assert.rejects(runBrandReferenceIndexInstaller({adapter,mode:'apply',plan:initial.plan,journal:initial.journal,checkpoint}),/OWNED_SESSION_CLEANUP_FAILED/);
 assert.equal(snapshots.at(-1).journal.status,'cleanup_failed');
 assert.equal(snapshots.at(-1).journal.error.code,'SOURCE_SEMANTICS_MISMATCH');
 assert.deepEqual(snapshots.at(-1).journal.cleanupFailure,{priorStatus:'failed',failedSessions:['guard']});
 assert.ok(!JSON.stringify(snapshots).includes('private driver detail'));
});
