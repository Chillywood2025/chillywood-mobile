import fs from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';
import {buildNativeInstallEnvelope,classifyNativeInstallOutcome,envelopeLockRelations} from '../../isolated-runtime/native-store-sandbox-v1/install-envelope.mjs';
import {nativeStoreInstallProfile} from '../../isolated-runtime/native-store-sandbox-v1/install-profile.mjs';
import {dependencyRelations} from '../../scripts/native-store-install-prepare.mjs';
const context={currentPostgres:false,currentReadOnly:true,sessionPostgres:false,sessionReadOnly:true,sessionAdmin:false,transactionReadOnly:true};
const review=()=>({migration:{version:'20010101000000',name:'native_store_sandbox_synthetic_fixture',sourceDigest:nativeStoreInstallProfile().sourceDigest},
 baseline:{context,serverVersionNum:'170006',historyCount:1,historyMaximum:'20000101000000',historySha256:'a'.repeat(64),catalogSha256:'b'.repeat(64),moneyControlsSha256:'c'.repeat(64),moneyHeld:true,
 dependencies:{protocol:'native-store-install-dependencies-v1',serverVersionNum:'170006',transactionReadOnly:'on',currentUser:'supabase_read_only_user',sessionUser:'supabase_read_only_user',freshNamespaces:true,freshRoles:true,
 relations:dependencyRelations().map(relation=>({relation,present:true,postgresSelect:true,postgresMaintain:true,missingColumns:[]}))}}});
test('no assigned migration or hosted baseline: default envelope refuses SQL',()=>{
 assert.throws(()=>buildNativeInstallEnvelope(),/native_envelope_review_required/u);
 for(const mutate of [r=>r.migration.sourceDigest='0'.repeat(64),r=>r.migration.version="';drop table x;--",r=>r.migration.extra=true,r=>r.baseline.moneyHeld=false,r=>r.baseline.context={...context,currentPostgres:true,currentReadOnly:false}]){const r=review();mutate(r);assert.throws(()=>buildNativeInstallEnvelope(r));}
});
test('exact offline envelope binds source, before snapshot, bounded locks and transactional receipt before existing postcheck',()=>{
 const r=review(),b=buildNativeInstallEnvelope(r);assert.equal(b.deploymentAllowed,false);assert.equal(b.administrativeConcurrencyExcluded,false);
 assert.equal(envelopeLockRelations().length,22);assert.equal(new Set(b.lockRelations).size,22);
 for(const s of ["set local jit=off","set local work_mem='8MB'","set local statement_timeout='20s'","set local transaction_timeout='25s'",'in share row exclusive mode nowait','native_envelope_baseline_changed','native_envelope_history_changed','native_atomic_added_catalog_changed'])assert.ok(b.sql.includes(s),s);
 assert.ok(b.sql.indexOf('insert into supabase_migrations.schema_migrations')<b.sql.indexOf('-- Force the original'));
 assert.match(b.sql,/commit;$/u);assert.deepEqual(b.receipt.slice(0,2),[r.migration.version,r.migration.name]);
 r.migration.name='mutated';assert.notEqual(b.receipt[1],r.migration.name);
 const sql=b.sql,receipt=JSON.stringify(b.receipt),locks=JSON.stringify(b.lockRelations);
 for(const mutate of [()=>b.receipt[0]='20990101000000',()=>b.receipt[2].push('changed'),()=>b.lockRelations.pop(),()=>b.sql='changed'])assert.throws(mutate,TypeError);
 assert.equal(b.sql,sql);assert.equal(JSON.stringify(b.receipt),receipt);assert.equal(JSON.stringify(b.lockRelations),locks);
});
test('uncertain outcome needs exact read context/catalog/history and never authorizes retry',()=>{
 const bundle=buildNativeInstallEnvelope(review());const before={context,serverVersionNum:'170006',moneyControlsSha256:'c'.repeat(64),history:[['20000101000000','fixture',[]]],catalog:{bootstrapSuperuser:'fixture_admin',rows:[['schema','public','postgres',null]],publicAcl:[],acls:{}}};
 assert.deepEqual(classifyNativeInstallOutcome({before,after:structuredClone(before),receipt:bundle.receipt}),{status:'unchanged_observed',retryAllowed:false,deploymentAllowed:false});
 for(const after of [null,{}, {...before,catalog:null},{...before,moneyControlsSha256:'d'.repeat(64)},{...before,history:[]},{...before,context:{...context,transactionReadOnly:false}}])assert.deepEqual(classifyNativeInstallOutcome({before,after,receipt:bundle.receipt}),{status:'outcome_unknown',retryAllowed:false,deploymentAllowed:false});
 assert.equal(classifyNativeInstallOutcome({before,after:before,receipt:['20010101000000','native_store_sandbox_fixture',['wrong source']]}).status,'outcome_unknown');
});

test('history verification is rowwise multiset with unchanged canonical text digest and no budget reset',()=>{
 const source=fs.readFileSync(new URL('../../isolated-runtime/native-store-sandbox-v1/install-envelope.mjs',import.meta.url),'utf8');
 assert.match(source,/insert into native_envelope_history \$\{historyItemsSQL\}/u);
 assert.match(source,/canonicalItemArrayTextSQL/u);
 assert.doesNotMatch(source,/declare expected jsonb;actual jsonb|rows\|\|jsonb_build_array/u);
});

test('one independent typed expected receipt is reused without RETURNING or duplicated literals',()=>{
 const b=buildNativeInstallEnvelope(review()),literal=x=>"'"+x.replaceAll("'","''")+"'";
 assert.equal(b.sql.split(literal(b.receipt[2][0])).length-1,1);
 assert.equal(b.sql.includes(literal(JSON.stringify(b.receipt))),false);
 assert.equal((b.sql.match(/select jsonb_build_array\(version,name,statements\) from native_envelope_expected_receipt/gu)||[]).length,2);
 assert.ok(b.sql.indexOf('insert into native_envelope_expected_receipt')<b.sql.indexOf('insert into supabase_migrations.schema_migrations'));
 assert.match(b.sql,/native_envelope_expected_receipt\(version text,name text,statements text\[\]\) on commit drop/u);
 assert.ok(b.sql.includes(createHash('sha256').update(b.receipt[2][0]).digest('hex')));
 assert.match(b.sql,/count\(\*\) from native_envelope_expected_receipt\)<>1/u);
 assert.match(b.sql,/array_ndims\(statements\)=1 and array_lower\(statements,1\)=1 and cardinality\(statements\)=1/u);
 assert.doesNotMatch(b.sql,/insert into supabase_migrations\.schema_migrations[^;]*returning/iu);
});
