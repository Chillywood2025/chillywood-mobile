// Real full-schema SQL in disposable PGlite. Native multi-session locking is
// separately qualified; this suite does not claim hosted deployment evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {loadBundle,MIGRATIONS,readbackSql,buildApplySql,classifyState,HELPERS} from '../scripts/social-engagement-exact-deploy.mjs';

const readContext={currentPostgres:false,currentReadOnly:true,sessionPostgres:false,sessionReadOnly:true,sessionAdmin:false,transactionReadOnly:true};
for(const historical of [false,true])test(`exact social transaction preserves ${historical?'deployed November 4 checkpoint':'current sandbox successors'}`,{timeout:180_000},async()=>{
  const all=fs.readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort();
  const excluded=historical?all.filter(x=>x.split('_')[0]>'20261104032615'):MIGRATIONS.map(x=>x.path.split('/').at(-1));
  const {db,replayReport}=await createDatabase({implicitApiGrants:false,excludeMigrations:excluded});
  const bundle=loadBundle();
  const scalar=async sql=>(await db.query(sql)).rows[0].value;
  const read=async()=>{
    const results=await db.exec(readbackSql(bundle));
    const state=results.find(x=>x.rows?.[0]?.state)?.rows[0].state;
    // PGlite cannot model the management API's restricted connection role.
    // Only that transport context is substituted, not any SQL safety predicate.
    return {...state,context:readContext};
  };
  try{
    await db.exec(`create schema if not exists supabase_migrations;
      create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
      insert into supabase_migrations.schema_migrations values('20261104032615','test_preexisting_receipt',array['immutable historical fixture']);
      update public.platform_money_kill_switches set state='off' where key in ('live_money_enabled','cashout_enabled','payouts_enabled');`);
    assert.deepEqual(replayReport.files,all.filter(x=>!excluded.includes(x)));
    const fixture=fs.readFileSync(new URL('../supabase/tests/qualified_content_view_notifications_test.sql',import.meta.url),'utf8');
    await db.exec(fixture.slice(fixture.indexOf('insert into auth.users'),fixture.indexOf('select ok(')));
    await db.exec(`insert into public.creator_video_comments(id,video_id,user_id,body) values
      ('9a130000-0000-4000-8000-000000000081','9a130000-0000-4000-8000-000000000021','9a130000-0000-4000-8000-000000000002','Existing public discussion');
      insert into public.creator_video_comments(id,video_id,user_id,body,parent_comment_id) values
      ('9a130000-0000-4000-8000-000000000082','9a130000-0000-4000-8000-000000000021','9a130000-0000-4000-8000-000000000002','Existing reply','9a130000-0000-4000-8000-000000000081');`);
    const sourceBefore=await scalar("select jsonb_agg(to_jsonb(c) order by id) value from public.creator_video_comments c");
    for(const signature of HELPERS)assert.ok(await scalar(`select to_regprocedure('${signature}') is not null value`));
    const before=await read();assert.equal(classifyState(bundle,before),'ready');
    if(!historical){
      const videoHelper=(await db.query("select pg_get_functiondef(oid) definition,prosrc from pg_proc where oid='public.can_read_creator_video_row(text,text,text,text,text,text,text,text)'::regprocedure")).rows[0];
      const clause=' and not private.stripe_video_is_protected(v_video_ids[1])';
      assert.equal(videoHelper.prosrc.split(clause).length,2,'exactly one protective Stripe exclusion');
      assert.equal(createHash('sha256').update(videoHelper.prosrc.replace(clause,'')).digest('hex'),'f30d29ee49a58acd182c996b0e3cf5f23d71bc7e287ccad6562619b97c3f0eba','the reviewed successor adds only the protective clause');
      await db.exec(videoHelper.definition.replace(clause,' and true'));
      assert.equal((await read()).prerequisites,false,'unknown relaxed successor body cannot qualify');
      await db.exec(videoHelper.definition);
      await db.exec('grant execute on function public.can_read_creator_video_row(text,text,text,text,text,text,text,text) to service_role');
      assert.equal((await read()).prerequisites,false,'reviewed successor body with broader ACL cannot qualify');
      await db.exec('revoke execute on function public.can_read_creator_video_row(text,text,text,text,text,text,text,text) from service_role');
      assert.equal((await read()).prerequisites,true);
    }
    const sql=buildApplySql(bundle,before);
    // Concurrent deployment history between plan and apply is not adopted.
    await db.exec("insert into supabase_migrations.schema_migrations values('20261106000000','concurrent_fixture',array['test only'])");
    await assert.rejects(db.exec(sql),/social_baseline_changed/u);await db.exec('rollback');
    assert.equal(await scalar("select to_regnamespace('video_engagement_private') is null value"),true);
    await db.exec("delete from supabase_migrations.schema_migrations where version='20261106000000'");
    const helper=(await db.query("select pg_get_functiondef(oid) definition,prosrc from pg_proc where oid='public.can_view_profile_content(text)'::regprocedure")).rows[0];
    await db.exec(helper.definition.replace(helper.prosrc,'begin return false; end;'));
    assert.equal((await read()).prerequisites,false,'unknown authority helper cannot qualify');
    await assert.rejects(db.exec(sql),/social_baseline_changed/u);await db.exec('rollback');
    await db.exec(helper.definition);
    await db.exec('alter function public.can_view_profile_content(text) immutable');
    assert.equal((await read()).prerequisites,false,'same body with unsafe session-constant semantics is rejected');
    await assert.rejects(db.exec(sql),/social_baseline_changed/u);await db.exec('rollback');
    await db.exec('alter function public.can_view_profile_content(text) stable');
    await db.exec('create table public.social_deploy_drift_fixture(id integer)');
    await assert.rejects(db.exec(sql),/social_baseline_changed/u);await db.exec('rollback');
    await db.exec('drop table public.social_deploy_drift_fixture');
    // A failing final contract rolls back BOTH migrations and both receipts.
    const mutant={...bundle,manifest:{...bundle.manifest,targetCatalogSha256:'0'.repeat(64)}};
    await assert.rejects(db.exec(buildApplySql(mutant,before)),/social_postcheck_failed/u);await db.exec('rollback');
    assert.equal(await scalar("select count(*)::int value from supabase_migrations.schema_migrations"),1);
    assert.equal((await read()).absent,true);
    const targetAclMutant=sql.replace("if (not exists(select 1 from (", "grant select on video_engagement_private.likes to authenticated;\nif (not exists(select 1 from (");
    assert.notEqual(targetAclMutant,sql,'test-only final ACL injection found exactly one anchor');
    await assert.rejects(db.exec(targetAclMutant),/social_postcheck_failed/u);await db.exec('rollback');
    assert.equal((await read()).absent,true);
    await db.exec(sql);
    assert.equal(await scalar("select sum(comment_count)::int value from video_engagement_private.counts"),1);
    assert.deepEqual(await scalar("select jsonb_agg(to_jsonb(c) order by id) value from public.creator_video_comments c"),sourceBefore);
    const after=await read();assert.equal(classifyState(bundle,after),'applied');
    for(const key of ['priorHistorySha256','catalogSha256','controlsSha256'])assert.equal(after[key],before[key],key);
    assert.equal(after.targets.length,2);
    const history=(await db.query("select version,name,statements from supabase_migrations.schema_migrations where version in ('20261107173220','20261107191000') order by version")).rows;
    assert.deepEqual(history,bundle.migrations.map(x=>({version:x.version,name:x.name,statements:[x.body]})));
    await assert.rejects(db.exec(sql),/social_baseline_changed/u);await db.exec('rollback');
    assert.equal(classifyState(bundle,await read()),'applied');
    // Partial/misidentified state is never treated as permission to continue.
    await db.exec("delete from supabase_migrations.schema_migrations where version='20261107191000'");
    assert.throws(()=>classifyState(bundle,after.targets.length?{...after,targets:after.targets.slice(0,1)}:after),/PARTIAL_OR_DIFFERENT_HISTORY/u);
  }finally{await db.close();}
});
