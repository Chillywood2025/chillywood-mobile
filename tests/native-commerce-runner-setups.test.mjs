// Execute actual registered runner setup code, including its direct INSERTs
// and late source/receipt/ledger factories. Sequential PGlite ONLY: no native
// session, blocked-backend, rollback-race or SKIP LOCKED claim is made here.
import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeSetupDatabase,nativeSource,nativeSpan,nativeFunction,nativeVariables,executeNativeSetup} from './helpers/native-runner-setup-preflight.mjs';
import {seedAutomaticCommerceObserverFixture,prepareAutomaticCommerceObserverSkipLockedFixture,runAutomaticCommerceObserverLeaseRaces} from '../scripts/lib/automatic-commerce-observer-races.mjs';
import {commerceSeedAdapter,seedCommerceCreator,commerceActor} from './helpers/automatic-commerce-fixture.mjs';

const prefix='scripts/test-';
const eventStart="query(readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));";
test('registered native commerce runner setups and late INSERT factories execute current SQL',{timeout:360000},async t=>{
 const db=nativeSetupDatabase();
 const runPath=async(file,parts,tail='',options={})=>{
  const source=nativeSource(file);
  const result=await executeNativeSetup(file,source,parts(source),{query:db.query,tail,...options});
  t.diagnostic(JSON.stringify({file,sourceSha256:result.sourceSha256,excerptSha256:result.excerptSha256,evidence:'sequential setup only; native contention not run'}));
  return result.result;
 };
 const run=(name,...args)=>runPath(prefix+name+'.mjs',...args);
 const workers=new Set();
 const check=async(name,fn)=>t.test(name,async()=>{
  const {threadId}=await db.reset();assert.ok(!workers.has(threadId),'each sequential case gets a fresh WASM worker');workers.add(threadId);
  await fn();
 });
 try{
  const googleParts=source=>[
   nativeSpan(source,'  const cap=query(',"  const holder=session('google-claim-holder'"),
   "query(`begin;${service}select public.claim_google_play_external_report('${lease}');commit;`);",
   nativeSpan(source,'  const row=JSON.parse(query(',"  const duplicate=session('google-enqueue-holder'"),
   "query(`begin;${service}select public.finish_google_play_external_report('${row.id}','${lease}',${lit(JSON.stringify({status:'reported',receipt}))}::jsonb);commit;`);",
   nativeSpan(source,'  // Use the same production schema',"  const historyHolder=session('google-history-holder'"),
  ];
  await check('Google exact later transaction INSERT reproduces the old trigger failure without its creator companion',async()=>{
   await assert.rejects(run('google-external-reporting-concurrency-postgres',source=>googleParts(source).map(part=>part.replace('  await seedCurrentEventCommerceCreator(commerceSeedAdapter(query));',''))),/creator_eligibility_required/u);
   assert.equal(db.query('select count(*) from public.creator_tip_transactions'),'0','failed source setup creates no tip');
   assert.equal(db.query("select count(*) from public.access_grants g join event_reservation_fixture.actors a on a.user_id=g.user_id where a.kind like 'buyer%'"),'0');
  });
  await check('Google exact tax-tail setup binds the actual creator and historical refund evidence survives Premium loss',async()=>{
   await run('google-external-reporting-concurrency-postgres',source=>[
    ...googleParts(source),
    `assert.equal(query("select count(*) from private.google_play_external_launch_bindings b join private.creator_external_payment_capabilities c on c.id=b.capability_id join public.creator_tip_transactions tip on tip.id=b.quote_id where b.quote_id='"+taxQuote+"' and c.creator_id=tip.creator_id and c.provider_account_id=tip.provider_account_id and c.environment=tip.provider_environment"),'1');
     query("select public.process_revenuecat_premium_event_atomic('revenuecat_google_play','google-tail-expiration','EXPIRATION','"+actors.creator.id+"',p.provider_product_id,p.provider_base_plan_id,'sandbox','expired',now()-interval '1 day',now()-interval '1 second',now(),999,'usd',repeat('e',64),'NORMAL','google_play','android',null,p.id,'live-authority-original-"+actors.creator.id+"') from public.monetization_products p where p.provider='revenuecat_google_play' and p.environment='sandbox' and p.product_type='premium_subscription' and p.status='sandbox' order by p.created_at,p.id limit 1");
     assert.equal(query("select private.ordinary_commerce_premium_current('"+actors.creator.id+"','sandbox')"),'f');
     let historyLease=JSON.parse(query('begin;'+service+'select '+beginHistory+';commit;'));`,
    nativeSpan(source,'  const context=JSON.parse(query(',"  const saveHolder=session('google-history-save-holder'"),
   ],`const saved=JSON.parse(query('begin;'+service+'select '+saveHistory+';commit;'));
    assert.deepEqual(saved,{status:'history_complete',evidenceRecorded:true,financialAuthority:false});
    assert.equal(query("select count(*) from private.stripe_refund_tax_evidence where refund_id='re_nativeTax'"),'1');
    assert.equal(query("select count(*) from private.google_play_external_report_outbox where transaction_id='"+taxTransaction+"' and operation='refund' and state='pending' and canonical_receipt is null"),'1');
    assert.equal(query("select payment_status from public.creator_tip_transactions where id='"+taxQuote+"'"),'pending');
    assert.equal(query("select count(*) from public.access_grants g join event_reservation_fixture.actors a on a.user_id=g.user_id where a.kind like 'buyer%'"),'0');`);
  });
  await check('room auction native initial fixture and later Party admission setup',async()=>{
   await seedCommerceCreator(commerceSeedAdapter(db.query),commerceActor());
   await run('room-seat-auction-concurrency-postgres',source=>[
    nativeSpan(source,'  const baselineAccessGrants=query(accessGrantsSnapshotSql);','  let checks=0;'),
    nativeSpan(source,'  query("insert into public.titles(',"  await race('Party auction hold"),
   ],`const a=rpc('creator',partyAuction('RACE-PARTY'));assert.ok(a.id);
    const native=rpc('buyer1',partyNative('RACE-PARTY-TWO'));assert.ok(native.id);
    assert.equal(query(inheritedAccessGrantsSql),baselineAccessGrants);assert.equal(query(accessGrantsSnapshotSql),raceAccessGrants);
    assert.equal(query("select count(*) from public.access_grants where user_id in(select user_id from event_reservation_fixture.actors where kind like 'buyer%')"),'0');`);
  });
  await check('auction transfer actual full payment, ledger, seat attendance and release fixture',async()=>{
   await run('auction-transfer-concurrency-postgres',source=>[nativeSpan(source,'  '+eventStart,'  let checks=0;')],
    `const f=await fixture('SEQUENTIALTRANSFER');assert.ok(f.contract);assert.equal(f.qualified.status,'qualified_test_only');
     const reserve=run(f.reserve);assert.equal(reserve.dispatchAuthorized,false);assert.equal(reserve.reason,'tax_service_fee_unverified');
     assert.equal(query('select count(*) from private.auction_transfer_operations'),'0');`);
  });
  await check('commerce fee actual pair of source factories, direct receipt/ledger rows and fee qualification tail',async()=>{
   await run('commerce-fee-concurrency-postgres',source=>[
    nativeSpan(source,'  '+eventStart,'  let checks=0;'),
    nativeSpan(source,"  const a=await fixture('FEEA')","  await race('same-sale identical"),
    nativeSpan(source,'  query(`insert into private.commerce_creator_fee_acceptances(',"  await race('late report after snapshot"),
   ],`const imported=run(record(a.contract,ca,first));assert.ok(imported);
    assert.equal(query("select count(*) from private.commerce_fee_components where component->>'feeTransactionId'='fee_First'"),'1');
    assert.equal(query('select count(*) from private.auction_transfer_operations'),'0');`);
  });
  await check('merch tracking actual product/order factories and canonical payment webhooks',async()=>{
   await run('merch-tracking-concurrency-postgres',source=>[
    nativeSpan(source,'  '+eventStart,"  await race('two orders cannot share"),
    `query(tx(assign(firstOrder),'authenticated'));`,
    nativeSpan(source,"  query(`insert into private.merch_tracking_qualification",'  const holder=session('),
   ],`assert.equal(query('select count(*) from public.merch_orders'), '2');
    assert.equal(query('select count(*) from public.creator_earnings_ledger'),'0');`);
  });
  await check('merch return actual new ordinary creator and direct order/payment setup',async()=>{
   await run('merch-return-cases-concurrency-postgres',source=>[nativeSpan(source,'  '+eventStart,'  const opened=await race(')],
    `const opened=rpc(open(request1),'authenticated','buyer1');assert.ok(opened.id);
     assert.equal(query('select count(*) from public.creator_earnings_ledger'),'0');
     assert.equal(query("select count(*) from public.access_grants where user_id='"+actors.buyer1.id+"'"),'0');`);
  });
  await check('cashout actual historical earning, payout request and context setup',async()=>{
   await run('cashout-execution-concurrency-postgres',source=>[nativeSpan(source," let prefix='';",' const holder=start(')],
    `assert.equal(query("select count(*) from public.creator_payout_requests where id='"+fixture.request.id+"'"),'1');
     assert.equal(query('select count(*) from private.creator_cashout_executions'),'1');`);
  });
  await check('cashout later real merch earning, release, payout allocation and funding setup',async()=>{
   await run('cashout-execution-concurrency-postgres',source=>[
    nativeSpan(source," let prefix='';",' const holder=start('),
    nativeVariables(source,['funded']),
    nativeSpan(source,' query("update public.platform_money_kill_switches set state=', ' const revertedHold=start('),
   ],`assert.ok(release.earnings_ledger_id);assert.ok(domainRequest);
    assert.equal(query("select phase from private.creator_cashout_executions where request_id='"+domainRequest+"'"),'funded');`);
  });
  await check('sandbox cashout actual synthetic earning inserts and physical order/receipt factory',async()=>{
   await run('sandbox-cashout-concurrency-postgres',source=>[nativeSpan(source," let prefix='';"," for(const blocker of ['retention'")],
    `const a=await seed();const merch=seedMerch(a);assert.ok(merch);const id=funded(a);assert.ok(id);invariants(a);`);
  });
  for(const lane of ['event','room'])await check(`sandbox cashout actual later ${lane} auction, receipt, ledger and payout reservation setup`,async()=>{
   await run('sandbox-cashout-concurrency-postgres',source=>[
    nativeSpan(source," let prefix='';"," for(const blocker of ['retention'"),
    // The late native tail inherits sandbox control/qualifications from its
    // earlier seed schedules. Execute that actual factory before the excerpt.
    `await seed();const lane=${JSON.stringify(lane)},outcome='commit';`,
    nativeSpan(source,"  const suffix=randomUUID().replaceAll('-',''),schema='auction_native_'", '  const id=run(a,\'authenticated\',`select public.request_sandbox_creator_cashout(189'),
    `const preview=run(a,'authenticated',"select public.preview_sandbox_creator_cashout(189,'scheduled');");assert.equal(preview.ready,true,JSON.stringify(preview));`,
    nativeSpan(source,'  const id=run(a,\'authenticated\',`select public.request_sandbox_creator_cashout(189', "  if(outcome==='rollback'){"),
   ],`assert.equal(query("select phase from private.sandbox_cashout_executions where id='"+id+"'"),'prepared');invariants(a);`);
  });
  await check('tip cross-rail actual source factories admit Free buyers through each rail',async()=>{
   await seedCommerceCreator(commerceSeedAdapter(db.query),commerceActor());
   await run('tip-cross-rail-concurrency-postgres',source=>[
    nativeSpan(source,'  const baselineAccessGrants=query(accessGrantsSnapshotSql);','  let checks=0;'),
    ...['quote','external','native','verify'].map(name=>nativeFunction(source,name)),
   ],`const action=randomUUID(),tip=randomUUID(),stripe=external('buyer1',action,tip);rpc('buyer1',stripe.sql,stripe.role);
    verify('buyer1',action,null,tip,'stripe_connect');
    const nativeAction=randomUUID(),appStore=native('buyer2',nativeAction);rpc('buyer2',appStore.sql);
    verify('buyer2',nativeAction,appStore,null,'revenuecat_app_store');
    assert.equal(query(inheritedAccessGrantsSql),baselineAccessGrants);assert.equal(query(accessGrantsSnapshotSql),raceAccessGrants);
    assert.equal(query("select count(*) from public.access_grants where user_id in(select user_id from event_reservation_fixture.actors where kind like 'buyer%')"),'0');`);
  });
  await check('Connect actual creator, production Premium, callback, bind and observation setup',async()=>{
   await run('connect-dual-mode-concurrency-postgres',source=>[
    nativeVariables(source,['rpc','update','selected']),
    nativeSpan(source,' const creator=randomUUID()', ' const a=start('),
    `query(update(testId));rpc("select public.confirm_creator_connect_live_setup('"+creator+"','"+session+"','distinct-live-account-v1')");`,
    nativeSpan(source,' const reserved=rpc(', ' const c=start('),
   ],`rpc("select public.record_creator_connect_live_observation("+lit(JSON.stringify(context))+"::jsonb,"+lit(JSON.stringify(facts))+"::jsonb)");
    assert.equal(selected(creator).id,liveId);assert.equal(selected(creator).payable,false);
    assert.equal(query("select count(*) from public.platform_money_kill_switches where key in ('live_money_enabled','payouts_enabled') and state<>'off'"),'0');`);
  });
  await check('Clip export actual prepared owner fixture has receipt/seal and no ordinary Premium grant',async()=>{
   await run('clip-export-concurrency-postgres',source=>[nativeSpan(source," let prefix='';",' let checks=0;')],
    `const f=await seedPreparedClipExport(db);assert.ok(f.job.id);assert.ok(f.result);
     assert.equal(query("select count(*) from public.access_grants where user_id='"+f.owner+"'"),'0');
     assert.equal(query("select count(*) from public.platform_role_memberships where user_id='"+f.owner+"' and role='owner' and status='active'"),'1');`);
  });
  await check('Clip pool actual owner source, worker registration and queue admission setup',async()=>{
   await run('clip-export-pool-concurrency-postgres',source=>[
    `let prefix='';const fixtures=[];`,nativeVariables(source,['remember','db','call','claim','active','request']),
    ...['source','enqueue','worker','reset'].map(name=>nativeFunction(source,name)),
   ],`reset(2);const w=worker(),f=await enqueue();const job=call(claim(w));assert.equal(job.id,f.job.id);assert.equal(active(),1);
    assert.equal(query("select count(*) from public.access_grants where user_id='"+f.owner+"'"),'0');`);
  });
  await check('merch observer exact UNKNOWN cohort and both fresh/expired native scenario setup',async()=>{
   await runPath('scripts/lib/automatic-commerce-observer-races.mjs',()=>[
    `const lit=value=>"'"+String(value).replaceAll("'","''")+"'";
     const accounts=await seedAutomaticCommerceObserverFixture({query,lit});
     for(const expired of [false,true]){
      const token=await prepareAutomaticCommerceObserverSkipLockedFixture({query,lit,accounts,expired});
      assert.equal(query("select "+(expired?"lease_token="+lit(token)+" and lease_until<clock_timestamp()":"lease_token is null")+" from private.creator_provider_observation_jobs where account_id="+lit(accounts[0])),'t');
     }`,
   ],`assert.equal(query("select count(*) from private.creator_provider_observation_jobs where account_id in("+accounts.map(lit).join(',')+")"),'6');
    assert.equal(query("select count(*) from public.creator_payout_accounts where id in("+accounts.map(lit).join(',')+") and provider_configuration_status='unknown' and provider_configuration_observed_at is null and private.ordinary_commerce_premium_current(creator_user_id::uuid,'production')"),'6');`,
   {overrides:{seedAutomaticCommerceObserverFixture,prepareAutomaticCommerceObserverSkipLockedFixture}});
  });
  await check('merch declaration exact quota, stale-mode guard and permitted post-change retry setup',async()=>{
   let schedules=0;
   const parse=text=>JSON.parse(text.split('\n').findLast(line=>line.startsWith('{')));
   const race=async(label,first,second,{error}={})=>{
    schedules++;const firstResult=parse(db.query('begin;'+first+'commit;'));
    if(error){assert.throws(()=>db.query('begin;'+second+'commit;'),error,label);return {first:firstResult,second:null};}
    return {first:firstResult,second:parse(db.query('begin;'+second+'commit;'))};
   };
   const {runAutomaticCommerceDeclarationRaces}=await import('../scripts/lib/automatic-commerce-declaration-races.mjs');
   await runAutomaticCommerceDeclarationRaces({query:db.query,race,lit:value=>"'"+String(value).replaceAll("'","''")+"'"});
   assert.equal(schedules,3,'real quota, fresh post-gate mode retry and explicit stale-mode SQL all execute sequentially');
  });
  await check('merch cutover later direct product INSERT keeps its actual creator and Free buyer',async()=>{
   const context=await run('merch-return-cases-concurrency-postgres',source=>[
    nativeSpan(source,'  '+eventStart,'  const opened=await race('),
   ],'return {actors,auth,rpc,lit};');
   await runPath('scripts/lib/merch-admission-cutover-race.mjs',source=>[
    nativeSpan(source,' const product=randomUUID(),attempt=randomUUID();',' const holder=session('),
   ],`assert.equal(query("select count(*) from public.merch_products where id="+lit(product)+" and creator_id="+lit(actors.creator.id)+" and environment='sandbox' and publication_status='published'"),'1');
    assert.equal(query("select count(*) from public.access_grants where user_id="+lit(actors.buyer1.id)),'0');`,{overrides:context});
  });
  await check('merch combined later helper source setup and sequential SQL across mode handoffs',async()=>{
   const parse=text=>{const line=text.split('\n').findLast(x=>x.startsWith('{')||x.startsWith('['));return line?JSON.parse(line):null;};
   let count=0;
   const sequentialRace=async(label,first,second,{error,afterBlocked=''}={})=>{
    count++;const firstResult=parse(db.query('begin;'+first+afterBlocked+'commit;'));
    if(error){assert.throws(()=>db.query('begin;'+second+'commit;'),error,label);return {first:firstResult,second:null};}
    return {first:firstResult,second:parse(db.query('begin;'+second+'commit;'))};
   };
   await run('merch-return-cases-concurrency-postgres',source=>[
    nativeSpan(source,'  '+eventStart,'  const opened=await race(').replace(nativeFunction(source,'race'),''),
   ],`const observerAccounts=await seedAutomaticCommerceObserverFixture({query,lit});
    for(const expired of [false,true])await prepareAutomaticCommerceObserverSkipLockedFixture({query,lit,accounts:observerAccounts,expired});
    await runAutomaticCommerceObserverLeaseRaces({query,race,lit,account:observerAccounts[0]});
    assert.equal(query("select count(*) from public.creator_payout_accounts where id in("+observerAccounts.map(lit).join(',')+") and provider_configuration_status='unknown' and provider_live_observation is null"),'6');
    query("update public.platform_money_kill_switches set state='off' where key='live_money_enabled'");
    await runMerchCheckoutDispatchRaces({query,rpc,race,auth,actors,lit,json,sequentialReplay:true});
    await runMerchLiveCheckoutRaces({query,race,auth,actors,lit,json,sequentialReplay:true});
    await runMerchPublicationRaces({query,race,auth,actors,lit});
    await runMerchTaxCategoryRaces({query,race,auth,actors,lit});
    await runAutomaticCommerceAuthorityRaces({query,race,lit});
    assert.equal(await runOrdinaryNativeDispatchRaces({query,race,lit,sequentialReplay:true}),153);`,
   {overrides:{race:sequentialRace,seedAutomaticCommerceObserverFixture,prepareAutomaticCommerceObserverSkipLockedFixture,runAutomaticCommerceObserverLeaseRaces}});
   assert.equal(count,190,'2 nested observer + 12 checkout + 6 live + 6 publication + 5 category + 6 authority + 153 ordinary sequential operations, plus one non-concurrent Auth control');
  });
  t.diagnostic('All executed code above is actual native setup/source SQL; independent native schedules remain REQUIRED and unrun here.');
 }finally{await db.close();}
});
