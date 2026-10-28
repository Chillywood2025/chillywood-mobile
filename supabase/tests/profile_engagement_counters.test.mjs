// Canonical product schema/RLS and actual production backfill/trigger SQL.
// Optional PROFILE_COUNTER_SCALE=1 adds isolated 100k/1m READ measurements.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {isAbsolute} from 'node:path';
import {createDatabase} from '../../tests/helpers/database-runtime-authority-fixture.mjs';
const name='20261028005432_profile_engagement_sharded_counters.sql';
const source=readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8');
let databaseFactory;
if(process.env.NATIVE_PG_ADAPTER){
  assert.ok(isAbsolute(process.env.NATIVE_PG_ADAPTER),'native test adapter must be an explicit local absolute path');
  ({databaseFactory}=await import(pathToFileURL(process.env.NATIVE_PG_ADAPTER).href));
}
const {db,replayReport}=await createDatabase({includeHeldStudio:true,applyRepair:true,excludeMigrations:[name],databaseFactory});
const p=n=>`9b471000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const u=n=>`9b470000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const totals=async id=>(await db.query('select coalesce(sum(like_count),0)::int likes,coalesce(sum(comment_count),0)::int comments from profile_engagement_private.post_counts where post_id=$1',[id])).rows[0];
const asRole=async(role,actor,sql,args=[])=>{
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,...(actor?{sub:u(actor),session_id:`9b472000-0000-4000-8000-${String(actor).padStart(12,'0')}`}:{})})]);
  await db.exec(`set role ${role}`);
  try{return(await db.query(sql,args)).rows;}finally{await db.exec('reset role');}
};
try{
  const setup=readFileSync(new URL('./profile_relationship_feed_cursor_test.sql',import.meta.url),'utf8');
  await db.exec(setup.slice(setup.indexOf('create function pg_temp.feed_user'),setup.indexOf('select ok(')));
  await db.exec(`insert into auth.sessions(id,user_id,not_after) select ('9b472000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.feed_user(n)::uuid,now()+interval '1 day' from generate_series(1,65)n`);
  await db.exec(source);
  eq(await totals(p(2)),{likes:2,comments:2},'actual migration backfills existing source rows');
  await assert.rejects(()=>db.query("select profile_engagement_private.apply_delta($1,profile_engagement_private.bucket($2),-1000,0)",[p(2),u(62)]),/check constraint/);checks++;
  eq(await totals(p(2)),{likes:2,comments:2},'underflow rejects atomically instead of clamping or corrupting counts');
  const parity=async()=>{
    const rows=(await db.query(`select p.id,
      (select count(*)::int from public.profile_post_likes l where l.post_id=p.id) likes,
      (select count(*)::int from public.profile_post_comments c where c.post_id=p.id and c.deleted_at is null and c.moderation_status in ('clean','reported')) comments
      from public.profile_posts p where p.id in ($1,$2)`,[p(2),p(3)])).rows;
    for(const row of rows)eq(await totals(row.id),{likes:row.likes,comments:row.comments},'counter equals canonical eligible source rows');
  };
  await db.query('insert into public.profile_post_likes(post_id,user_id) values($1,$2) on conflict do nothing',[p(2),u(62)]);
  await parity();
  await db.exec('begin');
  await db.query('delete from public.profile_post_likes where post_id=$1 and user_id=$2',[p(2),u(62)]);
  eq((await totals(p(2))).likes,1,'delete delta occurs in same transaction');
  await db.exec('rollback');
  eq((await totals(p(2))).likes,2,'source and counter rollback together');
  const comment=(await db.query('select id from public.profile_post_comments where post_id=$1 order by id limit 1',[p(2)])).rows[0].id;
  for(const status of ['hidden','clean','reported','hidden','reported']){
    await db.query('update public.profile_post_comments set moderation_status=$1 where id=$2',[status,comment]);await parity();
  }
  await db.query('update public.profile_post_comments set deleted_at=now() where id=$1',[comment]);await parity();
  await db.query('update public.profile_post_comments set deleted_at=null where id=$1',[comment]);await parity();
  await db.query('update public.profile_post_comments set post_id=$1 where id=$2',[p(3),comment]);await parity();
  await db.query('delete from public.profile_post_comments where id=$1',[comment]);await parity();
  await db.query('update public.profile_post_likes set post_id=$1 where post_id=$2 and user_id=$3',[p(3),p(2),u(62)]);await parity();
  await db.query('delete from public.profile_post_likes where post_id=$1 and user_id=$2',[p(3),u(62)]);await parity();
  eq((await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='profile_engagement_private.post_counts'::regclass")).rows[0],{relrowsecurity:true,relforcerowsecurity:true},'private counters force RLS');
  for(const role of ['anon','authenticated','service_role']){
    await assert.rejects(()=>asRole(role,role==='anon'?null:1,'select * from profile_engagement_private.post_counts'),/permission denied/);checks++;
    eq((await db.query("select has_function_privilege($1,'profile_engagement_private.apply_delta(uuid,smallint,bigint,bigint)','execute') allowed",[role])).rows[0].allowed,false,'app role cannot forge counters');
  }
  const helper='select * from public.read_authorized_profile_post_counts($1)';
  eq((await asRole('anon',null,helper,[p(2)])).length,1,'anonymous public counts available');
  // Runtime fault oracle: normal path must not even prepare the expensive
  // fallback SELECT on comments. Restore ACL immediately after this test.
  await db.exec('revoke select on public.profile_post_comments from authenticated');
  eq((await db.query("select has_table_privilege('authenticated','public.profile_post_comments','select') allowed")).rows[0].allowed,false,'fault oracle removes fallback table read privilege');
  eq((await asRole('authenticated',1,'select * from public.read_profile_post_engagement_batch($1)',[[p(2)]])).length,1,'normal path never executes or prepares fallback query');
  await db.exec('grant select on public.profile_post_comments to authenticated');
  await db.query("update public.user_profiles set profile_access_visibility='private' where user_id=$1",[u(3)]);
  await db.query("update public.profile_posts set moderation_status='hidden' where id=$1",[p(4)]);
  await db.query('update public.profile_posts set deleted_at=now() where id=$1',[p(8)]);
  await db.query('insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values($1,$2,$1),($2,$3,$2)',[u(5),u(1),u(6)]);
  for(const role of ['anon','authenticated'])for(const n of [3,4,8,999])eq(await asRole(role,role==='anon'?null:1,helper,[p(n)]),[],'direct helper omits inaccessible/nonexistent source');
  for(const n of [5,6])eq(await asRole('authenticated',1,helper,[p(n)]),[],'both-direction block applies to direct helper');
  eq(await asRole('authenticated',4,helper,[p(4)]),[],'owner cannot count own hidden post through helper');
  await db.query('insert into public.profile_post_likes(post_id,user_id) values($1,$2)',[p(2),u(2)]);
  await db.query("insert into public.profile_post_comments(post_id,user_id,body) values($1,$2,'Owner subset')",[p(2),u(2)]);
  await db.query("insert into public.account_deletion_requests(user_id,status,restore_deadline,delete_after) values($1,'scheduled',now()+interval '30 days',now()+interval '30 days')",[u(2)]);
  eq(await asRole('authenticated',2,helper,[p(2)]),[],'scheduled-deletion owner cannot read other users aggregate');
  const restricted=await asRole('authenticated',2,`select
    (select count(*) from public.profile_post_likes where post_id=$1) like_count,
    (select count(*) from public.profile_post_comments where post_id=$1 and deleted_at is null and moderation_status in ('clean','reported')) comment_count`,[p(2)]);
  const restrictedBatch=await asRole('authenticated',2,'select like_count,comment_count from public.read_profile_post_engagement_batch($1)',[[p(2)]]);
  eq(restrictedBatch,restricted,'restricted owner fallback preserves exact canonical child RLS');
  eq(Number(restrictedBatch[0].like_count),1,'restricted owner gets only own like, not other users remaining like');
  eq(Number(restrictedBatch[0].comment_count),1,'restricted owner gets only own comment, not other users remaining comment');
  await db.query('delete from public.account_deletion_requests where user_id=$1',[u(2)]);
  await db.query('delete from public.profile_posts where id=$1',[p(2)]);
  eq(await totals(p(2)),{likes:0,comments:0},'parent hard-delete cascades without underflow');
  // Negative control proves parity detects a missing production trigger.
  await db.exec('alter table public.profile_post_likes disable trigger profile_post_likes_exact_count');
  await db.query('insert into public.profile_post_likes(post_id,user_id) values($1,$2)',[p(10),u(62)]);
  eq((await totals(p(10))).likes,0,'negative control missing trigger leaves stale count');
  await db.query('delete from public.profile_post_likes where post_id=$1',[p(10)]);
  await db.exec('alter table public.profile_post_likes enable trigger profile_post_likes_exact_count');
  await db.query('insert into public.profile_post_likes(post_id,user_id) values($1,$2)',[p(10),u(62)]);
  eq((await totals(p(10))).likes,1,'restored production trigger counts same operation');
  const measurements=[];
  if(process.env.PROFILE_COUNTER_SCALE==='1'){
    const triggerState=async()=>(await db.query("select tgname,tgenabled,pg_get_triggerdef(oid) definition from pg_trigger where tgrelid='public.profile_post_likes'::regclass and not tgisinternal order by tgname")).rows;
    const triggers=await triggerState();
    const start=source.indexOf('insert into profile_engagement_private.post_counts(post_id,bucket,like_count,comment_count)');
    const end=source.indexOf(';',start);
    assert.ok(start>0&&end>start);
    const backfill=source.slice(start,end+1);
    for(const size of [100_000,1_000_000]){
      console.error(`Counter READ fixture: seeding ${size} likes`);
      // Fixture loading is not a write benchmark. Production backfill rebuilds
      // the counters after synthetic bulk load; all exact trigger definitions
      // and states are restored before the actual source-authorized RPC read.
      await db.exec('alter table public.profile_post_likes disable trigger user');
      await db.exec(`insert into public.profile_post_likes(post_id,user_id) select '${p(10)}','9b4a0000-0000-4000-8000-'||lpad(n::text,12,'0') from generate_series(${size===100_000?1:100_001},${size})n`);
      for(const trigger of triggers){
        const mode={O:'enable',D:'disable',A:'enable always',R:'enable replica'}[trigger.tgenabled];
        await db.exec(`alter table public.profile_post_likes ${mode} trigger "${trigger.tgname.replaceAll('"','""')}"`);
      }
      eq(await triggerState(),triggers,'all production write trigger states restored');
      await db.exec('truncate profile_engagement_private.post_counts');
      const backfillStart=performance.now();await db.exec(backfill);const backfillMs=performance.now()-backfillStart;
      await db.exec('analyze public.profile_post_likes;analyze profile_engagement_private.post_counts');
      const times=[];
      for(let i=0;i<12;i++){
        const time=performance.now();
        const result=await asRole('authenticated',1,'select * from public.read_profile_post_engagement_batch($1)',[[p(10)]]);
        times.push(performance.now()-time);eq(Number(result[0].like_count),size+1,'viral counts remain exact');
      }
      const instrumentedRpcMs=[];
      if(databaseFactory&&process.env.PROFILE_COUNTER_NESTED_PLANS==='1'){
        // Local diagnostics only, AFTER the untuned 12-call measurements. This
        // logs actual cached nested plans; it never changes planner/JIT choices.
        await db.exec("load 'auto_explain';set auto_explain.log_min_duration='50ms';set auto_explain.log_analyze=true;set auto_explain.log_buffers=true;set auto_explain.log_nested_statements=true;set auto_explain.log_format='json'");
        for(let i=0;i<2;i++){
          const t=performance.now();
          await asRole('authenticated',1,'select * from public.read_profile_post_engagement_batch($1)',[[p(10)]]);
          instrumentedRpcMs.push(performance.now()-t);
        }
        await db.exec("set auto_explain.log_min_duration='-1'");
      }
      const helperStart=source.indexOf('  select coalesce(sum(counts.like_count)');
      const helperEnd=source.indexOf('\n$$;',helperStart);
      const exactHelper=source.slice(helperStart,helperEnd).replace(/\bp_post_id\b/gu,'$1::uuid');
      // Definer executes as database owner but current request claims remain.
      const plan=(await db.query(`explain (analyze,buffers,format json) ${exactHelper}`,[p(10)])).rows[0]['QUERY PLAN'];
      const batchStart=source.indexOf('    return query\n');
      const batchEnd=source.indexOf(';',batchStart);
      const exactBatch=source.slice(batchStart+'    return query\n'.length,batchEnd)
        .replace(/\bv_post\b/gu,'$1::uuid').replace(/\bv_viewer\b/gu,'$2::text')
        .replace(/\bv_likes\b/gu,'$3::bigint').replace(/\bv_comments\b/gu,'$4::bigint');
      const batchPlan=(await asRole('authenticated',1,`explain (analyze,buffers,format json) ${exactBatch}`,[p(10),u(1),size+1,0]))[0]['QUERY PLAN'];
      const batchIds=Array.from({length:50},(_,i)=>p(i+10));
      const batchStartMs=performance.now();
      const batchRows=await asRole('authenticated',1,'select * from public.read_profile_post_engagement_batch($1)',[batchIds]);
      const fiftyPostBatchMs=performance.now()-batchStartMs;
      eq(batchRows.length,50,'50 distinct public posts read with one viral post');
      const shardRows=Number((await db.query('select count(*) from profile_engagement_private.post_counts where post_id=$1',[p(10)])).rows[0].count);
      assert.ok(shardRows<=64);checks++;
      measurements.push({likes:size+1,shardRows,backfillMs,rpcReadMs:times,instrumentedRpcMs,fiftyPostBatchMs,fiftyPostBatchComposition:'one viral post and 49 zero-engagement posts',exactHelperPlan:plan,exactReturnQueryPlan:batchPlan});
      if(size===1_000_000){
        await db.exec('alter table public.profile_post_likes disable trigger user');
        await db.exec(`update public.profile_post_likes set post_id=('9b471000-0000-4000-8000-'||lpad((10+mod(right(user_id,12)::bigint,50))::text,12,'0'))::uuid where user_id like '9b4a0000-%'`);
        for(const trigger of triggers){
          const mode={O:'enable',D:'disable',A:'enable always',R:'enable replica'}[trigger.tgenabled];
          await db.exec(`alter table public.profile_post_likes ${mode} trigger "${trigger.tgname.replaceAll('"','""')}"`);
        }
        eq(await triggerState(),triggers,'all trigger states restored for distributed viral batch');
        await db.exec('truncate profile_engagement_private.post_counts');await db.exec(backfill);
        await db.exec('analyze public.profile_post_likes;analyze profile_engagement_private.post_counts');
        const distributedMs=[];
        for(let i=0;i<3;i++){
          const t=performance.now();
          const rows=await asRole('authenticated',1,'select * from public.read_profile_post_engagement_batch($1)',[batchIds]);
          distributedMs.push(performance.now()-t);
          eq(rows.length,50,'all 50 viral posts included');
          eq(rows.reduce((sum,row)=>sum+Number(row.like_count),0),1_000_001,'50-post viral batch exactly counts million distributed likes');
          assert.ok(rows.every(row=>Number(row.like_count)>=20_000));checks++;
        }
        measurements.push({likes:1_000_001,distribution:'50 posts with 20000 synthetic likes each, plus one original like',fiftyViralPostBatchMs:distributedMs});
      }
    }
  }
  console.log(JSON.stringify({status:'passed',checks,migrations:replayReport.files.length+1,engine:databaseFactory?'native PostgreSQL canonical schema':'PGlite canonical schema',version:(await db.query('select version()')).rows[0].version,nativeConcurrency:false,productionCapacity:false,fixtureOnlyWriteTriggersSuppressed:measurements.length>0,measurements,hash:createHash('sha256').update(source).digest('hex'),scriptHash:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex')}));
}finally{await db.close();}
