import {materializeHistoricalProofPackage} from './helpers/historical-revenuecat-closure.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const historicalProof=materializeHistoricalProofPackage();
const p=await import(new URL('staged.mjs',historicalProof));
const names=['inverse','types','catalog','data','history'];
const fresh=()=>Object.fromEntries(names.map(n=>[n,{proofProtocol:'refund589-staged-offline-v1',proofStage:n,...({inverse:{bothFrozenAnchorsProven:true,faults:[]},types:{qualified:true,faults:[]},catalog:{hash:'a'.repeat(64)},data:{qualified:true,hash:'b'.repeat(64)},history:{qualified:true,hash:'c'.repeat(64)}}[n])}]));
test('final aggregation requires complete same-batch sentinels, tags, hashes, booleans and context',async()=>{
 const db=new PGlite();try{
  await db.exec('begin read only');
  // Only replace context with an explicit parameter to isolate aggregation predicates.
  // Real production context remains unchanged in the emitted offline batch.
  const q=p.final.replaceAll(p.context,'$1::boolean');
  async function check(values,context=true){
   for(const n of names)await db.query('select set_config($1,$2,true)',['chillywood.refund_proof_'+n,JSON.stringify(values[n]??{})]);
   return (await db.query(q,[context])).rows[0].evidence;
  }
  assert.equal((await check(fresh())).databaseBaselineQualified,true);
  for(const mutate of [v=>delete v.inverse,v=>v.types={},v=>v.catalog.proofStage='data',v=>v.data.proofProtocol='old',v=>v.history.qualified='true',v=>v.inverse.bothFrozenAnchorsProven=false,v=>v.data.hash='bogus',v=>delete v.history.hash]){
   const v=fresh();mutate(v);const e=await check(v);assert.equal(e.databaseBaselineQualified,false);for(const k of ['Catalog','Data','History'])assert.equal(e['expected'+k+'Sha256'],null);
  }
  assert.equal((await check(fresh(),false)).databaseBaselineQualified,false);
  await db.exec('rollback');
  for(const n of names)assert.equal((await db.query('select current_setting($1,true) v',['chillywood.refund_proof_'+n])).rows[0].v,'');
 }finally{await db.close();}
});
test('transaction-local trusted DO setters execute under non-superuser read-only role and roll back',async()=>{
 const db=new PGlite();try{
  await db.exec("create role stage_reader;set session authorization stage_reader;");
  await db.exec("begin isolation level repeatable read read only;set local chillywood.refund_proof_inverse='{}';DO $proof$ DECLARE result jsonb; BEGIN SELECT jsonb_build_object('verified',true) INTO STRICT result; PERFORM set_config('chillywood.refund_proof_inverse',result::text,true); END $proof$;");
  const r=(await db.query("select current_user,session_user,current_setting('transaction_read_only') ro,current_setting('transaction_isolation') iso,current_setting('chillywood.refund_proof_inverse')::jsonb e")).rows[0];
  assert.equal(r.current_user,'stage_reader');assert.equal(r.session_user,'stage_reader');assert.equal(r.ro,'on');assert.equal(r.iso,'repeatable read');assert.deepEqual(r.e,{verified:true});
  await db.exec('rollback');assert.equal((await db.query("select current_setting('chillywood.refund_proof_inverse',true) v")).rows[0].v,'');
 }finally{await db.close();}
});

test('staged proof preserves canonical catalog/data/history coverage and snapshot/resource guards',async()=>{
 const {sql:inverse}=await import(new URL('inverse.mjs',historicalProof));
 const {invariantsHashSQL}=await import('../scripts/google-refund-tax-observer-exact-deploy.mjs');
 const predicates=await import(new URL('predicates.mjs',historicalProof));
 assert.equal(p.stages.inverse,inverse.slice(inverse.indexOf('with observed'),inverse.lastIndexOf('; rollback;')));
 assert.ok(p.stages.catalog.includes(invariantsHashSQL));
 for(const expression of [predicates.dataEvidenceExpression,predicates.dataPredicate])assert.ok(p.stages.data.includes(expression));
 for(const expression of [predicates.historyEvidenceExpression,predicates.historyPredicate,predicates.fullHistoryHash])assert.ok(p.stages.history.includes(expression));
 assert.equal(Object.keys(p.stages).join(','),'inverse,types,catalog,data,history');
 assert.match(p.setup,/begin isolation level repeatable read read only/);
 assert.match(p.setup,/set local jit=off/);assert.match(p.setup,/work_mem='4MB'/);assert.match(p.setup,/statement_timeout='15s'/);assert.match(p.setup,/idle_in_transaction_session_timeout='30s'/);
 for(const n of Object.keys(p.stages))assert.ok(p.setup.includes(`set local chillywood.refund_proof_${n}='{}'`));
 assert.match(p.sql,/rollback;\n$/);assert.match(p.final,/'edgeQualified',false,'deploymentQualified',false/);
 assert.equal((p.sql.match(/DO \$refund_proof_stage\$/g)||[]).length,5);
});
