import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {callRetryFixture} from './helpers/chat-call-retry-concurrency-fixture.mjs';
const migration='20261031205522_chat_meaningful_activity_and_call_reads.sql';

test('meaningful activity and recipient call reads follow actual retained events, never metadata or sorting', {timeout:180000}, async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false,excludeMigrations:[migration]});
 const f=callRetryFixture(21),calleeSession='cb210000-0000-4000-8000-000000000005';
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const run=async(sql)=>{try{return (await db.exec(`begin;${sql}commit;`)).flatMap(r=>r.rows).at(-1);}catch(e){await db.exec('rollback');throw e;}};
 const claims=(user,session)=>`set local role authenticated;set local request.jwt.claims='${JSON.stringify({role:'authenticated',sub:user,session_id:session})}';`;
 const mark=(user,session,through)=>run(`${claims(user,session)}select public.mark_chilly_chat_thread_read('${f.thread}',null,'${through}'::timestamptz);`);
 const member=async(user)=>await scalar("select m from public.chat_thread_activity t,jsonb_array_elements(t.members) m where t.id=$1 and m->>'user_id'=$2",[f.thread,user]);
 const activity=async()=>(await db.query('select last_activity_at::text,last_activity_kind,last_activity_preview,last_activity_source_key from public.chat_thread_activity where id=$1',[f.thread])).rows[0];
 const latestEvent=async()=>(await db.query('select id,created_at::text,event_type from public.chat_call_events where thread_id=$1 order by created_at desc,id desc limit 1',[f.thread])).rows[0];
 try {
  await db.exec(f.setup);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[calleeSession,f.callee]);
  await db.exec(f.room(1));
  const started=(await run(f.begin(1))).begin_chilly_chat_call.invite;
  await db.exec(fs.readFileSync(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'));
  const initial=await latestEvent();
  assert.equal((await activity()).last_activity_preview,'Video call started','backfill uses retained call event');
  assert.equal((await member(f.caller)).unread_call_count,0,'own call never becomes own unread');
  assert.equal((await member(f.callee)).unread_call_count,1);
  assert.equal((await run(`${claims(f.callee,calleeSession)}select count(*)::integer from public.chat_thread_activity where id='${f.thread}';`)).count,1,'security-invoker view preserves member visibility');
  const authenticatedView=await run(`${claims(f.callee,calleeSession)}select members,last_activity_preview from public.chat_thread_activity where id='${f.thread}';`);
  assert.equal(authenticatedView.last_activity_preview,'Video call started');
  assert.equal(authenticatedView.members.length,2,'projected member JSON executes under invoking member RLS');
  assert.equal(authenticatedView.members.find(m=>m.user_id===f.callee).unread_call_count,1);
  assert.equal(authenticatedView.members.find(m=>m.user_id===f.caller).unread_call_count,0);
  const outsider='cb210000-0000-4000-8000-000000000099',outsiderSession='cb210000-0000-4000-8000-000000000098';
  await db.query('insert into auth.users(id,is_sso_user,is_anonymous) values($1,false,false)',[outsider]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[outsiderSession,outsider]);
  assert.equal((await run(`${claims(outsider,outsiderSession)}select count(*)::integer from public.chat_thread_activity where id='${f.thread}';`)).count,0,'view cannot bypass underlying thread RLS');
  await mark(f.callee,calleeSession,initial.created_at);
  assert.equal((await member(f.callee)).unread_call_count,0);
  await run(f.transition(started.id,f.callee,'accepted'));
  const accepted=await latestEvent();
  assert.equal((await member(f.caller)).unread_call_count,1);
  await run(f.transition(started.id,f.caller,'ended'));
  const ended=await latestEvent();
  assert.equal((await activity()).last_activity_source_key,`call:${ended.id}`);
  assert.equal((await activity()).last_activity_preview,'Video call ended');
  await mark(f.callee,calleeSession,initial.created_at);
  assert.equal((await member(f.callee)).unread_call_count,1,'old observed boundary cannot acknowledge later End');
  const messageId='cb211000-0000-4000-8000-000000000001';
  await run(`${claims(f.callee,calleeSession)}insert into public.chat_messages(id,thread_id,sender_user_id,body,message_type,created_at)
    values('${messageId}','${f.thread}','${f.callee}','Latest actual message','text','2099-01-01');`);
  assert.equal(await scalar("select created_at<clock_timestamp()+interval '1 minute' from public.chat_messages where id=$1",[messageId]),true,'client future timestamp is replaced by server admission time');
  assert.equal((await activity()).last_activity_preview,'Latest actual message');
  assert.equal((await activity()).last_activity_kind,'message');
  assert.equal((await member(f.caller)).unread_count,1);
  assert.equal((await member(f.caller)).unread_call_count,1,'message and call counters remain separate');
  await mark(f.caller,f.session,accepted.created_at);
  assert.equal((await member(f.caller)).unread_call_count,0);
  assert.equal((await member(f.caller)).unread_count,1,'marking observed call leaves newer unseen message unread');
  await mark(f.caller,f.session,(await scalar('select created_at::text from public.chat_messages where id=$1',[messageId])));
  assert.equal((await member(f.caller)).unread_count,1,'even later call-only watermark cannot acknowledge messages');
  const cut=(await run(`${claims(f.caller,f.session)}select public.read_chilly_chat_activity_cut('${f.thread}')::text;`)).read_chilly_chat_activity_cut;
  const concurrentMessage='00000000-0000-4000-8000-000000000001';
  await run(`${claims(f.caller,f.session)}insert into public.chat_messages(id,thread_id,sender_user_id,body,message_type)
    values('${concurrentMessage}','${f.thread}','${f.caller}','Own reply does not read remote content','text');`);
  assert.equal((await member(f.caller)).unread_count,1,'own send does not acknowledge unseen remote message');
  assert.equal(await scalar('select count(*)::integer from public.chat_messages where id=$1 and created_at<=$2::timestamptz',[concurrentMessage,cut]),0,'lower UUID concurrent insertion is outside fixed snapshot cut');
  await db.query('delete from public.chat_messages where id=$1',[concurrentMessage]);
  const before=await activity();
  for(const [table,id] of [['chat_messages',messageId],['chat_call_events',ended.id]]) {
    await assert.rejects(db.query(`update public.${table} set id='cb210000-0000-4000-8000-000000000097' where id=$1`,[id]),/chat_activity_identity_immutable/);
    await assert.rejects(db.query(`update public.${table} set thread_id='cb210000-0000-4000-8000-000000000096' where id=$1`,[id]),/chat_activity_identity_immutable/);
  }
  await db.query("update public.chat_threads set updated_at=now()+interval '1 year' where id=$1",[f.thread]);
  assert.deepEqual(await activity(),before,'metadata timestamp cannot reorder or change preview');
  for(const column of ['last_activity_at','last_activity_source_key','last_activity_kind','last_activity_preview','members'])
    assert.equal(await scalar("select has_column_privilege('authenticated','public.chat_thread_activity',$1,'UPDATE')",[column]),false);
  assert.equal(await scalar("select has_column_privilege('authenticated','public.chat_threads','activity_admission_watermark','UPDATE')"),false);
  assert.equal(await scalar("select has_table_privilege('authenticated','public.chat_thread_activity','INSERT')"),false);
  assert.equal(await scalar("select has_column_privilege('authenticated','public.chat_thread_members','last_call_read_at','UPDATE')"),false);
  await db.query("update public.chat_messages set moderation_status='removed' where id=$1",[messageId]);
  assert.equal((await activity()).last_activity_preview,'Message removed after review','redaction never leaves original preview');
  await db.query("update public.chat_messages set body='Deidentified retained record',sender_user_id=$2 where id=$1",[messageId,outsider]);
  assert.equal((await activity()).last_activity_preview,'Message removed after review','purge/redaction edits remain supported without leaking retained body');
  await db.query('update public.chat_call_events set actor_user_id=$2 where id=$1',[ended.id,outsider]);
  await db.query('update public.chat_call_events set actor_user_id=$2 where id=$1',[ended.id,f.caller]);
  await db.query('delete from public.chat_messages where id=$1',[messageId]);
  assert.equal((await member(f.caller)).unread_count,0,'deleting unread message recomputes count');
  assert.equal((await activity()).last_activity_source_key,`call:${ended.id}`,'latest deletion reveals previous real activity');
  await db.query('delete from public.chat_call_events where id=$1',[ended.id]);
  assert.equal((await activity()).last_activity_source_key,`call:${accepted.id}`);
  assert.equal((await member(f.callee)).unread_call_count,0,'deletion removes corresponding unread call activity');
  await db.query('delete from auth.sessions where id=$1',[calleeSession]);
  await assert.rejects(mark(f.callee,calleeSession,accepted.created_at),/current_session_required/);
  await db.query('delete from public.chat_call_events where thread_id=$1',[f.thread]);
  assert.equal((await activity()).last_activity_preview,null,'deleting final retained item clears canonical preview');
  assert.equal(await scalar('select last_message_preview from public.chat_thread_activity where id=$1',[f.thread]),null,'deleted text cannot survive via legacy fallback');
  assert.equal((await member(f.caller)).unread_call_count,0);
  const oldHigh=await scalar('select activity_admission_watermark::text from public.chat_threads where id=$1',[f.thread]);
  const beforeEmpty=await scalar('select last_call_read_at::text from public.chat_thread_members where thread_id=$1 and user_id=$2',[f.thread,f.caller]);
  await mark(f.caller,f.session,'2099-01-01');
  assert.equal(await scalar('select last_call_read_at::text from public.chat_thread_members where thread_id=$1 and user_id=$2',[f.thread,f.caller]),beforeEmpty,'empty stream cannot advance to forged future watermark');
  await db.query("update public.chat_threads set activity_admission_watermark=clock_timestamp()+interval '1 day' where id=$1",[f.thread]);
  await run(`${claims(f.caller,f.session)}insert into public.chat_messages(thread_id,sender_user_id,body,message_type)
    values('${f.thread}','${f.caller}','Clock rollback admission','text');`);
  assert.equal(await scalar('select min(created_at)>$2::timestamptz from public.chat_messages where thread_id=$1',[f.thread,oldHigh]),true,'deletion/clock rollback never reuses an issued read cut');
 } finally {await db.close();}
});
