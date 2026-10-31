import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {callRetryFixture} from './helpers/chat-call-retry-concurrency-fixture.mjs';

const migration='20261031203703_chilly_chat_completed_call_retry_accounting.sql';
const caller='ca110000-0000-4000-8000-000000000001';
const callee='ca110000-0000-4000-8000-000000000002';
const thread='ca111000-0000-4000-8000-000000000001';
const session='ca112000-0000-4000-8000-000000000001';

test('real call transitions credit only callee-accepted ended calls, preserving unanswered budget and ledger', {timeout:180000}, async()=>{
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,
    implicitApiGrants:false,excludeMigrations:[migration]});
  const one=async(sql,params=[])=>(await db.query(sql,params)).rows[0];
  let serial=0;
  let isolateRoomBudget=true;
  const as=async(role,sql)=>{
    try {
      const result=await db.exec(`begin; set local role ${role};
        set local request.jwt.claims='${JSON.stringify({role,sub:caller,session_id:session})}';
        ${sql}; commit;`);
      return result.flatMap(r=>r.rows).at(-1);
    } catch(error) {await db.exec('rollback');throw error;}
  };
  const start=async()=>{
    const room=`RETRY${++serial}`;
    // This suite isolates invitation accounting. The independent unchanged
    // room-allocation budget is explicitly tested below; age its synthetic
    // fixture entries so it cannot mask the invite rejection under test.
    if(isolateRoomBudget) await db.exec("update public.abuse_rate_limit_events set created_at=now()-interval '601 seconds' where action_key='communication_room_create'");
    await db.query(`insert into public.communication_rooms(room_id,room_code,host_user_id,status)
      values($1,$1,$2,'active')`,[room,caller]);
    return (await as('authenticated',`select public.begin_chilly_chat_call('${thread}','${room}','video') value`)).value.invite;
  };
  const transition=async(invite,actor,status)=>(await as('service_role',
    `select public.transition_chilly_chat_call_invite('${invite.id}','${actor}','${status}',null) value`)).value;
  try {
    await db.exec(`insert into auth.users(id,is_sso_user,is_anonymous) values('${caller}',false,false),('${callee}',false,false);
      insert into auth.sessions(id,user_id) values('${session}','${caller}');
      select set_config('request.jwt.claims','${JSON.stringify({role:'authenticated',sub:caller,session_id:session})}',false);
      insert into public.chat_threads(id,thread_kind,participant_pair_key,created_by)
      values('${thread}','direct','${caller}::${callee}','${caller}');
      insert into public.chat_thread_members(thread_id,user_id) values('${thread}','${caller}'),('${thread}','${callee}');`);
    for(let i=0;i<2;i++) await transition(await start(),callee,'declined');
    const completed=await start();
    await assert.rejects(transition(completed,caller,'accepted'),/transition_accept_forbidden/,
      'caller cannot invent callee consent');
    await transition(completed,callee,'accepted');
    await transition(completed,caller,'ended');
    await assert.rejects(start(),/rate_limited/,'negative control reproduces screenshot after a genuinely accepted ended call');
    assert.equal(Number((await one("select count(*) n from public.abuse_rate_limit_events where action_key='chat_call_invite'")).n),3);
    await db.exec(fs.readFileSync(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'));
    // A forged UI/timeline status cannot replace the server-only acceptance
    // receipt. Remove only synthetic evidence, prove rejection, then restore it.
    await db.exec(`create temporary table saved_acceptance as select * from public.chat_call_transition_deliveries
      where call_invite_id='${completed.id}' and target_status='accepted';
      delete from public.chat_call_transition_deliveries where call_invite_id='${completed.id}' and target_status='accepted';`);
    await assert.rejects(start(),/rate_limited/,'ended row without callee transition receipt remains counted');
    await db.exec('insert into public.chat_call_transition_deliveries select * from saved_acceptance');
    await db.query("update public.chat_call_transition_deliveries set actor_user_id=$1 where call_invite_id=$2 and target_status='accepted'",[caller,completed.id]);
    await assert.rejects(start(),/rate_limited/,'a caller-authored acceptance receipt cannot credit the budget');
    await db.query("update public.chat_call_transition_deliveries set actor_user_id=$1 where call_invite_id=$2 and target_status='accepted'",[callee,completed.id]);
    await db.exec(`create temporary table saved_end as select * from public.chat_call_transition_deliveries
      where call_invite_id='${completed.id}' and target_status='ended';
      delete from public.chat_call_transition_deliveries where call_invite_id='${completed.id}' and target_status='ended';`);
    await assert.rejects(start(),/rate_limited/,'callee acceptance without durable ended receipt still consumes its slot');
    await db.exec('insert into public.chat_call_transition_deliveries select * from saved_end');
    await db.query("update public.abuse_rate_limit_events set metadata=metadata||'{\"invite_id\":\"unknown\"}'::jsonb where action_key='chat_call_invite' and created_at=(select created_at from public.chat_call_invites where id=$1)",[completed.id]);
    await assert.rejects(start(),/rate_limited/,'an explicit wrong invite ID cannot fall back to a matching legacy timestamp');
    await db.query("update public.abuse_rate_limit_events set metadata=metadata-'invite_id' where action_key='chat_call_invite' and metadata->>'invite_id'='unknown'");
    const retry=await start();
    assert.equal(retry.status,'ringing','confirmed completed call no longer consumes an unanswered slot');
    assert.equal((await start()).id,retry.id,'duplicate start reuses the active invite instead of charging another attempt');
    const ledger=(await db.query("select metadata from public.abuse_rate_limit_events where action_key='chat_call_invite'")).rows;
    assert.equal(ledger.length,4,'completed legacy event stays in ledger');
    assert.equal(ledger.filter(e=>e.metadata.invite_id===retry.id).length,1,'new event binds exact invite');
    await transition(retry,caller,'canceled');
    await assert.rejects(start(),/rate_limited/,'caller-only cancellation never resets budget');
    for(const table of ['chat_call_invites','chat_call_transition_deliveries','abuse_rate_limit_events']) {
      assert.equal((await one(`select has_table_privilege('authenticated','public.${table}','UPDATE') allowed`)).allowed,false);
      assert.equal((await one(`select has_table_privilege('authenticated','public.${table}','INSERT') allowed`)).allowed,false);
    }
    await assert.rejects(as('authenticated',`select public.transition_chilly_chat_call_invite('${completed.id}','${callee}','accepted',null)`),/permission denied/,
      'client cannot impersonate a callee through server-only transition RPC');
    const guard=(await one("select pg_get_functiondef('public.enforce_chat_call_invites_abuse_guard()'::regprocedure) source")).source;
    assert.match(guard,/pg_advisory_xact_lock/,'same-thread accounting stays serialized');
    assert.equal((await one("select count(*)::int n from public.chat_call_transition_deliveries where call_invite_id=$1 and target_status='accepted'",[completed.id])).n,1);
    // Age only the synthetic rate ledger (not immutable invite authority) to
    // test expiry without a five-minute sleep or modifying the product clock.
    await db.exec("update public.abuse_rate_limit_events set created_at=now()-interval '301 seconds' where action_key='chat_call_invite'");
    await db.exec("update public.abuse_rate_limit_events set created_at=now()-interval '601 seconds' where action_key='communication_room_create'");
    isolateRoomBudget=false;
    let lastCompleted;
    for(let i=0;i<12;i++) {
      const next=await start();
      await transition(next,callee,'accepted');
      await transition(next,caller,'ended');
      lastCompleted=next;
    }
    assert.equal(Number((await one("select count(*) n from public.abuse_rate_limit_events where action_key='chat_call_invite'")).n),16,
      'consenting completed calls do not acquire an invented invite cap; all ledger entries remain');
    for(let i=0;i<4;i++) await db.query(`insert into public.communication_rooms(room_id,room_code,host_user_id,status)
      values($1,$1,$2,'active')`,[`ROOMCAP${i}`,caller]);
    const allocate=()=>db.query(`insert into public.communication_rooms(room_id,room_code,host_user_id,status)
      values('ROOMCAPLAST','ROOMCAPLAST',$1,'active')`,[caller]);
    await assert.rejects(db.query("update public.communication_rooms set linked_room_mode='live' where room_id=$1",[lastCompleted.communication_room_id]),
      /immutable/,'existing room identity guard prevents rewriting linked provenance');
    await db.query("update public.abuse_rate_limit_events set metadata=jsonb_set(metadata,'{room_id}','\"UNKNOWN\"') where metadata->>'room_id'=$1",[lastCompleted.communication_room_id]);
    await assert.rejects(allocate(),/rate_limited/,'unknown exact allocation mapping stays charged');
    await db.query("update public.abuse_rate_limit_events set metadata=jsonb_set(metadata,'{room_id}',to_jsonb($1::text)) where metadata->>'room_id'='UNKNOWN'",[lastCompleted.communication_room_id]);
    const allocation=(await one("select id,created_at from public.abuse_rate_limit_events where metadata->>'room_id'=$1",[lastCompleted.communication_room_id]));
    await db.query(`update public.abuse_rate_limit_events set metadata=metadata-'room_id',
      created_at=(select created_at from public.communication_rooms where room_id=$1) where id=$2`,[lastCompleted.communication_room_id,allocation.id]);
    await assert.rejects(allocate(),/rate_limited/,'even an exact historical room timestamp is not proven allocation identity');
    await db.query("update public.abuse_rate_limit_events set metadata=metadata||jsonb_build_object('room_id',$1::text),created_at=$2 where id=$3",
      [lastCompleted.communication_room_id,allocation.created_at,allocation.id]);
    await allocate();
    await assert.rejects(db.query(`insert into public.communication_rooms(room_id,room_code,host_user_id,status)
      values('ROOMCAPDENIED','ROOMCAPDENIED',$1,'active')`,[caller]),/rate_limited/,
      'existing five-room / ten-minute allocation safeguard remains unchanged');
    await db.exec("update public.communication_rooms set status='ended' where room_id like 'ROOMCAP%'");
    await assert.rejects(allocate(),/rate_limited/,'host-only room End without a callee accepted call never earns credit');
  } finally {await db.close();}
});

test('ambiguous legacy timestamps fail closed without deleting rate history', {timeout:180000}, async()=>{
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,
    implicitApiGrants:false,excludeMigrations:[migration]});
  const f=callRetryFixture(8);
  try {
    await db.exec(f.setup);
    await db.exec('begin');
    for(let n=1;n<=3;n++) {
      await db.exec(`reset role;${f.room(n)}`);
      const result=await db.exec(f.begin(n));
      const invite=result.flatMap(r=>r.rows).at(-1).begin_chilly_chat_call.invite;
      if(n<3) {
        await db.exec(f.transition(invite.id,f.callee,'accepted'));
        await db.exec(f.transition(invite.id,f.caller,'ended'));
      } else await db.exec(f.transition(invite.id,f.caller,'canceled'));
    }
    await db.exec('commit;reset role');
    assert.equal((await db.query("select count(distinct created_at)::int n from public.chat_call_invites")).rows[0].n,1);
    await db.exec(fs.readFileSync(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'));
    await db.exec(f.room(4));
    await assert.rejects(db.exec(`begin;${f.begin(4)}commit;`),/rate_limited/,
      'same timestamp is not sufficient to map multiple legacy allocations to a completed call');
    await db.exec('rollback');
    assert.equal(Number((await db.query(f.ledger)).rows[0].count),3);
    const delayed=callRetryFixture(9);
    await db.exec(delayed.setup);
    await db.exec('begin');
    const began=(await db.query('select now() value')).rows[0].value;
    await new Promise(resolve=>setTimeout(resolve,50));
    await db.exec(delayed.room(1));
    await db.exec(delayed.begin(1));
    await db.exec('reset role');
    const admissions=(await db.query("select action_key,created_at from public.abuse_rate_limit_events where actor_user_id=$1",[delayed.caller])).rows;
    assert.equal(admissions.length,2);
    for(const admission of admissions) assert.ok(new Date(admission.created_at).getTime()>new Date(began).getTime()+20,
      `${admission.action_key} uses admission time, not stale transaction start`);
    await db.exec('commit');
  } finally {await db.close();}
});
