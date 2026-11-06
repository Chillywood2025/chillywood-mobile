import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

test('final commerce functions take retained global and subject locks before source rows', {timeout:180000}, async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const definition=async signature=>(await db.query('select pg_get_functiondef($1::regprocedure) body',[signature])).rows[0].body;
 const before=(body,first,second)=>{
  assert.ok(body.indexOf(first)>=0,first);
  assert.ok(body.indexOf(second)>body.indexOf(first),`${first} precedes ${second}`);
 };
 try {
  for(const signature of [
   'public.review_creator_merch_live_publication(uuid,timestamp with time zone)',
   'public.confirm_creator_merch_live_publication(uuid)',
   'public.copy_creator_merch_live_draft(uuid,timestamp with time zone)',
   'public.select_creator_merch_tax_category(uuid,uuid,timestamp with time zone,text)',
  ]) {
   const body=await definition(signature);
   before(body,'perform private.lock_ordinary_commerce_authority_gate();','perform private.platform_brand_retention_lock();');
   before(body,'perform private.platform_brand_retention_lock();','perform public.wave1_assert_current_creator_money_authority_internal();');
  }
  const cashout=await definition('private.lock_sandbox_cashout_creator(uuid)');
  const sequence=['perform private.lock_ordinary_commerce_authority_gate();','perform private.platform_brand_retention_lock();',
   "perform private.lock_ordinary_commerce_dispatch_subjects(p_creator,null,p_creator,'sandbox');",'from public.merch_orders',
   'from private.creator_event_auction_quotes','from private.creator_room_auction_quotes','from public.money_access_ledger_events',"'sandbox-cashout:'"];
  for(let i=1;i<sequence.length;i++)before(cashout,sequence[i-1],sequence[i]);
  assert.doesNotMatch(cashout,/ordinary_commerce_subject_current|sandbox_cashout_subject_current|raise exception/u,
   'historical recovery obtains serialization, not a new membership requirement');
  assert.doesNotMatch(cashout,/from auth\.(users|sessions)/u,'canonical user fence replaces late auth row locks');
  const publication=await definition('private.merch_live_publication_authority(public.merch_products)');
  before(publication,'perform public.wave1_assert_current_creator_money_authority_internal();',"'merch-tax-authority'");
  before(publication,'perform public.wave1_assert_current_creator_money_authority_internal();',"'wave1-creator:'");
  before(publication,'perform private.lock_ordinary_commerce_authority_gate();','perform public.wave1_assert_current_creator_money_authority_internal();');
  assert.doesNotMatch(publication,/lock table [^;]*(?:wave1_creator_eligibility|wave1_legal_acceptances|wave1_legal_document_versions|creator_payout_accounts|creator_payout_eligibility_records|platform_money_kill_switches)[^;]*in share mode/u,
   'covered authority membership never introduces gate-to-RowExclusive relation inversion');
  assert.match(publication,/lock table private\.merch_tax_categories,private\.merch_tax_category_contexts,[\s\S]*private\.commerce_tax_qualifications in share mode/u,
   'independent tax/category qualification membership protection remains');
  for(const relation of ['public.wave1_creator_eligibility','public.wave1_legal_acceptances','public.wave1_legal_document_versions']) {
   const row=(await db.query("select count(*)::int n from pg_trigger where tgrelid=$1::regclass and tgname='aaa_ordinary_commerce_writer_gate' and tgtype=30",[relation])).rows[0];
   assert.equal(row.n,1,`${relation}: before-statement gate protects inserts, updates and deletes`);
  }
  assert.equal((publication.match(/perform public\.wave1_assert_current_creator_money_authority_internal\(\);/gu)??[]).length,1);
  assert.doesNotMatch(await definition('public.wave1_assert_current_creator_money_authority_internal()'),/platform_brand_retention_lock/u,
   'shared non-merch assertion does not introduce a global latch under unrelated feature locks');
  for(const role of ['anon','authenticated','service_role']) {
   const row=(await db.query(`select has_function_privilege($1,'private.lock_sandbox_cashout_creator(uuid)','execute') cashout,
    has_function_privilege($1,'private.merch_live_publication_authority(public.merch_products)','execute') publication`,[role])).rows[0];
   assert.deepEqual(row,{cashout:false,publication:false});
  }
 }finally{await db.close();}
});
