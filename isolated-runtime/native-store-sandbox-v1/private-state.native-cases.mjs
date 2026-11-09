import assert from 'node:assert/strict';
import {nativePrivateStateReadSQL,validateNativePrivateState} from './private-state-readback.mjs';
export function runNativePrivateStateCases({q,run,args}){
 let cases=0;const reader='supabase_read_only_user';
 // The fixed closure already installed the reader. Never transplant it here.
 assert.equal(q("select to_regprocedure('public.native_store_private_install_state_v1()') is not null;"),'t');cases++;
 const read=()=>JSON.parse(q(nativePrivateStateReadSQL,reader));
 const fresh=read();assert.equal(validateNativePrivateState(fresh).defaultOffAndEmptyObserved,true);cases++;
 assert.equal(JSON.stringify(fresh).includes('secret'),false);
 for(const role of ['anon','authenticated','service_role']){
  const r=run('psql',args(),`set role ${role};select public.native_store_private_install_state_v1();`);assert.notEqual(r.status,0);assert.match(r.stderr,/permission denied/u);
 }cases++;
 for(const table of ['native_store_sandbox_v1.connections','sandbox_commerce_v1.native_store_settlement_protocols']){
  const r=run('psql',args(reader),'begin read only;select * from '+table+';rollback;');assert.notEqual(r.status,0);assert.match(r.stderr,/permission denied/u);
 }cases++;
 // SET ROLE impersonation cannot stand in for the original authenticated reader.
 const impersonated=run('psql',args(),nativePrivateStateReadSQL.replace('select public.',`set local role ${reader};select public.`));assert.notEqual(impersonated.status,0);assert.match(impersonated.stderr,/native_private_read_context_required/u);cases++;
 for(const bad of [nativePrivateStateReadSQL.replace('repeatable read','read committed'),nativePrivateStateReadSQL.replace('read only','read write'),nativePrivateStateReadSQL.replace("statement_timeout='5s'","statement_timeout='0'"),nativePrivateStateReadSQL.replace("transaction_timeout='5s'","transaction_timeout='0'")]){
  const r=run('psql',args(reader),bad);assert.notEqual(r.status,0);assert.match(r.stderr,/native_private_read_context_required/u);
 }cases++;
 for(const role of ['sbx_v1_core_owner','native_store_sandbox_v1_owner'])assert.equal(q(`select pg_has_role('postgres','${role}','SET'),pg_has_role('postgres','${role}','USAGE'),has_schema_privilege('${role}','public','CREATE');`),'f|f|f');cases++;
 q('update native_store_sandbox_v1.control set enabled=true;');let dirty=read();assert.equal(dirty.journal.disabled,false);assert.throws(()=>validateNativePrivateState(dirty),/NOT_FRESH/u);q('update native_store_sandbox_v1.control set enabled=false;');cases++;
 q('update sandbox_commerce_v1.native_store_quote_controls set preparation_enabled=true;');dirty=read();assert.equal(dirty.controls.preparationDisabled,false);assert.throws(()=>validateNativePrivateState(dirty),/NOT_FRESH/u);q('update sandbox_commerce_v1.native_store_quote_controls set preparation_enabled=false;');cases++;
 q(`insert into native_store_sandbox_v1.connections values('a0000000-0000-4000-8000-000000000001',1,'synthetic-readback-project','synthetic-app','APP_STORE','SANDBOX','synthetic-auth-id','synthetic-storage-id');`);
 dirty=read();assert.equal(dirty.journal.empty.connections,false);assert.throws(()=>validateNativePrivateState(dirty),/NOT_FRESH/u);assert.equal(JSON.stringify(dirty).includes('synthetic-readback-project'),false);cases++;
 q(`insert into sandbox_commerce_v1.paid_video_routes values('a0000000-0000-4000-8000-000000000002','s3','synthetic-private-bucket',repeat('a',64),false);`);
 dirty=read();assert.equal(dirty.empty.paid_video_routes,false);assert.throws(()=>validateNativePrivateState(dirty),/NOT_FRESH/u);assert.equal(JSON.stringify(dirty).includes('synthetic-private-bucket'),false);cases++;
 console.log(JSON.stringify({protocol:'native-private-state-local-proof-v1',cases,passed:cases,actualReadOnlyLogin:true,tableGrantsAdded:false,fixedInstallModules:48,candidateReaderSeparate:false,hostedQualified:false}));return cases;
}
