// Full product schema/RLS replay and actual checked-in SQL, no provider calls.
// This is single-session SQL evidence, not a native concurrency/load claim.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDatabase} from '../../tests/helpers/database-runtime-authority-fixture.mjs';
const name='20261107173220_creator_video_social_engagement.sql';
const migration=readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const {db}=await createDatabase({excludeMigrations:[name]});
const user=n=>`9a130000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const video=user(21), other=user(22), viewer=user(2);
let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label); checks++;};
async function actor(role,subject,sql,args=[]){
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,...(subject?{sub:subject,session_id:user(subject===viewer?12:11)}:{})})]);
  await db.exec(`set role ${role}`);
  try {return(await db.query(sql,args)).rows;} finally {await db.exec('reset role');}
}
const read=()=>actor('authenticated',viewer,'select * from public.read_creator_video_engagement_batch($1)',[[video,video,other]]);
try {
  const fixture=readFileSync(new URL('./qualified_content_view_notifications_test.sql',import.meta.url),'utf8');
  await db.exec(fixture.slice(fixture.indexOf('insert into auth.users'),fixture.indexOf('select ok(')));
  await db.query("update public.user_profiles set shares_visibility='public',profile_visibility='everyone',profile_access_visibility='public' where user_id=$1",[viewer]);
  await db.exec(`insert into public.creator_video_comments(id,video_id,user_id,body) values('${user(31)}','${video}','${viewer}','Counted comment');`);
  await db.exec(`insert into public.creator_video_comments(id,video_id,user_id,body,parent_comment_id) values('${user(32)}','${video}','${viewer}','Reply inside discussion','${user(31)}');`);
  await db.exec(migration);
  let rows=await read();
  eq(rows.length,1,'duplicates collapse and absent sources omitted');
  eq(Number(rows[0].comment_count),1,'pre-existing top-level discussion backfilled, not its reply');
  eq(Number(rows[0].like_count),0,'known empty has real zero');
  eq(rows[0].liked_by_viewer,false,'viewer state starts false');
  eq(rows[0].can_like,true,'current signed in authority can like');
  await actor('authenticated',viewer,'select public.set_creator_video_like($1,true)',[video]);
  await actor('authenticated',viewer,'select public.set_creator_video_like($1,true)',[video]);
  rows=await read();
  eq(Number(rows[0].like_count),1,'duplicate desired state cannot inflate likes');
  eq(rows[0].liked_by_viewer,true,'only own reaction state is returned');
  eq((await actor('anon',null,'select * from public.read_creator_video_engagement_batch($1)',[[video]]))[0].liked_by_viewer,false,'anonymous sees no viewer reaction');
  await assert.rejects(()=>actor('anon',null,'select public.set_creator_video_like($1,true)',[video]),/permission denied/);checks++;
  for(const table of ['likes','reposts','counts','write_limits']) {
    const flags=(await db.query(`select relrowsecurity,relforcerowsecurity from pg_class where oid='video_engagement_private.${table}'::regclass`)).rows[0];
    eq(flags,{relrowsecurity:true,relforcerowsecurity:true},`${table} forces RLS`);
    await assert.rejects(()=>actor('authenticated',viewer,`select * from video_engagement_private.${table}`),/permission denied/);checks++;
  }
  await assert.rejects(()=>actor('authenticated',viewer,'select video_engagement_private.apply_delta($1,0::smallint,100,0)',[video]),/permission denied/);checks++;
  await assert.rejects(()=>actor('anon',null,'select * from public.read_creator_video_engagement_batch($1)',[Array(51).fill(video)]),/Too many/);checks++;
  await actor('authenticated',viewer,'select public.set_creator_video_repost($1,true)',[video]);
  await actor('authenticated',viewer,'select public.set_creator_video_repost($1,true)',[video]);
  rows=await read();
  eq(Number(rows[0].repost_count),1,'idempotent public repost counted once');
  eq(rows[0].reposted_by_viewer,true,'caller own public repost state');
  let page=(await actor('anon',null,'select public.read_creator_video_reposts($1) page',[viewer]))[0].page;
  eq(page.items.map(item=>item.videoId),[video],'public repost actually appears in profile library');
  await db.query("update public.user_profiles set shares_visibility='private' where user_id=$1",[viewer]);
  eq(Number((await read())[0].repost_count),0,'privacy withdrawal removes public aggregate');
  eq((await actor('anon',null,'select public.read_creator_video_reposts($1) page',[viewer]))[0].page,null,'private shares cannot be read');
  await assert.rejects(()=>actor('authenticated',viewer,'select public.set_creator_video_repost($1,true)',[video]),/Public profile/);checks++;
  await db.query("update public.user_profiles set shares_visibility='public' where user_id=$1",[viewer]);
  eq(Number((await read())[0].repost_count),0,'making profile public cannot silently republish');
  await actor('authenticated',viewer,'select public.set_creator_video_repost($1,true)',[video]);
  await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1",[viewer]);
  eq(Number((await actor('anon',null,'select * from public.read_creator_video_engagement_batch($1)',[[video]]))[0].repost_count),0,'ban withdraws public repost aggregate');
  await db.query('update auth.users set banned_until=null where id=$1',[viewer]);
  await actor('authenticated',viewer,'select public.set_creator_video_repost($1,true)',[video]);
  for(const [status,expected] of [['hidden',0],['reported',1],['removed',0],['clean',1]]) {
    await db.query('update public.creator_video_comments set moderation_status=$1 where id=$2',[status,user(31)]);
    eq(Number((await read())[0].comment_count),expected,'comment moderation changes exact count');
  }
  await db.query('update public.creator_video_comments set deleted_at=now() where id=$1',[user(31)]);
  eq(Number((await read())[0].comment_count),0,'soft-deleted comment excluded');
  await db.query('update public.creator_video_comments set deleted_at=null where id=$1',[user(31)]);
  eq(Number((await read())[0].comment_count),1,'restored comment counted once');
  await db.exec('begin');
  await actor('authenticated',viewer,'select public.set_creator_video_like($1,false)',[video]);
  eq(Number((await read())[0].like_count),0,'unlike count in same transaction');
  await db.exec('rollback');
  eq(Number((await read())[0].like_count),1,'rollback restores both relation and count');
  await db.query("update public.videos set visibility='draft' where id=$1",[video]);
  eq((await read()).length,0,'private source omitted');
  eq((await actor('authenticated',viewer,'select * from public.read_authorized_creator_video_engagement($1)',[video])).length,0,'direct helper cannot bypass source privacy');
  await assert.rejects(()=>actor('authenticated',viewer,'select public.set_creator_video_like($1,true)',[video]),/Video unavailable/);checks++;
  await actor('authenticated',viewer,'select public.set_creator_video_like($1,false)',[video]);
  eq(Number((await db.query('select coalesce(sum(like_count),0) count from video_engagement_private.counts where video_id=$1',[video])).rows[0].count),0,'user may withdraw like from newly private source');
  await db.query("update public.videos set visibility='public' where id=$1",[video]);
  await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[user(12)]);
  await assert.rejects(()=>actor('authenticated',viewer,'select public.set_creator_video_like($1,true)',[video]),/Current signed-in/);checks++;
  eq((await read()).length,0,'expired session cannot read even public-source personalized summary');
  await db.query("update auth.sessions set not_after=now()+interval '1 hour' where id=$1",[user(12)]);
  await db.query('update video_engagement_private.write_limits set attempts=60,started_at=clock_timestamp() where user_id=$1',[viewer]);
  await assert.rejects(()=>actor('authenticated',viewer,'select public.set_creator_video_like($1,true)',[video]),/rate_limited/);checks++;
  await db.query("update video_engagement_private.write_limits set started_at=clock_timestamp()-interval '2 minutes' where user_id=$1",[viewer]);
  await actor('authenticated',viewer,'select public.set_creator_video_like($1,true)',[video]);
  eq(Number((await read())[0].like_count),1,'rate window resets using server time');
  await assert.rejects(()=>db.query('select video_engagement_private.apply_delta($1,video_engagement_private.bucket($2),-100,0)',[video,viewer]),/check constraint/);checks++;
  eq(Number((await read())[0].like_count),1,'counter underflow rejected atomically');
  await db.query('delete from public.videos where id=$1',[video]);
  eq(Number((await db.query('select count(*) from video_engagement_private.counts where video_id=$1',[video])).rows[0].count),0,'cascade removes counts without resurrection');
  eq(Number((await db.query('select count(*) from video_engagement_private.likes where video_id=$1',[video])).rows[0].count),0,'cascade removes reactions');
  console.log(`Creator video engagement: ${checks} full-schema SQL checks passed.`);
} finally {await db.close();}
