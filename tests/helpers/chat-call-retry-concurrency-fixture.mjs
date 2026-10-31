// Synthetic fixture only; all call admission/transition functions remain real.
export const callRetryMigration = '20261031203703';
// Disposable native clone only: realtime is intentionally excluded from the
// template export. Keep production invalidation triggers active, but record
// their transport locally instead of dispatching to a Realtime service.
export const callRetryRealtimeSink = `
  create schema realtime;
  create table realtime.fixture_outbox(payload jsonb not null,event text not null,topic text not null,private boolean not null);
  create function realtime.send(jsonb,text,text,boolean) returns void language sql
    as $$insert into realtime.fixture_outbox values($1,$2,$3,$4)$$;
  revoke all on schema realtime from public,anon,authenticated,service_role;
  revoke all on function realtime.send(jsonb,text,text,boolean) from public,anon,authenticated,service_role;
`;
export const literal = value => `'${String(value).replaceAll("'", "''")}'`;
export function callRetryFixture(n) {
  const id = suffix => `cb${String(n).padStart(2, '0')}0000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
  const caller = id(1), callee = id(2), thread = id(3), session = id(4);
  const claims = (role = 'authenticated') => `set local role ${role};set local request.jwt.claims=${literal(JSON.stringify({role,sub:caller,session_id:session}))};`;
  return {
    caller, callee, thread, session, claims,
    setup: `insert into auth.users(id,is_sso_user,is_anonymous) values('${caller}',false,false),('${callee}',false,false);
      insert into auth.sessions(id,user_id) values('${session}','${caller}');
      select set_config('request.jwt.claims',${literal(JSON.stringify({role:'authenticated',sub:caller,session_id:session}))},false);
      insert into public.chat_threads(id,thread_kind,participant_pair_key,created_by)
      values('${thread}','direct','${caller}::${callee}','${caller}');
      insert into public.chat_thread_members(thread_id,user_id) values('${thread}','${caller}'),('${thread}','${callee}');`,
    room: serial => `insert into public.communication_rooms(room_id,room_code,host_user_id,status) values('RETRY${n}X${serial}','RETRY${n}X${serial}','${caller}','active');`,
    begin: serial => `${claims()}select public.begin_chilly_chat_call('${thread}','RETRY${n}X${serial}','video');`,
    atomic: serial => `${claims()}select public.start_chilly_chat_call('${thread}','RETRY${n}X${serial}','video','best_effort');`,
    transition: (invite, actor, status) => `${claims('service_role')}select public.transition_chilly_chat_call_invite('${invite}','${actor}','${status}',null);`,
    cancelLatest: `${claims('service_role')}select public.transition_chilly_chat_call_invite(
      (select id from public.chat_call_invites where thread_id='${thread}' and status='ringing'), '${caller}','canceled',null);`,
    ledger: `select count(*) from public.abuse_rate_limit_events where action_key='chat_call_invite' and actor_user_id='${caller}' and target_key='${thread}:${callee}';`,
  };
}

export function chatActivityConcurrencyFixture(n) {
  const f=callRetryFixture(n);
  const calleeSession=`cb${String(n).padStart(2,'0')}0000-0000-4000-8000-000000000006`;
  const recipientClaims=`set local role authenticated;set local request.jwt.claims=${literal(JSON.stringify({role:'authenticated',sub:f.callee,session_id:calleeSession}))};`;
  const expiredInvite=`cb${String(n).padStart(2,'0')}0000-0000-4000-8000-000000000007`;
  return {...f,calleeSession,recipientClaims,expiredInvite,
    setup:f.setup+`insert into auth.sessions(id,user_id) values('${calleeSession}','${f.callee}');`,
    message:serial=>`${f.claims()}insert into public.chat_messages(id,thread_id,sender_user_id,body,message_type,created_at)
      values('cb${String(n).padStart(2,'0')}1000-0000-4000-8000-${String(serial).padStart(12,'0')}','${f.thread}','${f.caller}','Synthetic lock schedule ${serial}','text','2099-01-01')
      returning jsonb_build_object('id',id,'createdAt',created_at);`,
    cut:`${recipientClaims}select jsonb_build_object('cut',public.read_chilly_chat_activity_cut('${f.thread}'));`,
    mark:cut=>`${recipientClaims}select jsonb_build_object('readThrough',public.mark_chilly_chat_thread_read('${f.thread}',${literal(cut)}::timestamptz,null));`,
    member:`select jsonb_build_object('messages',m->'unread_count','calls',m->'unread_call_count') from public.chat_thread_activity t,jsonb_array_elements(t.members) m where t.id='${f.thread}' and m->>'user_id'='${f.callee}';`,
    // Synthetic historical row, inserted with its original expired deadline;
    // never mutate immutable deadlines or change production clock/guards.
    expired:f.room(1)+`insert into public.chat_call_invites(id,thread_id,communication_room_id,caller_user_id,callee_user_id,call_type,status,created_at,expires_at)
      values('${expiredInvite}','${f.thread}','RETRY${n}X1','${f.caller}','${f.callee}','video','ringing','2000-01-01','2000-01-02');
      update public.chat_threads set active_communication_room_id='RETRY${n}X1',active_call_type='video' where id='${f.thread}';`,
    expire:`${f.claims('service_role')}select public.expire_stale_chilly_chat_call_invites(10);`,
    expireOne:`${f.claims('service_role')}select public.expire_stale_chilly_chat_call_invites(1);`,
  };
}
