import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

const migration = '20261027085833_creator_event_explicit_replay_terms.sql';
test('explicit replay policy preserves historical purchases and enforces new production event and offer writes', {timeout:240_000}, async t => {
  const {db} = await createDatabase({includeHeldStudio:true,implicitApiGrants:false,excludeMigrations:[migration]});
  let checks = 0, step = 'historical purchase fixture';
  const one = async (sql,args=[]) => Object.values((await db.query(sql,args)).rows[0])[0];
  const eq = (actual,expected,message) => {assert.deepEqual(actual,expected,message);checks++;};
  const deny = async (fn,pattern=/event_replay_explicit_window_required/) => {await assert.rejects(fn,pattern);checks++;};
  const claim = async actor => {await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers','{\"x-chillywood-platform\":\"ios\"}',false)",[JSON.stringify({role:'authenticated',sub:actor.user_id,session_id:actor.session_id})]);await db.exec('set role authenticated');};
  const service = async () => {await db.exec('reset role');await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");};
  const isolate = async fn => {await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}};
  try {
    await db.exec(fs.readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
    const actors = (await db.query('select * from event_reservation_fixture.actors')).rows;
    const host = actors.find(a=>a.kind==='creator'),buyer = actors.find(a=>a.kind==='buyer14');
    const pendingBuyer = actors.find(a=>a.kind==='buyer15'),newBuyer = actors.find(a=>a.kind==='buyer16');
    const heldBuyer = actors.find(a=>a.kind==='buyer17');
    const historical = await one("select id from event_reservation_fixture.events where name='show14'");
    const fresh = await one("select id from event_reservation_fixture.events where name='show13'");
    // The shared fixture defaults private. First-store-call authority also
    // requires these synthetic buyers to be able to view the event page.
    await service();await db.query("update public.creator_events set visibility='public' where id in($1,$2)",[historical,fresh]);
    const offer = async id => one("select public.configure_paid_creator_event_sale($1,'Live show and stated replay terms',99,5,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day')",[id]);
    await service();await db.query("update public.creator_events set replay_policy='indefinite' where id=$1",[historical]);
    await claim(host);const oldOffer = await offer(historical);
    await claim(buyer);const intent = await one('select public.create_reserved_creator_event_purchase_intent($1,$2)',[oldOffer.id,oldOffer.termsRevisionId]);
    await claim(pendingBuyer);const pendingIntent = await one('select public.create_reserved_creator_event_purchase_intent($1,$2)',[oldOffer.id,oldOffer.termsRevisionId]);
    const priorClaim = await one('select public.begin_creator_event_checkout($1,gen_random_uuid())',[pendingIntent.id]);
    eq(priorClaim.startAuthorized,true,'a pre-policy dispatch can legitimately have an unknown store outcome');
    await claim(heldBuyer);const heldIntent = await one('select public.create_reserved_creator_event_purchase_intent($1,$2)',[oldOffer.id,oldOffer.termsRevisionId]);
    await service();const receipt = await one("select public.process_revenuecat_app_store_event_atomic('historical-replay-paid','NON_RENEWING_PURCHASE',$1,$2,'sandbox',now(),null,99,'usd',repeat('d',64),'historical-replay-original',null,$3)",[buyer.user_id,intent.providerProductId,intent.createdAt]);
    eq(receipt.status,'processed','actual receipt issues the historical ticket');
    const original = await one('select terms from public.creator_event_offer_revisions where id=$1',[oldOffer.termsRevisionId]);
    const originalPass = await one('select row_to_json(p) from public.paid_creator_event_passes p where creator_event_id=$1 and buyer_id=$2',[historical,buyer.user_id]);
    await db.exec(fs.readFileSync(`supabase/migrations/${migration}`,'utf8'));
    step = 'historical rights after forward migration';
    eq(await one('select terms from public.creator_event_offer_revisions where id=$1',[oldOffer.termsRevisionId]),original,'original purchase terms are byte-for-byte JSON unchanged');
    eq(await one('select row_to_json(p) from public.paid_creator_event_passes p where creator_event_id=$1 and buyer_id=$2',[historical,buyer.user_id]),originalPass,'existing pass identity, rights and history unchanged');
    await claim(heldBuyer);await deny(()=>one('select public.begin_creator_event_checkout($1,gen_random_uuid())',[heldIntent.id]));
    await service();eq(await one('select checkout_attempt_id from public.event_ticket_reservations where purchase_intent_id=$1',[heldIntent.id]),null,'pre-policy held intent receives no new store-dispatch authority');
    await isolate(async()=>{
      await db.exec('alter table public.event_ticket_reservations disable trigger guard_event_checkout_explicit_replay_terms');
      await claim(heldBuyer);const unsafe = await one('select public.begin_creator_event_checkout($1,gen_random_uuid())',[heldIntent.id]);
      eq(unsafe.startAuthorized,true,'negative control reproduces first dispatch on an old held intent without claim guard');
    });
    await claim(pendingBuyer);const retry = await one('select public.begin_creator_event_checkout($1,$2)',[pendingIntent.id,priorClaim.checkoutAttemptId]);
    eq(retry.startAuthorized,false,'already dispatched uncertain checkout never authorizes a second store call');
    eq(retry.checkoutAttemptId,priorClaim.checkoutAttemptId,'already dispatched claim keeps exact identity');
    await service();
    const pendingReceipt = await one("select public.process_revenuecat_app_store_event_atomic('historical-pending-replay-paid','NON_RENEWING_PURCHASE',$1,$2,'sandbox',now(),null,99,'usd',repeat('e',64),'historical-pending-replay-original',null,$3)",[pendingBuyer.user_id,pendingIntent.providerProductId,pendingIntent.createdAt]);
    eq(pendingReceipt.status,'processed','pre-policy pending purchase settles its original replay promise');
    await claim(newBuyer);await deny(()=>one('select public.create_reserved_creator_event_purchase_intent($1,$2)',[oldOffer.id,oldOffer.termsRevisionId]));
    await service();eq(await one('select count(*)::int from public.money_purchase_intents where source_id=$1 and user_id=$2',[historical,newBuyer.user_id]),0,'denied new buyer has no partial intent');
    await claim(host);await db.query("update public.creator_events set event_title='Historical title updated' where id=$1",[historical]);
    eq(await one('select replay_policy from public.creator_events where id=$1',[historical]),'indefinite','unchanged historical replay tuple stays editable');
    await deny(()=>offer(historical));
    await service();eq(await one('select count(*)::int from public.creator_event_offer_revisions where offer_id=$1',[oldOffer.id]),1,'rejected new revision rolled back without rewriting history');
    step = 'new event replay windows';
    await claim(host);
    eq(await one("insert into public.creator_events(host_user_id,event_title,event_type,status,starts_at,ends_at,time_zone) values($1,'Default live-only','live_first','scheduled',now()+interval '7 days',now()+interval '7 days 2 hours','America/New_York') returning replay_policy",[host.user_id]),'none','database default is live-only without generated replay dates');
    await deny(()=>db.query("insert into public.creator_events(host_user_id,event_title,event_type,status,starts_at,ends_at,time_zone,replay_policy) values($1,'Rejected indefinite new show','live_first','scheduled',now()+interval '7 days',now()+interval '7 days 2 hours','America/New_York','indefinite')",[host.user_id]));
    for (const change of [
      "replay_policy='indefinite'",
      "replay_policy='until_expiration',replay_expires_at=ends_at+interval '1 hour'",
      "replay_policy='until_expiration',replay_available_at=ends_at,replay_expires_at=ends_at",
      "replay_policy='until_expiration',replay_available_at=starts_at,replay_expires_at=ends_at+interval '1 hour'",
      "replay_policy='until_expiration',replay_available_at=ends_at,replay_expires_at='infinity'",
    ]) await deny(()=>db.query(`update public.creator_events set ${change} where id=$1`,[fresh]));
    await db.query("update public.creator_events set replay_policy='until_expiration',replay_available_at=ends_at,replay_expires_at=ends_at+interval '1 hour' where id=$1",[fresh]);
    const newOffer = await offer(fresh);
    eq(newOffer.terms.replayPolicy,'until_expiration');
    eq(Date.parse(newOffer.terms.replayAvailableAt),Date.parse(newOffer.terms.endsAt),'explicit availability can equal event end');
    eq(Date.parse(newOffer.terms.replayExpiresAt)-Date.parse(newOffer.terms.replayAvailableAt),3600000,'creator-selected duration is unchanged');
    await claim(buyer);const newIntent = await one('select public.create_reserved_creator_event_purchase_intent($1,$2)',[newOffer.id,newOffer.termsRevisionId]);
    eq(newIntent.reservation.terms.replayAvailableAt,newOffer.terms.replayAvailableAt,'checkout reads exact immutable availability');
    eq(newIntent.reservation.terms.replayExpiresAt,newOffer.terms.replayExpiresAt,'checkout reads exact immutable expiry');
    const dispatch = await one('select public.begin_creator_event_checkout($1,gen_random_uuid())',[newIntent.id]);
    eq(dispatch.startAuthorized,true,'supported explicit replay window can authorize its first store call');
    step = 'legacy caller and mutation negative controls';
    await service();
    await isolate(async()=>{
      await db.exec('alter table public.creator_events disable trigger guard_creator_event_explicit_replay_terms');
      const id = await one("insert into public.creator_events(host_user_id,event_title,event_type,status,starts_at,ends_at,time_zone,replay_policy) values($1,'Legacy writer','live_first','scheduled',now()+interval '7 days',now()+interval '7 days 2 hours','America/New_York','indefinite') returning id",[host.user_id]);
      await db.exec('alter table public.creator_events enable trigger guard_creator_event_explicit_replay_terms');
      await claim(host);await deny(()=>offer(id));
    });
    await service();await isolate(async()=>{
      await db.exec('alter table public.creator_event_offer_revisions disable trigger guard_creator_event_offer_explicit_replay_terms');
      await claim(host);const allowed = await offer(historical);
      eq(allowed.terms.replayPolicy,'indefinite','negative control reproduces old new-sale behavior only without canonical revision guard');
    });
    await service();
    for (const name of ['guard_creator_event_explicit_replay_terms','guard_creator_event_offer_explicit_replay_terms','guard_event_ticket_explicit_replay_terms','guard_event_checkout_explicit_replay_terms']) {
      for (const role of ['anon','authenticated','service_role']) eq(await one('select has_function_privilege($1,$2,\'execute\')',[role,`private.${name}()`]),false,`${role} cannot invoke private replay guard`);
    }
    eq(await one("select count(*)::int from public.platform_money_kill_switches where key in('live_money_enabled','payouts_enabled') and state='off'"),2,'live money and payouts remain off');
    t.diagnostic(`${checks} SQL assertions; historical actual intent/payment/ticket preserved; synthetic local provider envelope only`);
  } catch(error) {error.message=`${step}: ${error.message}`;throw error;} finally {await db.close();}
});
