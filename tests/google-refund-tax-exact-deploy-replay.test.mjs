import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHistoricalDeploymentDatabase} from './helpers/historical-deployment-schema-fixture.mjs';
import {loadHistoricalRefundBundle} from './helpers/google-refund-tax-historical-deployment-fixture.mjs';
import {
  probeSql,classifyProbe,readbackSql,classifyState,buildApplySql,deploy,
  PROJECT,MIGRATION,VERSION,NAME,PREDECESSORS,ADDED_FUNCTIONS,ADDED_TABLES,
} from '../scripts/google-refund-tax-exact-deploy.mjs';

test('historical exact tip, ingress and sandbox order precedes additive refund deployment; drift and rollback fail closed', {timeout:300000},async t=>{
  const bundle=loadHistoricalRefundBundle();
  assert.equal(bundle.manifest.addedCatalogSha256,'39159c6f49dd220468376fa243c4be2b42c859342b92d0e1b916e694458dcba9',
    'independently measured exact added catalog, not a hash learned from the apply response');
  const predecessorPaths=PREDECESSORS.map(p=>`supabase/migrations/${p.version}_${p.name}.sql`);
  const excluded=[MIGRATION,...predecessorPaths,
    'supabase/migrations/20261105010859_sandbox_cashout_status_notifications.sql',
    'supabase/migrations/20261102093836_creator_clip_export_bounded_pool.sql',
    'supabase/migrations/20261102094308_creator_clip_scale_lifecycle_ledger.sql'].map(p=>path.basename(p));
  const {db}=await createHistoricalDeploymentDatabase({
    implicitApiGrants:false,excludeMigrations:excluded});
  t.after(()=>db.close());
  await db.exec(`set search_path=pg_catalog,public;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
    create view public.refund_deploy_fixture_view as select 1 as value;
    insert into supabase_migrations.schema_migrations values('20261101215711','synthetic_fixture_predecessor',array['select 1;']);
    update public.platform_money_kill_switches set state=case
      when key in ('live_money_enabled','payouts_enabled','cashout_enabled') then 'off' else 'sandbox_only' end
      where key in ('live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled','tips_enabled',
        'creator_monetization_enabled','provider_webhooks_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled');
    -- Source migrations deliberately leave Discovery dormant. This isolated
    -- fixture models the required, previously authorized production hold state.
    update private.discovery_invalidation_worker_config set enabled=true,collecting=true,primary_delivery_enabled=true,token_sha256=repeat('0',64);
    create role supabase_read_only_user bypassrls;
    grant usage on schema public,private,auth,supabase_migrations to supabase_read_only_user;
    grant select on all tables in schema public,private,auth,supabase_migrations to supabase_read_only_user;`);
  const read=async(sql=readbackSql())=>{
    await db.exec('set session authorization supabase_read_only_user;begin read only;set local search_path=extensions,private,public;');
    try{return (await db.exec(sql)).at(-1).rows[0].state;}
    finally{await db.exec('rollback;set session authorization postgres;');}
  };
  const initial=await read(probeSql());
  const local={...bundle,manifest:{...bundle.manifest,originalHistory:{count:1,
    maximum:'20261101215711',sha256:initial.originalHistorySha256}}};
  assert.equal(classifyProbe(local,initial),'blocked_until_tip');
  let writes=0,reads=0;
  await assert.rejects(deploy({bundle:local,apply:true,query:async()=>{reads++;}}),/POST_PREDECESSOR_REQUALIFICATION_REQUIRED/);
  assert.equal(reads,0,'pending production qualification fails before any network or credential-dependent query');
  const phases=['blocked_until_native_ingress','blocked_until_sandbox','post_predecessors_require_independent_requalification'];
  for(const [i,p] of PREDECESSORS.entries()){
    const body=fs.readFileSync(predecessorPaths[i],'utf8');
    await db.exec(body);
    await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[p.version,p.name,[body]]);
    const state=await read(probeSql());
    assert.equal(classifyProbe(local,state),phases[i]);
    assert.equal(state.originalHistorySha256,initial.originalHistorySha256,'three predecessor rows are separate from the original inventory');
    assert.equal(state.historyMaximum,PREDECESSORS[0].version,'actual dependency order is not timestamp order');
  }
  await db.exec('grant select on all tables in schema public,private,auth,supabase_migrations to supabase_read_only_user;');
  const before=await read();
  assert.equal(before.holds,true);
  assert.throws(()=>buildApplySql(local,before),/POST_PREDECESSOR_REQUALIFICATION_REQUIRED/);
  local.manifest.qualification='independently_reviewed_post_predecessors';
  local.manifest.postPredecessorBaseline={historyCount:4,historyMaximum:PREDECESSORS[0].version,
    historySha256:before.priorHistorySha256,catalogSha256:before.catalogSha256,dataSha256:before.dataSha256,
    observedAt:'2026-11-04T00:00:00Z',revenuecat:{project:PROJECT,name:'revenuecat-webhook',version:94,status:'ACTIVE',
      verifyJwt:false,files:bundle.revenuecatExpected.files}};
  assert.equal(classifyState(local,before),'ready');
  const sql=buildApplySql(local,before);
  const rejectStale=async mutation=>{
    await db.exec(`begin;${mutation}`);
    await assert.rejects(db.exec(sql),/refund_deploy_baseline_changed/);
    await db.exec('rollback');
    assert.deepEqual(await read(),before,'failed stale apply restores the synthetic fixture without accepting a new baseline');
  };
  await rejectStale('grant select on private.google_play_external_transactions to service_role;');
  await rejectStale('drop index public.creator_money_checkout_attempt_unique;');
  await rejectStale('alter view public.refund_deploy_fixture_view set (security_invoker=true);');
  await rejectStale("update supabase_migrations.schema_migrations set statements=array['changed original'] where version='20261101215711';");
  await rejectStale(`update supabase_migrations.schema_migrations set statements=array['changed predecessor'] where version='${PREDECESSORS[1].version}';`);
  await rejectStale("update public.platform_money_kill_switches set state='off' where key='tips_enabled';");
  await rejectStale('alter table private.google_play_external_transactions disable row level security;');
  const malformed=sql.replace('force row level security','disable row level security');
  assert.notEqual(malformed,sql);
  await assert.rejects(db.exec(malformed),/refund_deploy_postcheck_failed/);
  await db.exec('rollback');
  assert.deepEqual(await read(),before,'postcheck failure rolls back all refund objects and history');
  const query=async(querySql,readOnly)=>{if(!readOnly){writes++;await db.exec(querySql);return;}return read(querySql);};
  const recheckSource=()=>{};
  await assert.rejects(deploy({bundle:local,apply:true,query,recheckSource}),/CURRENT_PREDECESSOR_EDGE_READBACK_REQUIRED/);
  assert.equal(writes,0);
  await assert.rejects(deploy({bundle:local,apply:true,query,recheckSource,
    verifyPrerequisiteEdge:async()=>({...local.manifest.postPredecessorBaseline.revenuecat,version:93})}),/CURRENT_PREDECESSOR_EDGE_READBACK_MISMATCH/);
  assert.equal(writes,0);
  const result=await deploy({bundle:local,apply:true,query,recheckSource,
    verifyPrerequisiteEdge:async()=>local.manifest.postPredecessorBaseline.revenuecat});
  assert.equal(result.status,'applied_verified');assert.equal(writes,1);
  const after=await read();
  assert.equal(classifyState(local,after),'applied');
  assert.equal(after.catalogSha256,before.catalogSha256,'all preexisting functions, relations, ACLs, policies, indexes and triggers remain unchanged');
  assert.equal(after.dataSha256,before.dataSha256,'all guarded data and dormant controls remain unchanged');
  assert.equal(after.originalHistorySha256,before.originalHistorySha256);
  assert.equal(after.priorHistorySha256,before.priorHistorySha256);
  assert.equal(after.addedCatalogSha256,bundle.manifest.addedCatalogSha256);
  assert.equal(after.historyCount,5);assert.equal(after.historyMaximum,VERSION);
  assert.deepEqual((await db.query('select version,name,statements from supabase_migrations.schema_migrations where version=$1',[VERSION])).rows[0],
    {version:VERSION,name:NAME,statements:[bundle.body]});
  assert.equal((await db.query('select count(*)::integer count from private.google_refund_tax_history')).rows[0].count,0);
  const metadata=(await db.query(`select p.oid::regprocedure::text signature,p.proowner::regrole::text owner,
    p.proacl::text acl,p.prosecdef,p.proconfig,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') body_sha256
    from pg_proc p where p.oid=any($1::regprocedure[]) order by p.oid::regprocedure::text`,[ADDED_FUNCTIONS])).rows;
  assert.equal(metadata.length,3);
  for(const row of metadata){
    assert.equal(row.owner,'postgres');assert.deepEqual(row.proconfig,['search_path=""']);
    const privateHelper=row.signature.startsWith('private.');
    assert.equal(row.prosecdef,!privateHelper);
    assert.equal(row.acl,privateHelper?'{postgres=X/postgres}':'{postgres=X/postgres,service_role=X/postgres}');
  }
  assert.deepEqual(metadata.map(r=>r.body_sha256).sort(),[
    '39cd618f41c0a07fe79ded9fd2f833897a5e6298b0ed3f796b942266c16e4f92',
    'eb9eacab77070742c09ee3237f0a9c0a5884822e63fdcecb1cc804885a8bca03',
    'a8f8d71dd693eaf1358e55943dd3b16980d3fda025f6181ad350d48ead906d7a',
  ].sort());
  const table=(await db.query(`select relowner::regrole::text owner,relacl::text acl,relrowsecurity,relforcerowsecurity
    from pg_class where oid=$1::regclass`,[ADDED_TABLES[0]])).rows[0];
  assert.deepEqual(table,{owner:'postgres',acl:'{postgres=arwdDxtm/postgres}',relrowsecurity:true,relforcerowsecurity:true});
  const columns=(await db.query(`select a.attname name,format_type(a.atttypid,a.atttypmod) type,
    a.attnotnull required,pg_get_expr(d.adbin,d.adrelid) default_value
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=$1::regclass and a.attnum>0 and not a.attisdropped order by a.attname`,[ADDED_TABLES[0]])).rows;
  assert.deepEqual(columns,[
    {name:'account_id',type:'text',required:true,default_value:null},
    {name:'checkpoint',type:'jsonb',required:true,default_value:"'{}'::jsonb"},
    {name:'completed',type:'boolean',required:true,default_value:'false'},
    {name:'generation',type:'uuid',required:true,default_value:'extensions.gen_random_uuid()'},
    {name:'lease',type:'uuid',required:false,default_value:null},
    {name:'lease_until',type:'timestamp with time zone',required:false,default_value:null},
    {name:'result',type:'jsonb',required:false,default_value:null},
    {name:'source_binding',type:'jsonb',required:true,default_value:null},
    {name:'transaction_id',type:'uuid',required:true,default_value:null},
    {name:'updated_at',type:'timestamp with time zone',required:true,default_value:'clock_timestamp()'},
  ]);
  const constraints=(await db.query(`select contype,count(*)::integer count from pg_constraint
    where conrelid=$1::regclass group by contype order by contype`,[ADDED_TABLES[0]])).rows;
  assert.deepEqual(constraints,[{contype:'c',count:2},{contype:'f',count:1},{contype:'n',count:7},{contype:'p',count:1}]);
  const extras=(await db.query(`select
    (select count(*)::integer from pg_policy where polrelid=$1::regclass) policies,
    (select count(*)::integer from pg_trigger where tgrelid=$1::regclass and not tgisinternal) triggers,
    (select count(*)::integer from pg_index where indrelid=$1::regclass and indisvalid and indisready) indexes`,[ADDED_TABLES[0]])).rows[0];
  assert.deepEqual(extras,{policies:0,triggers:0,indexes:1});
  assert.equal((await deploy({bundle:local,apply:true,query})).status,'already_applied_verified');
  assert.equal(writes,1,'verified already-applied state never issues another write');
  await db.exec('grant execute on function public.begin_google_refund_tax_history(uuid,text) to authenticated;');
  assert.throws(()=>classifyState(local,{...after,addedCatalogSha256:'0'.repeat(64)}),/FINAL_CATALOG_MISMATCH/);
  const changed=await read();assert.throws(()=>classifyState(local,changed),/FINAL_CATALOG_MISMATCH/);
  await db.exec('revoke execute on function public.begin_google_refund_tax_history(uuid,text) from authenticated;');
  assert.equal(classifyState(local,await read()),'applied');
});
