import assert from 'node:assert/strict';
export const creator='b1000000-0000-4000-8000-000000000001',session='b1000000-0000-4000-8000-000000000002';
// Only for an owned disposable database. Synthetic provider evidence, no network.
export async function seedCashoutExecutionFixture(db){
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const claims=async role=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,sub:creator,session_id:session})]);
 const rpc=async(sql,args=[])=>{await claims('service_role');await db.exec('set role service_role');try{return await scalar(sql,args);}finally{await db.exec('reset role');}};
  await db.query("insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,'cashout-execution@example.test',now(),false,false)",[creator]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,creator]);
  await db.exec("insert into public.wave1_legal_document_versions(document_key,version,market,capability,effective_at) values('payout_terms','cashout-fixture','UNITED_STATES','payout',now()-interval '1 day') on conflict do nothing");
  await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
   select $1::uuid,public.wave1_sha256($1::text),document_key,version,market,'member',capability,$2,'service_reconciliation'
   from public.wave1_legal_document_versions where active and market='UNITED_STATES'`,[creator,session]);
  await db.query(`insert into public.wave1_creator_eligibility(creator_user_id,state,account_status,age_18_plus,legal_accepted,creator_role,moderation_state,market,rollout_eligible,platform_capability,provider_eligible,kyc_complete,tax_complete,sanctions_clear,payout_eligible,authority_source,last_operation_key)
   values($1,'VERIFIED','ACTIVE',true,true,true,'CLEAR','UNITED_STATES',true,true,true,true,true,true,true,'synthetic_sql_fixture','cashout-execution')`,[creator]);
  await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false); set role service_role; select set_config('request.jwt.claim.role','service_role',false)");
  await db.exec("update public.platform_money_kill_switches set state='on' where key in ('live_money_enabled','payouts_enabled','stripe_connect_enabled','cashout_enabled')");
  await db.exec("reset role; select set_config('request.jwt.claim.role','',false)");
  const account=await scalar(`insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id,country,status,payouts_enabled,details_submitted,transfers_capability_status,onboarding_status,kyc_status,tax_status,last_provider_sync_at,metadata)
   values($1,'stripe_connect','live','acct_cashoutCreator','US','eligible',true,true,'active','ready_for_payouts','verified','verified',now(),'{"last_provider_sync_source":"stripe-connect-account-sync","synthetic_fixture":true}') returning id`,[creator]);
  const audit=await scalar("insert into public.platform_admin_audit_logs(action,action_category,target_type,target_id,target_user_id,metadata) values('stripe_connect_account_synced','payout','creator_payout_account',$1,$2,'{\"synthetic_fixture\":true}') returning id",[account,creator]);
  await db.query('update public.creator_payout_accounts set last_platform_admin_audit_log_id=$2 where id=$1',[account,audit]);
  const provider=await scalar("insert into public.provider_events(provider,provider_event_id,user_id,environment,event_type,status,idempotency_key,metadata) values('stripe_connect','evt_cashoutFixture',$1,'production','synthetic_settlement','processed','cashoutFixture','{\"synthetic_fixture\":true}') returning id",[creator]);
  const money=await scalar(`insert into public.money_access_ledger_events(user_id,creator_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,metadata)
   values($1,$1,$2,'synthetic_settlement',10000,'usd','production','payable','verified','tip','{"payout_readiness_proved":true,"live_money_enabled_at_verification":true,"synthetic_fixture":true}') returning id`,[creator,provider]);
  const earning=await scalar(`insert into public.creator_earnings_ledger(creator_id,source_type,gross_amount_cents,net_creator_amount_cents,ledger_status,money_ledger_event_id,provider_event_id,settlement_started_at,normal_eligible_at,reserve_amount_cents,reserve_release_at,settlement_policy_version,metadata)
   values($1,'tip',10000,10000,'available',$2,$3,now()-interval '30 days',now()-interval '1 day',0,now()-interval '1 day','2026-08-31-v1','{"synthetic_fixture":true}') returning id`,[creator,money,provider]);
  const hasFeePolicy=await scalar("select to_regprocedure('public.get_creator_fee_policy_status()') is not null");
  await claims('authenticated');await db.exec('set role authenticated');
  if(hasFeePolicy){const policy=await scalar('select public.get_creator_fee_policy_status()');await scalar('select public.accept_creator_fee_policy($1,$2)',[policy.version,policy.termsSha256]);}
  const request=await scalar("select public.create_creator_payout_request_safe(10000,'instant')");await db.exec('reset role');
  assert.equal(await scalar('select originating_session_id::text from public.creator_payout_requests where id=$1',[request.id]),session);
  await assert.rejects(db.query('update public.creator_payout_requests set originating_session_id=null where id=$1',[request.id]),/cashout_origin_session_immutable/);
  await assert.rejects(rpc('select public.get_creator_cashout_execution_context($1)',[request.id]),/cashout_provider_qualification_required/);
  const qualification=await scalar(`insert into private.creator_cashout_provider_qualifications(creator_id,platform_account_id,account_id,destination_id,environment,currency,payout_type,source_type,provider_fee_bps,provider_fee_fixed_minor,provider_fee_basis,
   manual_schedule_verified,exclusive_writer_verified,zero_additional_application_fee_verified,platform_fee_payer_verified,funding_provenance_verified,fee_report_coverage_verified,fee_report_semantics,provider_terms_reference,expires_at)
   values($1,'acct_cashoutPlatform','acct_cashoutCreator','ba_cashoutDestination','live','usd','instant','card',0,0,'bank_amount',true,true,true,true,true,true,
   'all_fees.incurred_at.itemized.2:amount_excludes_tax_v1','SYNTHETIC TEST ONLY',clock_timestamp()+interval '1 day') returning id`,[creator]);
 return {scalar,claims,rpc,request,qualification,earning,money,creator,session};
}
