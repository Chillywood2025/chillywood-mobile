// Full migration replay, actual role/RLS/report/audit/notification/delivery SQL.
// Synthetic accounts and storage rows only; no network, provider or device use.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createDatabase, splitSQL} from './helpers/database-runtime-authority-fixture.mjs';

const migration = new URL('../supabase/migrations/20261016002724_profile_media_report_enforcement_repair.sql', import.meta.url);
const sourceRepair = fs.readFileSync(migration, 'utf8');
const mutations = {
  delivery: sql => sql.replace("if v_media_status is distinct from 'active' then", 'if false then'),
  role: sql => sql.replace("and current_user in ('postgres', 'service_role', 'supabase_admin')", 'and true'),
  finalAuthority: sql => sql.replace("if v_target_type = 'profile_media'\n    and not public.has_platform_permission", "if false\n    and not public.has_platform_permission"),
};
const mutation = process.env.PROFILE_MEDIA_REPORT_MUTATION;
if (mutation) assert.ok(mutations[mutation], 'known explicit test mutation');
const repair = mutation ? mutations[mutation](sourceRepair) : sourceRepair;
if (mutation) assert.notEqual(repair, sourceRepair, 'mutation changed production SQL');
const historicalFunction = (file, name) => splitSQL(fs.readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  .find(sql => sql.replaceAll('"', '').includes(`create or replace function public.${name}(`));
const oldGuard = historicalFunction('202608250002_whole_app_media_authority_closure.sql', 'guard_profile_media_client_authority');
const oldDelivery = historicalFunction('20260829233000_restore_owner_profile_media_delivery.sql', 'resolve_profile_media_delivery');
const oldAction = historicalFunction('20260625214816_chat_thread_report_message_actions.sql', 'apply_admin_report_target_action');
const id = n => `f6100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const session = n => `f6200000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const email = n => `profile-moderation-${n}@example.test`;
const claims = n => ({role:'authenticated', sub:id(n), session_id:session(n), email:email(n)});
const owner = id(2);

test('profile-media report action preserves authority and enforces exact delivery', {timeout:240_000}, async t => {
  const {db} = await createDatabase({overlayLiveDrift:true, applyRepair:true});
  const one = async (sql, params=[]) => (await db.query(sql, params)).rows[0];
  const as = async (n, sql, params=[]) => {
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims(n))]);
    await db.exec('set role authenticated');
    try { return await one(sql, params); } finally { await db.exec('reset role'); }
  };
  const action = (report, kind='hide', actor=1, target=owner, reason='Synthetic private staff reason') =>
    as(actor, 'select * from public.apply_admin_report_target_action($1,\'profile_media\',$2,$3,$4)', [report,target,kind,reason]);
  const profile = () => one('select to_jsonb(p) row from public.user_profiles p where user_id=$1', [owner]);
  const effects = () => one(`select
    (select to_jsonb(p) from public.user_profiles p where user_id=$1) profile,
    (select jsonb_agg(to_jsonb(r) order by id) from public.safety_reports r) reports,
    coalesce((select jsonb_agg(to_jsonb(a) order by id) from public.platform_admin_audit_logs a),'[]'::jsonb) audits,
    coalesce((select jsonb_agg(to_jsonb(e) order by id) from public.notification_activity_events e),'[]'::jsonb) events`, [owner]);
  const delivery = async kind => (await as(4, 'select public.resolve_profile_media_delivery($1,$2) result', [owner,`${owner}/${kind}/fixture.jpg`])).result;
  const report = async (n, kind='avatar', target=owner) => {
    const reporter = n - 921001 + 5;
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims(reporter))]);
    // Independent reporters exercise real duplicate/rate guards unchanged.
    return db.query(`insert into public.safety_reports
      (id,reporter_user_id,target_type,target_id,category,context,created_at)
      values($1,$2,'profile_media',$3,'other',$4::jsonb,now()-interval '1 hour')`,
    [n,id(reporter),target,JSON.stringify({profileMediaKind:kind})]);
  };
  const context = () => one("select coalesce(current_setting('app.profile_media_report_action',true),'') value");
  const securityCatalog = async () => ({
    relations:(await db.query(`select n.nspname,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') order by 1,2`)).rows,
    policies:(await db.query("select * from pg_policies order by schemaname,tablename,policyname")).rows,
    functions:(await db.query(`select p.oid,p.proname,p.proowner,p.prosecdef,p.proacl,p.proconfig,
      pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','private') and p.prokind='f' order by p.oid`)).rows,
  });
  const denyUnchanged = async (label, fn, pattern) => {
    const before = await effects();
    await assert.rejects(fn, pattern, label);
    assert.deepEqual(await effects(), before, `${label}: no profile/report/audit/notification effects`);
  };
  try {
    for (let n=1;n<=11;n++) {
      await db.query('insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,$2,now(),false,false)', [id(n),email(n)]);
      await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [session(n),id(n)]);
      await db.query(`insert into public.user_profiles(user_id,username,profile_visibility)
        values($1,$2,'everyone') on conflict(user_id) do update set profile_visibility='everyone'`, [id(n),`profile_mod_${n}`]);
      await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,
        role_key,capability,session_generation,authority_source)
        select $1::uuid,public.wave1_sha256($1::text),document_key,version,market,'member',capability,$2,'service_reconciliation'
        from public.wave1_legal_document_versions where active and market='UNITED_STATES' and capability='account'`, [id(n),session(n)]);
    }
    await db.query(`insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
      values('owner',$1,$2,'active','Synthetic fixture','test'),('operator',$3,$4,'active','Synthetic fixture','test')`, [id(1),email(1),id(3),email(3)]);
    await db.query(`insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason,granted_by)
      values($1,$2,'admin.content.hide','active','Synthetic fixture','test')`, [id(3),email(3)]);
    for (const [index,kind] of ['avatar','background'].entries()) {
      await db.query(`insert into storage.objects(id,bucket_id,name,owner,owner_id,metadata)
        values($1,'profile-media',$2,$3::uuid,$3::text,'{"mimetype":"image/jpeg","size":1024}'::jsonb)`, [id(10+index),`${owner}/${kind}/fixture.jpg`,owner]);
    }
    await db.query(`update public.user_profiles set
      avatar_url=public.profile_media_public_url(user_id,user_id||'/avatar/fixture.jpg'),
      profile_background_url=public.profile_media_public_url(user_id,user_id||'/background/fixture.jpg') where user_id=$1`, [owner]);
    await db.query(`update public.user_profiles set profile_avatar_scan_status='clean',profile_background_scan_status='clean',
      profile_avatar_scan_result='synthetic clean',profile_background_scan_result='synthetic clean' where user_id=$1`, [owner]);
    for (const [n,kind] of [[921001,'avatar'],[921002,'background'],[921003,'avatar'],[921004,'background'],[921005,'avatar'],[921006,'avatar']]) await report(n,kind);
    assert.equal((await delivery('avatar')).allowed,true);
    assert.equal((await delivery('background')).allowed,true);
    await db.exec(oldGuard + oldAction + oldDelivery);
    await denyUnchanged('old source rejects genuine operator action', () => action(921001), /profile_media_status_server_owned/);
    const catalogBefore=await securityCatalog();
    await db.exec(repair);
    const catalogAfter=await securityCatalog();
    assert.deepEqual(catalogAfter.relations,catalogBefore.relations,'no table/owner/RLS/FORCE-RLS/grant changes');
    assert.deepEqual(catalogAfter.policies,catalogBefore.policies,'no policy widening');
    assert.deepEqual(catalogAfter.functions.map(({definition,...abi})=>abi),catalogBefore.functions.map(({definition,...abi})=>abi),'same function identities, signatures, owners, ACLs, security and search paths');
    assert.deepEqual(catalogAfter.functions.filter((f,i)=>f.definition!==catalogBefore.functions[i].definition).map(f=>f.proname).sort(),
      ['apply_admin_report_target_action','guard_profile_media_client_authority','resolve_profile_media_delivery'],'only three declared production functions change');
    await db.exec(repair);
    assert.deepEqual(await securityCatalog(),catalogAfter,'forward repair reapplication is catalog-idempotent');
    assert.equal((await one("select prosecdef from pg_proc where oid='public.guard_profile_media_client_authority()'::regprocedure")).prosecdef,false,'trigger must remain SECURITY INVOKER');
    await denyUnchanged('ordinary content owner cannot moderate', () => action(921001,'hide',2), /admin_reports_target_permission_denied/);
    await denyUnchanged('scoped hide actor cannot remove', () => action(921001,'remove',3), /admin_report_target_action_scope_required/);
    await denyUnchanged('wrong target rejected', () => action(921001,'hide',1,id(4)), /admin_report_target_mismatch/);
    await denyUnchanged('reason required', () => action(921001,'hide',1,owner,''), /admin_report_reason_required/);

    // Known report/actor/context are not secrets. Forging all of them as the
    // authenticated content owner still cannot write server-owned status.
    const forged = JSON.stringify({reportId:'921001',actor:owner,target:owner,mediaKind:'avatar',action:'hidden',at:new Date().toISOString()});
    await as(2, "select set_config('app.profile_media_report_action',$1,false)", [forged]);
    await denyUnchanged('ordinary client forged context', () => as(2, "update public.user_profiles set profile_avatar_media_status='flagged' where user_id=$1 returning user_id", [owner]), /profile_media_status_server_owned|profile_media_report_action_invalid/);
    await db.query("select set_config('app.profile_media_report_action','',false)");
    await report(921007,'avatar',id(1));
    await db.exec('begin');
    try {
      await as(1, `select set_config('app.profile_media_report_action',jsonb_build_object(
        'reportId','921007','actor',$1::text,'target',$1::text,'mediaKind','avatar','action','hidden','at',now())::text,true)`, [id(1)]);
      await db.exec('set local role authenticated');
      await assert.rejects(() => one(`update public.user_profiles set profile_avatar_media_status='flagged',
        profile_avatar_media_flagged_at=now(),profile_media_updated_at=now(),updated_at=now() where user_id=$1`, [id(1)]),
      /profile_media_status_server_owned/,'even staff cannot bypass audited RPC with a complete forged context and exact status-only delta');
    } finally { await db.exec('rollback'); }
    await db.query("select set_config('app.profile_media_report_action','',false)");

    const before = (await profile()).row;
    const auditsBefore = (await effects()).audits.length;
    const hidden = await action(921001,'hide',3);
    assert.equal(hidden.status,'actioned'); assert.equal(hidden.resolved_by,id(3)); assert.equal(hidden.resolution_type,'target_hidden');
    const after = (await profile()).row;
    for (const key of Object.keys(before).filter(k=>!['profile_avatar_media_status','profile_avatar_media_flagged_at','profile_media_updated_at','updated_at'].includes(k))) assert.deepEqual(after[key],before[key],`hide preserves ${key}`);
    assert.equal(after.profile_avatar_media_status,'flagged');
    assert.equal((await delivery('avatar')).reason,'profile_media_moderation_blocked');
    assert.equal((await delivery('background')).allowed,true,'unaffected background remains deliverable');
    assert.equal((await context()).value,'','successful RPC clears bounded context');
    const event = await one("select recipient_user_id,actor_user_id,private.resolve_notification_activity(e) resolved from public.notification_activity_events e where source_id='921001'");
    assert.equal(event.recipient_user_id,owner); assert.equal(event.actor_user_id,null);
    assert.equal(event.resolved.deep_link,`/profile/${owner}`); assert.equal(event.resolved.eligible,true);
    assert.equal(JSON.stringify(event).includes('Synthetic private staff reason'),false);
    assert.equal((await effects()).audits.length,auditsBefore+1,'one real immutable audit');
    await denyUnchanged('closed report retry cannot duplicate effects', () => action(921001,'hide',3), /admin_report_closed_state/);
    await db.exec(oldDelivery);
    assert.equal((await delivery('avatar')).allowed,true,'old exact resolver incorrectly serves genuinely hidden clean object');
    await db.exec(repair);
    assert.equal((await delivery('avatar')).allowed,false,'repair kills old resolver control');
    await action(921002,'remove');
    assert.equal((await profile()).row.profile_background_media_status,'admin_removed');
    assert.equal((await delivery('background')).allowed,false);
    await action(921003,'restore');
    assert.equal((await delivery('avatar')).allowed,true,'genuine restore of clean media works');

    // A restore is moderation authority, never malware approval.
    await db.query("select set_config('request.jwt.claims','{}',false)");
    await db.query("update public.user_profiles set profile_background_scan_status='malware_detected' where user_id=$1", [owner]);
    await action(921004,'restore');
    assert.equal((await profile()).row.profile_background_scan_status,'malware_detected');
    assert.equal((await delivery('background')).reason,'profile_media_scan_blocked');

    // Exact transaction rollback when the final audit write fails, followed by
    // a successful retry proves no leaked context or phantom event/audit.
    await db.exec(`create function public.fixture_fail_profile_audit() returns trigger language plpgsql as $$begin raise exception 'fixture_audit_failure';end$$;
      create trigger fixture_fail_profile_audit before insert on public.platform_admin_audit_logs for each row execute function public.fixture_fail_profile_audit();`);
    await denyUnchanged('audit failure rolls back enforcement', () => action(921005), /fixture_audit_failure/);
    assert.equal((await context()).value,'','failed RPC leaves no bounded context');
    await db.exec('drop trigger fixture_fail_profile_audit on public.platform_admin_audit_logs;drop function public.fixture_fail_profile_audit()');
    await action(921005);
    assert.equal((await context()).value,'');
    assert.equal((await one("select count(*)::int n from public.notification_activity_events where source_id='921005'")).n,1);

    // A real authority loss injected at the late audit boundary must abort the
    // full report transaction, including the injected session deletion itself.
    await db.exec(`create function public.fixture_revoke_profile_actor() returns trigger language plpgsql as $$begin delete from auth.sessions where id='${session(1)}';return new;end$$;
      create trigger fixture_revoke_profile_actor after insert on public.platform_admin_audit_logs for each row execute function public.fixture_revoke_profile_actor();`);
    await denyUnchanged('session loss at commit boundary', () => action(921006,'restore'), /admin_report_target_action_scope_required/);
    assert.equal((await one('select count(*)::int n from auth.sessions where id=$1',[session(1)])).n,1);
    assert.equal((await context()).value,'');
    await db.exec('drop trigger fixture_revoke_profile_actor on public.platform_admin_audit_logs;drop function public.fixture_revoke_profile_actor()');
    await db.exec(`create function public.fixture_profile_extra_delta() returns trigger language plpgsql as $$begin new.username:=old.username||'x';return new;end$$;
      create trigger zy_fixture_profile_extra_delta before update on public.user_profiles for each row execute function public.fixture_profile_extra_delta();`);
    await denyUnchanged('report context cannot authorize unrelated profile fields',()=>action(921006,'restore'),/profile_media_report_action_invalid/);
    assert.equal((await context()).value,'','trigger failure rolls back temporary report context');
    await db.exec('drop trigger zy_fixture_profile_extra_delta on public.user_profiles;drop function public.fixture_profile_extra_delta()');
    await as(1,"select set_config('app.profile_media_report_action','caller-sentinel',false)");
    await action(921006,'restore');
    assert.equal((await context()).value,'caller-sentinel','successful RPC restores preexisting untrusted context instead of leaking its capability');
    await db.query("select set_config('app.profile_media_report_action','',false)");
    t.diagnostic('Old action guard and old delivery resolver reproduced; real scoped report/audit/notification/delivery paths, direct client forgeries, retry, rollback and late-session control passed. No physical/provider evidence.');
  } catch (error) {
    t.diagnostic(JSON.stringify({message:error.message,where:error.where,internalQuery:error.internalQuery,query:error.query}));
    throw error;
  } finally { await db.close(); }
});
