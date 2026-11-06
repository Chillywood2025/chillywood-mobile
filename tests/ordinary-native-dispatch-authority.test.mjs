import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {runOrdinaryNativeDispatchRaces} from '../scripts/lib/ordinary-native-dispatch-races.mjs';

test('ordinary native dispatch final catalog and all race SQL replay; sequential replay is not contention proof',{timeout:360000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 try {
  const definition=async signature=>(await db.query('select pg_get_functiondef($1::regprocedure) body',[signature])).rows[0].body;
  const before=(body,a,b)=>{assert.ok(body.includes(a),a);assert.ok(body.indexOf(b)>body.indexOf(a),`${a} before ${b}`);};
  const signature='private.lock_ordinary_commerce_dispatch_subjects(uuid,uuid,uuid,text,text)';
  const helper=await definition(signature);
  before(helper,"'stripe-tip-buyer-authority-global'","'stripe-tip-buyer-authority-user:'");
  before(helper,"'stripe-tip-buyer-authority-user:'",'private.lock_ordinary_commerce_premium_subjects');
  before(helper,'private.lock_ordinary_commerce_premium_subjects','lock table public.creator_payout_accounts');
  before(helper,'lock table public.creator_payout_accounts',"'wave1-creator:'");
  assert.doesNotMatch(helper,/from auth\.(users|sessions)|from public\.wave1_legal/u,'never row-lock auth/legal after their writer fences');
  for(const kind of ['money','event']) {
   const body=await definition(`public.begin_creator_${kind}_checkout(uuid,uuid)`);
   before(body,'perform private.lock_ordinary_commerce_dispatch_subjects','perform pg_catalog.pg_advisory_xact_lock');
   before(body,'perform private.assert_ordinary_native_dispatch_current(i);',kind==='money'
    ?'update public.money_purchase_intents set checkout_attempt_id':'update public.event_ticket_reservations set checkout_attempt_id');
   before(body,'if '+(kind==='money'?'i':'r')+'.checkout_attempt_id is not null','perform private.assert_ordinary_native_dispatch_current(i);');
  }
  const merch=await definition('public.transition_merch_checkout_dispatch(uuid,uuid,uuid,text,jsonb)');
  before(merch,'perform private.platform_brand_retention_lock();','perform private.lock_ordinary_commerce_dispatch_subjects');
  before(merch,'perform private.lock_ordinary_commerce_dispatch_subjects','perform 1 from public.merch_products');
  for(const entry of [
   'public.create_money_purchase_intent(text,text,uuid,jsonb)',
   'public.create_ios_app_store_purchase_intent(text,text,uuid,jsonb)',
   'public.create_ios_creator_money_purchase_intent(text,uuid,integer,jsonb)',
   'public.create_paid_watch_party_ticket_purchase_intent(uuid)',
   'public.create_paid_creator_event_pass_purchase_intent(uuid)',
   'public.create_reserved_creator_event_purchase_intent(uuid,uuid)',
   'public.create_creator_vip_pass_purchase_intent(uuid)',
   'public.create_creator_channel_subscription_purchase_intent(uuid)',
  ])before(await definition(entry),'perform private.lock_ordinary_purchase_source_subjects','perform pg_catalog.pg_advisory_xact_lock');
  before(await definition('public.configure_paid_creator_event_sale(uuid,text,integer,integer,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone)'),
   'perform private.assert_current_creator_for_mode','select * into e from public.creator_events where id=p_creator_event_id for update;');
  const cashout=await definition('private.lock_sandbox_cashout_creator(uuid)');
  before(cashout,'private.lock_ordinary_commerce_dispatch_subjects','from public.merch_orders');
  assert.doesNotMatch(cashout,/sandbox_cashout_subject_current|ordinary_commerce_subject_current/u,'recovery prelude contains locks, not membership checks');
  assert.doesNotMatch(await definition('public.claim_sandbox_creator_cashout_dispatch(uuid,text)'),/from auth\.(users|sessions)/u,'no late auth row locks after user advisory');
  assert.doesNotMatch(await definition('private.merch_publish_authority_changed()'),/platform_brand_retention_lock|pg_advisory|lock table/iu);
  for(const role of ['anon','authenticated','service_role']) {
   assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') allowed',[role,signature])).rows[0].allowed,false);
   assert.equal((await db.query("select has_function_privilege($1,'private.assert_ordinary_native_dispatch_current(public.money_purchase_intents)','execute') allowed",[role])).rows[0].allowed,false);
  }
  const lit=value=>`'${String(value).replaceAll("'","''")}'`;
  const query=async sql=>(await db.exec(sql)).flatMap(result=>result.rows??[]).map(row=>{
   const value=Object.values(row)[0];return typeof value==='object'&&value!==null?JSON.stringify(value):typeof value==='boolean'?(value?'t':'f'):String(value??'');
  }).filter(Boolean).join('\n');
  const parse=text=>JSON.parse(text.split('\n').findLast(line=>line.startsWith('{')||line.startsWith('[')));
  const labels=[];
  const race=async(label,first,second,{error,afterBlocked=''}={})=>{
   labels.push(label);
   // Only SQL validity and committed mutation behavior are established here.
   // The native runner alone observes distinct backend IDs and blocking edges.
   const firstResult=parse(await query(`begin;${first}${afterBlocked}commit;`));
   if(error) {
    await assert.rejects(()=>query(`begin;${second}commit;`),error,label);await db.exec('rollback');
    return {first:firstResult,second:null};
   }
   return {first:firstResult,second:parse(await query(`begin;${second}commit;`))};
  };
  assert.equal(await runOrdinaryNativeDispatchRaces({query,race,lit,sequentialReplay:true}),113);
  assert.equal(labels.length,113);
 }finally{await db.close();}
});
