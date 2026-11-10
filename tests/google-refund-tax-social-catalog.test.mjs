import * as historicalTool from '../scripts/google-refund-tax-social-exact-deploy.mjs';
import {loadHistoricalBundle} from './helpers/historical-revenuecat-closure.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {databaseFactory} from './helpers/native-deployment-database.mjs';
import {addedCatalogHashSQL} from '../scripts/google-refund-tax-social-exact-deploy.mjs';
import {addedCatalogHashSQL as historicalCatalogHashSQL} from '../scripts/google-refund-tax-exact-deploy.mjs';

// Immutable target DDL over the minimum synthetic CREATE dependencies. No
// provider calls, production baseline or deployment qualification is produced.
const setup=`set check_function_bodies=false;set search_path=pg_catalog,public;
 create role anon;create role authenticated;create role service_role bypassrls;
 create schema private;create schema auth;create schema extensions;
 create extension pgcrypto with schema extensions;
 alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
 create table private.google_play_external_transactions(id uuid primary key);`;
const controls=[
 ['lost_not_null','alter table private.google_refund_tax_history alter column account_id drop not null'],
 ['real_check','alter table private.google_refund_tax_history drop constraint google_refund_tax_history_checkpoint_check'],
 ['foreign_key','alter table private.google_refund_tax_history drop constraint google_refund_tax_history_transaction_id_fkey'],
 ['grant','grant select on private.google_refund_tax_history to authenticated'],
 ['rls','alter table private.google_refund_tax_history disable row level security'],
 ['force_rls','alter table private.google_refund_tax_history no force row level security'],
 ['default',"alter table private.google_refund_tax_history alter column account_id set default 'acct_changed'"],
];
test('immutable refund catalog normalizes only redundant PG18 NOT NULL rows', {timeout:120000},async t=>{
 const bundle=loadHistoricalBundle(historicalTool),results=[];
 const engines=[['pglite18',()=>new PGlite({extensions:{pgcrypto}})],
   ...(process.env.NATIVE_DEPLOYMENT_PG_BIN?[['native17',databaseFactory]]:[])];
 for(const [name,create] of engines){
  const db=await create();
  try{
   await db.exec(setup);await db.exec(bundle.body);
   const read=async sql=>(await db.exec(`select ${sql} as hash`)).at(-1).rows[0].hash;
   const hash=await read(addedCatalogHashSQL),historical=await read(historicalCatalogHashSQL);
   assert.equal(hash,bundle.manifest.addedCatalogSha256);
   const version=(await db.exec('select version() value')).at(-1).rows[0].value;
   assert.match(version,name==='native17'?/^PostgreSQL 17\./u:/^PostgreSQL 18\./u);
   assert.equal(historical,name==='native17'?hash:'39159c6f49dd220468376fa243c4be2b42c859342b92d0e1b916e694458dcba9');
   const required=(await db.exec("select attname from pg_attribute where attrelid='private.google_refund_tax_history'::regclass and attnum>0 and attnotnull order by attname")).at(-1).rows.map(x=>x.attname);
   assert.deepEqual(required,['account_id','checkpoint','completed','generation','source_binding','transaction_id','updated_at']);
   for(const [control,sql] of controls){
    await db.exec('begin');
    try{await db.exec(sql);assert.notEqual(await read(addedCatalogHashSQL),hash,`${name}: ${control} must remain fingerprinted`);}
    finally{await db.exec('rollback');}
    assert.equal(await read(addedCatalogHashSQL),hash,`${name}: ${control} rollback`);
   }
   results.push(hash);t.diagnostic(`${name}: exact immutable target and ${controls.length} semantic drift controls passed`);
  }finally{await db.close();}
 }
 assert.ok(results.every(hash=>hash===results[0]),'native17 and PGlite18 normalize to the same source-derived digest');
});
