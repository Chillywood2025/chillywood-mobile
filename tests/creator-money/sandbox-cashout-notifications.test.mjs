import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedCashoutExecutionFixture} from '../helpers/cashout-execution-fixture.mjs';
import {seedCommerceCreator,assertBuyerHasNoPremium} from '../helpers/automatic-commerce-fixture.mjs';
import {pgtapSQLPreflight} from '../helpers/pgtap-sql-preflight.mjs';
import {createNotificationActivityHandler} from '../../supabase/functions/_shared/notification-activity-worker.mjs';

// Full current SQL -> actual GET-only reconciliation engine -> actual activity
// worker and platform payloads. All provider responses are local test doubles.
test('sandbox cashout milestones reach only the creator inbox and privacy-safe owned phones', {timeout:240000}, async t=>{
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  try {
    const f=await seedCashoutExecutionFixture(db,{reserveInitialRequest:false});
    const {scalar,creator,session,claims,rpc}=f;
    await seedCommerceCreator(db,{id:creator,session});
    const buyer=randomUUID();
    await db.query("insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,'payout-notice-buyer@example.test',now(),false,false)",[buyer]);
    await assertBuyerHasNoPremium(db,{id:buyer});
    await db.exec("update public.platform_money_kill_switches set state='off' where key in ('live_money_enabled','payouts_enabled','cashout_enabled'); update public.platform_money_kill_switches set state='sandbox_only' where key in ('stripe_connect_enabled','creator_monetization_enabled','provider_webhooks_enabled'); update private.sandbox_cashout_control set enabled=true");
    await db.query("insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id,country) values($1,'stripe_connect','test','acct_noticeCreator','US')",[creator]);
    const qualification=await scalar(`insert into private.sandbox_cashout_qualifications(creator_id,platform_account_id,account_id,destination_id,payout_type,source_type,
      provider_fee_bps,provider_fee_fixed_minor,settlement_policy_version,simulated_tax_bps,simulated_platform_bps,simulated_provider_bps,simulated_provider_fixed_minor,
      manual_schedule_verified,exclusive_writer_verified,zero_additional_application_fee_verified,platform_fee_payer_verified,test_mode_verified,provider_evidence_reference,verified_at,expires_at)
      values($1,'acct_noticePlatform','acct_noticeCreator','ba_noticeDestination','instant','card',0,0,'synthetic-test-policy-v1',0,1000,0,0,
      true,true,true,true,true,'SYNTHETIC DISPOSABLE TEST ONLY',now()-interval '1 minute',now()+interval '1 day') returning id`,[creator]);
    const provider=await scalar("insert into public.provider_events(provider,provider_event_id,user_id,environment,event_type,status,idempotency_key) values('revenuecat_app_store','evt_noticePurchase',$1,'sandbox','INITIAL_PURCHASE','processed','evt_noticePurchase') returning id",[buyer]);
    await db.query(`insert into public.money_access_ledger_events(user_id,creator_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,metadata)
      values($1,$2,$3,'INITIAL_PURCHASE',10000,'usd','sandbox','not_payable','sandbox_only','tip','{"original_transaction_id":"noticeOriginal"}')`,[buyer,creator,provider]);
    const user=async(sql,args=[])=>{await claims('authenticated');await db.exec('set role authenticated');try{return await scalar(sql,args);}finally{await db.exec('reset role');}};
    const quote=await user("select public.preview_sandbox_creator_cashout(9000,'instant')");
    assert.equal(quote.ready,true,JSON.stringify(quote));
    const request=()=>user('select public.request_sandbox_creator_cashout($1,$2,$3,$4,$5,$6,$7)',[9000,'instant',qualification,quote.operationId,180,0,8820]);
    const record=await request(),id=record.requestId;
    const events=()=>db.query("select e.*,private.resolve_notification_activity(e) plan from public.notification_activity_events e where event_kind='sandbox_cashout_status_updated' and source_id=$1 order by created_at,id",[id]);
    const count=()=>scalar("select count(*)::int from public.notification_activity_events where event_kind='sandbox_cashout_status_updated' and source_id=$1",[id]);
    const inbox=()=>db.query("select * from public.notifications where notification_type='sandbox_cashout_status_updated' order by created_at,id");
    const claim=stage=>rpc('select public.claim_sandbox_creator_cashout_dispatch($1,$2)',[id,stage]);
    const observe=facts=>rpc('select public.record_sandbox_creator_cashout_observation($1,null,$2)',[id,JSON.stringify(facts)]);
    const tokens=[];
    for(const platform of ['ios','android']){
      const install=`notice-${platform}`;
      await db.query(`insert into public.wave1_push_installation_ownership(platform,install_id,user_id,account_id,session_generation,ownership_state,revocation_credential_hash,last_operation_key,last_reason)
        values($1,$2,$3,$3,$4,'ACCOUNT_BOUND',repeat('a',64),'fixture','fixture')`,[platform,install,creator,session]);
      tokens.push(await scalar(`insert into public.user_push_tokens(user_id,platform,provider,token,token_hash,token_fingerprint,install_id,session_generation,ownership_state)
        values($1,$2,'expo',$3,$4,$4,$4,$5,'ACCOUNT_BOUND') returning id`,[creator,platform,`ExponentPushToken[${install}]`,install,session]));
    }
    await db.exec("insert into public.notification_activity_worker_config(singleton,enabled,token_sha256) values(true,true,encode(extensions.digest('fixture-worker','sha256'),'hex')) on conflict(singleton) do update set enabled=excluded.enabled,token_sha256=excluded.token_sha256");
    let beforeReserve=null,delivery='ok';const sent=[];
    const worker=createNotificationActivityHandler({deadlineMs:10000,adminClient:{async rpc(name,args){
      if(name==='reserve_notification_activity_push'&&beforeReserve){const fn=beforeReserve;beforeReserve=null;await fn();}
      await claims('service_role');await db.exec('set role service_role');
      try{const result=await db.query(`select public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) value`,Object.values(args));
        return {data:name==='claim_notification_activity_batch'?result.rows.map(r=>r.value):result.rows[0].value,error:null};
      }finally{await db.exec('reset role');}
    }},fetchImpl:async(url,options)=>{
      assert.equal(url,'https://exp.host/--/api/v2/push/send');sent.push(JSON.parse(options.body));
      if(delivery==='unknown')throw Error('simulated lost receipt');
      return Response.json({data:delivery==='ok'?{status:'ok',id:`fixture-ticket-${sent.length}`}:{status:'error',details:{error:delivery}}});
    }});
    const run=async()=>{
      await db.exec("update public.notification_activity_events set status='suppressed',completed_at=now() where event_kind<>'sandbox_cashout_status_updated' and status='pending'");
      const response=await worker(new Request('https://fixture.invalid',{method:'POST',headers:{'x-chillywood-activity-token':'fixture-worker'}}));
      assert.equal(response.status,200);return response.json();
    };
    const initialProduction=await scalar("select md5(jsonb_build_array((select jsonb_agg(t) from public.creator_earnings_ledger t),(select jsonb_agg(t) from public.creator_payout_requests t),(select jsonb_agg(t) from private.creator_cashout_executions t))::text)");

    await t.test('canonical request, dispatch and provider reconciliation deduplicate and reject stale payment state',async()=>{
      await request();assert.equal(await count(),1,'idempotent request has one requested event');
      assert.equal((await events()).rows[0].plan.target_context.cashoutRequestId,id);
      await claim('funding');
      const transfer={kind:'transfer',objectId:'tr_noticeFunding',amountMinor:8820,reversedMinor:0,fullyReversed:false,accountId:'acct_noticeCreator',environment:'test'};
      await observe(transfer);await claim('payout');
      assert.equal(await count(),2,'dispatch substeps share one processing event');
      assert.equal((await events()).rows.find(e=>e.context.state==='requested').plan.eligible,false,'delayed older milestone is suppressed');
      await run();assert.equal(sent.length,2);assert.equal((await inbox()).rows.length,1);
      await run();assert.equal(sent.length,2,'worker replay cannot send twice');

      const runtime={exports:{},URLSearchParams,Response,TextDecoder,Uint8Array,AbortSignal,setTimeout,clearTimeout};
      vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/creator-cashout-execution.ts','utf8'),
        {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,runtime);
      let providerStatus='paid',reads=0;
      const store={read:requestId=>rpc('select public.get_sandbox_creator_cashout_execution_context($1)',[requestId]),
        claim:()=>assert.fail('webhook reconciliation cannot dispatch'),observe:(_id,_token,facts)=>observe(facts)};
      const reconcile=()=>runtime.exports.runCreatorCashout(id,store,'rk_test_fixture',async(url,options)=>{
        assert.equal(options.method,'GET');reads++;
        if(url.endsWith('/v1/account'))return Response.json({object:'account',id:'acct_noticePlatform'});
        const payout={object:'payout',id:'po_noticeBank',livemode:false,amount:8820,currency:'usd',destination:'ba_noticeDestination',
          method:'instant',source_type:'card',automatic:false,status:providerStatus,metadata:{chillywood_cashout_execution:id,chillywood_cashout_request:id}};
        return Response.json(url.includes('/payouts?')?{object:'list',data:[payout],has_more:false}:payout);
      },Date.now,true);
      const paid=await reconcile();assert.equal(paid.providerTestPaid,true);assert.equal(paid.bankPaid,false);assert.ok(reads>=2);
      await reconcile();assert.equal(await count(),3,'repeat provider event cannot create a paid duplicate');
      providerStatus='pending';await assert.rejects(reconcile,/sandbox_payout_regression/);assert.equal(await count(),3);
      await run();assert.equal(sent.length,4);const n=(await inbox()).rows.find(n=>n.target_context.cashoutState==='test_paid');
      assert.ok(n);assert.match(n.title,/Test provider/);assert.match(n.body,/No real bank payment occurred/);
      assert.equal(n.user_id,creator);assert.equal(n.target_context.financialAuthority,false);
      const paidFacts={kind:'payout',objectId:'po_noticeBank',amountMinor:8820,accountId:'acct_noticeCreator',destinationId:'ba_noticeDestination',environment:'test'};
      await observe({...paidFacts,status:'failed'});await run();assert.equal(sent.length,6,'late failure after paid creates a new returning milestone');
      await observe({...paidFacts,status:'failed',returnedMinor:8820,returnTransactionId:'txn_noticeReturn'});
      assert.equal(await count(),4,'return proof is not a second return-pending notice');
      await claim('reversal');await observe({kind:'reversal',objectId:'trr_noticeReturn',transferId:'tr_noticeFunding',amountMinor:8820,accountId:'acct_noticeCreator',environment:'test'});
      await run();assert.equal(sent.length,8);
      assert.equal((await inbox()).rows.filter(n=>n.target_context.cashoutState==='returned').length,1);
      for(const p of sent){
        assert.equal(p.title,'Account update');assert.equal(p.body,"Open Chi'llywood to review your latest update.");
        assert.equal(p.data.deepLink,'/channel-studio');
        assert.deepEqual(Object.keys(p.data).sort(),['deepLink','notificationId','route','targetRoute']);
        assert.doesNotMatch(JSON.stringify(p),/8820|9000|acct_|ba_|po_|trr_|test_paid|cashoutRequestId/);
      }
      assert.ok(sent.some(p=>p.channelId==='default'));assert.ok(sent.some(p=>p.categoryId==='chillywood_activity'));
    });

    // Independent synthetic rows isolate delivery failures and preferences.
    // These do not claim to be provider observations or production payouts.
    const fixtureRequest=async()=>scalar(`insert into private.sandbox_cashout_executions(creator_id,originating_session_id,operation_id,qualification_id,gross_minor,app_fee_minor,expected_provider_fee_minor,bank_minor)
      values($1,$2,$3,$4,9000,180,0,8820) returning id`,[creator,session,randomUUID(),qualification]);
    const preferences=patch=>db.query(`insert into public.notification_preferences(user_id,${Object.keys(patch).join(',')}) values($1,${Object.keys(patch).map((_,i)=>`$${i+2}`).join(',')})
      on conflict(user_id) do update set ${Object.keys(patch).map(k=>`${k}=excluded.${k}`).join(',')}`,[creator,...Object.values(patch)]);
    await t.test('preferences and session/token revocation are rechecked before delivery',async()=>{
      for(const patch of [{account_activity_enabled:false},{push_enabled:false},{in_app_enabled:false}]){
        await preferences({account_activity_enabled:true,push_enabled:true,in_app_enabled:true,...patch});
        const row=await fixtureRequest(),before=sent.length;await run();
        const n=await scalar("select count(*)::int from public.notifications where target_context->>'cashoutRequestId'=$1",[row]);
        assert.equal(n,patch.account_activity_enabled===false||patch.in_app_enabled===false?0:1);
        assert.equal(sent.length-before,patch.account_activity_enabled===false||patch.push_enabled===false?0:2);
      }
      await preferences({account_activity_enabled:true,push_enabled:true,in_app_enabled:true});
      await fixtureRequest();const before=sent.length;
      beforeReserve=()=>preferences({account_activity_enabled:false});await run();assert.equal(sent.length,before,'new preference beats an existing preparation');
      await preferences({account_activity_enabled:true});
      await db.query("update public.wave1_push_installation_ownership set revoked_at=now() where user_id=$1",[creator]);
      await fixtureRequest();await run();assert.equal(sent.length,before,'account-switched or revoked installation cannot receive');
      await db.query("update public.wave1_push_installation_ownership set revoked_at=null where user_id=$1",[creator]);
      await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[session]);
      await fixtureRequest();await run();assert.equal(sent.length,before,'expired session cannot receive');
      await db.query('update auth.sessions set not_after=null where id=$1',[session]);
    });
    await t.test('known rejection retries once per lease; unknown acceptance is never resent',async()=>{
      let before=sent.length;await fixtureRequest();delivery='unknown';await run();delivery='ok';await run();
      assert.equal(sent.length-before,2,'unknown tickets never retried');
      const row=await fixtureRequest();before=sent.length;delivery='MessageRateExceeded';await run();delivery='ok';
      await db.exec("update public.notification_activity_pushes set retry_after=now()-interval '1 second' where status='retryable';update public.notification_activity_events set scheduled_at=now()-interval '1 second' where status='pending'");
      await run();await run();assert.equal(sent.length-before,4);
      assert.equal(await scalar("select count(*)::int from public.notifications where target_context->>'cashoutRequestId'=$1",[row]),1,'push retry does not duplicate inbox');
      await fixtureRequest();delivery='DeviceNotRegistered';await run();delivery='ok';
      assert.equal(await scalar('select count(*)::int from public.user_push_tokens where id=any($1::uuid[]) and enabled=false',[tokens]),2);
    });
    await t.test('transaction rollback, current ownership, private grants and inbox RLS remain authoritative',async()=>{
      const before=await scalar("select count(*)::int from public.notification_activity_events where event_kind='sandbox_cashout_status_updated'");
      await db.exec('begin');await fixtureRequest();await db.exec('rollback');
      assert.equal(await scalar("select count(*)::int from public.notification_activity_events where event_kind='sandbox_cashout_status_updated'"),before);
      const e=(await events()).rows.find(e=>e.context.state==='returned');
      for(const patch of [{recipient_user_id:buyer},{actor_user_id:buyer},{source_id:randomUUID()},{context:{environment:'live',state:'returned'}}]){
        assert.equal((await scalar('select private.resolve_notification_activity(jsonb_populate_record(null::public.notification_activity_events,to_jsonb(e)||$2::jsonb)) from public.notification_activity_events e where id=$1',[e.id,JSON.stringify(patch)])).eligible,false);
      }
      for(const role of ['anon','authenticated','service_role'])for(const fn of ['private.enqueue_sandbox_cashout_notification()','private.sandbox_cashout_notification_state(text)',
        'private.resolve_account_notification_before_sandbox_cashout(public.notification_activity_events)','public.reserve_notification_activity_push_before_sandbox_cashout(uuid,uuid,uuid)'])
        assert.equal(await scalar('select has_function_privilege($1,$2,\'execute\')',[role,fn]),false,`${role} ${fn}`);
      for(const role of ['anon','authenticated'])assert.equal(await scalar("select has_function_privilege($1,'public.reserve_notification_activity_push(uuid,uuid,uuid)','execute')",[role]),false);
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:buyer})]);await db.exec('set role authenticated');
      assert.equal((await inbox()).rows.length,0,'other account cannot read creator cashout history');await db.exec('reset role');
      assert.equal(await scalar("select md5(jsonb_build_array((select jsonb_agg(t) from public.creator_earnings_ledger t),(select jsonb_agg(t) from public.creator_payout_requests t),(select jsonb_agg(t) from private.creator_cashout_executions t))::text)"),initialProduction);
      assert.equal(await scalar("select count(*)::int from public.platform_money_kill_switches where key in ('live_money_enabled','payouts_enabled','cashout_enabled') and state='off'"),3);
    });
    await t.test('outbox failure rolls back the source phase, and a later retry records one milestone',async()=>{
      const row=await fixtureRequest();
      await db.exec(`create function pg_temp.reject_cashout_notice() returns trigger language plpgsql as $$
        begin if new.event_kind='sandbox_cashout_status_updated' then raise exception 'fixture_outbox_unavailable';end if;return new;end$$;
        create trigger fixture_reject_cashout_notice before insert on public.notification_activity_events
        for each row execute function pg_temp.reject_cashout_notice();`);
      await assert.rejects(db.query("update private.sandbox_cashout_executions set phase='needs_review' where id=$1",[row]),/fixture_outbox_unavailable/);
      assert.equal(await scalar('select phase from private.sandbox_cashout_executions where id=$1',[row]),'prepared');
      await db.exec('drop trigger fixture_reject_cashout_notice on public.notification_activity_events');
      await db.query("update private.sandbox_cashout_executions set phase='needs_review' where id=$1",[row]);
      await db.query("update private.sandbox_cashout_executions set phase='needs_review' where id=$1",[row]);
      assert.equal(await scalar("select count(*)::int from public.notification_activity_events where source_id=$1 and context->>'state'='needs_review'",[row]),1);
    });
    await t.test('pgTAP boundary SQL preflight against the real full schema',async()=>{
      await db.exec(pgtapSQLPreflight);
      const result=await db.exec(fs.readFileSync('supabase/tests/sandbox_cashout_notifications_test.sql','utf8'));
      const assertions=result.flatMap(r=>r.rows??[]).flatMap(Object.values).filter(v=>typeof v==='string'&&v.startsWith('ok '));
      assert.equal(assertions.length,28,'all pgTAP boundary assertions executed; native pgTAP remains separate');
    });
  } finally {await db.close();}
});
