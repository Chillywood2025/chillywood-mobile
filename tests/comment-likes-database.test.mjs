// Actual full-schema SQL/RLS evidence. Single backend, not concurrency/load proof.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
const name='20261107191000_comment_likes.sql';
const {db}=await createDatabase({excludeMigrations:[name]});
const id=n=>`9a130000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let checks=0;
const eq=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
async function actor(n,sql,args=[]){
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(n?{role:'authenticated',sub:id(n),session_id:id(n+10)}:{role:'anon'})]);
  await db.exec(`set role ${n?'authenticated':'anon'}`);
  try{return(await db.query(sql,args)).rows;}finally{await db.exec('reset role');}
}
const read=(kind,comment,n=2)=>actor(n,'select * from public.read_comment_likes_batch($1,$2)',[kind,[id(comment),id(comment),id(999)]]);
const like=(kind,comment,value,n=2)=>actor(n,'select public.set_comment_like($1,$2,$3)',[kind,id(comment),value]);
try{
  const fixture=readFileSync('supabase/tests/qualified_content_view_notifications_test.sql','utf8');
  await db.exec(fixture.slice(fixture.indexOf('insert into auth.users'),fixture.indexOf('select ok(')));
  await db.query("update public.user_profiles set profile_visibility='everyone',profile_access_visibility='public' where user_id=$1",[id(1)]);
  await db.query('insert into public.profile_posts(id,user_id,body) values($1,$2,$3)',[id(40),id(1),'Comment like source']);
  await db.query('insert into public.profile_post_comments(id,post_id,user_id,body) values($1,$2,$3,$4)',[id(41),id(40),id(2),'Profile comment']);
  await db.query('insert into public.profile_post_comments(id,post_id,user_id,body,parent_comment_id) values($1,$2,$3,$4,$5)',[id(42),id(40),id(3),'Profile reply',id(41)]);
  await db.query('insert into public.creator_video_comments(id,video_id,user_id,body) values($1,$2,$3,$4)',[id(31),id(21),id(2),'Video comment']);
  await db.query('insert into public.creator_video_comments(id,video_id,user_id,body,parent_comment_id) values($1,$2,$3,$4,$5)',[id(32),id(21),id(3),'Video reply',id(31)]);
  await db.exec(readFileSync(`supabase/migrations/${name}`,'utf8'));
  for(const [kind,comment,reply,table] of [['profile_post_comment',41,42,'profile_post_comments'],['creator_video_comment',31,32,'creator_video_comments']]){
    let rows=await read(kind,comment);eq(rows.length,1,'duplicate ids collapse, absent comments omitted');eq(Number(rows[0].like_count),0,'known zero');
    await like(kind,comment,true);await like(kind,comment,true);
    rows=await read(kind,comment);eq(Number(rows[0].like_count),1,'idempotent true cannot inflate');eq(rows[0].liked_by_viewer,true,'own state');
    await like(kind,comment,true,3);rows=await read(kind,comment);eq(Number(rows[0].like_count),2,'multiple actors exact total');
    rows=await read(kind,comment,0);eq(Number(rows[0].like_count),2,'anonymous sees aggregate');eq(rows[0].liked_by_viewer,false,'no other actor identities');eq(rows[0].can_like,false,'anonymous cannot mutate');
    await assert.rejects(()=>like(kind,comment,true,0),/permission denied/);checks++;
    await like(kind,reply,true);eq(Number((await read(kind,reply))[0].like_count),1,'replies independently liked');
    await db.query(`update public.${table} set moderation_status='hidden' where id=$1`,[id(comment)]);
    eq((await read(kind,comment)).length,0,'hidden comment inaccessible even to own author');eq((await read(kind,reply)).length,0,'hidden ancestor hides reply likes');
    await assert.rejects(()=>like(kind,reply,true),/Comment unavailable/);checks++;
    await like(kind,comment,false); // withdrawals do not disclose inaccessible source.
    await db.query(`update public.${table} set moderation_status='clean' where id=$1`,[id(comment)]);
    eq(Number((await read(kind,comment))[0].like_count),1,'withdrawal persisted while hidden');
    await db.query(`update public.${table} set deleted_at=now() where id=$1`,[id(comment)]);
    eq((await read(kind,comment)).length,0,'soft deletion hides counts');
    await db.query(`update public.${table} set deleted_at=null where id=$1`,[id(comment)]);
    await db.exec('begin');await like(kind,comment,true);await db.exec('rollback');
    eq(Number((await read(kind,comment))[0].like_count),1,'rollback includes exact counter');
  }
  await db.query("update public.videos set visibility='draft' where id=$1",[id(21)]);
  eq((await read('creator_video_comment',31)).length,0,'draft video hides child counts');
  await assert.rejects(()=>like('creator_video_comment',31,true),/Comment unavailable/);checks++;
  await db.query("update public.videos set visibility='public' where id=$1",[id(21)]);
  await db.query("update public.user_profiles set profile_access_visibility='private' where user_id=$1",[id(1)]);
  eq((await read('profile_post_comment',41)).length,0,'private profile hides child counts');
  await db.query("update public.user_profiles set profile_access_visibility='public' where user_id=$1",[id(1)]);
  await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[id(12)]);
  eq((await read('creator_video_comment',31)).length,0,'expired session cannot read personalized totals');
  await assert.rejects(()=>like('creator_video_comment',31,true),/Current signed-in/);checks++;
  await db.query("update auth.sessions set not_after=now()+interval '1 hour' where id=$1",[id(12)]);
  for(const table of ['likes','counts','limits']){await assert.rejects(()=>actor(2,`select * from comment_likes_private.${table}`),/permission denied/);checks++;}
  await assert.rejects(()=>actor(2,"select comment_likes_private.visible('creator_video_comment',$1)",[id(31)]),/permission denied/);checks++;
  await assert.rejects(()=>actor(2,'select * from public.read_comment_likes_batch($1,$2)',['creator_video_comment',Array(51).fill(id(31))]),/Invalid comment batch/);checks++;
  await db.query('update comment_likes_private.limits set attempts=120,started_at=clock_timestamp() where user_id=$1',[id(2)]);
  await assert.rejects(()=>like('creator_video_comment',31,true),/rate_limited/);checks++;
  await db.query('delete from public.creator_video_comments where id=$1',[id(31)]);
  eq(Number((await db.query("select count(*) n from comment_likes_private.likes where kind='creator_video_comment'")).rows[0].n),0,'hard-delete cascaded replies remove reactions');
  eq(Number((await db.query("select count(*) n from comment_likes_private.counts where kind='creator_video_comment'")).rows[0].n),0,'hard-delete removes all counters');
  console.log(`Comment likes: ${checks} full-schema SQL checks passed.`);
}finally{await db.close();}
