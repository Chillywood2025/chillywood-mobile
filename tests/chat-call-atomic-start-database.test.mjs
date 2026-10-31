import assert from 'node:assert/strict';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {callRetryFixture} from './helpers/chat-call-retry-concurrency-fixture.mjs';

test('atomic direct-call admission preserves authority, replay, rollback and retention', {timeout:180000}, async()=>{
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  const run=async sql=>{try{return (await db.exec(`begin;${sql}commit;`)).flatMap(r=>r.rows).at(-1);}catch(error){await db.exec('rollback');throw error;}};
  const start=(f,key,type='video',capture='host_managed')=>run(`${f.claims()}select public.start_chilly_chat_call('${f.thread}','${key}','${type}','${capture}') value;`);
  const scalar=async sql=>Object.values((await db.query(sql)).rows[0])[0];
  try {
    const f=callRetryFixture(11);await db.exec(f.setup);
    const first=(await start(f,'ATOMIC11A')).value;
    assert.equal(first.created,true);assert.equal(first.invite.call_type,'video');
    assert.equal(await scalar("select capture_policy from public.communication_rooms where room_id='ATOMIC11A'"),'host_managed');
    assert.equal(await scalar("select content_access_rule from public.communication_rooms where room_id='ATOMIC11A'"),'open');
    const replay=(await start(f,'ATOMIC11A')).value;
    assert.equal(replay.invite.id,first.invite.id);assert.equal(replay.created,true,'exact ringing replay permits deduped dispatch recovery');
    const collision=(await start(f,'ATOMIC11B','voice')).value;
    assert.equal(collision.invite.id,first.invite.id);assert.equal(collision.created,false);
    assert.equal(Number(await scalar(`select count(*) from public.communication_rooms where host_user_id='${f.caller}'`)),1,'reused call allocates no loser');
    assert.equal(Number(await scalar(f.ledger)),1);
    await assert.rejects(start(f,'ATOMIC11A','voice'),/start_key_conflict/);
    await assert.rejects(start(f,'ATOMIC11A','video','best_effort'),/start_key_conflict/);
    await assert.rejects(start(f,'ATOMIC11C','video','unsafe'),/begin_invalid_scope/);
    const alternateSession='cb110000-0000-4000-8000-000000000005';
    await db.exec(`insert into auth.sessions(id,user_id) values('${alternateSession}','${f.caller}')`);
    await assert.rejects(run(`${f.claims().replace(f.session,alternateSession)}select public.start_chilly_chat_call('${f.thread}','ATOMIC11A','video','host_managed');`),/start_key_conflict/);
    await run(f.transition(first.invite.id,f.callee,'accepted'));await run(f.transition(first.invite.id,f.caller,'ended'));
    const ended=(await start(f,'ATOMIC11A')).value;
    assert.equal(ended.created,false);assert.equal(ended.invite.status,'ended','old key never starts a replacement');
    await db.exec(`delete from auth.sessions where id='${f.session}'`);
    await assert.rejects(start(f,'ATOMIC11D'),/current_session_required/);
    assert.equal(Number(await scalar("select count(*) from public.communication_rooms where room_id='ATOMIC11D'")),0);
    await db.exec(`delete from public.chat_call_invites where id='${first.invite.id}'`);
    assert.equal(Number(await scalar(`select count(*) from private.chat_call_start_requests where thread_id='${f.thread}'`)),0,'invite retention cascades request receipts');

    const limited=callRetryFixture(12);await db.exec(limited.setup);
    for(let i=1;i<=3;i++){
      const invite=(await start(limited,`ATOMIC12X${i}`)).value.invite;
      await run(limited.transition(invite.id,limited.caller,'canceled'));
    }
    const counts=async()=>scalar(`select jsonb_build_object('rooms',(select count(*) from public.communication_rooms where host_user_id='${limited.caller}'),
      'events',(select count(*) from public.abuse_rate_limit_events where actor_user_id='${limited.caller}'),
      'requests',(select count(*) from private.chat_call_start_requests where actor_user_id='${limited.caller}'))`);
    const before=await counts();
    for(let i=4;i<=8;i++)await assert.rejects(start(limited,`ATOMIC12X${i}`),/rate_limited/);
    assert.deepEqual(await counts(),before,'definitive invite rejection rolls back candidate and every new ledger entry');
    assert.equal(await scalar("select has_table_privilege('authenticated','private.chat_call_start_requests','SELECT')"),false);
    assert.equal(await scalar("select has_function_privilege('anon','public.start_chilly_chat_call(uuid,text,text,text)','EXECUTE')"),false);
    assert.equal(await scalar("select has_function_privilege('service_role','public.start_chilly_chat_call(uuid,text,text,text)','EXECUTE')"),false);
  } finally {await db.close();}
});
