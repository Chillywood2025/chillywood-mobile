import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {harness,buyer,session,product} from '../helpers/merch-checkout-edge-harness.mjs';
import {runMerchLiveCheckoutRaces} from '../../scripts/lib/merch-live-checkout-races.mjs';
import {runMerchCheckoutDispatchRaces} from '../../scripts/lib/merch-checkout-dispatch-races.mjs';
test('live merchandise exact mode/account/quote chain remains dormant and preserves unknown holds',{timeout:240000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const root=()=>db.exec('reset role');
 const service=()=>db.exec(`reset role;set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}';set role service_role;`);
 const claim=async(user,s)=>{await root();await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[JSON.stringify({sub:user,session_id:s,role:'authenticated'})]);await db.exec('set role authenticated');};
 const rpc=async(name,args)=>{await service();try{return{data:await one(`select public.${name}(${Object.keys(args).map((key,i)=>`${key} => $${i+1}`).join(',')})`,Object.values(args)),error:null};}catch(e){return{data:null,error:{message:e.message}};}};
 const edge=options=>harness({rpc,beta:false,livemode:true,env:{STRIPE_MERCH_LIVE_CHECKOUT_KEY:'sk_live_synthetic',STRIPE_MERCH_LIVE_ACCOUNT_ID:'acct_fixture'},
  readRow:async()=>{await root();return one('select to_jsonb(p) from public.merch_products p where id=$1',[product]);},
  writeRow:async(body,id)=>{await service();await db.query('update public.merch_orders set provider_order_id=$1,stripe_checkout_session_id=$2,stripe_payment_intent_id=$3 where id=$4',[body.provider_order_id,body.stripe_checkout_session_id,body.stripe_payment_intent_id,id]);return{error:null};},...options});
 const body=key=>({product_id:product,quantity:1,attempt_id:key,tracking_mode:'tracked',expected_unit_price_minor:1000,expected_currency:'usd'});
 try{
  const host=await one("select md5('merch-host:'||n::text)::uuid from generate_series(1,1000)n where mod(hashtextextended('chillywood-wave1-us-rollout-v1:'||md5('merch-host:'||n::text)::uuid::text,20260814),100)=0 limit 1"),hs=randomUUID();
  await db.query('insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values($1,false,false,now()),($2,false,false,now())',[host,buyer]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[hs,host,session,buyer]);
  await db.query("insert into public.user_profiles(user_id,username,display_name) values($1,'dispatch_host','Host'),($2,'dispatch_buyer','Buyer') on conflict(user_id) do nothing",[host,buyer]);
  await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
   select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,'member',d.capability,s.id::text,'service_reconciliation'
   from auth.sessions s cross join public.wave1_legal_document_versions d where s.user_id in($1,$2) and d.active and d.market='UNITED_STATES'
   and (d.capability='account' or (s.user_id=$1 and d.capability in('creator','creator_money')))`,[host,buyer]);
  await service();await one(`select public.wave1_evaluate_creator_eligibility($1,'{"accountStatus":"ACTIVE","age18Plus":true,"legalAccepted":true,"creatorRole":true,"moderationState":"CLEAR","market":"UNITED_STATES","rolloutEligible":false,"platformCapability":true,"providerEligible":true,"kycComplete":true,"taxComplete":true,"sanctionsClear":true,"payoutEligible":true,"inputVersions":{"evaluationSequence":1}}','dispatch-fixture','local_pgtap')`,[host]);
  // Execute the native runner's actual bootstrap against the full real schema.
  // Its beta subject index is partial: the old bare conflict target must fail,
  // while a fresh synthetic actor needs only a plain insert.
  let nativeSeed;const captured=new Error('captured native bootstrap');
  await assert.rejects(()=>runMerchCheckoutDispatchRaces({actors:{buyer1:{id:buyer,session},creator:{id:host}},
   lit:value=>`'${String(value).replaceAll("'","''")}'`,query:sql=>{nativeSeed=sql;throw captured;}}),error=>error===captured);
  await root();
  const oldNativeSeed=nativeSeed.replace(/(insert into public\.beta_access_memberships[^;]+);/,"$1 on conflict(user_id) do update set access_status='active';");
  await assert.rejects(()=>db.exec(oldNativeSeed),/no unique or exclusion constraint/);
  await db.exec(nativeSeed);
  await assert.rejects(()=>db.exec(nativeSeed),/duplicate key/,'bootstrap must not hide a non-fresh actor');
  assert.equal(await one('select count(*)::int from public.beta_access_memberships where user_id=$1 and access_status=$$active$$',[buyer]),1);
  await claim(host,hs);await one('select public.save_creator_merch_product_with_tracking($1,$$Test$$,$$Physical only$$,null,1000,20,$$published$$,null,$$tracked$$)',[product]);

  await root();await db.query("update public.merch_products set environment='production',status='active' where id=$1",[product]);
  let probe=edge(),blocked=await probe.send(body(randomUUID()));assert.equal(blocked.status,409);assert.equal(probe.provider.length,0);
  assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[product]),0);
  await root();
  // Synthetic local qualifications only; nothing is sent to a provider.
  await db.exec("update public.platform_money_kill_switches set state='on' where key in('merch_enabled','live_money_enabled')");
  await db.exec("insert into public.provider_readiness_status(provider,capability,status,environment,is_live_money_enabled,proof_source,proof_summary,last_checked_at) values('stripe','platform_commerce','active','production',true,'synthetic','synthetic',now()) on conflict(provider,capability,environment) do update set status='active',is_live_money_enabled=true,proof_source='synthetic',proof_summary='synthetic',last_checked_at=now()");
  await db.exec("insert into private.merch_live_checkout_qualifications values('acct_fixture',repeat('a',64),repeat('b',64),repeat('c',64),now()+interval '1 hour',null)");
  await db.query(`insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
   full_permitted_scope_reviewed,professional_basis_reference,coverage_evidence_reference,collection_mode,liability_type,tax_code,tax_behavior,
   registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,provider_verified_at,provider_expires_at,expires_at,enabled)
   values('physical_merch',$1,'acct_fixture','production','US_all_destinations','all_supported_platforms',true,'SYNTHETIC','SYNTHETIC','automatic','self','txcd_99999999','inclusive','SYNTHETIC','SYNTHETIC','SYNTHETIC',now(),now()+interval '1 hour',now()+interval '1 hour',true)`,[product]);
  const key=randomUUID();probe=edge();const result=await probe.send(body(key));assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.body.checkoutCreated,true);assert.equal(result.body.mode,'production');assert.equal(probe.provider.length,1);
  await root();const o=await one('select to_jsonb(o) from public.merch_orders o where checkout_attempt_id=$1',[key]);assert.equal(o.environment,'production');
  assert.equal(await one('select state from private.merch_checkout_dispatch where order_id=$1',[o.id]),'dispatched');
  await assert.rejects(db.query("update public.merch_orders set environment='sandbox' where id=$1",[o.id]),/quote_immutable/);
  await service();await assert.rejects(one("select bind_merch_checkout_provider($1,'production','acct_wrong')",[o.id]),/unqualified|conflict/);
  const actor={p_buyer_id:buyer,p_session_id:session,p_attempt_id:key,p_request:{productId:product,quantity:1,variantId:null,trackingMode:'tracked',unitPriceMinor:1000,currency:'usd'}};
  assert.equal((await rpc('transition_merch_checkout_dispatch',{...actor,p_action:'abort'})).data.aborted,false);
  await root();await db.exec("update public.platform_money_kill_switches set state='off' where key='live_money_enabled'");
  const denied=await rpc('transition_merch_checkout_dispatch',{...actor,p_action:'dispatch'});assert.match(denied.error.message,/unqualified/);
  // Accepted callbacks continue settling after the sales switch is stopped.
  await root();const policy=await one('select policy_id from private.commerce_tax_checkout_bindings where identity_id=$1',[o.id]);
  const facts={event_livemode:true,object_livemode:true,verified_environment:'production',provider_account_id:'acct_fixture',event_account_id:null,
   object_id:o.stripe_checkout_session_id,object_type:'checkout.session',payment_intent_id:'pi_live_fixture',client_reference_id:o.id,
   metadata_order_id:o.id,metadata_buyer_id:buyer,metadata_environment:'production',metadata_tax_policy_id:policy,metadata_rail:'physical_merch',
   amount_minor:1000,currency:'usd',mode:'payment',status:'complete',payment_status:'paid'};
  const webhook=f=>rpc('process_stripe_merch_webhook_lifecycle',{p_event_id:'evt_live_bound',p_event_type:'checkout.session.completed',p_raw_event_hash:'a'.repeat(64),p_facts:f});
  assert.match((await webhook({...facts,provider_account_id:'acct_wrong'})).error.message,/binding_mismatch/);
  const paid=await webhook(facts);assert.equal(paid.data.reason,'payment_confirmed',JSON.stringify(paid));
  await root();assert.equal(await one('select payment_status from public.merch_orders where id=$1',[o.id]),'paid');
  assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[product]),1,'paid stock remains allocated');
  await root();const beforeEdit=await one('select to_jsonb(p) from public.merch_products p where id=$1',[product]);
  await claim(host,hs);await one("select save_creator_merch_product_with_tracking($1,'Updated live title','Physical only',null,1200,20,'published',$2,'tracked')",[product,beforeEdit.updated_at]);
  await root();assert.equal(await one('select environment from public.merch_products where id=$1',[product]),'production');
  assert.equal(await one('select amount_subtotal_minor from public.merch_orders where id=$1',[o.id]),1000,'accepted quote unchanged by creator edits');
  // Restore only this synthetic product price for following transport cases.
  await db.query('update public.merch_products set price_minor=1000 where id=$1',[product]);
  const wrongKey=edge({env:{STRIPE_MERCH_LIVE_CHECKOUT_KEY:'sk_test_wrong',STRIPE_MERCH_LIVE_ACCOUNT_ID:'acct_fixture'}});
  await wrongKey.send(body(randomUUID()));assert.equal(wrongKey.provider.length,0);assert.ok(!wrongKey.calls.some(c=>c[0]==='reserve_merch_checkout_dispatch'));
  await service();await root();await db.exec("update public.platform_money_kill_switches set state='on' where key='live_money_enabled'");
  const wrongAccount=edge({env:{STRIPE_MERCH_LIVE_CHECKOUT_KEY:'sk_live_synthetic',STRIPE_MERCH_LIVE_ACCOUNT_ID:'acct_wrong'}});
  const refused=await wrongAccount.send(body(randomUUID()));assert.equal(refused.body.checkoutRetrySafe,true);assert.equal(wrongAccount.provider.length,0);
  const uncertainKey=randomUUID(),uncertain=edge({providerError:true});const unknown=await uncertain.send(body(uncertainKey));
  assert.equal(unknown.status,500);assert.equal(unknown.body.checkoutRetrySafe,undefined);assert.equal(unknown.body.liveMoneyAction,true);
  await root();assert.equal(await one('select d.state from private.merch_checkout_dispatch d join public.merch_orders o on o.id=d.order_id where o.checkout_attempt_id=$1',[uncertainKey]),'dispatched');
  await claim(buyer,session);const orders=await one("select list_my_merch_orders('buyer',null,20,null)");assert.ok(JSON.stringify(orders).includes(o.id));
  // Execute the native runner's exact fixture SQL sequentially to catch schema
  // drift. This is explicitly NOT concurrency proof; hosted PostgreSQL observes
  // actual independent-backend blocking edges for these same four schedules.
  await root();const literal=value=>`'${String(value).replaceAll("'","''")}'`;
  const nativeQuery=async sql=>{await root();const rows=(await db.exec(sql)).at(-1)?.rows;return rows?.length?String(Object.values(rows.at(-1))[0]):'';};
  const nativeAuth=()=>`set local role service_role;set local request.jwt.claim.role='service_role';set local request.jwt.claims=${literal(JSON.stringify({role:'service_role',sub:buyer,session_id:session}))};`;
  const nativeTx=async sql=>{await root();await db.exec('begin');try{const rows=(await db.exec(sql)).at(-1)?.rows;await db.exec('commit');return rows?.length?Object.values(rows.at(-1))[0]:null;}catch(e){await db.exec('rollback');throw e;}};
  await runMerchLiveCheckoutRaces({query:nativeQuery,auth:nativeAuth,actors:{buyer2:{id:buyer,session},creator:{id:host}},lit:literal,json:x=>literal(JSON.stringify(x))+'::jsonb',
   race:async(_label,a,b,{error}={})=>{const first=await nativeTx(a);if(error){await assert.rejects(nativeTx(b),error);return{first};}return{first,second:await nativeTx(b)};}});
  for(const role of ['anon','authenticated']){await db.exec(`reset role;set role ${role}`);await assert.rejects(one("select bind_merch_checkout_provider($1,'production','acct_fixture')",[o.id]),/permission denied/);}
 }finally{await db.close();}
});
