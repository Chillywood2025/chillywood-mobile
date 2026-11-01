import assert from 'node:assert/strict';

// Only the disposable Actions cluster, before any native proof sessions exist.
// Never alter cron.job: schedules, active flags and complete source hashes remain
// tested. Restart proves previously accepted cron workers have actually ended.
export async function isolateLocalCron({query, restart, waitReady, run}) {
  assert.equal(await query("select current_user='supabase_admin' and rolsuper from pg_roles where rolname=current_user"), 't',
    'verified local Supabase superuser required before ALTER SYSTEM');
  const before = await query('select pg_postmaster_start_time()::text');
  const original = await query("select setting from pg_settings where name='cron.launch_active_jobs' and context='sighup'");
  assert.ok(['on', 'off'].includes(original), 'reloadable pg_cron launcher required');
  let changed = false;
  try {
    changed = true;
    await query("alter system set cron.launch_active_jobs='off'");
    await restart();
    await waitReady();
    assert.notEqual(await query('select pg_postmaster_start_time()::text'), before, 'new local postmaster required');
    assert.equal(await query('show cron.launch_active_jobs'), 'off');
    return await run();
  } finally {
    if (changed) {
      // Compare all cron metadata immediately around restoration; never remove a
      // job or hide its scheduled state to obtain a source-fingerprint pass.
      const jobs = "select md5(coalesce(jsonb_agg(to_jsonb(j) order by jobid)::text,'[]')) from cron.job j";
      const fingerprint = await query(jobs);
      await query(`alter system set cron.launch_active_jobs='${original}'`);
      await query('select pg_reload_conf()');
      await waitReady(original);
      assert.equal(await query('show cron.launch_active_jobs'), original, 'launcher restoration required');
      assert.equal(await query(jobs), fingerprint, 'all cron metadata preserved');
    }
  }
}
