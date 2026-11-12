import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Execute the candidate's actual fence functions. This deliberately narrow
// fixture proves scope isolation, not complete handover or concurrent cutover.
const source=fs.readFileSync(new URL('../../isolated-runtime/native-store-apple-ownership-v1/ownership.sql',import.meta.url),'utf8');
const fn=name=>{
  const start=source.indexOf(`create function ${name}(`);
  assert.notEqual(start,-1);
  const end=source.indexOf('end $$;',start);
  assert.notEqual(end,-1);
  return source.slice(start,end+7);
};
test('Apple ownership fences do not lock unrelated, Google or production purchases',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create schema private;
   create table public.monetization_products(id uuid primary key,provider_product_id text);
   create table public.monetization_product_store_mappings(product_id uuid,provider_product_id text);
   create table public.money_purchase_intents(provider text,environment text,provider_product_id text,product_id uuid);
   create table private.native_apple_sandbox_owners(id uuid,product_id text,project_id text,app_id text,store text,environment text,
    connection_id uuid,connection_revision bigint,created_at timestamptz);
   create function private.native_apple_owner_lock() returns void language plpgsql as $$begin
    raise exception 'scope_lock_reached';end $$;
   ${fn('private.native_apple_legacy_intent_fence')}
   create trigger fence before insert on public.money_purchase_intents
    for each row execute function private.native_apple_legacy_intent_fence();
   ${fn('public.native_apple_admission_internal')}
   insert into public.monetization_products values('00000000-0000-4000-8000-000000000001','com.chillywood.paidvideo.tier1');
   insert into public.monetization_product_store_mappings values('00000000-0000-4000-8000-000000000001','com.chillywood.paidvideo.tier1');`);
  const insert=(provider,environment,sku,product=null)=>db.query('insert into public.money_purchase_intents values($1,$2,$3,$4)',[provider,environment,sku,product]);
  await insert('revenuecat_app_store','production','com.chillywood.paidvideo.tier1');
  await insert('revenuecat_google_play','sandbox','com.chillywood.paidvideo.tier1','00000000-0000-4000-8000-000000000001');
  await insert('revenuecat_app_store','sandbox','unrelated');
  await insert('revenuecat_app_store','sandbox',null);
  await assert.rejects(insert('revenuecat_app_store','sandbox','com.chillywood.paidvideo.tier1'),/scope_lock_reached/);
  await assert.rejects(insert('revenuecat_app_store','sandbox',null,'00000000-0000-4000-8000-000000000001'),/scope_lock_reached/);
  const admission=catalog=>db.query('select public.native_apple_admission_internal($1::jsonb,now())',[JSON.stringify(catalog)]);
  await admission({store:'PLAY_STORE',environment:'SANDBOX',wireProductId:'com.chillywood.paidvideo.tier1'});
  await admission({store:'APP_STORE',environment:'PRODUCTION',wireProductId:'com.chillywood.paidvideo.tier1'});
  await admission({store:'APP_STORE',environment:'SANDBOX',wireProductId:'unrelated'});
  await assert.rejects(admission({store:'APP_STORE',environment:'SANDBOX',wireProductId:'com.chillywood.paidvideo.tier1'}),/scope_lock_reached/);
 } finally {await db.close();}
});
