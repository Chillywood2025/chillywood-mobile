import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {observe,order,fixture} from './merch-cost-observation-edge.test.mjs';

test('actual full-chain SQL records verified adapter costs, immutable 90/10 held deltas and refund recovery without payable authority',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const service=()=>db.exec(`reset role; select set_config('request.jwt.claims','{"role":"service_role"}',false); select set_config('request.jwt.claim.role','service_role',false); set role service_role;`);
 const root=()=>db.exec('reset role');
 const save=e=>one('select public.record_merch_provider_cost_observation($1,$2)',[order.id,JSON.stringify(e)]);
 try{
  await db.query(`insert into public.merch_orders(id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id)
   values($1,$2,'e7100000-0000-4000-8000-000000000003','stripe_physical_goods','sandbox','paid','not_started','paid',1000,1000,'usd','cs_test_merch','pi_merch')`,[order.id,order.buyer_id]);
  const f=fixture();const evidence=JSON.parse(JSON.stringify(await observe(order,'sk_test_synthetic','acct_fixture',f.transport)));
  for(const role of ['anon','authenticated']){
   await db.exec(`set role ${role}`);await assert.rejects(save(evidence),/permission denied/);
   await assert.rejects(db.query('select * from private.merch_provider_cost_observations'),/permission denied/);await root();
  }
  await service();
  await db.exec('begin');await save(evidence);await db.exec('rollback');
  await root();assert.equal(await one('select count(*)::int from private.merch_provider_cost_observations'),0,'rollback leaves neither evidence nor allocation');
  assert.equal(await one('select count(*)::int from private.merch_held_net_allocations'),0);
  await service();const result=await save(evidence);assert.equal(result.netBaseMinor,870);assert.equal(result.platformShareMinor,87);assert.equal(result.creatorShareMinor,783);assert.equal(result.financialAuthority,false);
  assert.ok(result.holdReasons.includes('fulfillment_unqualified'));assert.ok(result.holdReasons.includes('verified_delivery_required'));
  assert.equal((await save(evidence)).status,'duplicate');
  for(const patch of [{provider_fee_minor:null},{provider_fee_minor:0},{charge_id:'ch_wrong'},{account_id:'acct_wrong'},{gross_minor:999},{currency:'eur'},{financial_authority:true},{tax_minor:-1}])await assert.rejects(save({...evidence,...patch}));
  await root();assert.equal(await one('select count(*)::int from private.merch_held_net_allocations'),1);
  await assert.rejects(db.exec('delete from private.merch_provider_cost_observations'),/append_only/);
  await assert.rejects(db.exec('update private.merch_held_net_allocations set creator_minor=999'),/append_only/);
  const projection=await one('select public.merch_order_projection_internal(o) from public.merch_orders o where id=$1',[order.id]);
  assert.equal(projection.netSettlementStatus,'held_unqualified');assert.equal(projection.creatorShareMinor,783);assert.equal(projection.financialAuthority,false);
  await service();
  const partial={...evidence,refunded_minor:500,tax_reversal_minor:null,refunds:[{id:'re_first',balance_id:'txn_first',amount:500,fee:0,net:-500,status:'available'}]};
  const held=await save(partial);assert.equal(held.netBaseMinor,null);assert.equal(held.creatorShareMinor,null);assert.ok(held.holdReasons.includes('refund_tax_reversal_unverified'));
  await assert.rejects(save({...partial,refunds:[{...partial.refunds[0],fee:1,net:-501}]}),/immutable/);
  await root();assert.equal(await one('select creator_delta_minor::int from private.merch_held_net_allocations order by id desc limit 1'),-783);
  await service();await assert.rejects(save(evidence),/stale/);
  const full={...partial,refunded_minor:1000,tax_reversal_minor:100,refunds:[...partial.refunds,{id:'re_second',balance_id:'txn_second',amount:500,fee:0,net:-500,status:'available'}]};
  const recovery=await save(full);assert.equal(recovery.netBaseMinor,-30);assert.equal(recovery.recoveryObligationMinor,30);assert.equal(recovery.creatorShareMinor,0);
  assert.equal((await save(full)).status,'duplicate');
  const disputed=await save({...full,disputed:true});assert.equal(disputed.netBaseMinor,null);assert.equal(disputed.recoveryObligationMinor,30,'unknown dispute amount cannot erase existing negative obligation');assert.ok(disputed.holdReasons.includes('dispute_recovery_review'));
  await assert.rejects(save(full),/stale/);
  await root();assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),0);
  assert.equal(await one('select sum(creator_delta_minor)::int from private.merch_held_net_allocations'),0);
  for(const table of ['merch_provider_cost_observations','merch_held_net_allocations'])assert.equal(await one(`select relrowsecurity and relforcerowsecurity from pg_class where oid=$1::regclass`,[`private.${table}`]),true);
 }finally{await db.close();}
});
