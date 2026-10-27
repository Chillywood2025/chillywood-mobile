// Disposable native proof: exact migration payloads fail atomically on lock wait.
// No network URLs, credentials or production targets are accepted.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createDatabase} from '../tests/helpers/database-runtime-authority-fixture.mjs';
import {databaseFactory, localNativeOptions} from '../tests/helpers/native-profile-database.mjs';

const files=[
 '20261027210217_profile_relationship_feed_cursor.sql',
 '20261027211112_profile_public_read_role_isolation.sql',
 '20261027214412_profile_engagement_sharded_counters.sql',
 '20261027221629_profile_feed_guarded_candidate_fastpath.sql',
];
const sources=files.map(file=>readFileSync(`supabase/migrations/${file}`,'utf8'));
const options=localNativeOptions();
// databaseFactory verifies the explicit driver path/version before this import.
const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,excludeMigrations:files,databaseFactory});
const {default:pg}=await import(pathToFileURL(process.env.NATIVE_PG_DRIVER).href);
const database=(await db.query('select current_database() name')).rows[0].name;
const blocker=new pg.Client({...options,database});
await blocker.connect();
const observations=[];
const catalog=async()=>JSON.stringify((await db.query(`select
 (select jsonb_agg(jsonb_build_array(n.nspname,p.proname,p.proargtypes::text,pg_get_functiondef(p.oid),p.proacl) order by n.nspname,p.proname,p.proargtypes::text)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','profile_engagement_private') and p.prokind='f') functions,
 (select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relacl,c.relrowsecurity,c.relforcerowsecurity) order by n.nspname,c.relname)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','profile_engagement_private')) relations,
 (select jsonb_agg(jsonb_build_array(polname,polrelid,polroles,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) order by polrelid,polname) from pg_policy) policies,
 (select jsonb_agg(jsonb_build_array(tgname,pg_get_triggerdef(oid)) order by tgrelid,tgname) from pg_trigger where not tgisinternal) triggers,
 (select jsonb_agg(nspname order by nspname) from pg_namespace where nspname='profile_engagement_private') private_schema`)).rows);
try {
 const locks=[
  'lock table public.creator_feed_items in access exclusive mode',
  'lock table public.profile_posts in access exclusive mode',
  'lock table public.profile_post_likes in row exclusive mode',
  'alter function public.read_profile_relationship_feed_page(timestamptz,uuid,timestamptz,integer) cost 4242',
 ];
 for(let i=0;i<files.length;i++) {
  const before=await catalog();
  const settings=(await db.query("select current_setting('lock_timeout') lock_timeout,current_setting('statement_timeout') statement_timeout")).rows;
  await blocker.query('begin');await blocker.query(locks[i]);
  const start=performance.now();let code;
  try {await db.exec(sources[i]);assert.fail('blocked payload unexpectedly committed');}
  catch(error) {code=error.code;assert.equal(code,'55P03',`${files[i]}: lock timeout, not another SQL error`);}
  finally {await db.exec('rollback');await blocker.query('rollback');}
  const elapsedMs=performance.now()-start;
  assert.ok(elapsedMs>=4500&&elapsedMs<20000,`${files[i]}: five-second lock budget observed (${elapsedMs} ms)`);
  assert.equal(await catalog(),before,`${files[i]}: no partial catalog changes after timeout`);
  assert.deepEqual((await db.query("select current_setting('lock_timeout') lock_timeout,current_setting('statement_timeout') statement_timeout")).rows,settings,'transaction-local settings restored after failure');
  await db.exec(sources[i]);
  assert.deepEqual((await db.query("select current_setting('lock_timeout') lock_timeout,current_setting('statement_timeout') statement_timeout")).rows,settings,'transaction-local settings restored after commit');
  observations.push({file:files[i],sha256:createHash('sha256').update(sources[i]).digest('hex'),errorCode:code,elapsedMs,atomicRollback:true,subsequentUnblockedApply:true,sessionSettingsRestored:true});
 }
 console.log(JSON.stringify({status:'passed',engine:(await db.query('select version() version')).rows[0].version,observations,production:false}));
}finally{await blocker.end();await db.close();}
