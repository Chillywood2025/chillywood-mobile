import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedLiveRoomAuthority,liveFixtureActors as a,liveFixtureTitle,withLiveRoomActor} from './helpers/live-room-authority-fixture.mjs';

test('actual Party/Live leave-rejoin and same-code restart retain immutable identity and current admission', {timeout:180000},async()=>{
  const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
  const scalar=async(sql,p=[])=>(Object.values((await db.query(sql,p)).rows[0]??{}))[0];
  const auth=(actor,fn)=>withLiveRoomActor(db,actor,fn);
  const join=(id,actor)=>auth(actor,()=>db.query('select * from public.join_watch_party_room_session($1,$2)',[id,'Synthetic current member']));
  const leave=(id,actor)=>auth(actor,()=>db.query("select * from public.heartbeat_watch_party_room_session($1,'left',false,false)",[id]));
  const membership=async(id,actor)=>(await db.query('select * from public.watch_party_room_memberships where party_id=$1 and user_id=$2',[id,actor.id])).rows[0];
  try {
    await seedLiveRoomAuthority(db);
    await auth(a.host,()=>db.query(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,title_id,source_type,source_id,content_access_rule)
      values('REJOIN-PARTY',$1,'title',$2,'platform_title',$2,'premium'),('REJOIN-LIVE',$1,'live',null,null,null,'open')`,[a.host.id,liveFixtureTitle]));
    for(const id of ['REJOIN-PARTY','REJOIN-LIVE']) {
      await join(id,a.host);await join(id,a.friend);const first=await membership(id,a.friend);
      await leave(id,a.friend);assert.equal((await membership(id,a.friend)).membership_state,'left');
      await assert.rejects(auth(a.friend,()=>db.query("select * from public.heartbeat_watch_party_room_session($1,'active')",[id])),/watch_party_join_rpc_required/);
      await assert.rejects(auth(a.friend,async()=>{
        await db.exec("set local app.watch_party_membership_authority='server'");
        await db.query("update public.watch_party_room_memberships set membership_state='active',left_at=null,joined_at=now() where party_id=$1 and user_id=$2",[id,a.friend.id]);
      }),/permission denied|row-level security/,'a forged server-transition GUC never grants raw client writes');
      await new Promise(resolve=>setTimeout(resolve,5));await join(id,a.friend);
      const rejoined=await membership(id,a.friend);assert.equal(rejoined.membership_state,'active');assert.equal(rejoined.left_at,null);
      assert.equal(rejoined.party_id,first.party_id);assert.equal(rejoined.user_id,first.user_id);
      assert.ok(new Date(rejoined.joined_at)>new Date(first.joined_at),'fresh attendance interval uses actual database time');
      assert.equal(rejoined.role,'viewer');assert.equal(rejoined.stage_role,'listener');assert.equal(rejoined.can_speak,false);
      await assert.rejects(db.query("update public.watch_party_room_memberships set joined_at=now()+interval '1 hour' where party_id=$1 and user_id=$2",[id,a.friend.id]),/watch_party_membership_identity_immutable/,'active timestamps remain immutable even for privileged SQL');
      await leave(id,a.host);await new Promise(resolve=>setTimeout(resolve,5));await join(id,a.host);
      assert.equal((await membership(id,a.host)).role,'host','current exact host can genuinely leave/rejoin');
    }
    await leave('REJOIN-LIVE',a.friend);
    const source=fs.readFileSync('supabase/migrations/202608250001_chilly_chat_room_authority_closure.sql','utf8');
    const original=source.slice(source.indexOf('create or replace function public."enforce_watch_party_membership_identity"()'),source.indexOf('\ndrop trigger if exists "enforce_watch_party_membership_identity"'));
    const fixed=await scalar("select pg_get_functiondef('public.enforce_watch_party_membership_identity()'::regprocedure)");
    await db.exec('begin');await db.exec(original);
    await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:a.friend.id,session_id:a.friend.session})]);
    await db.exec('set local role authenticated');
    await assert.rejects(db.query("select * from public.join_watch_party_room_session('REJOIN-LIVE')"),/watch_party_membership_identity_immutable/,'rollback-only original guard reproduces the real rejoin failure');
    await db.exec('rollback');assert.equal(await scalar("select pg_get_functiondef('public.enforce_watch_party_membership_identity()'::regprocedure)"),fixed);
    await join('REJOIN-LIVE',a.friend);
    await auth(a.host,()=>db.query("select * from public.set_watch_party_participant_authority('REJOIN-LIVE',$1,'listener',false,'removed')",[a.friend.id]));
    await assert.rejects(join('REJOIN-LIVE',a.friend),/watch_party_membership_removed/,'removed membership remains terminal');
    await leave('REJOIN-PARTY',a.friend);
    await db.query('insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values($1,$2,$1)',[a.host.id,a.friend.id]);
    await assert.rejects(join('REJOIN-PARTY',a.friend),/blocked|unavailable|access|authority/,'rejoin repeats current blocking/admission checks');
    const oldGeneration=await scalar("select room_generation from public.watch_party_rooms where party_id='REJOIN-LIVE'");
    await leave('REJOIN-LIVE',a.host);
    await auth(a.host,()=>db.exec("update public.watch_party_rooms set is_active=false where party_id='REJOIN-LIVE'"));
    await assert.rejects(join('REJOIN-LIVE',a.host),/unavailable/);
    await auth(a.host,()=>db.exec("update public.watch_party_rooms set is_active=true where party_id='REJOIN-LIVE'"));
    await join('REJOIN-LIVE',a.host);
    assert.notEqual(await scalar("select room_generation from public.watch_party_rooms where party_id='REJOIN-LIVE'"),oldGeneration);
    assert.equal(await scalar("select joined_at>=notification_join_started_at from public.watch_party_room_memberships m join public.watch_party_rooms r using(party_id) where m.party_id='REJOIN-LIVE' and m.user_id=r.host_user_id::text"),true,'restart attendance belongs to the new generation, not the old initial join');
    await leave('REJOIN-LIVE',a.host);await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[a.host.session]);
    await assert.rejects(join('REJOIN-LIVE',a.host),/current_session/,'stale exact host session cannot rejoin');
    assert.equal(await scalar("select has_table_privilege('authenticated','public.watch_party_room_memberships','UPDATE')"),false);
    assert.equal(await scalar("select has_table_privilege('authenticated','public.watch_party_room_memberships','INSERT')"),false);
  }finally {await db.close();}
});
