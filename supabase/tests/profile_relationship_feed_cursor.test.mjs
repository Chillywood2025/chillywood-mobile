// Entire canonical migration replay. Managed auth/storage/cron/realtime use the
// repository's catalog-derived test harness; public product RLS is not stubbed.
// PGlite is single-backend: this is not native concurrency or production proof.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDatabase } from '../../tests/helpers/database-runtime-authority-fixture.mjs';

const roleMigration='20261027211112_profile_public_read_role_isolation.sql';
const { db, replayReport } = await createDatabase({ includeHeldStudio: true, applyRepair: true, excludeMigrations:[roleMigration] });
const u = n => `9b470000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const p = n => `9b471000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const s = n => `9b472000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const user = async (n, sql, args = []) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role:'authenticated',sub:u(n),session_id:s(n) })]);
  await db.exec('set role authenticated');
  try { return (await db.query(sql,args)).rows; } finally { await db.exec('reset role'); }
};
const page = (cursor = null, limit = 20, snapshot = '2099-01-01T00:00:00Z') => user(1,
  'select * from public.read_profile_relationship_feed_page($1,$2,$3,$4)',
  [cursor?.created_at ?? null,cursor?.id ?? null,snapshot,limit]);
const explainProductionQuery = async (cursor = null) => {
  const source=readFileSync(new URL('../migrations/20261027210217_profile_relationship_feed_cursor.sql',import.meta.url),'utf8');
  const start=source.indexOf('  return query\n');
  const end=source.indexOf(';\nend;',start);
  assert.ok(start>=0&&end>start,'exact production RETURN QUERY found');
  // Only PL/pgSQL local/argument bindings are replaced. The relational query,
  // CTE/materialization/lateral/limit/predicate text stays production-identical.
  const query=source.slice(start+'  return query\n'.length,end)
    .replace(/\bv_viewer\b/gu,'$1::text').replace(/\bp_before_created_at\b/gu,'$2::timestamptz')
    .replace(/\bp_before_id\b/gu,'$3::uuid').replace(/\bv_snapshot\b/gu,'$4::timestamptz')
    .replace(/\bv_limit\b/gu,'$5::integer');
  return (await user(1,`explain (analyze,buffers,format json) ${query}`,
    [u(1),cursor?.created_at??null,cursor?.id??null,'2099-01-01T00:00:00Z',20]))[0]['QUERY PLAN'];
};
try {
  const policiesBefore=(await db.query("select tablename,policyname,qual from pg_policies where policyname in ('profile_posts_select_public_clean_or_owner','profile_post_comments_select_public_clean_or_owner','profile_post_likes_select_public_clean','social_attachments_select_authorized') order by tablename")).rows;
  await db.query("select set_config('request.jwt.claims','{\"role\":\"anon\"}',false)");
  await db.exec('set role anon');
  await assert.rejects(()=>db.query('select id from public.profile_posts where id=$1',[p(1)]),/permission denied for function has_platform_role/);checks++;
  await db.exec('reset role');
  await db.exec(readFileSync(new URL(`../migrations/${roleMigration}`,import.meta.url),'utf8'));
  check((await db.query("select tablename,policyname,qual from pg_policies where policyname in ('profile_posts_select_public_clean_or_owner','profile_post_comments_select_public_clean_or_owner','profile_post_likes_select_public_clean','social_attachments_select_authorized') order by tablename")).rows,policiesBefore,'authenticated policy predicates are unchanged');
  check((await db.query("select has_function_privilege('anon','public.has_platform_role(text[])','execute') allowed")).rows[0].allowed,false,'no anonymous staff-helper grant');
  // Share the actual pgTAP setup so native and embedded tests use the same
  // normal source inserts/fanout trigger; no fabricated relationship-feed rows.
  const native = readFileSync(new URL('./profile_relationship_feed_cursor_test.sql', import.meta.url),'utf8');
  const setup = native.slice(native.indexOf('create function pg_temp.feed_user'), native.indexOf('select ok('));
  await db.exec(setup);
  await db.exec(`insert into auth.sessions(id,user_id,not_after)
    select ('9b472000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.feed_user(n)::uuid,now()+interval '1 day'
    from generate_series(1,65) n;`);
  const summaries=await user(1,'select * from public.read_profile_post_engagement_batch($1)',[[p(2)]]);
  check(Number(summaries[0]?.like_count),2,'batch counts likes from other users');
  check(Number(summaries[0]?.comment_count),2,'batch counts comments from other users');
  check(summaries[0]?.liked_by_viewer,false,'viewer like is independent from aggregate');
  const metadata = (await db.query("select prosecdef from pg_proc where oid='public.read_profile_relationship_feed_page(timestamptz,uuid,timestamptz,integer)'::regprocedure")).rows[0];
  check(metadata.prosecdef,false,'invoker, not RLS bypass');
  check((await db.query("select has_function_privilege('anon','public.read_profile_relationship_feed_page(timestamptz,uuid,timestamptz,integer)','execute') allowed")).rows[0].allowed,false,'anon denied');
  await assert.rejects(() => page({created_at:'2026-01-01T00:00:00Z'},20), /Invalid feed cursor/); checks++;
  await assert.rejects(() => page(null,20,'infinity'), /Invalid feed cursor/); checks++;
  const all = [], seen = new Set(); let cursor = null;
  while (true) {
    const rows = await page(cursor,20);
    check(rows.length <= 21,true,'bounded result');
    for (const row of rows.slice(0,20)) {
      assert.ok(!seen.has(row.source_id),'no duplicate source across pages'); checks++;
      seen.add(row.source_id); all.push(row);
    }
    if (rows.length <= 20) break;
    cursor = rows[19];
  }
  check(all.length,61,'all own and sixty followed creators reachable');
  check(all.find(row=>row.creator_user_id===u(2))?.source_context,'chilly_circle','Circle precedence deduplicates following');
  check(all.find(row=>row.creator_user_id===u(1))?.source_context,'own','owner context');
  check(all.some(row=>row.creator_user_id===u(64)),false,'outsider excluded');
  check((await page(null,100000)).length,51,'max50 plus lookahead');
  const first = (await page(null,20)).slice(0,20);
  await db.query('update public.profile_posts set updated_at=now() where id=$1',[first[0].source_id]);
  check((await page(null,20)).slice(0,20).map(row=>row.id),first.map(row=>row.id),'source updates do not reorder stable cursor');
  await db.query("update public.creator_feed_items set created_at=now()+interval '1 day',id=gen_random_uuid() where id=$1",[first[0].id]);
  check((await page(null,20)).slice(0,20).map(row=>row.id),first.map(row=>row.id),'explicit cursor identity rewrite is prevented');
  const serverPage=await page(null,20,null);
  assert.ok(serverPage[0]?.snapshot_at,'first page provides server snapshot');checks++;
  await db.exec('select pg_sleep(0.01)');
  await db.query("insert into public.profile_posts(id,user_id,body) values($1,$2,'Post after snapshot fixture')",[p(20000),u(1)]);
  check((await page(null,50,serverPage[0].snapshot_at)).some(row=>row.source_id===p(20000)),false,'later insert excluded by preserved server snapshot');
  check((await page(null,20,null)).some(row=>row.source_id===p(20000)),true,'refresh receives later insert');
  await db.exec(`update public.user_profiles set profile_access_visibility='private' where user_id='${u(3)}';
    update public.profile_posts set moderation_status='hidden' where user_id='${u(4)}';
    update public.profile_posts set deleted_at=now() where user_id='${u(8)}';
    insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values('${u(5)}','${u(1)}','${u(5)}'),('${u(1)}','${u(6)}','${u(1)}');`);
  const hidden = new Set([u(3),u(4),u(5),u(6),u(8)]);
  check((await page(null,50)).some(row=>hidden.has(row.creator_user_id)),false,'canonical private/moderation/bidirectional-block RLS');
  check((await user(1,'select * from public.read_profile_post_engagement_batch($1)',[[p(3),p(4),p(5),p(6)]])).length,0,'batch source privacy gates');
  await assert.rejects(()=>user(1,'select * from public.read_profile_post_engagement_batch($1)',[Array(51).fill(p(1))]),/Too many profile posts/); checks++;
  await db.exec(`update public.user_friendships set status='removed' where user_low_id='${u(1)}' and user_high_id='${u(2)}';
    delete from public.channel_followers where channel_user_id='${u(2)}' and follower_user_id='${u(1)}';`);
  check((await page(null,50)).some(row=>row.creator_user_id===u(2)),false,'revocation invalidates next read');
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'anon'})]);
  await db.exec('set role anon');
  check((await db.query('select * from public.read_profile_post_engagement_batch($1)',[[p(1)]])).rows.length,1,'anon public summary');
  check((await db.query('select * from public.read_profile_post_engagement_batch($1)',[[p(3)]])).rows.length,0,'anon private summary denied');
  for(const [table,column] of [['profile_posts','id'],['profile_post_likes','post_id'],['profile_post_comments','post_id']]) {
    check((await db.query(`select * from public.${table} where ${column}=$1`,[p(2)])).rows.length,table==='profile_posts'?1:2,'anon public direct '+table);
  }
  const attachments=(await db.query("select id from public.social_attachments where id::text like '9b473000-%' order by id")).rows.map(row=>row.id);
  check(attachments,['9b473000-0000-4000-8000-000000000001','9b473000-0000-4000-8000-000000000005'],'anon attachment source, scan and moderation filtering');
  await db.exec('reset role');
  // Negative control: the same privacy assertion fails when the actual feed
  // SELECT RLS is removed, proving this test depends on source authorization.
  await db.exec('alter table public.creator_feed_items disable row level security');
  const unsafeFirst=await page(null,50);
  const unsafeRemaining=unsafeFirst.length>50 ? await page(unsafeFirst[49],50) : [];
  check([...unsafeFirst,...unsafeRemaining].some(row=>row.creator_user_id===u(3)),true,'negative control detects RLS removal');
  await db.exec('alter table public.creator_feed_items enable row level security');
  const performance = [];
  if (process.env.PROFILE_FEED_SCALE === '1') {
    // Isolated index-volume stress, NOT a production throughput promise. These
    // unrelated rows intentionally have nonexistent source IDs: the query must
    // exclude their creators before source RLS work. Connected sources above
    // are real posts and execute the canonical permissions dependency graph.
    for (const total of [100_000,1_000_000]) {
      console.error(`Index-volume fixture: inserting through ${total} unrelated rows`);
      // These are index-volume fixtures, not source-write tests. Global retained
      // media reference guards would otherwise inspect each artificial row.
      // Restore every trigger before any measured SELECT; keep all RLS enabled.
      await db.exec(`alter table public.creator_feed_items disable trigger user;
        insert into public.creator_feed_items(id,source_type,source_id,creator_user_id,visibility,target_scope,created_at,published_at,status)
        select ('9b490000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'profile_post',
          'scale-unrelated-'||n,'scale-outsider-'||(n%10000),'public','followers',
          '2026-01-01'::timestamptz,'2026-01-01'::timestamptz,'active'
        from generate_series(${total===100_000 ? 1 : 100_001},${total}) n;
        alter table public.creator_feed_items enable trigger user;
        analyze public.creator_feed_items; analyze public.channel_followers; analyze public.user_friendships;`);
      const timings = [];
      console.error(`Index-volume fixture: measuring ${total} unrelated rows`);
      for (let iteration=0;iteration<4;iteration++) {
        const start=performanceNow(); await page(null,20); timings.push(performanceNow()-start);
      }
      const explain = await user(1,'explain (analyze,buffers,format json) select * from public.read_profile_relationship_feed_page(null,null,$1,20)',['2099-01-01T00:00:00Z']);
      const deep = all[Math.min(39,all.length-1)];
      const start=performanceNow(); const deepRows=await page(deep,20);
      performance.push({unrelatedFeedRows:total,viewerRelationshipDegree:60,firstPageMs:timings,deepPageMs:performanceNow()-start,
        deepRows:deepRows.length,rpcPlan:explain[0]['QUERY PLAN'],queryPlan:await explainProductionQuery(),deepQueryPlan:await explainProductionQuery(deep)});
    }
    console.error('Index-volume fixture: adding high-degree and celebrity source fixtures');
    await db.query("select set_config('request.jwt.claims','{}',false)");
    await db.exec(`insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at)
      select pg_temp.feed_user(n)::uuid,false,false,now() from generate_series(66,1065) n;
      update public.user_profiles set profile_visibility='everyone',profile_access_visibility='public' where user_id like '9b470000-%' and user_id>'${u(65)}';
      insert into public.channel_followers(channel_user_id,follower_user_id)
      select pg_temp.feed_user(n),pg_temp.feed_user(1) from generate_series(66,1065) n;
      insert into public.profile_posts(id,user_id,body)
      select ('9b471000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.feed_user(n),'High degree fixture '||n
      from generate_series(66,1065) n;
      insert into public.profile_posts(id,user_id,body)
      select ('9b471000-0000-4000-8000-'||lpad((10000+n)::text,12,'0'))::uuid,pg_temp.feed_user(7),'Celebrity history fixture '||n
      from generate_series(1,500) n;
      analyze public.creator_feed_items; analyze public.channel_followers; analyze public.user_friendships;`);
    const timings=[];
    for(let i=0;i<4;i++){const start=performanceNow();await page(null,20,null);timings.push(performanceNow()-start);}
    performance.push({unrelatedFeedRows:1_000_000,viewerRelationshipDegree:1059,celebrityPosts:500,firstPageMs:timings,
      rpcPlan:(await user(1,'explain (analyze,buffers,format json) select * from public.read_profile_relationship_feed_page(null,null,null,20)'))[0]['QUERY PLAN'],
      queryPlan:await explainProductionQuery()});
  }
  console.log(JSON.stringify({status:'passed',checks,migrations:replayReport.files.length+1,skipped:replayReport.skipped,
    engine:'PGlite canonical migration replay',nativeConcurrency:false,productionLoad:false,
    benchmarkFixtureWriteTriggersSuppressed:process.env.PROFILE_FEED_SCALE==='1',performance}));
} finally { await db.close(); }

function performanceNow() { return globalThis.performance.now(); }
