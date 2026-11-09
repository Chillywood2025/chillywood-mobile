import assert from 'node:assert/strict';
import {compactBeforeReadSQL,buildCompactRecoverySQL,classifyCompactRecovery} from './install-recovery.mjs';
import {buildNativeInstallEnvelope} from './install-envelope.mjs';
import {nativeStoreInstallProfile} from './install-profile.mjs';
import {nativePrivateStateReadSQL,validateNativePrivateState} from './private-state-readback.mjs';
export function prepareRecoveryNativeProof({q,run,args}){
 let cases=0;const reader='supabase_read_only_user';
 const literal=s=>"'"+s.replaceAll("'","''")+"'";
 q('grant insert,update,delete,maintain on supabase_migrations.schema_migrations to postgres;');
 q("insert into supabase_migrations.schema_migrations values('20260101000001','synthetic_recovery_order',array['first','second',null,'é']);");
 const beforeSQL=compactBeforeReadSQL(),before=JSON.parse(q(beforeSQL,reader));
 const envelope=buildNativeInstallEnvelope({baseline:before,migration:{version:'20010101000000',name:'native_store_sandbox_compact_native_fixture',sourceDigest:nativeStoreInstallProfile().sourceDigest}});
 const packet=buildCompactRecoverySQL({before,receipt:envelope.receipt});
 const read=(p=packet)=>classifyCompactRecovery(JSON.parse(q(p.sql,reader)),p);
 assert.equal(read().status,'unchanged_observed');cases++;
 // A healthy slower transaction must not inherit the separate private reader's
 // five-second budget. The one 25s recovery budget is never reset after waiting.
 const slower={...packet,sql:packet.sql.replace('do $recovery$',()=> 'select pg_sleep(5.2);do $recovery$')};
 assert.equal(read(slower).status,'unchanged_observed');cases++;
 const timed=run('psql',args(reader),packet.sql.replace("statement_timeout='20s'","statement_timeout='20ms'").replace('do $recovery$',()=> 'select pg_sleep(0.1);do $recovery$'));
 assert.notEqual(timed.status,0);assert.match(timed.stderr,/statement timeout/u);cases++;
 for(const sql of [beforeSQL,packet.sql]){
  const wrong=run('psql',args('postgres'),sql);assert.notEqual(wrong.status,0);assert.match(wrong.stderr,/native_recovery_reader_invalid/u);
 }cases++;
 const oldUnknown=buildCompactRecoverySQL({before:{...before,catalogSha256:'1'.repeat(64)},receipt:envelope.receipt});assert.equal(read(oldUnknown).status,'outcome_unknown');cases++;
 return {sql:envelope.sql,verifyCommitted(){
  const applied=read();assert.equal(applied.status,'exact_source_receipt_observed_runtime_unqualified');assert.equal(applied.administrativeConcurrencyExcluded,false);assert.equal(applied.retryAllowed,false);cases++;
  // Controlled disposable fixture only. Separate direct reader does not turn
  // metadata proof into a guarantee against real administrative replacement.
  assert.equal(validateNativePrivateState(JSON.parse(q(nativePrivateStateReadSQL,reader))).defaultOffAndEmptyObserved,true);cases++;
  const mutate=(change,restore)=>{q(change);try{assert.equal(read().status,'outcome_unknown');}finally{q(restore);}assert.equal(read().status,applied.status);cases++;};
  mutate('create function public.synthetic_compact_unexpected() returns integer language sql as $$select 1$$;','drop function public.synthetic_compact_unexpected();');
  const fn='public.native_store_private_install_state_v1()';
  const body=q(`select pg_get_functiondef('${fn}'::regprocedure);`);
  mutate(`create or replace function ${fn} returns jsonb language plpgsql stable security definer set search_path='' as $$begin raise exception 'UNTRUSTED_READER_MUST_NOT_EXECUTE';end$$;`,body);
  const cost=q(`select procost from pg_proc where oid='${fn}'::regprocedure;`);
  mutate(`alter function ${fn} cost 101;`,`alter function ${fn} cost ${cost};`);
  assert.equal(q("select has_schema_privilege('service_role','public','CREATE');"),'f');
  mutate('grant create on schema public to service_role;','revoke create on schema public from service_role;');
  mutate("update supabase_migrations.schema_migrations set name='wrong' where version='20010101000000';",`update supabase_migrations.schema_migrations set name=${literal(envelope.receipt[1])} where version='20010101000000';`);
  mutate("update supabase_migrations.schema_migrations set statements=array['second','first',null,'é'] where version='20260101000001';","update supabase_migrations.schema_migrations set statements=array['first','second',null,'é'] where version='20260101000001';");
  mutate("insert into supabase_migrations.schema_migrations select * from supabase_migrations.schema_migrations where version='20010101000000';","delete from supabase_migrations.schema_migrations where ctid=(select ctid from supabase_migrations.schema_migrations where version='20010101000000' order by ctid desc limit 1);");
  const badMeta=structuredClone(before);badMeta.recoveryMetadata.publicSchema[3]='{}';
  assert.equal(read(buildCompactRecoverySQL({before:badMeta,receipt:envelope.receipt})).status,'outcome_unknown');cases++;
  q('update native_store_sandbox_v1.control set enabled=true;');
  // Default recovery deliberately makes no private runtime assertion.
  assert.equal(read().status,'exact_source_receipt_observed_runtime_unqualified');
  assert.throws(()=>validateNativePrivateState(JSON.parse(q(nativePrivateStateReadSQL,reader))));
  q('update native_store_sandbox_v1.control set enabled=false;');cases++;
  console.log(JSON.stringify({protocol:'native-compact-recovery-managed-proof-v1',cases,passed:cases,actualReadOnlyLogin:true,runtimeInvocationDefault:false,administrativeConcurrencyExcluded:false,hostedQualified:false}));
 }};
}
