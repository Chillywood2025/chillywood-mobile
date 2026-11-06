// Only the guarded disposable native PostgreSQL runner supplies race(). Its
// distinct-backend pg_blocking_pids barrier is required for contention proof.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {commerceSeedAdapter,seedCommerceCreator,seedCommerceBuyer,acceptCommerceCreatorTerms,assertBuyerHasNoPremium} from '../../tests/helpers/automatic-commerce-fixture.mjs';

export async function runOrdinaryNativeDispatchRaces({query,race,lit,session,until,sequentialReplay=false,kinds=['subscription','event','merch']}) {
 const db=commerceSeedAdapter(query);
 const parse=text=>JSON.parse(text.split('\n').findLast(line=>line.startsWith('{')||line.startsWith('[')));
 const claims=(actor,role='authenticated')=>`set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,sub:actor.id,session_id:actor.session}))};set local request.headers='{"x-chillywood-platform":"ios"}';`;
 const rpc=async(actor,statement,role='authenticated')=>parse(await query(`begin;${claims(actor,role)}select ${statement};commit;`));
 const denied=/buyer_session_authority_required|creator_money_checkout_(?:intent_unavailable|session_changed|rail_unavailable)|event_reservation_(?:source_unavailable|session_changed)|event_checkout_(?:source_unavailable|rail_unavailable)|ordinary_native_dispatch_authority_unavailable|sandbox_monetization_tester_required/u;
 let schedules=0;
 const run=async(...args)=>{const result=await race(...args);schedules++;return result;};
 const setup=async kind=>{
  await query("update public.platform_money_kill_switches set state='off' where key in('live_money_enabled','payouts_enabled','cashout_enabled')");
  await query("update public.platform_money_kill_switches set state='sandbox_only' where key in('merch_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled','provider_webhooks_enabled','creator_monetization_enabled','digital_sales_enabled')");
  const creator=await seedCommerceCreator(db),buyer=await seedCommerceBuyer(db);
  await acceptCommerceCreatorTerms(db,creator);
  const declared=await rpc(creator,"public.declare_creator_money_eligibility(true,'US','CA')");
  assert.equal(declared.state,'PENDING_VERIFICATION');assert.equal(declared.canCreateMoneyExposure,false);
  assert.equal(declared.sandboxCapability.canUseCreatorTools,true);
  await query(`insert into public.user_profiles(user_id,username,display_name,channel_role)
   values(${lit(buyer.id)},${lit('native_'+buyer.id.replaceAll('-','').slice(0,16))},'Synthetic free buyer','member') on conflict(user_id) do nothing;`);
  assert.equal(await query(`select count(*) from public.creator_payout_accounts where creator_user_id=${lit(creator.id)}`),'0');
  await assertBuyerHasNoPremium(db,buyer);
  const attempt=randomUUID();let intent,source,dispatch,marker,sourceLock,eventSale;
  if(kind==='subscription') {
   const offer=await rpc(creator,"public.set_creator_channel_subscription_offer('Ordinary native fixture','Monthly','sandbox')");
   intent=await rpc(buyer,`public.create_creator_channel_subscription_purchase_intent(${lit(offer.id)})`);
   source=offer.id;
   dispatch=id=>claims(buyer)+`select public.begin_creator_money_checkout(${lit(intent.id)},${lit(id)});`;
   marker=`select count(*) from public.money_purchase_intents where id=${lit(intent.id)} and checkout_attempt_id is not null`;
   sourceLock=`select id from public.money_purchase_intents where id=${lit(intent.id)} for update;`;
  }else if(kind==='event') {
   source=randomUUID();
   await query(`insert into public.creator_events(id,host_user_id,event_title,event_type,status,starts_at,ends_at,time_zone,replay_policy,visibility)
    values(${lit(source)},${lit(creator.id)},'Synthetic ordinary online show','live_first','scheduled',now()+interval '7 days',now()+interval '7 days 2 hours','America/New_York','none','public');`);
   const sale=await rpc(creator,`public.configure_paid_creator_event_sale(${lit(source)},'Online admission',99,10,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day')`);
   eventSale=sale;
   intent=await rpc(buyer,`public.create_reserved_creator_event_purchase_intent(${lit(sale.id)},${lit(sale.termsRevisionId)})`);
   dispatch=id=>claims(buyer)+`select public.begin_creator_event_checkout(${lit(intent.id)},${lit(id)});`;
   marker=`select count(*) from public.event_ticket_reservations where purchase_intent_id=${lit(intent.id)} and checkout_attempt_id is not null`;
   sourceLock=`select id from public.creator_events where id=${lit(source)} for update;`;
  }else {
   source=randomUUID();
   await query(`insert into public.merch_products(id,creator_id,display_name,title,provider,status,fulfillment_model,price_minor,currency,
    environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,shipping_tracking_mode)
    values(${lit(source)},${lit(creator.id)},'Ordinary native merch','Ordinary native merch','stripe_physical_goods','sandbox','manual',1000,'usd','sandbox',true,false,'published',5,'tracked');`);
   intent=await rpc(buyer,`public.reserve_merch_checkout_dispatch(${lit(buyer.id)},${lit(buyer.session)},${lit(source)},1,${lit(attempt)},null,'tracked',1000,'usd')`,'service_role');
   await query(`with q as(insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope)
    values('physical_merch',${lit(source)},'acct_synthetic','sandbox','US_all_destinations','all_supported_platforms') returning id)
    insert into private.commerce_tax_checkout_bindings(feature,identity_id,policy_id,product_id,account_id,environment,permitted_scope)
    select 'physical_merch',${lit(intent.id)},id,${lit(source)},'acct_synthetic','sandbox','US_all_destinations' from q;`);
   const request={productId:source,quantity:1,variantId:null,trackingMode:'tracked',unitPriceMinor:1000,currency:'usd'};
   dispatch=()=>claims(buyer,'service_role')+`select public.transition_merch_checkout_dispatch(${lit(buyer.id)},${lit(buyer.session)},${lit(attempt)},'dispatch',${lit(JSON.stringify(request))}::jsonb);`;
   marker=`select count(*) from private.merch_checkout_dispatch where order_id=${lit(intent.id)} and state='dispatched'`;
   sourceLock=`select id from public.merch_products where id=${lit(source)} for update;`;
  }
  const premium=(event,expiry)=>`select public.process_revenuecat_premium_event_atomic('revenuecat_google_play',${lit('native-premium-'+randomUUID())},${lit(event)},${lit(creator.id)}::uuid,
   p.provider_product_id,p.provider_base_plan_id,'sandbox',${lit(event==='EXPIRATION'?'expired':'active')},clock_timestamp()-interval '1 day',
   clock_timestamp()+interval ${lit(expiry)},clock_timestamp(),999,'usd',repeat('a',64),'NORMAL','google_play','android',null,p.id,
   ${lit('live-authority-original-'+creator.id)}) from public.monetization_products p where p.provider='revenuecat_google_play'
   and p.environment='sandbox' and p.product_type='premium_subscription' and p.status='sandbox' order by p.created_at,p.id limit 1;`;
  return {kind,creator,buyer,intent,source,attempt,dispatch,marker,sourceLock,premium,eventSale};
 };
 const mutations=[
  ['canonical seller Premium expiration',f=>f.premium('EXPIRATION','-1 second')],
  ['seller Premium grant refund',f=>`update public.access_grants set refunded_at=clock_timestamp() where user_id=${lit(f.creator.id)} and grant_type='premium';`],
  ['seller ban',f=>`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${lit(f.creator.id)};`],
  ['new seller quarantine',f=>`insert into public.revenuecat_terminal_authority_quarantines(provider_scope,environment_scope,user_id,event_type,raw_payload_hash,reason)
   values('revenuecat_google_play','sandbox',${lit(f.creator.id)},'REFUND',${lit(createHash('sha256').update(randomUUID()).digest('hex'))},'synthetic_native_dispatch');`],
  ['free buyer ban',f=>`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${lit(f.buyer.id)};`],
  ['free buyer session revocation',f=>`update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=${lit(f.buyer.session)};`],
  ['new buyer deletion request',f=>`insert into public.account_deletion_requests(user_id,status,delete_after,restore_deadline)
   values(${lit(f.buyer.id)},'scheduled',clock_timestamp()+interval '30 days',clock_timestamp()+interval '30 days');`],
  ['buyer profile role change',f=>`update public.user_profiles set channel_role='creator' where user_id=${lit(f.buyer.id)};`],
  ['seller legal acceptance invalidation',f=>`update public.wave1_legal_acceptances set invalidated_at=clock_timestamp() where user_id=${lit(f.creator.id)} and capability='creator_money';`],
  ['new global legal requirement',f=>`insert into public.wave1_legal_document_versions(document_key,version,market,capability,active,effective_at)
   values('privacy',${lit(f.attempt)},'UNITED_STATES','creator_money',true,clock_timestamp());`],
  ['first restricted provider account',f=>`insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id,status,disabled_reason)
   values(${lit(f.creator.id)},'stripe_connect','test',${lit('acct_native'+f.attempt.replaceAll('-',''))},'not_active','synthetic_restriction');`],
  ['first creator hold',f=>`insert into public.creator_payout_eligibility_records(creator_user_id,fraud_hold_active,eligibility_status)
   values(${lit(f.creator.id)},true,'on_hold');`],
  ['creator suspension',f=>`update public.wave1_creator_eligibility set state='SUSPENDED' where creator_user_id=${lit(f.creator.id)};`],
  ['feature control disabled',f=>`update public.platform_money_kill_switches set state='off' where key=${lit(f.kind==='merch'?'merch_enabled':'creator_monetization_enabled')};`],
 ];
 for(const kind of kinds)for(const [label,mutation] of mutations)for(const mutationFirst of [true,false]) {
  const f=await setup(kind),change=mutation(f)+"select '{}'::jsonb;",dispatch=f.dispatch(f.attempt);
  const isBuyerChange=label.startsWith('free buyer')||label.startsWith('new buyer');
  // Identity writers enter the same gate before any user/retention lock,
  // so Merch waits before its initial actor check for ban, deletion AND
  // session revocation. Passive clock expiry still has its distinct final
  // JSON contract after the actual source wait below.
  const expectError=mutationFirst&&(kind!=='merch'||isBuyerChange);
  const buyerSnapshotSql=kind==='merch'&&mutationFirst&&(isBuyerChange||label==='buyer profile role change')?`select jsonb_build_object(
   'product',(select to_jsonb(p) from public.merch_products p where id=${lit(f.source)}),
   'order',(select to_jsonb(o) from public.merch_orders o where id=${lit(f.intent.id)}),
   'dispatch',(select to_jsonb(d) from private.merch_checkout_dispatch d where order_id=${lit(f.intent.id)}),
   'grants',(select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]'::jsonb) from public.access_grants g),
   'ledger',(select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]'::jsonb) from public.creator_earnings_ledger e))`:null;
  const buyerSnapshot=buyerSnapshotSql?await query(buyerSnapshotSql):null;
  try {
   const result=await run(`${kind}: ${label} ${mutationFirst?'before dispatch':'after dispatch'}`,mutationFirst?change:dispatch,mutationFirst?dispatch:change,
    {...(expectError?{error:kind==='merch'?/merch_current_session_required/u:denied}:{}),
     ...(kind==='merch'&&mutationFirst&&['new buyer deletion request','free buyer ban','free buyer session revocation'].includes(label)?{retentionFence:true}:{})});
   if(!mutationFirst)assert.equal(kind==='merch'?result.first.authorized:result.first.startAuthorized,true);
   else if(!expectError)assert.equal(result.second.authorized,false);
   assert.equal(await query(f.marker),mutationFirst?'0':'1','denial cannot create a new one-use dispatch marker');
   if(buyerSnapshotSql)assert.equal(await query(buyerSnapshotSql),buyerSnapshot,'buyer denial preserves full product/order/dispatch/grant/earning rows');
   if(label==='canonical seller Premium expiration')assert.equal(await query(`select public.premium_subject_has_finite_authority_internal(${lit(f.creator.id)})`),'f','canonical writer actually removed seller Premium');
   await assertBuyerHasNoPremium(db,f.buyer);
  }finally {
   if(label==='new global legal requirement')await query(`delete from public.wave1_legal_document_versions where document_key='privacy' and version=${lit(f.attempt)} and capability='creator_money';`);
   if(label==='feature control disabled')await query(`update public.platform_money_kill_switches set state='sandbox_only' where key=${lit(kind==='merch'?'merch_enabled':'creator_monetization_enabled')};`);
  }
 }
 // Split an ACTUAL reader prefix, not a completed dispatch. B runs the real
 // writer statement/RPC while A owns only the actual gate root. Native
 // asserts B waits there WITHOUT holding a downstream advisory, then A must
 // complete the real dispatch. A user-first/owner-first writer would deadlock
 // or fail that lock assertion; the old table SHARE cycle also cannot pass.
 const prefixWriters=new Set(['canonical seller Premium expiration','seller Premium grant refund','seller ban','free buyer ban',
  'new buyer deletion request','buyer profile role change','first restricted provider account','first creator hold',
  'creator suspension','feature control disabled','free buyer session revocation','seller legal acceptance invalidation','new global legal requirement']);
 for(const kind of kinds)for(const [label,mutation] of mutations)if(prefixWriters.has(label)) {
  const f=await setup(kind);
  try{
   const result=await run(`${kind}: split canonical prefix before ${label}`,
    "select private.lock_ordinary_commerce_authority_gate();select '{}'::jsonb;",mutation(f)+"select '{}'::jsonb;",
    {authorityPrefix:true,afterBlocked:f.dispatch(f.attempt)});
   assert.equal(kind==='merch'?result.first.authorized:result.first.startAuthorized,true);
   assert.equal(await query(f.marker),'1','reader completed once before the blocked writer committed');
   await assertBuyerHasNoPremium(db,f.buyer);
  }finally{
   if(label==='new global legal requirement')await query(`delete from public.wave1_legal_document_versions where document_key='privacy' and version=${lit(f.attempt)} and capability='creator_money';`);
   if(label==='feature control disabled')await query(`update public.platform_money_kill_switches set state='sandbox_only' where key=${lit(kind==='merch'?'merch_enabled':'creator_monetization_enabled')};`);
  }
 }
 if(kinds.includes('merch')) {
  // A real declaration INSERT has an Auth FK. A direct DELETE must wait at
  // its statement gate BEFORE owning the Auth tuple; the holder proves the
  // FK's KEY SHARE is immediately available and completes the real RPC.
  // Existing Premium transaction RESTRICT remains an exact deletion denial.
  const f=await setup('merch');
  const grantRows=await query('select md5(jsonb_agg(to_jsonb(g) order by id)::text) from public.access_grants g');
  const declarations=Number(await query(`select count(*) from private.creator_eligibility_declarations where creator_id=${lit(f.creator.id)}`));
  const result=await run('Auth DELETE waits before tuple and actual creator declaration FK',
   "select private.lock_ordinary_commerce_authority_gate();select '{}'::jsonb;",
   `delete from auth.users where id=${lit(f.creator.id)};select '{}'::jsonb;`,
   {authorityPrefix:true,error:/revenuecat_premium_transaction_authority_user_id_fkey/u,
    afterBlocked:`select id from auth.users where id=${lit(f.creator.id)} for key share nowait;`+
     claims(f.creator)+"select public.declare_creator_money_eligibility(true,'US','NY','adult-us-creator-v1');"});
  assert.equal(result.first.canCreateMoneyExposure,false);
  assert.equal(Number(await query(`select count(*) from private.creator_eligibility_declarations where creator_id=${lit(f.creator.id)}`)),declarations+1);
  assert.equal(await query('select md5(jsonb_agg(to_jsonb(g) order by id)::text) from public.access_grants g'),grantRows);
  assert.equal(await query(f.marker),'0','declaration creates no dispatch marker');
  await assertBuyerHasNoPremium(db,f.buyer);

  // One precise managed-style prelock control, not a universal Auth theorem.
  // This already-prepared Merch dispatch has no Auth FK INSERT. It must finish
  // while a different backend owns the Auth tuple, since current membership
  // is read under the advisory gate rather than an Auth tuple lock. A later
  // Auth mutation then joins the gate normally. Declaration FK/pre-delete
  // transactions remain an explicitly unproved external boundary.
  const m=await setup('merch');
  if(sequentialReplay) {
   assert.equal(parse(await query('begin;'+m.dispatch(m.attempt)+'commit;')).authorized,true);
   await query(`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${lit(m.buyer.id)};`);
  } else {
   assert.equal(typeof session,'function');assert.equal(typeof until,'function');
   const holder=session(`begin;select id from auth.users where id=${lit(m.buyer.id)} for update;select jsonb_build_object('holderPid',pg_backend_pid());select 'AUTH_TUPLE_READY';`);
   await until(()=>holder.output().includes('AUTH_TUPLE_READY'),'managed-style Auth tuple holder not ready');
   const waiter=session(`begin;select jsonb_build_object('waiterPid',pg_backend_pid());${m.dispatch(m.attempt)}commit;`);waiter.child.stdin.end();
   try {
    await until(()=>waiter.output().includes('"authorized": true'),'Merch reader must not wait on prelocked Auth tuple');
    const done=await waiter.done;assert.equal(done.code,0,done.stderr);
    const holderPid=parse(holder.output()).holderPid;
    const waiterPid=JSON.parse(done.stdout.split('\n').find(line=>line.includes('waiterPid'))).waiterPid;
    assert.notEqual(holderPid,waiterPid);
    assert.equal(await query(`select count(*) from pg_stat_activity where pid=${holderPid} and state='idle in transaction'`),'1');
    assert.equal(parse(done.stdout).authorized,true);
   } finally {
    holder.child.stdin.end(`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${lit(m.buyer.id)};commit;\n`);
    const done=await holder.done;assert.equal(done.code,0,done.stderr);
   }
  }
  assert.equal(await query(m.marker),'1');
  await assertBuyerHasNoPremium(db,m.buyer);
 }
 for(const kind of kinds)for(const subject of ['free buyer session','sole seller session','seller Premium'])for(const expiresDuringWait of [false,true]) {
  const f=await setup(kind);
  if(subject==='free buyer session')await query(`update auth.sessions set not_after=clock_timestamp()+interval '2 seconds' where id=${lit(f.buyer.session)};`);
  else if(subject==='sole seller session')await query(`update auth.sessions set not_after=clock_timestamp()+interval '2 seconds' where id=${lit(f.creator.session)};`);
  else assert.equal(parse(await query(f.premium('RENEWAL','2 seconds'))).status,'processed','finite deadline comes from canonical Premium renewal');
  const current=subject==='free buyer session'
   ?`exists(select 1 from auth.sessions where id=${lit(f.buyer.session)} and not_after>clock_timestamp())`
   :subject==='sole seller session'?`exists(select 1 from auth.sessions where id=${lit(f.creator.session)} and not_after>clock_timestamp())`
   :`exists(select 1 from public.user_entitlements where user_id=${lit(f.creator.id)} and entitlement_key='premium' and expires_at>clock_timestamp())`;
  const error=!expiresDuringWait?null:kind!=='merch'?denied:sequentialReplay&&subject==='free buyer session'?/merch_current_session_required/u:null;
  const result=await run(`${kind}: passive ${subject} ${expiresDuringWait?'expiry':'current control'} after actual source lock wait`,f.sourceLock+"select '{}'::jsonb;",f.dispatch(f.attempt),{
   afterBlocked:`do $barrier$ begin if not (${current}) then raise exception 'native_passive_expiry_barrier_was_late';end if;end $barrier$;${expiresDuringWait?'select pg_sleep(2.2);':''}select '{}'::jsonb;`,
   ...(error?{error}:{})});
  if(!error)assert.equal(kind==='merch'?result.second.authorized:result.second.startAuthorized,!expiresDuringWait);
  assert.equal(await query(f.marker),expiresDuringWait?'0':'1','current control grants once; wall-clock expiry after lock wait cannot grant dispatch');
 }
 for(const kind of kinds) {
  const f=await setup(kind);
  const result=await run(`${kind}: duplicate dispatch preserves exact original attempt`,f.dispatch(f.attempt),f.dispatch(randomUUID()));
  assert.equal(kind==='merch'?result.first.authorized:result.first.startAuthorized,true);
  // Merch reuses its exact provider idempotency key; native Store calls are
  // different and must never receive a second start authorization.
  assert.equal(kind==='merch'?result.second.authorized:result.second.startAuthorized,kind==='merch');
  assert.equal(await query(f.marker),'1');
  if(kind==='subscription') {
   assert.equal(parse(await query(f.premium('EXPIRATION','-1 second'))).status,'processed');
   const replay=parse(await query(`begin;${f.dispatch(randomUUID())}commit;`));
   assert.equal(replay.startAuthorized,false,'historical native attempt readback has no new seller Premium requirement');
  }
 }
 // Hold the real dispatch authority prefix, start the real competing source
 // RPC, prove it blocks, then finish the actual dispatch before releasing.
 // A source->Premium inversion would deadlock in afterBlocked, unlike a raw
 // source-row holder that never invokes the competing creator/issuer RPC.
 for(const [kind,operation] of [['event','configure'],['event','reserve'],['subscription','issue'],['merch','tracking']]) {
  if(!kinds.includes(kind))continue;
  for(const prefixFirst of [true,false]) {
   const f=await setup(kind),peer=await seedCommerceBuyer(db);let sourceCall;
   if(operation==='configure')sourceCall=claims(f.creator)+`select public.configure_paid_creator_event_sale(${lit(f.source)},'Updated online admission',99,10,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day');`;
   else if(operation==='reserve')sourceCall=claims(peer)+`select public.create_reserved_creator_event_purchase_intent(${lit(f.eventSale.id)},${lit(f.eventSale.termsRevisionId)});`;
   else if(operation==='issue')sourceCall=claims(peer)+`select public.create_creator_channel_subscription_purchase_intent(${lit(f.source)});`;
   else {
    const expectedUpdatedAt=await query(`select updated_at::text from public.merch_products where id=${lit(f.source)}`);
    sourceCall=claims(f.creator)+`select public.save_creator_merch_product_with_tracking(${lit(f.source)},'Updated ordinary merch','Physical only',null,1000,5,'published',${lit(expectedUpdatedAt)}::timestamptz,'tracked');`;
   }
   const prefix='select private.lock_ordinary_commerce_authority_gate();'+(kind==='merch'?'select private.platform_brand_retention_lock();':'')+
    `select private.lock_ordinary_commerce_dispatch_subjects(${lit(f.buyer.id)},${lit(f.buyer.session)},${lit(f.creator.id)},'sandbox',${kind==='merch'?'null':"'revenuecat_app_store'"});select '{}'::jsonb;`;
   const result=prefixFirst
    ?await run(`${kind}: actual ${operation} RPC cannot own source before dispatch authority`,prefix,sourceCall,{afterBlocked:f.dispatch(f.attempt)})
    :await run(`${kind}: actual ${operation} RPC before dispatch`,sourceCall,f.dispatch(f.attempt));
   const dispatched=prefixFirst?result.first:result.second;
   assert.equal(kind==='merch'?dispatched.authorized:dispatched.startAuthorized,true);
   assert.equal(await query(f.marker),'1');await assertBuyerHasNoPremium(db,peer);
  }
 }
 return schedules;
}
