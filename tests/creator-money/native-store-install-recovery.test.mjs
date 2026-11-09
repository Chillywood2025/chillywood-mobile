import test from 'node:test';import assert from 'node:assert/strict';
import {compactBeforeReadSQL,validateCompactBefore,buildCompactRecoverySQL,classifyCompactRecovery} from '../../isolated-runtime/native-store-sandbox-v1/install-recovery.mjs';
import {nativeStoreInstallProfile} from '../../isolated-runtime/native-store-sandbox-v1/install-profile.mjs';
import {dependencyRelations} from '../../scripts/native-store-install-prepare.mjs';
const before=()=>({recoveryProtocol:'native-compact-before-v1',sourceDigest:nativeStoreInstallProfile().sourceDigest,addedRowsAbsent:true,
 recoveryMetadata:{bootstrap:'fixture_admin',publicSchema:['schema','public','postgres',null],publicAcl:[]},
 context:{currentPostgres:false,currentReadOnly:true,sessionPostgres:false,sessionReadOnly:true,sessionAdmin:false,transactionReadOnly:true},
 serverVersionNum:'170006',historyCount:612,historyMaximum:'20261107191000',historySha256:'a'.repeat(64),catalogSha256:'b'.repeat(64),moneyControlsSha256:'c'.repeat(64),moneyHeld:true,
 dependencies:{protocol:'native-store-install-dependencies-v1',serverVersionNum:'170006',transactionReadOnly:'on',currentUser:'supabase_read_only_user',sessionUser:'supabase_read_only_user',freshNamespaces:true,freshRoles:true,
 relations:dependencyRelations().map(relation=>({relation,present:true,postgresSelect:true,postgresMaintain:true,missingColumns:[]}))}});
const receipt=()=>['20010101000000','native_store_sandbox_synthetic_fixture',[nativeStoreInstallProfile().sql.replace(/^begin;\n/u,'').replace(/\ncommit;\n$/u,'')]];
test('trusted before metadata is required and cannot be synthesized from missing legacy fields',()=>{
 assert.equal(validateCompactBefore(before()).addedRowsAbsent,true);
 for(const change of [v=>delete v.recoveryMetadata,v=>v.recoveryMetadata.publicSchema=null,v=>v.recoveryMetadata.publicAcl=[['postgres','sbx_v1_core_owner','USAGE',false]],v=>v.recoveryMetadata.bootstrap=null,v=>v.addedRowsAbsent=false,v=>v.sourceDigest='0'.repeat(64),v=>v.context.sessionReadOnly=false]){const v=before();change(v);assert.throws(()=>validateCompactBefore(v));}
});
test('before read fails identity before broad collection and has one bounded readonly transaction',()=>{
 const sql=compactBeforeReadSQL();assert.ok(sql.indexOf("current_user<>'supabase_read_only_user'")<sql.indexOf('select state||'));
 assert.match(sql,/begin isolation level repeatable read read only/u);assert.equal(sql.match(/transaction_timeout='25s'/gu).length,1);assert.match(sql,/rollback;$/u);
 assert.equal(sql.match(/idle_in_transaction_session_timeout='10s'/gu).length,1);
});
test('recovery preserves source/multiset/hash bindings without returning catalog/history bodies or invoking runtime code',()=>{
 const p=buildCompactRecoverySQL({before:before(),receipt:receipt()});
 assert.match(p.sql,/except all/u);assert.match(p.sql,/native_compact_recovery/u);assert.match(p.sql,/set local enable_hashagg=off/u);
 assert.equal(p.sql.match(/transaction_timeout='25s'/gu).length,1);assert.equal(p.sql.match(/statement_timeout='20s'/gu).length,1);
 assert.equal(p.sql.match(/idle_in_transaction_session_timeout='10s'/gu).length,1);
 assert.doesNotMatch(p.sql,/execute 'select public\.native_store_private_install_state_v1\(\)'/u);
 assert.equal(p.administrativeConcurrencyExcluded,false);assert.equal(p.retryAllowed,false);
 assert.match(p.sql,/count\(\*\)=1 and bool_and/u);assert.match(p.sql,/where version<>/u);assert.match(p.sql,/jsonb_set\(r,'\{3\}'/u);
});
test('wrong receipt source and unsafe identity cannot produce a recovery packet',()=>{
 for(const bad of [null,[],['20010101000000','native_store_sandbox_fixture',['wrong']],['bad','native_store_sandbox_fixture',receipt()[2]]])assert.throws(()=>buildCompactRecoverySQL({before:before(),receipt:bad}));
});
test('only complete exact results classify and no observation grants retry, activation or deployment',()=>{
 const p=buildCompactRecoverySQL({before:before(),receipt:receipt()});
 const valid={protocol:'native-compact-recovery-v1',token:p.token,sourceDigest:p.sourceDigest,status:'unchanged_observed',runtime:null,administrativeConcurrencyExcluded:false,retryAllowed:false,deploymentAllowed:false};
 for(const status of ['unchanged_observed','exact_source_receipt_observed_runtime_unqualified']){
  const r=classifyCompactRecovery({...valid,status},p);assert.equal(r.status,status);assert.equal(r.activationAllowed,false);assert.equal(r.retryAllowed,false);assert.equal(r.deploymentAllowed,false);assert.equal(r.administrativeConcurrencyExcluded,false);
 }
 for(const v of [null,{}, {...valid,token:'old'}, {...valid,sourceDigest:'0'.repeat(64)}, {...valid,retryAllowed:true},{...valid,administrativeConcurrencyExcluded:true},{...valid,runtime:{}},{...valid,status:'exact_source_receipt_default_off_empty_observed'},{...valid,extra:true}])assert.equal(classifyCompactRecovery(v,p).status,'outcome_unknown');
 for(const key of Object.keys(valid)){const v={...valid};delete v[key];assert.equal(classifyCompactRecovery(v,p).status,'outcome_unknown');}
});
test('fresh before and exact receipt are bound into the immutable packet token',()=>{
 const b=before(),p=buildCompactRecoverySQL({before:b,receipt:receipt()});b.historyCount++;
 assert.notEqual(buildCompactRecoverySQL({before:b,receipt:receipt()}).token,p.token);assert.throws(()=>p.token='changed',TypeError);
});
