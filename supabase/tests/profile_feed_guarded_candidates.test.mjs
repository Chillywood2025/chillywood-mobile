import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createDatabase} from '../../tests/helpers/database-runtime-authority-fixture.mjs';

let databaseFactory;
if(process.env.NATIVE_PG_ADAPTER) ({databaseFactory}=await import(pathToFileURL(process.env.NATIVE_PG_ADAPTER).href));
const migration='supabase/migrations/20261028005725_profile_feed_guarded_candidate_fastpath.sql';
const source=readFileSync(migration,'utf8');
const {db,replayReport}=await createDatabase({includeHeldStudio:true,applyRepair:true,databaseFactory});
const u=n=>`9b470000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actors=JSON.stringify(Array.from({length:65},(_,i)=>({actor_id:u(i+1),target_scope:i===0?'circle':'followers'})));
let checks=0;
const equal=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
const asUser=async(sql,args=[])=>{
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:u(1),session_id:'9b472000-0000-4000-8000-000000000001'})]);
  await db.exec('set role authenticated');
  try{return (await db.query(sql,args)).rows;}finally{await db.exec('reset role').catch(error=>{if(error.code!=='25P02')throw error;});}
};
const helper=()=>asUser('select * from public.read_authorized_profile_feed_candidates($1,null,null,$2,20)',[actors,'2099-01-01']);
const direct=()=>asUser(`select item.id,item.created_at from public.creator_feed_items item
 join jsonb_to_recordset($1::jsonb) actor(actor_id text,target_scope text)
 on item.creator_user_id=actor.actor_id and item.target_scope=actor.target_scope
 where item.status='active' and item.created_at<='2099-01-01' order by item.created_at desc,item.id desc limit 21`,[actors]);
const transaction=async(fn)=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback');await db.exec('reset role');}};
try{
 const fixture=readFileSync('supabase/tests/profile_relationship_feed_cursor_test.sql','utf8');
 await db.exec(fixture.slice(fixture.indexOf('create function pg_temp.feed_user'),fixture.indexOf('select ok(')));
 await db.exec(`insert into auth.sessions(id,user_id,not_after) values('9b472000-0000-4000-8000-000000000001','${u(1)}',now()+interval '1 day')`);
 equal((await helper()).length,21,'reviewed policy positively enables optimization');
 equal(await helper(),await direct(),'arbitrary helper actors reveal only direct-SELECT readable rows');
 const baselinePage=await asUser('select * from public.read_profile_relationship_feed_page(null,null,$1,20)',['2099-01-01']);
 await transaction(async()=>{
  await db.exec('revoke execute on function public.read_authorized_profile_feed_candidates(jsonb,timestamptz,uuid,timestamptz,integer) from authenticated');
  equal(await asUser('select * from public.read_profile_relationship_feed_page(null,null,$1,20)',['2099-01-01']),baselinePage,'revoked optimization helper uses original invoker path');
 });
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role',sub:u(1)})]);
 await db.exec('set role service_role');
 try {
  const rows=(await db.query('select * from public.read_profile_relationship_feed_page(null,null,$1,20)',['2099-01-01'])).rows;
  equal(rows.length,21,'service role retains executable invoker fallback without helper grant');
 } finally {await db.exec('reset role');}
 for(const change of [
  'create policy guarded_test_restrictive on public.creator_feed_items as restrictive for select to authenticated using(false)',
  'alter policy creator_feed_items_select_relationship_gated on public.creator_feed_items using(false)',
  'alter table public.creator_feed_items disable row level security',
  'revoke select on public.creator_feed_items from authenticated',
  'revoke execute on function public.can_read_creator_feed_item(text,text,text,text,text,text,text) from public,authenticated',
  'revoke execute on function auth.uid() from public,authenticated',
  'revoke usage on schema auth from public,authenticated',
 ]) await transaction(async()=>{await db.exec(change);equal(await helper(),[],`fails closed: ${change}`);});
 await transaction(async()=>{
  await db.exec('revoke usage on schema public from public,authenticated');
  await assert.rejects(helper,/permission denied for schema public/);checks++;
 });
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:u(1)})]);
 equal((await db.query('select * from public.read_authorized_profile_feed_candidates($1)',[actors])).rows,[],'JWT alone cannot impersonate actual authenticated SQL role');
 await transaction(async()=>{
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role',sub:u(1)})]);
  await db.exec('set role authenticated');
  equal((await db.query('select * from public.read_authorized_profile_feed_candidates($1)',[actors])).rows,[],'SQL role alone cannot impersonate signed JWT role');
 });
 await transaction(async()=>{
  // Adversarial canonical policy function: preserve identity, signature and policy
  // text, but make the newest raw row NULL. RLS treats NULL exactly as denial.
  const newest=(await helper())[0].id;
  const row=(await db.query('select source_id from public.creator_feed_items where id=$1',[newest])).rows[0];
  const definition=(await db.query("select pg_get_functiondef('public.can_read_creator_feed_item(text,text,text,text,text,text,text)'::regprocedure) definition")).rows[0].definition;
  const names=(await db.query("select proargnames from pg_proc where oid='public.can_read_creator_feed_item(text,text,text,text,text,text,text)'::regprocedure")).rows[0].proargnames;
  const replacement=definition.replace(/AS \$function\$[\s\S]*\$function\$/u,`AS $function$ begin if ${names[1]}='${row.source_id}' then return null; end if; return true; end; $function$`);
  assert.notEqual(replacement,definition);
  await db.exec(replacement);
  equal(await helper(),await direct(),'NULL raw head triggers complete authorized fallback including older rows');
  equal((await helper()).length,21,'NULL filtering never truncates a full authorized page');
  equal((await helper()).some(row=>row.id===newest),false,'NULL-authorized raw ID never exposed');
 });
 await transaction(async()=>{
  await db.exec('create policy guarded_source_test on public.creator_feed_items as restrictive for select to authenticated using(false)');
  equal(await asUser('select * from public.read_profile_relationship_feed_page(null,null,null,50)'),[],'wrapper fallback preserves a new restrictive source policy');
 });
 await transaction(async()=>{
  await db.exec('create policy guarded_relationship_test on public.channel_followers as restrictive for select to authenticated using(false)');
  const rows=await asUser('select * from public.read_profile_relationship_feed_page(null,null,null,50)');
  equal(rows.every(row=>[u(1),u(2)].includes(row.creator_user_id)),true,'wrapper honors invoker relationship restrictions');
 });
 equal(source.includes('where public.can_read_creator_feed_item'),true,'explicit canonical raw authorization');
 equal(/(?:from|join) public\.(?:user_friendships|channel_followers)/u.test(source.slice(0,source.indexOf('create or replace function public.read_profile_relationship_feed_page'))),false,'definer never reads relationship tables');
 console.log(JSON.stringify({status:'passed',checks,engine:databaseFactory?'native PostgreSQL':'PGlite',migrations:replayReport.files.length,sha256:createHash('sha256').update(source).digest('hex')}));
}finally{await db.close();}
