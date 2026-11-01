// Reconstructed after workspace rollback from the reviewed fixture contract.
// Actual full-schema authority SQL, normal guards and synthetic test subjects.
// Fault triggers prove transactional rollback; the native runner proves queues.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {createDatabase,repairMigrationPath,merchStorefrontFiles} from './helpers/database-runtime-authority-fixture.mjs';
import {monetizationAuditFiles} from './helpers/creator-monetization-migration-inventory.mjs';
import {profileFeedFiles} from './helpers/profile-feed-runtime-inventory.mjs';
import {discoveryInvalidationFiles} from './helpers/discovery-invalidation-runtime-inventory.mjs';
import {appCompletionFiles} from './helpers/app-completion-migration-inventory.mjs';

// Explicit reviewed successors: excluded from historical delta checkpoints,
// required in full-chain repair qualification alongside their real prerequisites.
const flexibleCommerceFiles = [
  "20261030155914_creator_external_payment_capabilities.sql",
  "20261030155923_creator_subscription_catalog_bindings.sql",
  "20261030155931_creator_event_auction_engine.sql",
  "20261030155939_creator_event_auction_payment_projection.sql",
  "20261030165642_google_external_transaction_reporting.sql",
  "20261030165908_creator_room_seat_inventory.sql",
  "20261030165913_creator_room_seat_auctions.sql",
  "20261030165918_creator_room_auction_payment_projection.sql",
  "20261030182620_ios_external_checkout_admission.sql",
  "20261030182836_creator_auction_lifecycle_notifications.sql",
  "20261030184536_creator_instant_cashout_fee.sql",
  "20261030185416_creator_instant_cashout_switch_off.sql",
  "20261030185719_creator_tip_route_fee_comparison.sql",
  "20261030190222_physical_merch_net_share_terms.sql",
  "20261030190449_creator_tip_cross_rail_action_claim.sql",
  "20261030191106_physical_merch_verified_cost_observations.sql",
  "20261030193217_creator_tip_exact_selected_capability_quote.sql",
  "20261030200156_physical_merch_return_window.sql",
  "20261030200311_creator_auction_platform_settlement.sql",
  "20261030201916_merch_verified_purchase_time.sql",
  "20261030202009_merch_declared_tracking_return_terms.sql",
  "20261030202330_merch_automatic_tracking.sql",
  "20261030202414_auction_transfer_execution_boundary.sql",
  "20261030203644_creator_event_provider_coverage.sql",
  "20261030204119_event_auction_release_policy.sql",
  "20261030204252_auction_release_qualification_serialization.sql",
  "20261030204513_auction_verified_net_recovery_issuer.sql",
  "20261030210200_merch_private_fulfillment_address.sql",
  "20261030212744_merch_return_cases.sql",
  "20261031011531_merch_provider_dispute_observations.sql",
  "20261031011906_merch_return_buyer_replies.sql",
  "20261031012501_merch_return_case_queues.sql",
  "20261031012502_merch_reconciliation_driver.sql",
  "20261031013158_auction_held_visibility_observer.sql",
  "20261031033642_auction_approved_automation.sql",
  "20261031033820_commerce_tax_readiness.sql",
  "20261031033911_merch_tracking_correction_intake.sql",
  "20261031034904_merch_tracking_reviewed_supersession.sql",
  "20261031173602_google_external_program_capability_binding.sql",
  "20261031173636_commerce_fee_report_observations.sql",
  "20261031191024_discovery_notification_subject_context.sql",
  "20261031191128_notification_display_context_read.sql",
  "20261031203703_chilly_chat_completed_call_retry_accounting.sql",
  "20261031204123_live_room_join_activity.sql",
  "20261031204321_atomic_chilly_chat_call_candidate.sql",
  "20261031205522_chat_meaningful_activity_and_call_reads.sql",
  '20261101045810_merch_checkout_dispatch_provenance.sql',
  '20261101045816_merch_reconciliation_bounded_drain.sql',...appCompletionFiles];

// Reviewed disabled inspection/deleted-retention successor bundle. Keep this
// inventory explicit so a missing or unexpected replay file still fails.
const brandRetentionFiles = [
  '20261021134043_platform_brand_exact_retention_lifecycle.sql',
  '20261021134053_media_scan_exact_byte_receipts.sql',
  '20261021134104_platform_brand_exact_expiry_transport.sql',
];

const inspectionBundleFiles = [
  '20261020124645_owner_content_inspection_disabled.sql',
  '20261020124904_content_inspection_verified_media.sql',
  '20261020124927_content_inspection_subject_browse.sql',
  '20261020141458_deleted_content_retention.sql',
  '20261020141529_content_inspection_deleted_fallback.sql',
  '20261020141554_deleted_media_reference_retirement.sql',
  '20261020141633_deleted_content_media_expiry.sql',
  '20261020141653_content_inspection_retained_originals.sql',
];

const retentionRecoveryFiles = [
  '20261020201310_deleted_content_stage_recovery.sql',
  '20261020201322_deleted_content_activation_readiness.sql',
  '20261020201336_deleted_content_delete_intent.sql',
  '20261020201937_deleted_content_terminal_source_cleanup.sql',
];

const studioBundleFiles = [
  '20261015073423_platform_studio_publication_and_audience_authority.sql',
  '20261019020049_platform_studio_rolling_brand_compatibility.sql',
  '20261019020052_platform_studio_rolling_audience_compatibility.sql',
];

const adminBackendFiles = [
  '20261020141826_transactional_staff_permission_templates.sql',
  '20261020141850_admin_reports_dmca_complete_history.sql',
];

// Both reviewed successors are part of the current replay: new transactional
// Owner Security/Canary functions and replacement null-safe staff RPC bodies.
const userIdHoldScopeFiles = ['20261025083249_deleted_content_user_id_hold_scope.sql'];
const brandEmptyFiles = ['20261025114152_platform_brand_empty_test_disposition.sql'];
const brandObservationFiles = ['20261025111212_platform_brand_expiry_observation_recovery.sql'];
const brandReferenceFiles = [
  '20261025121430_platform_brand_reference_scan_performance.sql',
  '20261025141347_platform_brand_reference_candidate_indexes.sql',
];
const legacyRenditionFiles = ['20261025192059_legacy_rendition_playback_authority.sql'];
// Exact creator/buyer audit successors; historical mutation assertions stay
// unchanged and unexpected/missing migration files still fail the inventory.
const brandGlobalRetentionFiles = ['20261025033057_platform_brand_global_retention_integration.sql'];
const brandArchivedVerificationFiles = ['20261025111122_platform_brand_archived_byte_verification.sql'];
const externalReferenceFiles = ['20261024093048_deleted_content_reviewed_external_reference.sql'];
const originalCopyFiles = ['20261021134033_supabase_original_copy_receipts.sql','20261025111024_supabase_original_copy_cutover.sql'];
const legacyRetentionFiles = ['20261021134020_deleted_media_legacy_provenance_adapter.sql'];
const collectionOrderingFiles = ['20261020233652_user_collection_revision_authority.sql'];
const notificationPreferenceOrderingFiles = ['20261022204942_notification_preference_revision_authority.sql'];
const notificationRegistrationOrderingFiles = ['20261022205003_notification_registration_revision_authority.sql'];
const explicitApiGrantFiles = ['20261021152932_explicit_service_api_grants.sql'];
const realtimeIdentityFiles = ['20261022204956_message_realtime_replica_identity.sql'];
const r2QualificationFiles = ['20261024175231_r2_qualification_test_ledger.sql'];
const ownerSecurityFiles = [
  '20261020222318_transactional_owner_security_canary.sql',
  '20261020222325_staff_permission_null_actor_closure.sql',
];

for(const includeHeldStudio of [false,true]) test(`staff mutation repair with Studio ${includeHeldStudio?'included':'held'}`,{timeout:120_000},async t=>{
  const sql=fs.readFileSync(repairMigrationPath,'utf8');
  const {db,replayReport}=await createDatabase({overlayLiveDrift:true,includeHeldStudio});
  const actor='e8200000-0000-4000-8000-000000000001',session='e8300000-0000-4000-8000-000000000001';
  const id=n=>`e8200000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const email=n=>`runtime-mutation-${n}@example.test`;
  const claims={role:'authenticated',sub:actor,session_id:session,email:email(1)};
  const one=async(q,p=[])=> (await db.query(q,p)).rows[0];
  const setClaims=c=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(c)]);
  let assertions=0;
  const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);assertions++};
  const invoke=async(q,p=[],c=claims)=>{
    await setClaims(c);await db.exec('set role authenticated');
    try{return await one(q,p)}finally{await db.exec('reset role')}
  };
  const invokeIsolated=async(q,p=[],c=claims)=>{
    await setClaims(c);await db.exec('set role authenticated;savepoint operation');
    let result,error;
    try{result=await one(q,p)}catch(e){error=e;await db.exec('rollback to operation')}
    await db.exec('reset role');return {result,error};
  };
  const grantSql='select public.admin_grant_platform_role_by_email($1,$2,$3,$4) result';
  const grant=(n,key,reason='Runtime exact subject grant')=>invoke(grantSql,[email(n),'moderator',reason,key]);
  const reject=async(name,fn,pattern)=>{await assert.rejects(fn,e=>pattern.test(e.message),name);assertions++};
  const seedLegal=async(user,generation)=>db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
    select $1::uuid,public.wave1_sha256($1::text),document_key,version,market,'member',capability,$2,'service_reconciliation'
    from public.wave1_legal_document_versions where active and market='UNITED_STATES' and capability='account'`,[user,generation]);
  const snapshot=()=>one(`select (select jsonb_agg(to_jsonb(r) order by r.id) from public.platform_role_memberships r) roles,
    (select jsonb_agg(to_jsonb(g) order by g.id) from public.platform_staff_permission_grants g) grants,
    coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.platform_staff_role_audit a),'[]'::jsonb) audits,
    coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.platform_admin_audit_logs a),'[]'::jsonb) admin_audits,
    coalesce((select jsonb_agg(to_jsonb(r) order by r.operation_family,r.actor_user_id,r.operation_key) from public.privileged_mutation_operation_receipts r),'[]'::jsonb) receipts,
    coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.sandbox_monetization_testers t),'[]'::jsonb) testers`);
  const awaitClock=async(table,column,keyColumn,keyValue)=>{
    const deadline=Date.now()+5000;
    while(!(await one(`select clock_timestamp()>${column} elapsed from ${table} where ${keyColumn}=$1`,[keyValue])).elapsed){
      assert.ok(Date.now()<deadline,'fixture wall-clock cutoff must be observed');
      await new Promise(r=>setTimeout(r,20));
    }
  };
  const receiptBoundaries=async repaired=>{
    for(const scenario of ['receipt owner expiry','receipt owner revocation','receipt scope expiry','receipt scope revocation','receipt self fallback','audit self fallback']){
      await db.exec('begin');
      try{
        const scope=scenario.includes('scope'),self=scenario.includes('self'),revoked=scenario.includes('revocation');
        if(scope||self){
          await db.query(`insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by) values('operator',$1,$2,'active','Boundary fixture','test')`,[actor,email(1)]);
          await db.query(`insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason,granted_by) values($1,$2,'manage_moderators','active','Boundary fixture','test')`,[actor,email(1)]);
        }
        if(scope)await db.query(`update public.platform_role_memberships set status='revoked' where user_id=$1 and role='owner'`,[actor]);
        const assignment=revoked?"status='revoked'":"expires_at=clock_timestamp()+interval '100 milliseconds'";
        const mutation=scope?`update public.platform_staff_permission_grants set ${assignment} where target_user_id='${actor}' and permission_key='manage_moderators';`:`update public.platform_role_memberships set ${assignment} where user_id='${actor}' and role='owner';`;
        await db.exec(`create function public.fixture_expire_authority() returns trigger language plpgsql security definer set search_path='' as $$begin ${mutation}${revoked?'':'perform pg_sleep(0.2);'}return new;end$$;
          create trigger fixture_expire_authority after insert on public.${scenario.startsWith('audit')?'platform_staff_role_audit':'privileged_mutation_operation_receipts'} for each row execute function public.fixture_expire_authority();`);
        const before=await snapshot();
        const outcome=await invokeIsolated(grantSql,[email(self?1:2),'moderator','Boundary exact subject grant','staff-role-grant:77777777777777777777777777777777']);
        if(repaired){
          check(`${scenario}: repaired commit denied`,!!outcome.error,true);
          check(`${scenario}: exact permission boundary`,outcome.error.message,'platform_staff_permission_denied');
          check(`${scenario}: all role/scope/audit/receipt effects rolled back`,await snapshot(),before);
        }else{
          check(`${scenario}: captured live commits incorrectly`,outcome.result?.result.idempotent,false);
          check(`${scenario}: captured live receipt exists`,(await snapshot()).receipts.length,before.receipts.length+1);
        }
      }finally{await db.exec('rollback')}
    }
  };
  try{
    for(let n=1;n<=8;n++)await db.query('insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,$2,now(),false,false)',[id(n),email(n)]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,actor]);
    await db.query(`insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by) values('owner',$1,$2,'active','Runtime fixture','test')`,[actor,email(1)]);
    await seedLegal(actor,session);
    await receiptBoundaries(false);
    await db.exec('begin');
    try{
      const key='staff-role-grant:99999999999999999999999999999999';
      check('captured live valid receipt setup',(await grant(2,key)).result.idempotent,false);
      await db.query("update auth.sessions set not_after=clock_timestamp()+interval '150 milliseconds' where id=$1",[session]);
      await awaitClock('auth.sessions','not_after','id',session);
      check('captured live new mutation after transaction wall-clock expiry',(await grant(3,'staff-role-grant:88888888888888888888888888888888')).result.idempotent,false);
      check('captured live receipt after transaction wall-clock expiry',(await grant(2,key)).result.idempotent,true);
    }finally{await db.exec('rollback')}
    await db.query('update auth.users set deleted_at=now() where id=$1',[actor]);
    check('captured live deleted Owner still protected',(await one('select public.is_platform_owner_user($1) allowed',[actor])).allowed,true);
    await db.query('update auth.users set deleted_at=null where id=$1',[actor]);
    await db.exec(sql);
    await receiptBoundaries(true);
    await db.query('update auth.users set deleted_at=now() where id=$1',[actor]);
    check('repaired deleted Owner denied',(await one('select public.is_platform_owner_user($1) allowed',[actor])).allowed,false);
    await db.query('update auth.users set deleted_at=null where id=$1',[actor]);
    const key='staff-role-grant:cccccccccccccccccccccccccccccccc';
    const beforeFirst=await snapshot();
    const first=(await grant(2,key)).result;
    check('valid new grant succeeds',first.idempotent,false);
    check('grant binds exact target',first.userId,id(2));
    const firstRows=await snapshot(),grantedRole=firstRows.roles.find(r=>r.user_id===id(2)&&r.role==='moderator');
    check('stored role binds exact active actor/target',
      {user_id:grantedRole.user_id,email:grantedRole.email,role:grantedRole.role,status:grantedRole.status,granted_by:grantedRole.granted_by},
      {user_id:id(2),email:email(2),role:'moderator',status:'active',granted_by:actor});
    const newAudits=firstRows.audits.filter(r=>!beforeFirst.audits.some(old=>old.id===r.id));
    const newAdminAudits=firstRows.admin_audits.filter(r=>!beforeFirst.admin_audits.some(old=>old.id===r.id));
    check('one new exact staff and admin audit',[newAudits.length,newAdminAudits.length],[1,1]);
    check('staff audit immutable actor/target binding',
      {actor:newAudits[0].actor_user_id,target:newAudits[0].metadata.target_user_id,email:newAudits[0].target_email,action:newAudits[0].action},
      {actor,target:id(2),email:email(2),action:'grant'});
    check('receipt exact request fingerprint',firstRows.receipts[0].request_fingerprint,{target_email:email(2),target_role:'moderator',reason:'Runtime exact subject grant'});
    check('receipt exact actor/target/result binding',
      {actor:firstRows.receipts[0].actor_user_id,target:firstRows.receipts[0].result_payload.userId,resultId:String(firstRows.receipts[0].result_payload.id),storedId:firstRows.receipts[0].result_target_id},
      {actor,target:id(2),resultId:String(grantedRole.id),storedId:String(grantedRole.id)});
    const replay=(await grant(2,key)).result;
    check('valid exact retry is idempotent',replay.idempotent,true);
    check('retry returns same membership',replay.id,first.id);
    check('one receipt only',(await snapshot()).receipts.length,1);
    await reject('conflicting key reuse denied',()=>grant(3,key),/platform_staff_operation_key_conflict/);
    await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[id(3)]);
    await reject('banned target denied',()=>grant(3,'staff-role-grant:dddddddddddddddddddddddddddddddd'),/target_not_active/);
    await db.query('update auth.users set deleted_at=now() where id=$1',[id(4)]);
    await reject('deleted target denied',()=>grant(4,'staff-role-grant:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'),/platform_exact_confirmed_subject_required/);
    await db.query('update auth.users set email_confirmed_at=null where id=$1',[id(5)]);
    await reject('unconfirmed target denied',()=>grant(5,'staff-role-grant:ffffffffffffffffffffffffffffffff'),/platform_exact_confirmed_subject_required/);
    await db.query('update auth.users set email=$2,is_sso_user=true where id=$1',[id(7),email(6)]);
    await reject('ambiguous target denied',()=>grant(6,'staff-role-grant:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),/platform_exact_confirmed_subject_required/);
    await db.exec(`create function public.fixture_fail_receipt() returns trigger language plpgsql as $$begin raise exception 'fixture_receipt_failure';end$$;
      create trigger fixture_fail_receipt before insert on public.privileged_mutation_operation_receipts for each row execute function public.fixture_fail_receipt();`);
    const beforeFailedReceipt=await snapshot();
    await reject('last receipt failure denied',()=>grant(8,'staff-role-grant:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),/fixture_receipt_failure/);
    check('last receipt failure rolls back all effects',await snapshot(),beforeFailedReceipt);
    await db.exec('drop trigger fixture_fail_receipt on public.privileged_mutation_operation_receipts;drop function public.fixture_fail_receipt();');
    await invoke('select public.admin_grant_platform_role_by_email($1,$2,$3) result',[email(8),'operator','Runtime operator grant']);
    const operatorSession='e8300000-0000-4000-8000-000000000008';
    const operatorClaims={role:'authenticated',sub:id(8),session_id:operatorSession,email:email(8)};
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[operatorSession,id(8)]);await seedLegal(id(8),operatorSession);
    await db.query('update auth.users set banned_until=null where id=$1',[id(3)]);
    await reject('operator missing scope denied',()=>invoke('select public.admin_grant_platform_role_by_email($1,$2,$3) result',[email(3),'moderator','Runtime scoped grant'],operatorClaims),/platform_staff_permission_denied/);
    await db.query(`insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason,granted_by) values($1,$2,'manage_moderators','active','Runtime operator scope','test')`,[id(8),email(8)]);
    check('scoped operator succeeds',(await invoke('select public.admin_grant_platform_role_by_email($1,$2,$3) result',[email(3),'moderator','Runtime scoped grant'],operatorClaims)).result.userId,id(3));
    await reject('operator cannot grant operator',()=>invoke('select public.admin_grant_platform_role_by_email($1,$2,$3) result',[email(2),'operator','Runtime forbidden grant'],operatorClaims),/platform_staff_permission_denied/);
    const tester=(await invoke('select public.grant_sandbox_monetization_tester($1,$2,null,$3) result',[email(3),id(3),'Runtime sandbox fixture'])).result;
    check('sandbox binds exact subject',tester.userId,id(3));check('sandbox does not mint Owner',tester.ownerRoleGranted,false);check('sandbox does not mint payout',tester.payoutAccessGranted,false);
    await reject('sandbox mismatch denied',()=>invoke('select public.grant_sandbox_monetization_tester($1,$2,null,$3) result',[email(2),id(3),'Runtime mismatch']),/sandbox_tester_subject_conflict/);
    await db.query('update public.wave1_legal_acceptances set invalidated_at=now() where user_id=$1',[actor]);
    await reject('missing current legal denied',()=>grant(8,'staff-role-grant:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),/platform_staff_auth_required/);
    await db.query('update public.wave1_legal_acceptances set invalidated_at=null where user_id=$1',[actor]);
    await db.query('update auth.users set deleted_at=null where id=$1',[id(4)]);
    for(const scenario of ['new grant','receipt replay','sandbox grant','expired actor role','expired operator permission']){
      await db.exec('begin');
      try{
        let q=grantSql,p=[email(4),'moderator','Runtime delayed grant','staff-role-grant:88888888888888888888888888888888'],c=claims;
        if(scenario==='expired actor role'){
          await db.query("update public.platform_role_memberships set expires_at=clock_timestamp()+interval '150 milliseconds' where user_id=$1 and role='owner'",[actor]);await awaitClock('public.platform_role_memberships','expires_at','user_id',actor);
        }else if(scenario==='expired operator permission'){
          await db.query("update public.platform_staff_permission_grants set expires_at=clock_timestamp()+interval '150 milliseconds' where target_user_id=$1",[id(8)]);await awaitClock('public.platform_staff_permission_grants','expires_at','target_user_id',id(8));c=operatorClaims;
        }else{
          await db.query("update auth.sessions set not_after=clock_timestamp()+interval '150 milliseconds' where id=$1",[session]);await awaitClock('auth.sessions','not_after','id',session);
          if(scenario==='receipt replay')p=[email(2),'moderator','Runtime exact subject grant',key];
          if(scenario==='sandbox grant'){q='select public.grant_sandbox_monetization_tester($1,$2,null,$3) result';p=[email(4),id(4),'Runtime late tester'];}
        }
        const outcome=await invokeIsolated(q,p,c);check(`wall-clock ${scenario} denied`,!!outcome.error,true);
        check(`wall-clock ${scenario} exact denial`,outcome.error.message,scenario==='expired operator permission'?'platform_staff_permission_denied':'platform_staff_auth_required');
      }finally{await db.exec('rollback')}
    }
    for(const table of ['platform_staff_role_audit','sandbox_monetization_testers']){
      await db.exec('begin');
      try{
        await db.exec(`create function public.fixture_delete_session() returns trigger language plpgsql as $$begin delete from auth.sessions where id='${session}';return new;end$$;
          create trigger fixture_delete_session after insert on public.${table} for each row execute function public.fixture_delete_session();`);
        const before=await snapshot();
        const outcome=table==='platform_staff_role_audit'?await invokeIsolated(grantSql,[email(4),'moderator','Runtime revoked grant','staff-role-grant:88888888888888888888888888888888']):await invokeIsolated('select public.grant_sandbox_monetization_tester($1,$2,null,$3) result',[email(4),id(4),'Runtime revoked tester']);
        check(`${table} post-write deletion denied`,outcome.error?.message,'platform_staff_auth_required');check(`${table} all effects rolled back`,await snapshot(),before);check(`${table} injected deletion rolled back`,(await one('select count(*)::int n from auth.sessions where id=$1',[session])).n,1);
      }finally{await db.exec('rollback')}
    }
    // This remains a full-current-chain repair test, including reviewed successors.
    check('complete isolated brand retention successors',replayReport.files.filter(file=>brandRetentionFiles.includes(file)),brandRetentionFiles);
    check('expected migration chain',replayReport.files.length,(includeHeldStudio?429:426)+inspectionBundleFiles.length+adminBackendFiles.length+retentionRecoveryFiles.length+ownerSecurityFiles.length+collectionOrderingFiles.length+notificationPreferenceOrderingFiles.length+notificationRegistrationOrderingFiles.length+explicitApiGrantFiles.length+brandRetentionFiles.length+legacyRetentionFiles.length+originalCopyFiles.length+realtimeIdentityFiles.length+externalReferenceFiles.length+r2QualificationFiles.length+brandGlobalRetentionFiles.length+brandObservationFiles.length+brandEmptyFiles.length+brandArchivedVerificationFiles.length+userIdHoldScopeFiles.length+brandReferenceFiles.length+legacyRenditionFiles.length+monetizationAuditFiles.length+profileFeedFiles.length+discoveryInvalidationFiles.length+merchStorefrontFiles.length+flexibleCommerceFiles.length);
    assert.deepEqual(replayReport.files.filter(file=>flexibleCommerceFiles.includes(file)),flexibleCommerceFiles, 'exact flexible commerce successor migrations replay');
    assert.deepEqual(replayReport.files.filter(file=>merchStorefrontFiles.includes(file)),merchStorefrontFiles, 'exact physical storefront/SKU/photo successors replay');
    check('exact creator/buyer monetization audit successors',replayReport.files.filter(file=>monetizationAuditFiles.includes(file)),monetizationAuditFiles);
    assert.deepEqual(replayReport.files.filter(file=>profileFeedFiles.includes(file)),profileFeedFiles, 'exact profile feed migration bundle');
    assert.deepEqual(replayReport.files.filter(file=>discoveryInvalidationFiles.includes(file)),discoveryInvalidationFiles, 'exact scoped discovery migration bundle');
    check('complete Brand reference scan and candidate index successors',replayReport.files.filter(file=>brandReferenceFiles.includes(file)),brandReferenceFiles);
    check('complete legacy rendition safety successor',replayReport.files.filter(file=>legacyRenditionFiles.includes(file)),legacyRenditionFiles);
    check('complete isolated R2 qualification successor in both Studio scenarios',replayReport.files.filter(file=>r2QualificationFiles.includes(file)),r2QualificationFiles);
    check('complete Brand observation recovery successor',replayReport.files.filter(file=>brandObservationFiles.includes(file)),brandObservationFiles);
    check('complete Brand empty-test successor',replayReport.files.filter(file=>brandEmptyFiles.includes(file)),brandEmptyFiles);
    check('complete global Brand retention successor',replayReport.files.filter(file=>brandGlobalRetentionFiles.includes(file)),brandGlobalRetentionFiles);
    check('complete archived Brand verification successor',replayReport.files.filter(file=>brandArchivedVerificationFiles.includes(file)),brandArchivedVerificationFiles);
    check('complete user_id hold scope successor',replayReport.files.filter(file=>userIdHoldScopeFiles.includes(file)),userIdHoldScopeFiles);
    check('complete reviewed external reference successor',replayReport.files.filter(file=>externalReferenceFiles.includes(file)),externalReferenceFiles);
    check('complete message identity successor',replayReport.files.filter(file=>realtimeIdentityFiles.includes(file)),realtimeIdentityFiles);
    check('complete original copy successor',replayReport.files.filter(file=>originalCopyFiles.includes(file)),originalCopyFiles);
    check('complete legacy retention successor',replayReport.files.filter(file=>legacyRetentionFiles.includes(file)),legacyRetentionFiles);
    check('complete explicit service API grant successor',replayReport.files.filter(file=>explicitApiGrantFiles.includes(file)),explicitApiGrantFiles);
    check('complete collection ordering successor',replayReport.files.filter(file=>collectionOrderingFiles.includes(file)),collectionOrderingFiles);
    check('complete notification preference ordering successor',replayReport.files.filter(file=>notificationPreferenceOrderingFiles.includes(file)),notificationPreferenceOrderingFiles);
    check('complete notification registration ordering successor',replayReport.files.filter(file=>notificationRegistrationOrderingFiles.includes(file)),notificationRegistrationOrderingFiles);
    check('complete Owner Security and null-actor successors',replayReport.files.filter(file=>ownerSecurityFiles.includes(file)),ownerSecurityFiles);
    check('complete retention recovery successors',replayReport.files.filter(file=>retentionRecoveryFiles.includes(file)),retentionRecoveryFiles);
    check('complete admin backend successors',replayReport.files.filter(file=>adminBackendFiles.includes(file)),adminBackendFiles);
    check('complete disabled inspection/retention successors',replayReport.files.filter(file=>inspectionBundleFiles.includes(file)),inspectionBundleFiles);
    check('Circle closure remains in both runtime scenarios',replayReport.files.includes('20261019000210_circle_request_rpc_anon_execute_closure.sql'),true);
    check('Studio migration scope is the complete bundle',replayReport.files.filter(file=>studioBundleFiles.includes(file)),includeHeldStudio?studioBundleFiles:[]);
    check('Studio presence is isolated',!(await one("select to_regclass('public.platform_brand_publications') is null absent")).absent,includeHeldStudio);
    check('rolling metadata presence is isolated',!(await one("select to_regclass('public.platform_brand_publication_metadata') is null absent")).absent,includeHeldStudio);
    t.diagnostic(`${assertions} real-SQL assertions; SHA256 ${crypto.createHash('sha256').update(sql).digest('hex')}`);
  }finally{await db.close()}
});
