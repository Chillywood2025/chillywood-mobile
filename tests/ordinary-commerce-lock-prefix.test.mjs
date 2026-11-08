// Sequential catalog/transition proof only. Native split-prefix schedules are
// required separately for independent backends, real waits and deadlock proof.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedQualifiedCommerceCreator} from './helpers/automatic-commerce-fixture.mjs';

const migration='20261106073240_ordinary_commerce_canonical_lock_prefix.sql';
const successors=['20261106170725_tip_commerce_gate_entry.sql',
 '20261107173220_creator_video_social_engagement.sql','20261107191000_comment_likes.sql',
 '20261107233954_isolated_test_store_capture_v1.sql'];
const sql=fs.readFileSync(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8');
const roots=[...sql.slice(sql.indexOf('do $roots$'),sql.indexOf('end $roots$')).matchAll(/^\s+'(public\.[^']+|private\.[^']+)'/gmu)].map(match=>match[1]);
const tables=['auth.users','auth.sessions','public.account_deletion_requests','public.wave1_legal_acceptances','public.wave1_legal_document_versions',
 'public.access_grants','public.user_entitlements','public.revenuecat_premium_transaction_authority','private.creator_eligibility_declarations','public.creator_tip_transactions',
 'public.creator_payout_accounts','public.creator_payout_eligibility_records','private.creator_connect_mode_bindings',
 'public.platform_money_kill_switches','public.wave1_creator_eligibility'];

test('finite migration retains supported-root and nonblocking observer boundaries',()=>{
 assert.equal(roots.length,86);assert.equal(new Set(roots).size,roots.length);
 assert.match(sql,/pg_advisory_xact_lock\(176214,32\)/u);
 assert.match(sql,/l\.pid=pg_catalog\.pg_backend_pid\(\)[\s\S]*l\.database=[\s\S]*l\.classid=176214 and l\.objid=32 and l\.objsubid=2/u);
 assert.doesNotMatch(sql.slice(sql.indexOf('do $writers$'),sql.indexOf('end $writers$')),/creator_provider_observation_jobs|user_profiles/u);
 assert.doesNotMatch(sql,/disable trigger|grant .* to|drop constraint|set_config\(/iu);
});

test('exact successor preserves predicates/ACLs and rejects unfenced observation authority without blocking lease-only work',{timeout:180000},async t=>{
 // Preserve the exact before/after checkpoint: later successors cannot run
 // ahead of this subject. All 624 predecessors replay, then the actual 625th.
 const excluded=[migration,...successors];
 assert.deepEqual(fs.readdirSync(new URL('../supabase/migrations/',import.meta.url))
  .filter(file=>file.endsWith('.sql')&&file>=migration).sort(),excluded,
  'every later successor requires explicit review before excluding it from this checkpoint');
 const {db,replayReport}=await createDatabase({implicitApiGrants:false,excludeMigrations:excluded});
 const scalar=async(q,args=[])=>(await db.query(q,args)).rows[0].value;
 const def=signature=>scalar('select pg_get_functiondef($1::regprocedure) value',[signature]);
 const catalog=()=>db.query("select oid,oid::regprocedure::text signature,prosrc,proacl::text,proowner,prosecdef,provolatile,proconfig from pg_proc where pronamespace in('public'::regnamespace,'private'::regnamespace) and prokind='f'");
 const rollback=async action=>{await db.exec('begin');try{return await action();}finally{await db.exec('rollback');}};
 try{
  assert.equal(replayReport.files.length,624);assert.equal(replayReport.files.includes(migration),false);
  assert.deepEqual(replayReport.excludedMigrations,excluded);
  assert.ok(replayReport.files.every(file=>file<migration),'only chronological predecessors execute before the subject');
  assert.deepEqual(replayReport.overlayFiles,[]);
  assert.match(await def('private.lock_ordinary_commerce_dispatch_subjects(uuid,uuid,uuid,text,text)'),/lock table public.creator_payout_accounts/u);
  assert.match(await def('private.lock_ordinary_creator_subject(uuid,uuid,text)'),/from auth\.users where id=p_creator for share/u);
  const before=new Map((await catalog()).rows.map(row=>[row.oid,row]));
  await db.exec(sql);
  const after=(await catalog()).rows;
  const changed=[];
  for(const row of after){
   const old=before.get(row.oid);if(!old)continue;
   for(const field of ['proacl','proowner','prosecdef','provolatile','proconfig'])assert.deepEqual(row[field],old[field],`${row.signature}: unchanged ${field}`);
   if(row.prosrc!==old.prosrc)changed.push(row.signature);
  }
  const rootIds=new Set();
  for(const signature of roots){
   const oid=await scalar('select $1::regprocedure::oid value',[signature]);rootIds.add(oid);
   const row=after.find(row=>row.oid===oid),old=before.get(oid);
   assert.match(row.prosrc,/^\s*(?:declare[\s\S]*?)?begin\n perform private\.lock_ordinary_commerce_authority_gate\(\);/u,signature);
   // Unchanged-body check for every root that is not also a narrowly modified
   // membership/auth reader. This detects accidental predicate rewrites.
   let expected=old.prosrc.replace('begin\n','begin\n perform private.lock_ordinary_commerce_authority_gate();\n');
   const canonical=s=>s.replace(/^public\./u,'').replaceAll('timestamp with time zone','timestamptz').replace('(public.merch_products)','(merch_products)');
   for(const match of sql.matchAll(/\('([^']+)',\$old\$([\s\S]*?)\$old\$,\$new\$([\s\S]*?)\$new\$\)/gu)){
    if(canonical(match[1])!==canonical(row.signature))continue;
    assert.ok(expected.includes(match[2]),`${signature}: exact approved old anchor`);
    expected=expected.replaceAll(match[2],match[3]);
   }
   assert.equal(row.prosrc,expected,`${signature}: only explicit reviewed prefix/anchor changes`);
  }
  assert.equal(changed.length,90,'86 roots plus two identity triggers, one claim and one profile-report prelock');
  for(const table of tables)assert.equal(await scalar("select count(*)::int value from pg_trigger where tgrelid=$1::regclass and tgname='aaa_ordinary_commerce_writer_gate' and tgtype=30",[table]),1,table);
  const covered=/(?:creator_payout_accounts|creator_payout_eligibility_records|creator_connect_mode_bindings|creator_provider_observation_jobs|platform_money_kill_switches|wave1_creator_eligibility|wave1_legal_acceptances|wave1_legal_document_versions)/u;
  for(const row of after)for(const lock of row.prosrc.matchAll(/lock\s+table\s+[^;]*;/giu))
   assert.ok(!covered.test(lock[0]),`${row.signature}: no conflicting membership SHARE on covered writers`);
  const subject=await def('private.lock_ordinary_creator_subject(uuid,uuid,text)');
  assert.doesNotMatch(subject,/from auth\.(users|sessions)/u);
  assert.match(subject,/lock_ordinary_commerce_authority_gate[\s\S]*lock_ordinary_commerce_premium_subjects[\s\S]*ordinary_commerce_subject_current/u);
  const creator=await seedQualifiedCommerceCreator(db);
  const account=await scalar('select id value from public.creator_payout_accounts where creator_user_id=$1',[creator.id]);
  const job=()=>scalar('select to_jsonb(j) value from private.creator_provider_observation_jobs j where account_id=$1',[account]);
  const beforeJob=await job();
  for(const isolation of ['repeatable read','serializable'])await rollback(async()=>{
   await db.exec(`set transaction isolation level ${isolation}`);
   await assert.rejects(db.query("select private.lock_ordinary_creator_subject($1,$2,'sandbox')",[creator.id,creator.session]),/ordinary_commerce_read_committed_required/u);
  });
  assert.deepEqual(await job(),beforeJob,'isolation denials do not rewrite provider evidence');
  for(const mutation of ["observed_at=clock_timestamp()-interval '20 minutes'","observed_at=null","environment='live'","provider_account_id='acct_wrongBinding'","creator_id=gen_random_uuid()"]){
   await assert.rejects(db.query(`update private.creator_provider_observation_jobs set ${mutation} where account_id=$1`,[account]),/ordinary_commerce_authority_gate_required/u,mutation);
   assert.deepEqual(await job(),beforeJob,mutation);
  }
  await assert.rejects(db.query('delete from private.creator_provider_observation_jobs where account_id=$1',[account]),/ordinary_commerce_authority_gate_required/u);
  await rollback(async()=>{
   await db.exec('select private.lock_ordinary_commerce_authority_gate()');
   await db.query('update private.creator_provider_observation_jobs set observed_at=null where account_id=$1',[account]);
   assert.equal((await job()).observed_at,null,'explicit correctly ordered invalidation succeeds');
  });
  await rollback(async()=>{
   await db.query("update private.creator_provider_observation_jobs set lease_token=gen_random_uuid(),leased_at=clock_timestamp(),lease_until=clock_timestamp()+interval '2 minutes',failure_count=1,due_at=clock_timestamp()+interval '1 minute' where account_id=$1",[account]);
   assert.equal((await job()).observed_at,beforeJob.observed_at,'lease/backoff retains exact freshness without Brand');
  });
  await rollback(async()=>{
   // Malformed old job can be repaired only while its exact DB-bound account
   // proves that old evidence was already invalid. No binding is fabricated.
   await db.exec('select private.lock_ordinary_commerce_authority_gate()');
   await db.query("update private.creator_provider_observation_jobs set provider_account_id='acct_staleSynthetic' where account_id=$1",[account]);
  });
  await db.exec("begin;select private.lock_ordinary_commerce_authority_gate();");
  await db.query("update private.creator_provider_observation_jobs set provider_account_id='acct_staleSynthetic',lease_token=null,due_at=clock_timestamp()-interval '1 minute' where account_id=$1",[account]);
  await db.exec('commit');
  await db.exec("update private.creator_provider_observation_control set enabled=true,last_claimed_at=null;set request.jwt.claims='{\"role\":\"service_role\"}';");
  const claimed=await scalar('select public.claim_creator_provider_observations() value');
  assert.equal(claimed.length,1);assert.equal(claimed[0].account_id,account);
  assert.equal((await job()).observed_at,null,'claim clears only previously mismatched freshness');
  const claim=await def('public.claim_creator_provider_observations()');
  assert.doesNotMatch(claim,/platform_brand_retention_lock/u);assert.match(claim,/for update of q skip locked/u);
  assert.equal((claim.match(/join private\.creator_connect_mode_bindings binding/gu)||[]).length,2);
  // Service/client privileges are unchanged and all new helpers remain private.
  for(const role of ['anon','authenticated','service_role'])for(const signature of [
   'private.ordinary_commerce_writer_gate()','private.assert_ordinary_commerce_authority_gate()','private.guard_creator_observation_authority_write()'])
   assert.equal(await scalar('select has_function_privilege($1,$2,\'execute\') value',[role,signature]),false);
  t.diagnostic('624 exact predecessors + actual625th migration; sequential catalog/authority transitions only, native waits remain required.');
 }finally{await db.close();}
});
