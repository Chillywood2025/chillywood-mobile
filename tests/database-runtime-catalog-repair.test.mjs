// Reconstructed catalog contract after workspace rollback; all comparisons run
// against the actual full replay, not static names alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

const targets=new Set([
  'has_platform_role/1','has_platform_permission/1','is_platform_owner_user/1','has_active_beta_access/0',
  'resolve_sandbox_monetization_tester/2','grant_sandbox_monetization_tester/4',
  'admin_grant_platform_role_by_email/3','admin_grant_platform_role_by_email/4',
  'admin_grant_platform_role_by_email_pre_subject_closeout/3','admin_grant_platform_role_by_email_pre_exact_subject_closure/3',
  'watch_party_room_access_pre_live_decouple/2','resolve_watch_party_livekit_authority_pre_service_fix/3',
  'watch_party_room_self_access_allowed_internal/2','resolve_watch_party_livekit_viewer_authority/3',
  'apply_revenuecat_terminal_quarantine_projection_internal/1',
].map(x=>`public.${x}`));
const schemas="('public','private','cognitive_runtime')";
const queries={
  functions:`select p.oid,n.nspname||'.'||p.proname||'/'||p.pronargs key,p.oid::regprocedure::text identity,
    pg_get_functiondef(p.oid) definition,p.proowner,p.proacl,p.prosecdef,p.proleakproof,p.provolatile,p.proparallel,
    p.proconfig,p.proargtypes::text,p.proallargtypes::text,p.proargmodes::text,p.proargnames::text,
    p.prorettype,pg_get_expr(p.proargdefaults,0) defaults
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ${schemas} and p.prokind='f' order by p.oid`,
  relations:`select n.nspname,c.relname,c.relkind,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.relreplident,c.reloptions
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${schemas} order by 1,2`,
  columns:`select n.nspname,c.relname,a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,a.attacl,
    pg_get_expr(d.adbin,d.adrelid) default_expression from pg_attribute a join pg_class c on c.oid=a.attrelid
    join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
    where n.nspname in ${schemas} and a.attnum>0 and not a.attisdropped order by 1,2,3`,
  constraints:`select n.nspname,c.conname,c.conrelid,c.contype,c.convalidated,c.condeferrable,c.condeferred,pg_get_constraintdef(c.oid,true) definition
    from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in ${schemas} order by 1,2,c.oid`,
  indexes:`select n.nspname,c.relname,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) definition from pg_index i
    join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${schemas} order by 1,2`,
  triggers:`select n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) definition from pg_trigger t
    join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${schemas} and not t.tgisinternal order by 1,2,3`,
  enums:`select n.nspname,t.typname,e.enumlabel,e.enumsortorder from pg_type t join pg_namespace n on n.oid=t.typnamespace
    join pg_enum e on e.enumtypid=t.oid where n.nspname in ${schemas} order by 1,2,4`,
  sequences:`select * from pg_sequences where schemaname in ${schemas} order by schemaname,sequencename`,
  publications:'select pubname,schemaname,tablename,attnames,rowfilter from pg_publication_tables order by 1,2,3',
  policies:`select * from pg_policies where schemaname in ${schemas} order by schemaname,tablename,policyname`,
};
async function snapshot(db){return Object.fromEntries(await Promise.all(Object.entries(queries).map(async([key,sql])=>[key,(await db.query(sql)).rows])))}
for(const includeHeldStudio of [false,true])test(`runtime catalog scope and idempotence, Studio ${includeHeldStudio?'included':'held'}`,{timeout:120_000},async()=>{
  const {db,repairSql,replayReport}=await createDatabase({overlayLiveDrift:!includeHeldStudio,includeHeldStudio});
  try{
    const before=await snapshot(db);await db.exec(repairSql);const after=await snapshot(db);
    assert.equal(before.functions.length,includeHeldStudio?1113:1105);
    assert.deepEqual(after.functions.map(x=>[x.oid,x.identity]),before.functions.map(x=>[x.oid,x.identity]),'stable function OIDs and signatures');
    const changed=after.functions.filter((f,i)=>f.definition!==before.functions[i].definition).map(f=>f.key).sort();
    const expected=[...targets].filter(x=>!includeHeldStudio||x!=='public.is_platform_owner_user/1').sort();
    assert.deepEqual(changed,expected,'only exact declared function targets change');
    for(let i=0;i<after.functions.length;i++){
      const {definition:oldDefinition,proacl:oldAcl,proconfig:oldConfig,...oldAbi}=before.functions[i];
      const {definition:newDefinition,proacl:newAcl,proconfig:newConfig,...newAbi}=after.functions[i];
      assert.deepEqual(newAbi,oldAbi,'ABI/owner/security flags unchanged');
      if(!['public.has_active_beta_access/0','public.resolve_sandbox_monetization_tester/2'].includes(newAbi.key))assert.deepEqual(newAcl,oldAcl,'unrelated EXECUTE ACL unchanged');
      if(newAbi.key!=='public.admin_grant_platform_role_by_email_pre_exact_subject_closure/3')assert.deepEqual(newConfig,oldConfig,'unrelated function settings unchanged');
      if(!targets.has(newAbi.key))assert.equal(newDefinition,oldDefinition,'unrelated body unchanged');
    }
    for(const key of Object.keys(queries).filter(x=>!['functions','policies'].includes(x)))assert.deepEqual(after[key],before[key],`${key} unchanged`);
    const allowedPolicyNames=new Set(['platform_role_memberships_select_own','platform_staff_permission_grants_select_owner_or_self','watch_party_room_memberships_self_insert_policy','watch_party_room_memberships_self_update_policy']);
    assert.deepEqual(after.policies.filter(p=>!allowedPolicyNames.has(p.policyname)),before.policies.filter(p=>!allowedPolicyNames.has(p.policyname)),'unrelated policies unchanged');
    assert.deepEqual(replayReport.skipped,[
      {file:'20260718114500_enable_chat_call_transition_retry_scheduler.sql',index:0,reason:'Managed scheduling/network extension replaced by local doubles'},
      {file:'20260718114500_enable_chat_call_transition_retry_scheduler.sql',index:1,reason:'Managed scheduling/network extension replaced by local doubles'},
      {file:'20260718211432_harden_media_scan_retry_recovery.sql',index:6,reason:'Data-only recovery call, irrelevant to empty isolated schema'},
      {file:'20260718214102_decouple_media_scan_audit_completion.sql',index:10,reason:'Data-only recovery call, irrelevant to empty isolated schema'},
    ],'only exact documented infrastructure/data skips');
    assert.equal(replayReport.files.length,includeHeldStudio?425:424);
    await db.exec(repairSql);assert.deepEqual(await snapshot(db),after,'repeat application is catalog-idempotent');
  }finally{await db.close()}
});
