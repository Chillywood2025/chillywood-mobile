// Called by the existing CI native PostgreSQL runner inside its generated
// disposable LOCAL clone. All access/cleanup remains owned by that runner.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function runProfileMediaReportConcurrency({query,literal,claimSql,seedPerson,seedRole,openSession,waitUntil,terminate}) {
  let checks=0;
  for (const boundary of ['profile', 'audit']) for (const change of ['none', 'session', 'scope']) {
    const revoke = change !== 'none';
    const actor=seedPerson(), target=seedPerson(), reporter=seedPerson();
    seedRole(actor,'operator');
    query(`insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason,granted_by)
      values(${literal(actor.user)},${literal(actor.email)},'admin.content.hide','active','Native profile queue','test');`);
    query(`insert into public.user_profiles(user_id,username) values(${literal(target.user)},${literal(`profile_${target.user.replaceAll('-','').slice(0,16)}`)}) on conflict(user_id) do nothing;`);
    const report=query(`begin;${claimSql(reporter)}insert into public.safety_reports(reporter_user_id,target_type,target_id,category,context)
      values(${literal(reporter.user)},'profile_media',${literal(target.user)},'other','{"profileMediaKind":"avatar"}') returning id;commit;`).split('\n').at(-1);
    assert.match(report,/^[0-9]+$/u);
    const label=`profile_report_${randomUUID().replaceAll('-','')}`;
    let holder,waiter;
    try {
      const lock = boundary === 'profile'
        ? `select user_id from public.user_profiles where user_id=${literal(target.user)} for update;`
        : 'lock table public.platform_admin_audit_logs in share mode;';
      holder=openSession(`${label}_holder`,`begin;${lock}select 'PROFILE_LOCKED';`);
      await waitUntil(()=>holder.output().includes('PROFILE_LOCKED'),'profile row holder acquired');
      waiter=openSession(`${label}_waiter`,`set statement_timeout='15s';begin;${claimSql(actor)}
        select (public.apply_admin_report_target_action(${report},'profile_media',${literal(target.user)},'hide','Native profile report queue')).status;
        select coalesce(current_setting('app.profile_media_report_action',true),'')='';commit;`);
      waiter.child.stdin.end();
      const blocked = () => query(`select exists(select 1 from pg_stat_activity w join pg_stat_activity h
        on h.pid=any(pg_blocking_pids(w.pid)) where w.datname=current_database() and h.datname=current_database()
        and w.application_name=${literal(`${label}_waiter`)} and h.application_name=${literal(`${label}_holder`)}
        and w.pid<>h.pid and w.wait_event_type='Lock');`) === 't';
      await waitUntil(blocked,`actual profile report ${boundary} lock wait observed`);
      if(change === 'session')query(`delete from auth.sessions where id=${literal(actor.session)};`);
      // Revoke only this exact scoped grant; leave session and role valid.
      if(change === 'scope')query(`update public.platform_staff_permission_grants set status='revoked' where target_user_id=${literal(actor.user)} and permission_key='admin.content.hide';`);
      assert.equal(blocked(),true,'waiter remains blocked after independent authority change');
      holder.child.stdin.end('commit;\n');
      assert.equal((await holder.done).code,0);
      const outcome=await waiter.done;
      const state=JSON.parse(query(`select jsonb_build_object(
        'status',(select profile_avatar_media_status from public.user_profiles where user_id=${literal(target.user)}),
        'report',(select status from public.safety_reports where id=${report}),
        'events',(select count(*) from public.notification_activity_events where event_kind='moderation_notice' and source_id=${literal(report)}),
        'audits',(select count(*) from public.platform_admin_audit_logs where actor_user_id=${literal(actor.user)}))::text;`));
      if(revoke) {
        assert.notEqual(outcome.code,0);
        assert.match(outcome.stderr,/profile_media_report_action_invalid|admin_report_target_action_scope_required/u);
        assert.deepEqual(state,{status:'active',report:'needs_review',events:0,audits:0},'queued revoked actor leaves no effects');
      } else {
        assert.equal(outcome.code,0,outcome.stderr);
        assert.match(outcome.stdout,/actioned\s+t/u,'status and context cleanup read back from same backend');
        assert.deepEqual(state,{status:'flagged',report:'actioned',events:1,audits:1},'one exact queued enforcement');
        // Two concurrent retries see the same closed report; neither duplicates.
        const retrySql=`set statement_timeout='15s';begin;${claimSql(actor)}select public.apply_admin_report_target_action(${report},'profile_media',${literal(target.user)},'hide','Native profile report queue');commit;`;
        const retries=[openSession(`${label}_retry1`,retrySql),openSession(`${label}_retry2`,retrySql)];
        for(const retry of retries)retry.child.stdin.end();
        for(const retry of retries){const result=await retry.done;assert.notEqual(result.code,0);assert.match(result.stderr,/admin_report_closed_state/u);}
        assert.equal(query(`select count(*) from public.notification_activity_events where event_kind='moderation_notice' and source_id=${literal(report)};`),'1');
      }
      checks++;console.log(`PASS profile report observed ${boundary} lock / ${change}: ${revoke?'authority revoked, all effects denied':'exact action, cleaned context, concurrent retries denied'}`);
    } finally {await terminate(`${label}_holder`,holder);await terminate(`${label}_waiter`,waiter);}
  }
  assert.equal(checks,6);
}
