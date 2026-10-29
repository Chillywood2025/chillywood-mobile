import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {client} from './event-ticket-policy-fixture.mjs';

test('promised replay deadline uses actual protected delivery and retains earned remedies', {timeout:600_000}, async t => {
  const {db,replayReport}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
  let checks=0;
  const check=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const isolate=async fn=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}};
  try {
    for(const file of ['event-reservation-authority.sql','event-broadcast-producer-authority.sql','event-replay-deadline-policy.sql']) {
      await db.exec(fs.readFileSync(`tests/fixtures/${file}`,'utf8'));
    }
    const c=await one('select context from event_reservation_fixture.replay_deadline_context');
    const claim=async(user=c.buyerId,session=c.buyerSession)=>{
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.headers','{\"x-chillywood-platform\":\"ios\"}',true)",
        [JSON.stringify({role:'authenticated',sub:user,session_id:session})]);
      await db.exec('set local role authenticated');
    };
    const read=()=>one('select public.read_my_creator_event_ticket_policy($1,$2)',[c.eventId,c.intentId]);
    const hasRemedy=p=>p.refundEligibility?.reasons?.includes('event_replay_unavailable')??false;
    const setDeadline=offset=>one(`select event_reservation_fixture.set_replay_deadline(clock_timestamp()+make_interval(secs=>$1))`,[offset]);
    check(await one('select available from private.creator_event_replay_availability_facts where event_id=$1 order by id desc limit 1',[c.eventId]),false,
      'provider COMPLETE alone cannot present a still-live show as delivered replay');
    await db.exec('begin');
    await claim(c.hostId,c.hostSession);
    await one("select public.manage_creator_event_lifecycle(id,'end',updated_at) from public.creator_events where id=$1",[c.eventId]);
    await db.exec('reset role;commit');
    check(await one('select available from private.creator_event_replay_availability_facts where event_id=$1 order by id desc limit 1',[c.eventId]),true,
      'actual end, producer receipt and private playback projection establish replay availability');
    await isolate(async()=>{
      await setDeadline(60);await claim();
      check(hasRemedy(await read()),false,'future promise does not grant an early remedy');
    });
    await isolate(async()=>{
      await setDeadline(-60);await claim();
      const policy=await read();check(hasRemedy(policy),true,'first availability after promised deadline earns review');
      check(policy.refundEligibility.status,'provider_review_required','eligibility does not claim a completed refund');
      check(client().api.parseEventTicketPolicy(policy,c.eventId,c.intentId,c.buyerId).refundEligibility.reasons.includes('event_replay_unavailable'),true,
        'real SQL response survives production policy parser');
      const wallet=await one("select public.read_my_creator_purchases(50,null,null,'event',$1)",[c.eventId]);
      check(hasRemedy(wallet.items[0]),true,'real wallet exposes the same earned remedy');
      check(hasRemedy(await read()),true,'late playable replay cannot erase an earned remedy');
      await db.exec('reset role');
      check(await one("select count(*)::int from public.creator_event_purchase_remedies where purchase_intent_id=$1 and reason='event_replay_unavailable'",[c.intentId]),1,
        'repeated wallet and policy reads deduplicate remedies');
      check(await one("select count(*)::int from private.creator_event_ticket_notices where event_id=$1 and buyer_id=$2 and kind='event_replay_unavailable'",[c.eventId,c.buyerId]),1,
        'repeat reads deduplicate durable buyer notice');
    });
    await isolate(async()=>{
      await setDeadline(-60);
      // Advance synthetic observation times with production guards restored
      // before every application read; no real history is changed.
      await db.exec("set local session_replication_role='replica'");
      await db.query("update private.creator_event_replay_availability_facts set observed_at=clock_timestamp()-interval '2 minutes' where event_id=$1",[c.eventId]);
      await db.exec("set local session_replication_role='origin'");
      await claim();check(hasRemedy(await read()),false,'verified availability before deadline satisfies the promise');
    });
    await isolate(async()=>{
      await setDeadline(-60);
      await db.exec("set local session_replication_role='replica'");
      await db.exec('update private.creator_event_replay_policy_observation set started_at=clock_timestamp()');
      await db.exec("set local session_replication_role='origin'");
      await claim();check(hasRemedy(await read()),false,'pre-observation absence remains unknown historical delivery');
    });
    await isolate(async()=>{
      const other=(await db.query("select user_id,session_id from event_reservation_fixture.actors where kind='buyer18'")).rows[0];
      await claim(other.user_id,other.session_id);
      await assert.rejects(read,/event_ticket_purchase_required/);checks++;
    });
    for(const table of ['creator_event_replay_policy_observation','creator_event_replay_availability_facts']) {
      check(await one("select relrowsecurity and relforcerowsecurity from pg_class where oid=$1::regclass",[`private.${table}`]),true,'private replay facts force RLS');
      for(const role of ['anon','authenticated','service_role']) {
        check(await one("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE')",[role,`private.${table}`]),false,`${role} cannot access private replay facts`);
      }
      await isolate(async()=>{await assert.rejects(db.exec(`delete from private.${table}`),/immutable/);checks++;});
    }
    t.diagnostic(`${checks} replay deadline assertions; ${replayReport.files.length} migrations; ${replayReport.skipped.length} managed-infrastructure substitutions; synthetic provider only`);
  } catch(error) {if(error.where)error.message+=`\n${error.where}`;throw error;} finally {await db.close();}
});
