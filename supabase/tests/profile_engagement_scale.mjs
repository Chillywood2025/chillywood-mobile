// Optional isolated viral-post READ benchmark. No production connection.
// Generated liker IDs are fixtures; notification/retention write capacity is NOT
// measured. All canonical read RLS and trigger definitions are restored before
// queries. Run: node supabase/tests/profile_engagement_scale.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDatabase } from '../../tests/helpers/database-runtime-authority-fixture.mjs';
// Historical pre-counter baseline: the subsequent counter migration must not
// be applied to fixtures whose bulk seed deliberately suppresses write hooks.
const {db,replayReport}=await createDatabase({includeHeldStudio:true,applyRepair:true,
  excludeMigrations:['20261028005432_profile_engagement_sharded_counters.sql']});
const post='9b471000-0000-4000-8000-000000000002';
const migrationURL=new URL('../migrations/20261028005149_profile_relationship_feed_cursor.sql',import.meta.url);
const sql=readFileSync(migrationURL,'utf8');
const hashes={migration:createHash('sha256').update(sql).digest('hex'),script:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex')};
const queryAsViewer=async(sql,args=[])=>{
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:'9b470000-0000-4000-8000-000000000001',session_id:'9b472000-0000-4000-8000-000000000001'})]);
  await db.exec('set role authenticated');
  try{return(await db.query(sql,args)).rows;}finally{await db.exec('reset role');}
};
const triggerState=async()=>(await db.query("select tgname,tgenabled,pg_get_triggerdef(oid) definition from pg_trigger where tgrelid='public.profile_post_likes'::regclass and not tgisinternal order by tgname")).rows;
try{
  const fixture=readFileSync(new URL('./profile_relationship_feed_cursor_test.sql',import.meta.url),'utf8');
  await db.exec(fixture.slice(fixture.indexOf('create function pg_temp.feed_user'),fixture.indexOf('select ok(')));
  await db.exec("insert into auth.sessions(id,user_id,not_after) values('9b472000-0000-4000-8000-000000000001','9b470000-0000-4000-8000-000000000001',now()+interval '1 day')");
  const triggers=await triggerState();
  const read=()=>queryAsViewer('select * from public.read_profile_post_engagement_batch($1)',[[post]]);
  const queryStart=sql.indexOf('  return query\n',sql.indexOf('function public.read_profile_post_engagement_batch'));
  const queryEnd=sql.indexOf(';\nend;',queryStart);
  assert.ok(queryStart>0&&queryEnd>queryStart);
  const exactQuery=sql.slice(queryStart+'  return query\n'.length,queryEnd).replace(/\bp_post_ids\b/gu,'$1::uuid[]');
  const measurements=[];
  let capacityTimeout=false;
  for(const total of [100_000,1_000_000]){
    console.error(`Viral read fixture: generating ${total} likes`);
    await db.exec('alter table public.profile_post_likes disable trigger user');
    await db.exec(`insert into public.profile_post_likes(post_id,user_id)
      select '${post}'::uuid,'9b4a0000-0000-4000-8000-'||lpad(n::text,12,'0')
      from generate_series(${total===100_000?1:100_001},${total}) n`);
    for(const trigger of triggers){
      const mode={O:'enable',D:'disable',A:'enable always',R:'enable replica'}[trigger.tgenabled];
      const name='"'+trigger.tgname.replaceAll('"','""')+'"';
      await db.exec(`alter table public.profile_post_likes ${mode} trigger ${name}`);
    }
    assert.deepEqual(await triggerState(),triggers,'all trigger states/definitions restored before measurement');
    await db.exec('analyze public.profile_post_likes');
    await db.exec("set statement_timeout='30s'");
    const timings=[];
    for(let sample=0;sample<3;sample++){
      const start=performance.now();let rows;
      try{rows=await read();}catch(error){
        if(error.code!=='57014') throw error;
        capacityTimeout=true;
        measurements.push({likes:total+2,queryBudgetMs:30000,capacityTimeout:true,readMs:timings});
        break;
      }
      timings.push(performance.now()-start);
      assert.equal(Number(rows[0].like_count),total+2,'all generated and initial likes counted exactly');
      assert.equal(rows[0].liked_by_viewer,false);
    }
    if(capacityTimeout) break;
    const plan=(await queryAsViewer(`explain (analyze,buffers,format json) ${exactQuery}`,[[post]]))[0]['QUERY PLAN'];
    measurements.push({likes:total+2,readMs:timings,plan});
    console.error(`Viral read fixture: completed ${total} likes`);
  }
  if(capacityTimeout) process.exitCode=1;
  console.log(JSON.stringify({status:capacityTimeout?'capacity_timeout':'passed',queryBudgetMs:30000,engine:'PGlite canonical migration replay',migrations:replayReport.files.length,
    productionCapacity:false,nativeConcurrency:false,fixtureOnlyWriteTriggersSuppressed:true,hashes,measurements}));
}finally{await db.close();}
