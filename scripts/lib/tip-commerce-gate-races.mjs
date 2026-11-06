// Actual production RPCs in the caller's owned disposable full-schema clone.
// All provider facts are synthetic. No HTTP, payment, grant or payout occurs.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {commerceSeedAdapter,seedCommerceBuyer,assertBuyerHasNoPremium} from '../../tests/helpers/automatic-commerce-fixture.mjs';

export async function runTipCommerceGateRaces({query,session,until,lit,actors,roots=['receipt','reservation']}) {
  const db=commerceSeedAdapter(query),creator=actors.creator.id;
  const capability='ef000000-0000-4000-8000-000000000001';
  const service=`set local role service_role;set local request.jwt.claims='{"role":"service_role"}';set local request.headers='{"x-chillywood-platform":"ios"}';`;
  const invoke=sql=>`begin;${service}${sql};commit;`;
  const parse=output=>JSON.parse(output.split('\n').findLast(line=>line.startsWith('{')));
  const gate='select private.lock_ordinary_commerce_authority_gate();';
  let checks=0;
  async function fixture() {
    const buyer=await seedCommerceBuyer(db),tip=randomUUID(),request=randomUUID(),suffix=randomUUID().replaceAll('-','');
    await assertBuyerHasNoPremium(db,buyer);
    query(`insert into event_reservation_fixture.actors values(${lit(buyer.id)},${lit(buyer.session)},${lit('buyer_gate_'+suffix)});
      insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
      values(${lit(capability)},${lit(buyer.id)},${lit(buyer.session)},'synthetic trusted native gate-race route',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '10 minutes');`);
    const quote={tipId:tip,creatorId:creator,amountCents:299,currency:'usd',providerAccountId:'acct_fixture',capabilityId:capability,body:{
      client_reference_id:tip,'metadata[chillywood_tip_id]':tip,'metadata[fan_user_id]':buyer.id,'metadata[creator_user_id]':creator,
      'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':299,
      'payment_intent_data[transfer_data][destination]':'acct_fixture','payment_method_types[0]':'card',mode:'payment',expires_at:Math.floor(Date.now()/1000)+3600}};
    const checkout='cs_test_gate'+suffix,intent='pi_gate'+suffix,event='evt_tipGate'+suffix,attempt=randomUUID();
    const reserve=`select public.reserve_creator_tip_checkout_attempt(${lit(buyer.id)},${lit(buyer.session)},${lit(request)},${lit(JSON.stringify(quote))}::jsonb)`;
    const receipt=`select public.record_creator_tip_checkout_session(${lit(buyer.id)},${lit(buyer.session)},${lit(request)},${lit(checkout)},${lit(intent)})`;
    const facts={event_livemode:false,event_account:null,object_livemode:false,amount_cents:299,currency:'usd',payment_intent_id:intent,
      metadata_tip_id:tip,metadata_sender_id:buyer.id,metadata_creator_id:creator,object_type:'checkout.session',object_id:checkout,
      client_reference_id:tip,object_status:'complete',checkout_mode:'payment',payment_status:'unpaid'};
    const webhook=`select public.process_stripe_tip_webhook_lifecycle(${lit(event)},${lit(attempt)},${lit(tip)},${lit(JSON.stringify(facts))}::jsonb,'{"metadata":{"provider_completion_exact":true}}','{}')`;
    return {buyer,tip,request,checkout,intent,event,attempt,reserve,receipt,webhook};
  }
  async function blocked(holder,waiter,label) {
    await until(()=>query(`select count(*) from pg_stat_activity h join pg_stat_activity w on w.application_name=${lit(waiter.name)}
      where h.application_name=${lit(holder.name)} and h.datname=current_database() and w.datname=current_database()
      and h.pid=any(pg_blocking_pids(w.pid)) and exists(select 1 from pg_locks l where l.pid=w.pid
        and l.locktype='advisory' and not l.granted and l.classid=176214 and l.objid=32 and l.objsubid=2)`)==='1',
    `${label}: no observed canonical commerce gate blocking edge`);
    const evidence=JSON.parse(query(`select jsonb_build_object('holderPid',h.pid,'waiterPid',w.pid,'blockers',pg_blocking_pids(w.pid))
      from pg_stat_activity h join pg_stat_activity w on w.application_name=${lit(waiter.name)}
      where h.application_name=${lit(holder.name)} and h.datname=current_database() and w.datname=current_database()`));
    assert.notEqual(evidence.holderPid,evidence.waiterPid);assert.ok(evidence.blockers.includes(evidence.holderPid));
    console.log(JSON.stringify({schedule:label,gate:[176214,32],...evidence}));
  }
  async function schedule(label,{first,second,outcome,beforeFirst='',probe=''}) {
    // In gate-first schedules the first transaction pauses AFTER its canonical
    // gate, BEFORE its production operation. The peer must not own source rows.
    // The fixture postgres session owns this scheduling barrier. The private
    // helper stays revoked from service_role; actual RPCs still run as service.
    const holder=session(`tip-gate-holder-${checks}`,`begin;${beforeFirst}${service}${beforeFirst?'':first+';'}select 'TIP_GATE_READY';`);
    let waiter;
    try {
      await until(()=>holder.output().includes('TIP_GATE_READY'),`${label}: first transaction not ready`);
      waiter=session(`tip-gate-waiter-${checks}`,invoke(second));waiter.child.stdin.end();
      await blocked(holder,waiter,label);
      if(probe) {
        // NOWAIT is positive absence-of-prelock proof, not a timer or inference
        // from a final row value. Exact predecessor mutants fail this assertion.
        assert.doesNotThrow(()=>query(`begin;set local lock_timeout='1s';${probe};rollback;`),
          `${label}: actual RPC owns source row before canonical gate`);
      }
      holder.child.stdin.end(`${beforeFirst?first+';':''}${outcome};\n`);
      const a=await holder.done,b=await waiter.done;
      assert.equal(a.code,0,`${label}: ${a.stderr}`);assert.equal(b.code,0,`${label}: ${b.stderr}`);
      checks++;return {first:parse(a.stdout),second:parse(b.stdout)};
    } finally {
      for(const s of [holder,waiter].filter(Boolean))if(s.child.exitCode===null){
        if(!s.child.stdin.writableEnded)s.child.stdin.end('rollback;\n');
        s.child.kill('SIGTERM');await s.done;
      }
    }
  }
  if(roots.includes('receipt'))for(const retired of [false,true])for(const receiptFirst of [true,false])for(const outcome of ['commit','rollback']) {
    const f=await fixture();assert.equal(parse(query(invoke(f.reserve))).tipId,f.tip);
    if(retired)query(`update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=${lit(f.buyer.session)}`);
    const lease=parse(query(invoke(`select public.reserve_stripe_tip_webhook_event(${lit(f.event)},'checkout.session.completed',repeat('d',64),${lit(f.attempt)})`)));
    assert.equal(lease.disposition,'claimed');
    const label=`${retired?'retired':'active'} receipt ${receiptFirst?'before':'after'} webhook ${outcome}`;
    const result=await schedule(label,{first:receiptFirst?f.receipt:f.webhook,second:receiptFirst?f.webhook:f.receipt,outcome,
      beforeFirst:receiptFirst?'':gate,
      probe:receiptFirst?'':`select 1 from private.creator_tip_checkout_attempts where buyer_id=${lit(f.buyer.id)} and request_id=${lit(f.request)} for update nowait;
        select 1 from public.creator_tip_transactions where id=${lit(f.tip)} for update nowait`});
    const row=JSON.parse(query(`select jsonb_build_object('status',status,'session',provider_checkout_session_id,'intent',provider_payment_intent_id,
      'payment',payment_status,'payout',payout_status,'paidAt',paid_at) from public.creator_tip_transactions where id=${lit(f.tip)}`));
    const recorded=!receiptFirst||outcome==='commit';
    assert.equal(row.session,recorded?f.checkout:null);assert.equal(row.intent,recorded?f.intent:null);
    assert.equal(row.status,recorded&&!retired?'checkout_started':'pending','retired receipt records fact without new admission');
    assert.equal(row.payment,'pending');assert.equal(row.payout,'not_payable');assert.equal(row.paidAt,null);
    const projected=receiptFirst?result.second:result.first;
    assert.ok(['tip_provider_identity_pending','tip_payment_pending'].includes(projected.reason),JSON.stringify(projected));
    await assertBuyerHasNoPremium(db,f.buyer);
  }
  if(roots.includes('reservation'))for(const target of ['provider','eligibility'])for(const reservationFirst of [true,false])for(const outcome of ['commit','rollback']) {
    const f=await fixture();
    // Harmless real authority-row updates isolate lock order without injecting
    // fake provider verification or changing the admission result mid-schedule.
    const table=target==='provider'?'public.creator_payout_accounts':'public.creator_payout_eligibility_records';
    const condition=`creator_user_id=${lit(creator)}`+(target==='provider'?" and provider='stripe_connect' and provider_environment='test'":'');
    assert.equal(query(`select count(*) from ${table} where ${condition}`),'1');
    const mutation=`update ${table} set updated_at=updated_at where ${condition};select jsonb_build_object('mutation',${lit(target)})`;
    const label=`reservation ${reservationFirst?'before':'after'} ${target} mutation ${outcome}`;
    const result=await schedule(label,{first:reservationFirst?f.reserve:mutation,second:reservationFirst?mutation:f.reserve,outcome,
      beforeFirst:reservationFirst?'':gate,
      probe:reservationFirst?'':`select 1 from public.creator_payout_accounts where creator_user_id=${lit(creator)} and provider='stripe_connect' and provider_environment='test' for update nowait;
        select 1 from public.creator_payout_eligibility_records where creator_user_id=${lit(creator)} for update nowait`});
    assert.equal((reservationFirst?result.first:result.second).tipId,f.tip);
    const persisted=!reservationFirst||outcome==='commit';
    assert.equal(query(`select count(*) from public.creator_tip_transactions where id=${lit(f.tip)}`),persisted?'1':'0');
    assert.equal(query(`select count(*) from private.creator_tip_checkout_attempts where buyer_id=${lit(f.buyer.id)} and request_id=${lit(f.request)}`),persisted?'1':'0');
    if(persisted)assert.equal(query(`select status='pending' and payment_status='pending' and payout_status='not_payable'
      and provider_checkout_session_id is null and paid_at is null from public.creator_tip_transactions where id=${lit(f.tip)}`),'t');
    await assertBuyerHasNoPremium(db,f.buyer);
  }
  assert.equal(checks,8*roots.length,'eight real PostgreSQL schedules per tip root');
  return checks;
}
