// Reconstructed catalog contract after workspace rollback; all comparisons run
// against the actual full replay, not static names alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

// Reviewed disabled inspection/deleted-retention successor bundle. Keep this
// inventory explicit so a missing or unexpected replay file still fails.
const inspectionBundleFiles = [
  '20261020010608_owner_content_inspection_disabled.sql',
  '20261020011354_content_inspection_verified_media.sql',
  '20261020011409_content_inspection_subject_browse.sql',
  '20261020011840_deleted_content_retention.sql',
  '20261020012144_content_inspection_deleted_fallback.sql',
  '20261020013500_deleted_media_reference_retirement.sql',
  '20261020013556_deleted_content_media_expiry.sql',
  '20261020014747_content_inspection_retained_originals.sql',
];
const inspectionFunctionKeys = new Set([
  'private.capture_deleted_content_row/3',
  'private.capture_deleted_content_trigger/0',
  'private.claim_deleted_media_retirement/1',
  'private.content_inspection_actor/3',
  'private.content_inspection_audit/11',
  'private.content_inspection_context_owned/2',
  'private.content_inspection_current_source/2',
  'private.content_inspection_grant_valid/1',
  'private.content_inspection_immutable_event/0',
  'private.content_inspection_live_media_binding/3',
  'private.content_inspection_media_binding/2',
  'private.content_inspection_media_receipt_valid/1',
  'private.content_inspection_owner_target/2',
  'private.content_inspection_source/2',
  'private.deleted_content_hold_matches/7',
  'private.deleted_content_immutable/0',
  'private.deleted_content_legal_hold_guard/0',
  'private.deleted_media_has_live_reference/1',
  'private.deleted_media_locator_columns/1',
  'private.deleted_media_locator_document/2',
  'private.deleted_media_mentions/2',
  'private.deleted_media_normalize_locator/1',
  'private.deleted_media_preserve_identity/0',
  'private.deleted_media_reference_coverage_ready/0',
  'private.deleted_media_reference_identity/1',
  'private.deleted_media_retirement_binding/1',
  'private.finalize_deleted_media_inspection_proof/2',
  'private.guard_deleted_media_references/0',
  'private.read_deleted_content_inspection/2',
  'private.register_deleted_media_retirement/0',
  'public.admin_authorize_content_inspection_media/3',
  'public.admin_close_content_inspection_context/3',
  'public.admin_create_content_inspection_context/3',
  'public.admin_grant_content_inspection_access/7',
  'public.admin_list_content_inspection_contexts/4',
  'public.admin_list_content_inspection_scope/3',
  'public.admin_list_content_inspection_subject_targets/6',
  'public.admin_prepare_content_inspection_media/5',
  'public.admin_read_content_inspection/5',
  'public.admin_resolve_content_inspection_media/3',
  'public.admin_revoke_content_inspection_access/3',
  'public.check_deleted_media_retirement/4',
  'public.claim_deleted_content_media_expiry/1',
  'public.deleted_content_expiry_readiness/0',
  'public.expire_deleted_content_text/1',
  'public.list_deleted_content_expiry_work/0',
  'public.list_deleted_content_media_expiry_work/0',
  'public.read_deleted_content_media_expiry_claim/1',
  'public.reconcile_deleted_content_stage/1',
  'public.record_deleted_content_media_expiry_result/2',
  'public.stage_deleted_content_media/6',
]);

const studioBundleFiles = [
  '20261015073423_platform_studio_publication_and_audience_authority.sql',
  '20261019020049_platform_studio_rolling_brand_compatibility.sql',
  '20261019020052_platform_studio_rolling_audience_compatibility.sql',
];
// The held migration adds eight functions; Brand adds five (including the
// retained asset-publish implementation's new identity), and Audience four.
const studioFunctionKeys = new Set([
  'guard_platform_brand_profile_publication_metadata/0',
  'platform_brand_publication_asset_safe_internal/2',
  'platform_studio_current_staff_access_internal/0',
  'platform_studio_current_creator_tool_access_internal/0',
  'publish_platform_brand_profile/1', 'read_public_platform_identity/1',
  'read_public_channel_follower_count/1', 'review_channel_audience_request/2',
  'platform_brand_publication_metadata_read_allowed/1',
  'record_platform_brand_publication_metadata/0',
  'publish_platform_brand_profile_assets_internal/2',
  'platform_brand_published_object_visible_internal/3',
  'guard_platform_brand_asset_archive_transition/0',
  'assert_channel_audience_review_authority_internal/3',
  'preflight_legacy_channel_audience_follow/2',
  'guard_legacy_channel_audience_follow_insert/0',
  'guard_channel_audience_review_transition/0',
].map(name => `public.${name}`));

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
    assert.equal(before.functions.length,(includeHeldStudio?1122:1105)+inspectionFunctionKeys.size);
    assert.deepEqual(before.functions.filter(fn=>inspectionFunctionKeys.has(fn.key)).map(fn=>fn.key).sort(),
      [...inspectionFunctionKeys].sort(),'exact disabled inspection/retention function inventory is present');
    assert.deepEqual(before.functions.filter(fn=>studioFunctionKeys.has(fn.key)).map(fn=>fn.key).sort(),
      includeHeldStudio?[...studioFunctionKeys].sort():[], 'the entire Studio bundle has the expected catalog scope');
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
    // Preserve the historical baseline, then account for every reviewed successor.
    assert.equal(replayReport.files.length,(includeHeldStudio?429:426)+inspectionBundleFiles.length);
    assert.deepEqual(replayReport.files.filter(file=>inspectionBundleFiles.includes(file)),inspectionBundleFiles,
      'entire disabled inspection/retention successor bundle is replayed');
    assert.ok(replayReport.files.includes('20261019000210_circle_request_rpc_anon_execute_closure.sql'));
    assert.deepEqual(replayReport.files.filter(file=>studioBundleFiles.includes(file)),
      includeHeldStudio?studioBundleFiles:[], 'Studio migrations are replayed as one complete bundle or omitted together');
    await db.exec(repairSql);assert.deepEqual(await snapshot(db),after,'repeat application is catalog-idempotent');
  }finally{await db.close()}
});
