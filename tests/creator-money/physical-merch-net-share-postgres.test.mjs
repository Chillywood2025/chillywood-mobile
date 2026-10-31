import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
const migration='20261030190222_physical_merch_net_share_terms.sql';
test('physical merch freezes new90/10 NET terms without repricing history or granting settlement', {timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,excludeMigrations:[migration]});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const make=()=>one(`insert into public.merch_orders(buyer_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency)
 values('e7000000-0000-4000-8000-000000000001','stripe_physical_goods','sandbox','pending','not_started','pending',1000,1000,'usd') returning id`);
 try{
  const old=await make();const prior=await one('select to_jsonb(o) from public.merch_orders o where id=$1',[old]);
  await db.exec(fs.readFileSync(`supabase/migrations/${migration}`,'utf8'));
  const oldAfter=await one('select to_jsonb(o) from public.merch_orders o where id=$1',[old]);
  assert.equal(oldAfter.net_share_policy_version,null);for(const [k,v] of Object.entries(prior))assert.deepEqual(oldAfter[k],v);
  const id=await make();const read=()=>one('select public.merch_order_projection_internal(o) from public.merch_orders o where id=$1',[id]);
  const q=await read();assert.equal(q.platformNetShareBps,1000);assert.equal(q.creatorNetShareBps,9000);assert.equal(q.providerFeeMinor,null);assert.equal(q.creatorShareMinor,null);assert.equal(q.netSettlementStatus,'unverified');
  await assert.rejects(db.query('update public.merch_orders set platform_net_share_bps=2000 where id=$1',[id]),/immutable/);
  await assert.rejects(db.query("update public.merch_orders set net_share_policy_version='physical_merch_net_90_10_v1',platform_net_share_bps=1000,creator_net_share_bps=9000 where id=$1",[old]),/immutable/);
  for(const refunded of [100,400,1000]){await db.query('update public.merch_orders set refunded_amount_minor=$2 where id=$1',[id,refunded]);assert.equal((await read()).platformNetShareBps,1000);assert.equal((await read()).creatorShareMinor,null);}
  const split=(args)=>one('select public.preview_physical_merch_net_split($1,$2,$3,$4,$5)',args);
  for(const [gross,costs,net,fee] of [[10000,[300,700,0,0],9000,900],[101,[0,0,0,0],101,10],[9,[0,0,0,0],9,0],[1000,[20,0,500,80],400,40],[1000,[0,0,1000,0],0,0]]){
   const result=await split([gross,...costs]);assert.equal(result.netBaseMinor,net);assert.equal(result.platformShareMinor,fee);assert.equal(result.creatorShareMinor,net-fee);assert.equal(result.costsVerified,false);assert.equal(result.financialAuthority,false);assert.deepEqual(await split([gross,...costs]),result);
  }
  assert.equal((await split([1000,null,0,0,0])).creatorShareMinor,null);
  await assert.rejects(split([1000,1001,0,0,0]),/exceed_gross/);await assert.rejects(split([1000,-1,0,0,0]),/cost_invalid/);
  assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),0,'no unqualified payable earnings');
 }finally{await db.close();}
});
