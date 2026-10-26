import assert from 'node:assert/strict';
import test from 'node:test';
import { createLegacyRenditionFixture, ids } from './helpers/legacy-rendition-playback-fixture.mjs';

test('real legacy resolver rejects stale claims and quarantine without reviving fallback', { timeout: 120_000 }, async t => {
  const f = await createLegacyRenditionFixture();
  const { db } = f;
  const resolveAs = async (role = 'anon', user = null) => {
    await f.as(role,user);
    try { return await f.resolve(); } finally { await db.exec('reset role'); }
  };
  const rowsAs = async (table, role = 'anon', user = null) => {
    await f.as(role,user);
    try { return (await db.query(`select count(*)::int n from ${table}`)).rows[0].n; }
    finally { await db.exec('reset role'); }
  };
  const isolated = async action => {
    await db.exec('begin');
    try { await action(); } finally { await db.exec('reset role; rollback'); }
  };
  try {
    const before = await resolveAs();
    assert.equal(before.allowed_qualities.length,1);
    assert.equal(before.default_quality,'360p');
    assert.equal(await rowsAs('storage.objects'),2);
    for (const sql of [
      `delete from public.media_rendition_output_path_claims where output_path='renditions/master.m3u8'`,
      `update public.video_renditions set quarantined_at=now()`,
    ]) await isolated(async () => {
      await db.exec(sql);
      assert.equal((await resolveAs()).allowed_qualities.length,1,'baseline RPC discloses the unsafe quality');
      assert.equal(await rowsAs('storage.objects'),0,'existing Storage gate independently denies it');
    });

    await f.install();
    assert.deepEqual(await resolveAs(),before,'valid anonymous JSON contract is unchanged');
    assert.equal(await rowsAs('storage.objects'),2);
    assert.equal(await rowsAs('public.video_renditions','authenticated',ids.owner),1);

    const unsafe = [
      ['missing storage claim',`delete from public.media_rendition_output_path_claims where output_path='renditions/360.mp4'`],
      ['missing manifest claim',`delete from public.media_rendition_output_path_claims where output_path='renditions/master.m3u8'`],
      ['other rendition claim',`update public.media_rendition_output_path_claims set rendition_id='a3000000-0000-4000-8000-000000000099'`],
      ['modern-table claim',`update public.media_rendition_output_path_claims set rendition_kind='media_rendition'`],
      ['rendition quarantine',`update public.video_renditions set quarantined_at=now()`],
      ['unsafe rendition scan',`update public.video_renditions set scan_status='pending_scan'`],
      ['parent quarantine',`update public.videos set quarantined_at=now()`],
      ['unsafe parent scan',`update public.videos set scan_status='pending_scan'`],
      ['parent moderation removal',`update public.videos set moderation_status='removed'`],
      ['mismatched owner',`set session_replication_role=replica; update public.video_renditions set owner_id='${ids.viewer}'; set session_replication_role=origin`],
    ];
    for (const [name,sql] of unsafe) await t.test(name,() => isolated(async () => {
      await db.exec(sql);
      const result = await resolveAs();
      assert.deepEqual(result.allowed_qualities,[]);
      assert.equal(result.default_quality,null);
      assert.equal(result.hd_available,false);
      assert.equal(result.legacy_playback_allowed,false,'unsafe ready output cannot revive original fallback');
      assert.equal(await rowsAs('storage.objects'),0);
      assert.equal(await rowsAs('public.video_renditions','authenticated',ids.owner),0);
    }));

    await t.test('stale shared alias after canonical deletion',() => isolated(async () => {
      await db.exec(`set session_replication_role=replica;
        insert into public.video_renditions(id,video_id,owner_id,quality_label,storage_path,manifest_path)
        select 'a3000000-0000-4000-8000-000000000002',video_id,owner_id,'480p',storage_path,manifest_path from public.video_renditions;
        set session_replication_role=origin;`);
      assert.equal((await resolveAs()).allowed_qualities.length,1,'only the canonical claim holder is offered');
      await db.query("update public.video_renditions set status='archived' where id=$1",[ids.rendition]);
      assert.deepEqual((await resolveAs()).allowed_qualities,[],'archiving a canonical output does not authorize its alias');
      assert.equal((await resolveAs()).legacy_playback_allowed,false);
      await db.query('delete from public.video_renditions where id=$1',[ids.rendition]);
      const result = await resolveAs();
      assert.deepEqual(result.allowed_qualities,[]);
      assert.equal(result.legacy_playback_allowed,false);
      assert.equal(await rowsAs('storage.objects'),0);
    }));
    for (const status of ['archived','failed','queued','processing']) await t.test(`${status} retains legacy fallback contract`,() => isolated(async () => {
      await db.query('update public.video_renditions set status=$1',[status]);
      const result = await resolveAs();
      assert.deepEqual(result.allowed_qualities,[]);
      assert.equal(result.default_quality,null);
      assert.equal(result.legacy_playback_allowed,true,'the still-authorized parent original remains available');
      assert.equal(await rowsAs('storage.objects'),0);
    }));
    await t.test('same-row alias is valid',() => isolated(async () => {
      await db.exec(`update public.video_renditions set manifest_path=storage_path`);
      assert.equal((await resolveAs()).allowed_qualities.length,1);
    }));
    await t.test('a valid neighboring quality survives an invalid lower quality',() => isolated(async () => {
      await db.exec(`insert into public.video_renditions(id,video_id,owner_id,quality_label,storage_path)
        values('a3000000-0000-4000-8000-000000000003','${ids.video}','${ids.owner}','480p','renditions/480.mp4');
        delete from public.media_rendition_output_path_claims where output_path='renditions/360.mp4';`);
      const result = await resolveAs();
      assert.deepEqual(result.allowed_qualities.map(row => row.quality_label),['480p']);
      assert.equal(result.default_quality,'480p');
      assert.equal(result.legacy_playback_allowed,false);
    }));
    await t.test('Premium and owner tiers retain access and availability behavior',() => isolated(async () => {
      await db.exec(`update public.video_renditions set quality_label='720p',access_tier='premium'`);
      const anonymous = await resolveAs();
      assert.deepEqual(anonymous.allowed_qualities,[]);
      assert.equal(anonymous.is_premium_locked_available,true);
      await db.exec(`select set_config('fixture.premium','true',true)`);
      const premium = await resolveAs('authenticated',ids.viewer);
      assert.equal(premium.default_quality,'720p');
      assert.equal(premium.hd_available,true);
      assert.equal(await rowsAs('storage.objects','authenticated',ids.viewer),2);
      await db.exec(`select set_config('fixture.premium','false',true); update public.video_renditions set access_tier='owner'`);
      assert.equal((await resolveAs('authenticated',ids.owner)).default_quality,'720p');
      assert.deepEqual((await resolveAs('authenticated',ids.viewer)).allowed_qualities,[]);
      await db.exec(`update public.video_renditions set quarantined_at=now(),access_tier='premium'`);
      const unsafe = await resolveAs();
      assert.equal(unsafe.is_premium_locked_available,false);
      assert.equal(unsafe.hd_available,false);
      assert.deepEqual((await resolveAs('authenticated',ids.owner)).allowed_qualities,[]);
    }));
    await t.test('outer commerce denial precedes the unchanged private selector',() => isolated(async () => {
      await db.exec(`select set_config('fixture.parent_denied','true',true)`);
      const result = await resolveAs();
      assert.equal(result.status,'not_allowed');
      assert.deepEqual(result.allowed_qualities,[]);
      assert.equal(result.access_reason,'fixture_parent_gate');
      assert.equal(result.legacy_playback_allowed,false);
    }));
    await t.test('parent deletion removes legacy output',() => isolated(async () => {
      await db.query('delete from public.videos where id=$1',[ids.video]);
      assert.deepEqual((await resolveAs()).allowed_qualities,[]);
      assert.equal(await rowsAs('storage.objects'),0);
    }));
    const acl = (await db.query(`select
      has_function_privilege('anon','public.video_rendition_playback_safe(uuid)','EXECUTE') helper,
      has_function_privilege('anon','public.resolve_video_playback_pre_paid_authority_closeout(uuid)','EXECUTE') predecessor,
      (select prosecdef and proconfig=array['search_path=""'] from pg_proc where oid='public.video_rendition_playback_safe(uuid)'::regprocedure) fixed_path`)).rows[0];
    assert.deepEqual(acl,{helper:true,predecessor:false,fixed_path:true});
  } finally { await db.close(); }
});
