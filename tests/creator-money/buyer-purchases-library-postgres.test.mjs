import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createDatabase } from '../helpers/database-runtime-authority-fixture.mjs';

// Full migration replay and real current-session guards. Provider transport and
// managed infrastructure are local doubles. Fixture rows are synthetic; replica
// mode is used only to seed historical states without pretending to charge.
test('owner purchase library executes current SQL across modes, history and denied authority', { timeout: 240_000 }, async () => {
  const { db, replayReport } = await createDatabase({ includeHeldStudio: true, implicitApiGrants: false });
  const id = n => `b1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const buyer = id(1), other = id(2), creator = id(3), session = id(4), otherSession = id(5);
  const one = async (sql, values = []) => (await db.query(sql, values)).rows[0];
  const claims = (user = buyer, sid = session) => ({ role: 'authenticated', sub: user, session_id: sid });
  async function read(limit = 50, cursor = null, user = buyer, sid = session, sourceType = null, sourceId = null) {
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims(user, sid))]);
    await db.exec('set role authenticated');
    try { return (await one('select public.read_my_creator_purchases($1,$2,$3,$4,$5) result', [limit, cursor?.createdAt ?? null, cursor?.id ?? null,sourceType,sourceId])).result; }
    finally { await db.exec('reset role'); }
  }
  async function seed(fn) {
    await db.exec('set session_replication_role=replica');
    try { await fn(); } finally { await db.exec('set session_replication_role=origin'); }
  }
  const modes = [
    ['creator_tip', 'creator_tip', 'creator_channel'], ['paid_content', 'paid_content_access', 'creator_video'],
    ['watch_party_live', 'watch_party_live_ticket', 'watch_party'], ['event', 'event_pass', 'creator_event'],
    ['channel_subscription', 'channel_subscription', 'channel_subscription'], ['vip_pass', 'vip_pass', 'vip_pass'],
    ['live_watch_party_access', 'live_watch_party_access_pass', 'live_stage'], ['live_watch_party_seat', 'live_watch_party_seat_pass', 'live_stage'],
  ];
  const rows = [];
  try {
    assert.ok(replayReport.files.includes('20261026164625_buyer_creator_purchases_library.sql'));
    await seed(async () => {
      for (const user of [buyer, other, creator]) await db.query('insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,$2,now(),false,false)', [user, `wallet-${user}@example.test`]);
      await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)', [session, buyer, otherSession, other]);
      for (const [user, sid] of [[buyer, session], [other, otherSession]]) await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
        select $1::uuid,public.wave1_sha256($1::text),document_key,version,market,'member',capability,$2,'service_reconciliation'
        from public.wave1_legal_document_versions where active and market='UNITED_STATES' and capability='account'`, [user, sid]);
      for (let n = 0; n < modes.length; n++) {
        const [sourceType, productType, kind] = modes[n];
        const product = await one(`select * from public.monetization_products where product_type=$1 and provider='revenuecat_google_play' and environment='sandbox' order by id limit 1`, [productType]);
        assert.ok(product, `real catalog fixture ${productType}`);
        const row = { n, sourceType, productType, kind, product, intent: id(100+n), source: sourceType === 'creator_tip' ? creator : id(200+n), receipt: id(300+n), grant: id(400+n), ledger: id(500+n), original: `wallet-original-${n}` };
        rows.push(row);
        await db.query(`insert into public.money_purchase_intents(id,user_id,product_id,product_key,product_type,provider,provider_product_id,source_type,source_id,creator_id,environment,status,amount_minor,currency,idempotency_key,expires_at,consumed_at,created_at,session_generation)
          values($1,$2,$3,$4,$5,'revenuecat_google_play',$6,$7,$8,$9,'sandbox','consumed',99,'usd',$10,now()+interval '1 hour',now(),now()-interval '1 day',$11)`,
        [row.intent,buyer,product.id,product.product_key,productType,product.provider_product_id,sourceType,row.source,creator,`wallet-intent-${n}`,session]);
        const terms = { startsAt: '2026-01-01T20:00:00Z', [sourceType === 'event' ? 'description' : 'includes']: 'Exact item only', destination: { type: kind === 'watch_party' ? 'party_room' : kind, id: `wallet-room-${n}` }, secretFixtureMustNotLeak: 'PRIVATE', signedMedia: 'https://invalid.example/private' };
        await db.query(`insert into public.creator_money_purchase_quotes values($1,$2,$3,$4,$5,99,'usd','revenuecat_google_play',$6,'sandbox',$7,$8,now()-interval '1 day',now()+interval '1 hour')`,
          [row.intent,buyer,creator,sourceType,row.source,product.provider_product_id,`Original title ${n}`,JSON.stringify(terms)]);
        await db.query(`insert into public.provider_events(id,provider_event_id,provider,product_id,product_key,user_id,app_user_id,environment,event_type,status,occurred_at,idempotency_key,raw_payload_hash,metadata)
          values($1,$2,'revenuecat_google_play',$3,$4,$5,$6,'sandbox','NON_RENEWING_PURCHASE','processed',now()-interval '1 hour',$2,repeat('a',64),$7)`,
          [row.receipt,`wallet-event-${n}`,product.id,product.product_key,buyer,buyer,JSON.stringify({purchase_intent_id:row.intent,provider_product_id:product.provider_product_id,original_transaction_id:row.original})]);
        await db.query(`insert into public.access_grants(id,user_id,grant_type,source_type,source_id,product_id,provider,provider_event_id,environment,status,starts_at,expires_at,metadata)
          values($1,$2,$3,'provider_event',$4,$5,'revenuecat_google_play',$6,'sandbox','sandbox_only',now()-interval '1 hour',now()+interval '1 day',$7)`,
          [row.grant,buyer,productType === 'creator_tip' ? 'creator_tip_record' : productType,row.source,product.id,row.receipt,JSON.stringify({purchase_intent_id:row.intent,original_transaction_id:row.original})]);
        await db.query(`insert into public.money_access_ledger_events(id,user_id,creator_id,product_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,source_id,metadata)
          values($1,$2,$3,$4,$5,'NON_RENEWING_PURCHASE',99,'usd','sandbox','not_payable','sandbox_only',$6,$7,$8)`,
          [row.ledger,buyer,creator,product.id,row.receipt,sourceType,row.source,JSON.stringify({purchase_intent_id:row.intent,original_transaction_id:row.original})]);
      }
      await db.query(`insert into public.creator_events(id,host_user_id,event_title,event_type,status,starts_at) values($1,$2,'Current changed title','live_first','scheduled',now()+interval '2 days')`, [rows[3].source,creator]);
      await db.query(`insert into public.creator_event_offer_revisions(id,offer_id,creator_event_id,creator_id,revision,terms)
        values($1,$2,$3,$4,1,$5)`,[id(920),id(921),rows[3].source,creator,JSON.stringify({title:'Original title 3',description:'Exact item only',priceCents:99,currency:'usd',startsAt:'2026-01-01T20:00:00Z',timeZone:'America/New_York',attendance:'virtual',replayPolicy:'none'})]);
      await db.query(`insert into public.event_ticket_reservations(id,purchase_intent_id,revision_id,buyer_id,creator_event_id,offer_id,state,expires_at,access_grant_id)
        values($1,$2,$3,$4,$5,$6,'fulfilled',now()+interval '1 hour',$7)`,[id(922),rows[3].intent,id(920),buyer,rows[3].source,id(921),rows[3].grant]);
      await db.query(`insert into public.paid_creator_event_passes(id,event_id,creator_event_id,buyer_id,creator_id,access_grant_id)
        values($1,$2,$3,$4,$5,$6)`,[id(924),id(921),rows[3].source,buyer,creator,rows[3].grant]);
      await db.query(`insert into public.creator_event_purchase_remedies(id,event_id,buyer_id,pass_id,access_grant_id,purchase_intent_id,reason)
        values($1,$2,$3,$4,$5,$6,'material_schedule_change'),($7,$2,$8,$4,$5,$6,'event_canceled')`,
        [id(925),rows[3].source,buyer,id(924),rows[3].grant,rows[3].intent,id(926),other]);
    });
    const result = await read();
    assert.equal(result.userId,buyer); assert.equal(result.items.length,8); assert.equal(result.nextCursor,null);
    for (const row of rows) {
      const item=result.items.find(item=>item.id===row.intent);
      assert.equal(item.sourceType,row.sourceType); assert.equal(item.productType,row.productType);
      assert.equal(item.title,`Original title ${row.n}`); assert.equal(item.amountMinor,99); assert.equal(item.currency,'usd');
      assert.equal(item.status,row.sourceType==='creator_tip'?'completed':row.sourceType==='event'?'upcoming':'active');
      assert.equal(item.destination.kind,row.kind); assert.equal(item.grantsAccess,false); assert.equal(item.termsAvailable,true);
      assert.equal(item.terms.includeText,'Exact item only','receipt retains original inclusions across mode-specific quote fields');
      assert.equal(item.receipt.originalTransactionId,row.original);
    }
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE|signedMedia|invalid\.example/);
    const first=await read(3), second=await read(3,first.nextCursor), third=await read(3,second.nextCursor);
    assert.equal(new Set([...first.items,...second.items,...third.items].map(item=>item.id)).size,8);
    assert.equal(third.nextCursor,null);
    const exactEvent=await read(50,null,buyer,session,'event',rows[3].source);
    assert.equal(exactEvent.items.length,1); assert.equal(exactEvent.items[0].id,rows[3].intent);
    assert.equal(exactEvent.items[0].terms.timeZone,'America/New_York');
    assert.equal(exactEvent.items[0].terms.startsAt,'2026-01-01T20:00:00Z');
    assert.notEqual(exactEvent.items[0].startsAt,exactEvent.items[0].terms.startsAt,'current schedule cannot rewrite purchased schedule');
    assert.deepEqual(exactEvent.items[0].refundEligibility.reasons,['material_schedule_change']);
    assert.equal(exactEvent.items[0].refundEligibility.eligibility,'eligible');
    assert.equal(exactEvent.items[0].refundEligibility.status,'provider_review_required');
    assert.equal(exactEvent.items[0].status,'upcoming','eligibility does not mark the purchase refunded');
    assert.equal((await read(50,null,other,otherSession,'event',rows[3].source)).items.length,0);
    assert.equal((await read(50,null,other,otherSession)).items.length,0,'a different current account sees no purchases');
    await assert.rejects(read(50,null,buyer,otherSession),/buyer_purchase_history_authority_required/);
    await assert.rejects(read(101),/buyer_purchase_history_cursor_invalid/);
    await assert.rejects(read(50,{createdAt:result.items[0].createdAt,id:null}),/buyer_purchase_history_cursor_invalid/);

    await seed(async()=>{
      await db.query("update public.access_grants set status='refunded',refunded_at=now() where id=$1",[rows[1].grant]);
      await db.query("update public.access_grants set status='revoked',revoked_at=now() where id=$1",[rows[2].grant]);
      await db.query("update public.access_grants set expires_at=now()-interval '1 second' where id=$1",[rows[4].grant]);
      await db.query('delete from public.access_grants where id=$1',[rows[5].grant]);
      await db.query('update public.access_grants set user_id=$1 where id=$2',[other,rows[6].grant]);
      await db.query(`update public.access_grants set metadata=jsonb_set(metadata,'{original_transaction_id}','"wrong-original"'),provider_event_id=$1 where id=$2`,[rows[1].receipt,rows[7].grant]);
    });
    const history=await read();
    const state=n=>history.items.find(item=>item.id===rows[n].intent).status;
    assert.equal(state(1),'refunded'); assert.equal(state(2),'revoked'); assert.equal(state(4),'expired');
    assert.equal(state(5),'paid_unfulfilled'); assert.equal(state(6),'paid_unfulfilled'); assert.equal(state(7),'paid_unfulfilled');
    await seed(async()=>{
      for(const [offset,status] of [[600,'pending'],[601,'failed'],[602,'cancelled'],[603,'expired'],[604,'pending']]) {
        const base=rows[1];
        await db.query(`insert into public.money_purchase_intents(id,user_id,product_id,product_key,product_type,provider,provider_product_id,source_type,source_id,creator_id,environment,status,amount_minor,currency,idempotency_key,expires_at,created_at,session_generation)
          values($1,$2,$3,$4,'paid_content_access','revenuecat_google_play',$5,'paid_content',$6,$7,'sandbox',$8,99,'usd',$9,now()+interval '1 hour',now(),$10)`,
        [id(offset),buyer,base.product.id,base.product.product_key,base.product.provider_product_id,base.source,creator,status,`wallet-recovery-${offset}`,session]);
      }
      // Signed denied charge with an exact intent and two deliveries for the same
      // unbound original. Only the first unbound history identity is displayed.
      for(const [event,obligation,intent,original] of [[900,901,id(604),'bound-denial'],[910,911,null,'unbound-original'],[912,913,null,'unbound-original']]) {
        const product=rows[1].product;
        await db.query(`insert into public.provider_events(id,provider_event_id,provider,product_id,product_key,user_id,app_user_id,environment,event_type,status,idempotency_key,metadata)
          values($1,$2,'revenuecat_google_play',$3,$4,$5,$6,'sandbox','NON_RENEWING_PURCHASE','ignored',$2,$7)`,
        [id(event),`wallet-denied-${event}`,product.id,product.product_key,buyer,buyer,JSON.stringify({purchase_intent_id:intent,provider_product_id:product.provider_product_id,original_transaction_id:original})]);
        await db.query(`insert into public.revenuecat_provider_reconciliation_obligations(id,provider_event_id,purchase_intent_id,user_id,creator_id,provider,provider_product_id,original_transaction_id,event_type,environment,reported_amount_minor,reported_currency,reason)
          values($1,$2,$3,$4,$5,'revenuecat_google_play',$6,$7,'NON_RENEWING_PURCHASE','sandbox',99,'usd','synthetic_authority_denial')`,
        [id(obligation),id(event),intent,buyer,creator,product.provider_product_id,original]);
      }
      await db.query(`insert into public.creator_tip_transactions(id,sender_id,creator_id,tip_amount_cents,total_paid_cents,currency,provider,payment_status,status,provider_environment,provider_payment_intent_id,paid_at)
        values($1,$2,$3,149,149,'usd','stripe_connect','succeeded','paid','test','pi_synthetic_wallet',now())`,[id(930),buyer,creator]);
      const base=rows[0];
      await db.query(`insert into public.provider_events(id,provider_event_id,provider,product_id,product_key,user_id,app_user_id,environment,event_type,status,idempotency_key,metadata)
        select $1,'wallet-duplicate-original',provider,product_id,product_key,user_id,app_user_id,environment,event_type,'processed','wallet-duplicate-original',metadata from public.provider_events where id=$2`,[id(940),base.receipt]);
      const premium=await one("select * from public.monetization_products where product_type='premium_subscription' limit 1");
      await db.query(`insert into public.provider_events(id,provider_event_id,provider,product_id,product_key,user_id,app_user_id,environment,event_type,status,idempotency_key,metadata)
        values($1,'wallet-premium','revenuecat_google_play',$2,$3,$4,$5,'sandbox','INITIAL_PURCHASE','processed','wallet-premium','{}')`,[id(950),premium.id,premium.product_key,buyer,buyer]);
      await db.query(`insert into public.money_access_ledger_events(id,user_id,creator_id,product_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,source_id)
        values($1,$2,$3,$4,$5,'INITIAL_PURCHASE',99,'usd','sandbox','not_payable','sandbox_only','paid_content',$6)`,[id(951),buyer,creator,premium.id,id(950),rows[1].source]);
      const video=rows[1].product;
      for(const [event,ledger] of [[960,962],[961,963]]) {
        await db.query(`insert into public.provider_events(id,provider_event_id,provider,product_id,product_key,user_id,app_user_id,environment,event_type,status,idempotency_key,metadata)
          values($1,$2,'revenuecat_google_play',$3,$4,$5,$6,'sandbox','INITIAL_PURCHASE','processed',$2,$7)`,
          [id(event),`legacy-video-${event}`,video.id,video.product_key,buyer,buyer,JSON.stringify({original_transaction_id:'legacy-video-original',provider_product_id:video.provider_product_id})]);
        await db.query(`insert into public.money_access_ledger_events(id,user_id,creator_id,product_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,source_id)
          values($1,$2,$3,$4,$5,'INITIAL_PURCHASE',299,'usd','sandbox','not_payable','sandbox_only','paid_content',$6)`,[id(ledger),buyer,creator,video.id,id(event),id(964)]);
      }
      await db.query(`insert into public.access_grants(id,user_id,grant_type,source_type,source_id,product_id,provider,provider_event_id,environment,status,starts_at,metadata)
        values($1,$2,'paid_content_access','provider_event',$3,$4,'revenuecat_google_play',$5,'sandbox','sandbox_only',now()-interval '1 hour',$6)`,
        [id(965),buyer,id(964),video.id,id(960),JSON.stringify({original_transaction_id:'legacy-video-original'})]);
      await db.query('update public.revenuecat_provider_reconciliation_obligations set reported_amount_minor=199 where id=$1',[id(901)]);
      await db.query('update public.revenuecat_provider_reconciliation_obligations set reported_amount_minor=null where id in ($1,$2)',[id(911),id(913)]);
    });
    const recovery=await read();
    for(const [offset,status] of [[600,'pending'],[601,'failed'],[602,'canceled'],[603,'expired'],[604,'reconciliation_required']]) {
      const item=recovery.items.find(item=>item.id===id(offset));
      assert.equal(item.status,status); assert.equal(item.termsAvailable,false); assert.equal(item.title,null);
    }
    await seed(async()=>{
      await db.query("update public.money_purchase_intents set checkout_attempt_id=$1,checkout_started_at=now(),expires_at=now()-interval '1 hour' where id=$2",[id(610),id(600)]);
      await db.query("update public.money_purchase_intents set checkout_attempt_id=$1,checkout_started_at=now() where id=$2",[id(611),id(603)]);
    });
    const unresolved=await read();
    for(const offset of [600,603]){
      const item=unresolved.items.find(item=>item.id===id(offset));
      assert.equal(item.status,'pending','a started checkout remains unresolved after intent expiry');
      assert.equal(item.receipt,null);assert.equal(item.grantsAccess,false);
    }
    const unbound=recovery.items.filter(item=>item.receipt?.originalTransactionId==='unbound-original');
    assert.equal(unbound.length,1); assert.equal(unbound[0].id,id(911));
    assert.equal(unbound[0].status,'reconciliation_required'); assert.equal(unbound[0].destination,null); assert.equal(unbound[0].sourceId,null);
    assert.equal(unbound[0].amountMinor,null); assert.equal(unbound[0].currency,null,'partial historical economics are unavailable together');
    assert.equal(recovery.items.find(item=>item.id===id(604)).amountMinor,99);
    assert.equal(recovery.items.find(item=>item.id===id(604)).receipt.reportedAmountMinor,199,'provider-reported charge is distinct from agreed price');
    assert.equal(recovery.items.find(item=>item.id===id(930)).status,'completed');
    assert.equal(recovery.items.find(item=>item.id===id(930)).amountMinor,149);
    assert.equal(recovery.items.filter(item=>item.receipt?.originalTransactionId===rows[0].original).length,1,'restored/duplicate original remains one intent');
    assert.equal(recovery.items.some(item=>item.id===id(951)),false,'Premium receipts are not creator purchases');
    const legacy=recovery.items.filter(item=>item.receipt?.originalTransactionId==='legacy-video-original');
    assert.equal(legacy.length,1); assert.equal(legacy[0].id,id(962)); assert.equal(legacy[0].amountMinor,299);
    assert.equal(legacy[0].termsAvailable,false); assert.equal(legacy[0].purchaseIntentId,null); assert.equal(legacy[0].status,'active');
    await seed(async()=>{ await db.query("update public.creator_events set status='ended' where id=$1",[rows[3].source]); });
    assert.equal((await read(50,null,buyer,session,'event',rows[3].source)).items[0].status,'completed','live-only ended event is not active forever');
    await seed(async()=>{ await db.query("update public.creator_events set status='replay_available' where id=$1",[rows[3].source]); });
    assert.equal((await read(50,null,buyer,session,'event',rows[3].source)).items[0].status,'completed','current replay flag does not amend live-only purchase terms');
    await seed(async()=>{ await db.query(`update public.creator_event_offer_revisions set terms=terms||jsonb_build_object('replayPolicy','until_expiration','replayAvailableAt',now()-interval '1 day','replayExpiresAt',now()-interval '1 second') where id=$1`,[id(920)]); });
    assert.equal((await read(50,null,buyer,session,'event',rows[3].source)).items[0].status,'expired','purchased replay expiry is enforced in history');
    await seed(async()=>{ await db.query(`update public.creator_event_offer_revisions set terms=terms||jsonb_build_object('replayExpiresAt',now()+interval '1 day') where id=$1`,[id(920)]); });
    assert.equal((await read(50,null,buyer,session,'event',rows[3].source)).items[0].status,'active','explicit current replay terms may be shown active but grant no media');
    await seed(async()=>{
      await db.query("update public.creator_events set status='canceled' where id=$1",[rows[3].source]);
    });
    assert.equal((await read(50,null,buyer,session,'event',rows[3].source)).items[0].status,'canceled','canceling an event is not a verified refund');
    await seed(async()=>{
      await db.query("update public.event_ticket_reservations set state='reconciliation_required' where id=$1",[id(922)]);
      await db.query("update public.revenuecat_provider_reconciliation_obligations set state='resolved_refund',resolution_reference_hash=repeat('b',64),resolved_at=now() where id=$1",[id(901)]);
    });
    const terminal=await read();
    assert.equal(terminal.items.find(item=>item.id===rows[3].intent).status,'paid_unfulfilled');
    assert.equal(terminal.items.find(item=>item.id===id(604)).status,'refunded');
    await seed(async()=>{ await db.query("update public.access_grants set status='refunded',refunded_at=now() where id=$1",[rows[3].grant]); });
    const refundedEvent=(await read(50,null,buyer,session,'event',rows[3].source)).items[0];
    assert.equal(refundedEvent.status,'refunded'); assert.equal(refundedEvent.refundEligibility,null,'verified refund supersedes pending review banner');
    await db.query('update auth.sessions set not_after=now()-interval \'1 second\' where id=$1',[session]);
    await assert.rejects(read(),/buyer_purchase_history_authority_required/);
    await seed(async()=>{
      await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[id(6),buyer]);
      await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
        select $1::uuid,public.wave1_sha256($1::text),document_key,version,market,'member',capability,$2,'service_reconciliation'
        from public.wave1_legal_document_versions where active and market='UNITED_STATES' and capability='account'`,[buyer,id(6)]);
    });
    assert.deepEqual((await read(50,null,buyer,id(6))).items.map(item=>item.id),terminal.items.map(item=>item.id),'new valid session recovers same owned purchase history');
    await db.query('update auth.sessions set not_after=null where id=$1',[session]);
    // An event can be canceled while its payment is still pending. Preserve
    // conditional intent eligibility, but do not advertise it until a verified
    // charged receipt/obligation exists; a fulfilled pass is not required.
    const lateIntent=id(980),lateReceipt=id(981),lateObligation=id(982);
    await seed(async()=>{
      await db.query(`insert into public.money_purchase_intents(id,user_id,product_id,product_key,product_type,provider,provider_product_id,source_type,source_id,creator_id,environment,status,amount_minor,currency,idempotency_key,expires_at,created_at,session_generation)
        select $1,user_id,product_id,product_key,product_type,provider,provider_product_id,source_type,source_id,creator_id,environment,'pending',amount_minor,currency,'wallet-event-late',now()+interval '1 hour',now(),session_generation
        from public.money_purchase_intents where id=$2`,[lateIntent,rows[3].intent]);
      await db.query(`insert into public.event_ticket_reservations(id,purchase_intent_id,revision_id,buyer_id,creator_event_id,offer_id,state,expires_at)
        values($1,$2,$3,$4,$5,$6,'held',now()+interval '1 hour')`,[id(983),lateIntent,id(920),buyer,rows[3].source,id(921)]);
      await db.query(`insert into public.creator_event_purchase_remedies(id,event_id,buyer_id,purchase_intent_id,reason)
        values($1,$2,$3,$4,'event_canceled')`,[id(984),rows[3].source,buyer,lateIntent]);
    });
    const lateItem=async()=> (await read(50,null,buyer,session,'event',rows[3].source)).items.find(item=>item.id===lateIntent);
    assert.equal((await lateItem()).status,'pending');assert.equal((await lateItem()).refundEligibility,null,'unpaid pending intent has no refund eligibility banner');
    await seed(async()=>{
      await db.query("update public.money_purchase_intents set status='expired',expires_at=now()-interval '1 hour' where id=$1",[lateIntent]);
      await db.query("update public.event_ticket_reservations set checkout_attempt_id=$1,checkout_started_at=now(),expires_at=now()-interval '1 hour' where purchase_intent_id=$2",[id(985),lateIntent]);
    });
    assert.equal((await lateItem()).status,'pending','a started event checkout keeps unknown payment separate from expired capacity');
    assert.equal((await lateItem()).refundEligibility,null);
    await seed(async()=>{
      const product=rows[3].product;
      await db.query(`insert into public.provider_events(id,provider_event_id,provider,product_id,product_key,user_id,app_user_id,environment,event_type,status,occurred_at,idempotency_key,raw_payload_hash,metadata)
        values($1,'wallet-event-late-receipt','revenuecat_google_play',$2,$3,$4::uuid,$4::text,'sandbox','NON_RENEWING_PURCHASE','ignored',now(),'wallet-event-late-receipt',repeat('a',64),$5)`,
        [lateReceipt,product.id,product.product_key,buyer,JSON.stringify({purchase_intent_id:lateIntent,provider_product_id:product.provider_product_id,original_transaction_id:'wallet-event-late-original'})]);
      await db.query("update public.event_ticket_reservations set state='reconciliation_required',reason='event_canceled' where purchase_intent_id=$1",[lateIntent]);
    });
    assert.equal((await lateItem()).refundEligibility,null,'ignored receipt alone is not an authoritative charged obligation');
    await seed(async()=>{
      await db.query(`insert into public.revenuecat_provider_reconciliation_obligations(id,provider_event_id,purchase_intent_id,user_id,creator_id,provider,provider_product_id,event_type,environment,reason)
        values($1,$2,$3,$4,$5,'revenuecat_google_play',$6,'NON_RENEWING_PURCHASE','sandbox','event_canceled')`,[lateObligation,lateReceipt,lateIntent,buyer,creator,rows[3].product.provider_product_id]);
    });
    const latePaid=await lateItem();assert.equal(latePaid.status,'reconciliation_required');
    assert.deepEqual(latePaid.refundEligibility.reasons,['event_canceled']);assert.equal(latePaid.grantsAccess,false);
    assert.equal((await one('select count(*)::int count from public.paid_creator_event_passes where creator_event_id=$1 and access_grant_id is null',[rows[3].source])).count,0);
    await seed(async()=>{await db.query('update public.revenuecat_provider_reconciliation_obligations set user_id=$1 where id=$2',[other,lateObligation]);});
    assert.equal((await lateItem()).refundEligibility,null,'wrong-owner obligation cannot establish eligibility');
    await seed(async()=>{await db.query('update public.revenuecat_provider_reconciliation_obligations set user_id=$1 where id=$2',[buyer,lateObligation]);});
    assert.equal((await read(50,null,other,otherSession,'event',rows[3].source)).items.length,0);
    await seed(async()=>{
      await db.query(`insert into public.money_purchase_intents(id,user_id,product_id,product_key,product_type,provider,provider_product_id,source_type,source_id,creator_id,environment,status,amount_minor,currency,idempotency_key,expires_at,created_at,session_generation)
        select ('b1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,user_id,product_id,product_key,product_type,provider,provider_product_id,source_type,source_id,creator_id,environment,'pending',amount_minor,currency,'wallet-page-'||n,now()+interval '1 hour',now(),session_generation
        from public.money_purchase_intents cross join generate_series(1000,1059) n where id=$1`,[rows[1].intent]);
    });
    assert.equal((await read()).items.some(item=>item.id===rows[3].intent),false,'old event is beyond the first wallet page');
    assert.equal((await read(50,null,buyer,session,'event',rows[3].source)).items.some(item=>item.id===rows[3].intent),true,'exact event filter is applied before pagination');
    const signature='public.read_my_creator_purchases(integer,timestamptz,uuid,text,uuid)';
    assert.equal((await one("select has_function_privilege('anon',$1,'EXECUTE') allowed",[signature])).allowed,false);
    assert.equal((await one("select has_function_privilege('service_role',$1,'EXECUTE') allowed",[signature])).allowed,false);
    assert.equal((await one("select has_function_privilege('authenticated',$1,'EXECUTE') allowed",[signature])).allowed,true);
    assert.equal((await one("select has_function_privilege('authenticated','public.read_my_creator_purchases_pre_event_remedies(integer,timestamptz,uuid,text,uuid)','EXECUTE') allowed")).allowed,false);
    const originalSQL=fs.readFileSync('supabase/migrations/20261026164625_buyer_creator_purchases_library.sql','utf8');
    const unsafeSQL=originalSQL.replace('where i."user_id"=v_user\n','where true\n');
    assert.notEqual(unsafeSQL,originalSQL,'negative control changes owner predicate');
    await db.exec(unsafeSQL);
    assert.ok((await read(50,null,other,otherSession)).items.length>0,'removing owner filter reproduces cross-account list leakage');
    await db.exec(originalSQL);
    assert.equal((await read(50,null,other,otherSession)).items.length,0);
  } finally { await db.close(); }
});
