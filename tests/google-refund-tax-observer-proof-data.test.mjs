import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {loadBundle} from '../scripts/google-refund-tax-observer-exact-deploy.mjs';
import {DATA_ANCHORS,EXPECTED_RECEIPTS,dataPredicate,historyPredicate,classifySyntheticProof} from '../scripts/google-refund-tax-observer-proof/predicates.mjs';
const bundle=loadBundle(new URL('../',import.meta.url).pathname);
const valid=()=>({catalog:true,data:{guardedHash:DATA_ANCHORS.guarded,inverseHash:DATA_ANCHORS.inverse,seedExact:true,holds:true,fullHash:'a'.repeat(64)},history:{database:'postgres',originalHistorySha256:bundle.manifest.originalHistory.sha256,historyCount:589,historyMaximum:'20261107191000',targets:structuredClone(EXPECTED_RECEIPTS),addedAbsent:true,socialCatalogSha256:bundle.manifest.socialCatalogSha256}});
test('compiled SQL predicates agree with strict synthetic classifier and reject data/history drift',async()=>{
 const db=new PGlite();try{
  const check=async p=>{const r=(await db.query(`with additional as(select $1::jsonb data_evidence,$2::jsonb history_evidence) select (${dataPredicate}) data_valid,(${historyPredicate}) history_valid from additional`,[JSON.stringify(p.data),JSON.stringify(p.history)])).rows[0];return p.catalog===true&&r.data_valid===true&&r.history_valid===true;};
  assert.equal(await check(valid()),true);assert.equal(classifySyntheticProof(valid()),true);
  for(const mutate of [p=>p.data.inverseHash='f'.repeat(64),p=>p.data.guardedHash='f'.repeat(64),p=>p.data.seedExact=false,p=>delete p.data.seedExact,p=>p.data.holds=false,p=>p.catalog=false,
   p=>p.history.historyCount=590,p=>p.history.historyMaximum='20261108000000',p=>p.history.originalHistorySha256='f'.repeat(64),p=>p.history.targets.pop(),p=>p.history.targets.push(p.history.targets[0]),p=>p.history.targets[0].statementsSha256='f'.repeat(64),p=>p.history.targets[0].name='restamped',p=>p.history.addedAbsent=false,p=>p.history.socialCatalogSha256='f'.repeat(64),p=>p.history.database='wrong']){
   const p=valid();mutate(p);assert.equal(await check(p),false);assert.equal(classifySyntheticProof(p),false);
  }
 }finally{await db.close();}
});
test('real row edits change inverse digest, and source control must be one exact disabled row',async()=>{
 const db=new PGlite();try{
  await db.exec("create table prior_rows(id integer,amount integer);insert into prior_rows values(1,99);create table source_control(singleton boolean,enabled boolean);insert into source_control values(true,false)");
  const hash=async()=>(await db.query("select encode(sha256(convert_to(jsonb_agg(to_jsonb(t) order by id)::text,'UTF8')),'hex') h from prior_rows t")).rows[0].h;
  const seed=async()=>(await db.query(`select count(*)=1 and bool_and(to_jsonb(t)='{"singleton":true,"enabled":false}'::jsonb) valid from source_control t`)).rows[0].valid;
  const original=await hash();assert.equal(await seed(),true);
  await db.exec('update prior_rows set amount=100');assert.notEqual(await hash(),original);
  await db.exec('update source_control set enabled=true');assert.equal(await seed(),false);
  await db.exec('update source_control set enabled=false;insert into source_control values(true,false)');assert.equal(await seed(),false);
  await db.exec('delete from source_control');assert.notEqual(await seed(),true);
 }finally{await db.close();}
});
