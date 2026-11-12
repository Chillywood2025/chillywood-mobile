import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('Android sandbox tip correction preserves flags and rejects unexpected catalog identity', {timeout:1_200_000}, async()=>{
  const name='20261112103000_android_sandbox_tip_provider_identity.sql';
  const sql=fs.readFileSync(`supabase/migrations/${name}`,'utf8');
  const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false,excludeMigrations:[name]});
  const row=async()=> (await db.query("select * from public.monetization_products where product_key='creator_tip_sandbox_099'")).rows[0];
  try {
    await db.exec("update public.monetization_products set provider_product_id='creator_tip_sandbox_099',metadata=metadata-'sandbox_purchase_intents_enabled' where product_key='creator_tip_sandbox_099'");
    const before=await row();
    assert.ok(before);
    await db.exec(sql);
    const after=await row();
    assert.equal(after.provider_product_id,'cw_creator_tip_sandbox_099');
    for(const key of Object.keys(before).filter(k=>!['provider_product_id','updated_at'].includes(k))) assert.deepEqual(after[key],before[key],key);
    await db.exec(sql);
    assert.deepEqual(await row(),after,'already corrected row is a no-op');
    await db.exec("update public.monetization_products set provider_product_id='unexpected_sku' where product_key='creator_tip_sandbox_099'");
    await assert.rejects(()=>db.exec(sql),/android_tip_catalog_identity_unexpected/);
    assert.equal((await row()).provider_product_id,'unexpected_sku');
  } finally {await db.close();}
});

// Isolated migration precondition proof, not a claim of full lifecycle recovery.
test('Mapping correction refuses historical identity ambiguity without rewriting snapshots',async()=>{
  const db=new PGlite();
  const sql=fs.readFileSync('supabase/migrations/20261112103000_android_sandbox_tip_provider_identity.sql','utf8');
  try {
    await db.exec(`create table public.monetization_products(id integer,product_key text,product_type text,provider text,environment text,status text,provider_base_plan_id text,revenuecat_entitlement text,provider_product_id text);
      create table public.money_purchase_intents(provider text,environment text,provider_product_id text);
      create table public.provider_events(product_id integer,metadata jsonb);
      insert into public.monetization_products values(1,'creator_tip_sandbox_099','creator_tip','revenuecat_google_play','sandbox','sandbox',null,null,'creator_tip_sandbox_099');
      insert into public.money_purchase_intents values('revenuecat_google_play','sandbox','creator_tip_sandbox_099');`);
    const history=(await db.query('select * from public.money_purchase_intents')).rows;
    await assert.rejects(()=>db.exec(sql),/android_tip_catalog_history_requires_review/);
    assert.deepEqual((await db.query('select * from public.money_purchase_intents')).rows,history);
    await db.exec("delete from public.money_purchase_intents; insert into public.provider_events values(1,'{}')");
    await assert.rejects(()=>db.exec(sql),/android_tip_catalog_history_requires_review/);
    await db.exec(`update public.provider_events set metadata='{"provider_product_id":"cw_creator_tip_sandbox_099"}'`);
    await db.exec("insert into public.monetization_products values(2,'duplicate_tip','creator_tip','revenuecat_google_play','sandbox','sandbox',null,null,'cw_creator_tip_sandbox_099')");
    await assert.rejects(()=>db.exec(sql),/android_tip_catalog_target_ambiguous/);
    assert.equal((await db.query('select provider_product_id from public.monetization_products where id=1')).rows[0].provider_product_id,'creator_tip_sandbox_099');
    await db.exec('delete from public.monetization_products where id=2');
    await db.exec(sql);
    assert.equal((await db.query('select provider_product_id from public.monetization_products')).rows[0].provider_product_id,'cw_creator_tip_sandbox_099');
    assert.equal((await db.query('select metadata from public.provider_events')).rows[0].metadata.provider_product_id,'cw_creator_tip_sandbox_099');
  } finally {await db.close();}
});
