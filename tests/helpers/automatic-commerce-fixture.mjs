// Disposable database ONLY. Synthetic provider events exercise canonical SQL;
// they are not provider verification, deployment, or live-money evidence.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {seedLiveRoomActor, withLiveRoomActor} from './live-room-authority-fixture.mjs';

export const commerceActor = () => ({id:randomUUID(), session:randomUUID()});
export {withLiveRoomActor as withCommerceActor};

// Adapt the guarded native runner's owned-clone query function. Seed helpers
// use standalone statements or complete transaction batches, never a pretend
// persistent session across psql invocations.
export function commerceSeedAdapter(query) {
  const literal=value=>value===null?'null':`'${String(value).replaceAll("'","''")}'`;
  return {
    exec:async sql=>query(sql),
    query:async(sql,values=[])=>{
      const expanded=sql.replace(/\$(\d+)/gu,(_,index)=>literal(values[Number(index)-1]));
      if(/^\s*select\b/iu.test(expanded)) {
        const result=await query(`select coalesce(jsonb_agg(to_jsonb(fixture_result)),'[]'::jsonb) from (${expanded}) fixture_result`);
        return {rows:JSON.parse(result)};
      }
      await query(expanded);return {rows:[]};
    },
  };
}

export async function seedCommerceBuyer(db, actor=commerceActor()) {
  await seedLiveRoomActor(db,actor,{premium:false});
  return actor;
}

export async function seedCommerceCreator(db, actor=commerceActor(), {environment='sandbox'}={}) {
  assert.ok(['sandbox','production'].includes(environment));
  await seedLiveRoomActor(db,actor,{premium:environment==='sandbox'});
  if(environment==='production') {
    // Separate synthetic production catalog and a genuinely production processor
    // event. Never relabel a sandbox entitlement/grant into production authority.
    const product=randomUUID();
    await db.query(`insert into public.monetization_products
      (id,product_key,product_type,display_name,provider,provider_product_id,provider_base_plan_id,
       revenuecat_entitlement,environment,status,is_android_digital,metadata)
      values($1,$2,'premium_subscription','SYNTHETIC production Premium','revenuecat_google_play',
       $2,'monthly','premium','production','active',true,
       '{"provider_proof":true,"live_money_enabled_at_activation":true,"fixture":"SYNTHETIC ONLY, NOT PROVIDER VERIFICATION"}')`,
    [product,`synthetic_premium_${product}`]);
    await db.exec(`begin; set local request.jwt.claim.role='service_role';
      set local request.jwt.claims='{"role":"service_role"}'; set local role service_role;
      update public.platform_money_kill_switches set state='on'
      where key in ('revenuecat_google_play_enabled','provider_webhooks_enabled','live_money_enabled'); commit;`);
    const result=(await db.query(`select public.process_revenuecat_premium_event_atomic(
      'revenuecat_google_play',$2,'INITIAL_PURCHASE',$1::uuid,p.provider_product_id,p.provider_base_plan_id,
      'production','active',now()-interval '1 minute',now()+interval '1 day',now(),999,'usd',repeat('b',64),
      'NORMAL','google_play','android',null,p.id,$3) result
      from public.monetization_products p where id=$4`,
    [actor.id,`synthetic-production-${actor.id}`,`synthetic-original-${actor.id}`,product])).rows[0]?.result;
    assert.equal(result?.status,'processed',JSON.stringify(result));
  }
  return actor;
}

export async function acceptCommerceCreatorTerms(db,actor) {
  await db.query(`insert into public.wave1_legal_acceptances
    (user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
    select $1::uuid,public.wave1_sha256($1::text),document_key,version,market,'member',capability,$2,'service_reconciliation'
    from public.wave1_legal_document_versions where active and market='UNITED_STATES'
      and capability in ('creator','creator_money') on conflict do nothing`,[actor.id,actor.session]);
}

export async function assertBuyerHasNoPremium(db,actor) {
  const result=(await db.query(`select
    (select count(*) from public.user_entitlements where user_id=$1 and entitlement_key='premium')::int entitlements,
    (select count(*) from public.access_grants where user_id=$1::uuid and grant_type='premium')::int grants`,[actor.id])).rows[0];
  assert.deepEqual(result,{entitlements:0,grants:0});
}

// Intentionally synthetic complete facts, including tax and sanctions that the
// real adapter does NOT verify. This is test input, never readiness evidence.
export async function seedSyntheticStrictCreatorProvider(db,actor,{environment='sandbox',providerAccountId}={}) {
  assert.ok(['sandbox','production'].includes(environment));
  const mode=environment==='production'?'live':'test',account=providerAccountId??`acct_${mode}${actor.id.replaceAll('-','')}`;
  assert.match(account,/^acct_[A-Za-z0-9]+$/u);
  const key=mode==='live'?'stripe_connect_live_express_recipient_controller_v1':'stripe_connect_test_express_controller_v1';
  const observation={accountId:account,platformAccountId:'acct_syntheticPlatform',environment:'live',modeVerified:true,
    v2Dashboard:'express',v2FeesCollector:'application',v2LossesCollector:'application',source:'authenticated_stripe_get_v1_v2',
    pendingVerification:[],requirementsComplete:true,recipientTransfers:'active',payoutSchedule:'manual'};
  await db.query(`insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id,
    status,country,default_currency,details_submitted,payouts_enabled,transfers_capability_status,onboarding_status,kyc_status,tax_status,
    last_provider_sync_at,provider_configuration_observed_at,provider_configuration_account_id,provider_configuration_status,
    provider_expected_configuration_key,provider_configuration_key,provider_account_type,provider_controller_type,provider_is_controller,
    provider_dashboard_type,provider_fees_payer,provider_fees_payer_raw,provider_losses_collector,provider_requirements_collection,provider_live_observation)
    values($1,'stripe_connect',$3,$2,'eligible','US','usd',true,true,'active','ready_for_payouts','verified','verified',
    now(),now(),$2,'match',$4,$4,'express','application',true,'express','platform','application','platform','stripe',$5::jsonb)
    on conflict(creator_user_id,provider,provider_environment) do update set
    status=excluded.status,country=excluded.country,default_currency=excluded.default_currency,
    details_submitted=excluded.details_submitted,payouts_enabled=excluded.payouts_enabled,
    transfers_capability_status=excluded.transfers_capability_status,onboarding_status=excluded.onboarding_status,
    kyc_status=excluded.kyc_status,tax_status=excluded.tax_status,last_provider_sync_at=excluded.last_provider_sync_at,
    provider_configuration_observed_at=excluded.provider_configuration_observed_at,
    provider_configuration_account_id=excluded.provider_configuration_account_id,provider_configuration_status=excluded.provider_configuration_status,
    provider_expected_configuration_key=excluded.provider_expected_configuration_key,provider_configuration_key=excluded.provider_configuration_key,
    provider_account_type=excluded.provider_account_type,provider_controller_type=excluded.provider_controller_type,provider_is_controller=excluded.provider_is_controller,
    provider_dashboard_type=excluded.provider_dashboard_type,provider_fees_payer=excluded.provider_fees_payer,provider_fees_payer_raw=excluded.provider_fees_payer_raw,
    provider_losses_collector=excluded.provider_losses_collector,provider_requirements_collection=excluded.provider_requirements_collection,
    provider_live_observation=excluded.provider_live_observation`,
  [actor.id,account,mode,key,JSON.stringify(mode==='live'?observation:null)]);
  await db.query(`insert into private.creator_provider_observation_jobs(account_id,creator_id,environment,provider_account_id,observed_at)
    select id,creator_user_id::uuid,provider_environment,provider_account_id,provider_configuration_observed_at
    from public.creator_payout_accounts where creator_user_id=$1 and provider_environment=$2
    on conflict(account_id) do update set observed_at=excluded.observed_at`,[actor.id,mode]);
  const ready=(await db.query('select private.ordinary_creator_provider_ready($1::uuid,$2) ready',[actor.id,environment])).rows[0]?.ready;
  assert.equal(ready,true,'synthetic complete provider facts satisfy strict current predicate');
}

export async function seedQualifiedCommerceCreator(db,actor=commerceActor(),{environment='sandbox',premium=true}={}) {
  if(premium)await seedCommerceCreator(db,actor,{environment});
  await acceptCommerceCreatorTerms(db,actor);
  await seedSyntheticStrictCreatorProvider(db,actor,{environment});
  // Independent trusted local-test facts, NOT derived from a provider response.
  await db.query(`select public.wave1_evaluate_creator_eligibility($1::uuid,
    '{"accountStatus":"ACTIVE","age18Plus":true,"legalAccepted":true,"creatorRole":true,"moderationState":"CLEAR",
    "market":"UNITED_STATES","rolloutEligible":false,"platformCapability":true,"providerEligible":true,
    "kycComplete":true,"taxComplete":true,"sanctionsClear":true,"payoutEligible":true,"inputVersions":{"evaluationSequence":1}}'::jsonb,
    'synthetic-complete-commerce-fixture','local_pgtap')`,[actor.id]);
  return actor;
}
