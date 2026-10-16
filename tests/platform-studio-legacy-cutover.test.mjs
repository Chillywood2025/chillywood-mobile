import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { makeFixture, ids, sessionId, read } from './helpers/studio-authority-fixture.mjs';
import { loadStudioFunctions } from './helpers/studio-source-harness.mjs';

const root = fileURLToPath(new URL('./fixtures/studio-legacy-cutover/', import.meta.url));
const provenance = JSON.parse(fs.readFileSync(`${root}/provenance.json`, 'utf8'));
const migration = 'supabase/migrations/20261015073423_platform_studio_publication_and_audience_authority.sql';
const sha = value => createHash('sha256').update(value).digest('hex');
const assetId = '70000000-0000-4000-8000-000000000007';

test('portable historical declarations are hash-bound to the recorded baseline', () => {
  assert.equal(provenance.commit, '423b10f12ae2a3b6c42c1587210fadaea5418b18');
  for (const file of provenance.files) {
    const source = fs.readFileSync(`${root}/${file.path}.txt`, 'utf8');
    assert.equal(sha(source), file.fixtureSha256);
    let offset = 0;
    for (const declaration of file.declarations) {
      const slice = source.slice(offset, offset + declaration.end - declaration.start);
      assert.equal(sha(slice), declaration.sha256, declaration.name);
      offset += slice.length + 2;
    }
  }
});

// Supabase transport adapter only: all writes and visibility checks execute the
// production SQL fixture. Hooks inject response loss/interleavings at IO boundaries.
async function legacyFixture(t) {
  const fixture = await makeFixture();
  t.after(() => fixture.db.close());
  const state = { actor: ids.owner, writes: [], before: null, after: null };
  let queue = Promise.resolve();
  const query = (sql, values = [], actor = state.actor) => {
    const next = queue.then(() => fixture.as(actor ? 'authenticated' : 'anon', actor, sql, values))
      .then(value => JSON.parse(JSON.stringify(value))); // PostgREST returns JSON timestamps, not JS Dates.
    queue = next.catch(() => {}); // Serialize fixture role changes, not application transactions.
    return next;
  };
  const result = async (operation, work) => {
    try {
      await state.before?.(operation);
      const data = await work();
      await state.after?.(operation, data);
      return { data, error: null };
    } catch (error) { return { data: null, error }; }
  };
  const supabase = { from(table) {
    let payload, mode = 'select';
    const filters = [], values = [];
    const builder = {
      upsert(value) { payload = value; mode = 'upsert'; return this; },
      update(value) { payload = value; mode = 'update'; return this; },
      select() { return this; },
      eq(key, value) { values.push(value); filters.push(`${key}=$${values.length}`); return this; },
      in(key, value) { values.push(value); filters.push(`${key}=any($${values.length})`); return this; },
      is(key, value) { assert.equal(value, null); filters.push(`${key} is null`); return this; },
      returns() { return mode === 'upsert' ? this : this.execute(); },
      single() { return this.execute(); },
      execute() { return result(`${table}:${mode}`, async () => {
        if (mode === 'upsert') {
          const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
          const names = entries.map(([key]) => key);
          state.writes.push({ ...payload });
          const response = await query(`insert into ${table}(${names}) values(${names.map((_, i) => `$${i + 1}`)})
            on conflict(owner_user_id) do update set ${names.filter(key => key !== 'owner_user_id').map(key => `${key}=excluded.${key}`)} returning *`, entries.map(([, value]) => value));
          return response.rows[0];
        }
        let sql = `select * from ${table}`;
        if (mode === 'update') {
          const assignments = Object.entries(payload).map(([key, value]) => { values.push(value); return `${key}=$${values.length}`; });
          sql = `update ${table} set ${assignments}`;
        }
        sql += filters.length ? ` where ${filters.join(' and ')}` : '';
        return (await query(sql + (mode === 'update' ? ' returning *' : ''), values)).rows;
      }); },
    };
    return builder;
  } };
  const rpc = (name, args) => result(`rpc:${name}`, async () => (await query(
    `select public.${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`)}) result`, Object.values(args))).rows[0].result);
  const context = { supabase, runCurrentAccountBoundSupabaseMutationRpc: rpc,
    reviewPlatformBrandAsset: () => { throw new Error('Unexpected missing-RPC fallback'); } };
  const api = loadStudioFunctions('_lib/platformBranding.ts.txt', provenance.files[0].declarations.map(d => d.name), context, root);
  // Readback bundle transport projects SQL rows, retaining the historical parser
  // and historical readiness algorithm; signed URLs are irrelevant to readiness.
  context.readPlatformBrandStudio = async owner => ({
    profile: api.parseProfile((await query('select * from platform_brand_profiles where owner_user_id=$1', [owner])).rows[0], owner),
    assets: (await query('select * from platform_brand_assets where owner_user_id=$1', [owner])).rows.map(row => ({
      id: row.id, assetState: row.asset_state, moderationStatus: row.moderation_status, scanStatus: row.scan_status, deletedAt: row.deleted_at,
    })),
  });
  context.readPublicPlatformBranding = async owner => {
    const row = (await query('select * from read_public_platform_brand_profile($1)', [owner], null)).rows[0];
    return row ? { profile: api.parseProfile(row, owner), assets: [] } : null;
  };
  const draft = () => context.readPlatformBrandStudio(ids.owner).then(bundle => bundle.profile);
  const live = () => context.readPublicPlatformBranding(ids.owner).then(bundle => bundle?.profile ?? null);
  const ui = async patch => {
    let notice, profileSaves = 0;
    const handler = loadStudioFunctions('app/channel-settings.tsx.txt', provenance.files[1].declarations.map(d => d.name), {
      ...api, user: { id: ids.owner }, getCurrentBrandDraft: () => patch,
      brandProfileSaveInFlightRef: { current: false }, setBrandSaving() {}, setSaving() {}, setNotice() {},
      setBrandDraft() {}, setBrandNotice(value) { notice = value; },
      loadPlatformBranding: () => context.readPlatformBrandStudio(ids.owner),
      saveCurrentProfileSettingsIfNeeded: async () => { profileSaves++; },
    }, root);
    await handler.publishBrandStudioAndProfile();
    return { notice, profileSaves };
  };
  const seedAsset = async () => {
    await fixture.db.query(`insert into platform_brand_assets(id,owner_user_id,asset_type,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type)
      values($1,$2,'hero_image','supabase','platform-brand-assets',$3,$3,'image/png')`, [assetId, ids.owner, `${ids.owner}/hero.png`]);
    await fixture.db.query("update platform_brand_assets set scan_status='clean' where id=$1", [assetId]);
  };
  const atomic = patch => rpc('publish_platform_brand_profile', { p_profile: api.toProfileUpsert(ids.owner, { ...api.createDefaultPlatformBrandProfile(ids.owner), ...patch }) });
  return { ...fixture, state, api, draft, live, ui, seedAsset, atomic };
}

test('EXPECTED unsafe legacy flow before cutover: early timestamp and lost concurrent draft', async t => {
  const f = await legacyFixture(t);
  let firstWriteAt;
  f.state.after = async operation => {
    if (operation !== 'platform_brand_profiles:upsert' || f.state.writes.length !== 1) return;
    firstWriteAt = new Date().toISOString();
    await f.db.query("update platform_brand_profiles set accent_color='#222222' where owner_user_id=$1", [ids.owner]);
  };
  const saved = await f.api.publishPlatformBrandProfile(ids.owner, { accentColor: '#111111' });
  assert.ok(saved.publishedAt <= firstWriteAt, 'Old timestamp predates the first save response');
  assert.equal((await f.draft()).accentColor, '#111111', 'EXPECTED unsafe: final full-profile payload overwrites intervening edit');
  assert.equal((await f.live()).accentColor, '#111111');
  assert.equal(f.state.writes.length, 2);
  await f.api.savePlatformBrandProfileDraft(ids.owner, { ...saved, accentColor: '#333333' });
  assert.equal(f.state.writes[2].published_at, saved.publishedAt, 'Cached metadata really travels on old draft saves');
  assert.equal((await f.live()).accentColor, '#333333', 'EXPECTED unsafe pre-cutover: draft leaks into live');
});

test('held migration rejects actual old final write, preserving snapshot and concurrent draft', async t => {
  const f = await legacyFixture(t);
  const cached = await f.api.publishPlatformBrandProfile(ids.owner, { accentColor: '#111111' });
  await f.db.exec(read(migration));
  await f.api.savePlatformBrandProfileDraft(ids.owner, { ...cached, accentColor: '#222222' });
  assert.equal((await f.live()).accentColor, '#111111');
  f.state.writes = [];
  f.state.after = async operation => {
    if (operation === 'platform_brand_profiles:upsert' && f.state.writes.length === 1)
      await f.db.query("update platform_brand_profiles set accent_color='#444444' where owner_user_id=$1", [ids.owner]);
  };
  await assert.rejects(f.api.publishPlatformBrandProfile(ids.owner, { ...cached, accentColor: '#333333' }), /brand_publish_rpc_required/);
  assert.equal((await f.draft()).accentColor, '#444444');
  assert.equal((await f.live()).accentColor, '#111111');
  f.state.after = null;
  assert.equal((await f.atomic({ accentColor: '#555555' })).error, null);
  assert.equal((await f.live()).accentColor, '#555555');
  const before = await f.draft();
  await assert.rejects(f.api.savePlatformBrandProfileDraft(ids.owner, { ...cached, accentColor: '#666666' }), /brand_publish_rpc_required/);
  assert.deepEqual(await f.draft(), before, 'Stale cached publication metadata rejects the entire draft write');
});

test('historical selected-media publish and actual screen handler succeed on pre-cutover SQL', async t => {
  const f = await legacyFixture(t);
  await f.seedAsset();
  const outcome = await f.ui({ heroImageAssetId: assetId, accentColor: '#ABCDEF' });
  assert.match(outcome.notice, /Your public Platform is updated/);
  assert.equal(outcome.profileSaves, 1);
  assert.equal((await f.live()).heroImageAssetId, assetId);
  assert.equal((await f.live()).accentColor, '#ABCDEF');
  assert.equal((await f.db.query('select count(*)::int n from platform_brand_asset_review_events')).rows[0].n, 1);
  assert.equal(f.state.writes.length, 2, 'Real old draft and final publication are separate requests');
});

test('legacy earlier asset commit survives interrupted final phase; atomic unsafe-media control rolls back', async t => {
  const f = await legacyFixture(t);
  await f.seedAsset();
  await f.db.exec(read(migration));
  f.state.after = operation => { if (operation === 'rpc:publish_platform_brand_profile_assets') throw new Error('response lost after asset commit'); };
  await assert.rejects(f.api.publishPlatformBrandProfile(ids.owner, { heroImageAssetId: assetId }), /response lost/);
  const asset = (await f.db.query('select * from platform_brand_assets where id=$1', [assetId])).rows[0];
  assert.equal(asset.asset_state, 'published');
  assert.equal(asset.moderation_status, 'clean');
  assert.equal((await f.db.query('select count(*)::int n from platform_brand_asset_review_events')).rows[0].n, 1);
  assert.equal(await f.live(), null, 'Earlier asset commit is not a profile publication');
  f.state.after = null;
  await assert.rejects(f.api.publishPlatformBrandProfile(ids.owner, await f.draft()), /brand_publish_rpc_required/);
  assert.equal(await f.live(), null);
  assert.equal((await f.db.query('select asset_state from platform_brand_assets where id=$1', [assetId])).rows[0].asset_state, 'published',
    'Cutover final-phase rejection cannot undo an earlier committed legacy asset RPC');
  assert.equal((await f.atomic({ heroImageAssetId: assetId, accentColor: '#123456' })).error, null);
  const before = await f.draft();
  await f.db.query("update platform_brand_assets set asset_state='draft',scan_status='pending_scan' where id=$1", [assetId]);
  assert.match(String((await f.atomic({ heroImageAssetId: assetId, accentColor: '#654321' })).error), /not ready|not_ready/);
  assert.deepEqual(await f.draft(), before);
  assert.equal((await f.live()).accentColor, '#123456');
});

test('EXPECTED unsafe old screen catch reports empty-assets and previously-live success after cutover rejection', async t => {
  const f = await legacyFixture(t);
  await f.db.exec(read(migration));
  const empty = await f.ui({ accentColor: '#111111' });
  assert.match(empty.notice, /settings published/);
  assert.equal(empty.profileSaves, 0);
  assert.equal(await f.live(), null, 'No settings publication despite historical success copy');
  await f.seedAsset();
  assert.equal((await f.atomic({ heroImageAssetId: assetId, accentColor: '#222222' })).error, null);
  const oldLive = await f.draft();
  const previous = await f.ui({ ...oldLive, accentColor: '#333333' });
  assert.match(previous.notice, /Your public Platform is updated/);
  assert.equal(previous.profileSaves, 0);
  assert.equal((await f.live()).accentColor, '#222222', 'Previously live assets do not prove this requested publication');
});

test('stale authority and cross-account writes reject; old UI still mislabels non-null readback', async t => {
  const f = await legacyFixture(t);
  await f.db.exec(read(migration));
  assert.equal((await f.atomic({ accentColor: '#111111' })).error, null);
  const patch = await f.draft();
  f.state.actor = ids.outsider;
  await assert.rejects(f.api.savePlatformBrandProfileDraft(ids.owner, patch), /row-level security/);
  assert.match(String((await f.atomic(patch)).error), /owner_required/);
  f.state.actor = ids.owner;
  await f.db.query('delete from auth.sessions where id=$1', [sessionId(ids.owner)]);
  await assert.rejects(f.api.savePlatformBrandProfileDraft(ids.owner, patch), /row-level security|current_session/);
  assert.match(String((await f.atomic(patch)).error), /current_session/);
  const outcome = await f.ui(patch);
  assert.match(outcome.notice, /settings published/, 'EXPECTED unsafe: catch does not distinguish authority rejection');
  assert.equal((await f.live()).accentColor, '#111111');
});

test('response loss after old final commit differs from cutover rejection and new atomic loss', async t => {
  const f = await legacyFixture(t);
  f.state.after = operation => {
    if (operation === 'platform_brand_profiles:upsert' && f.state.writes.length === 2) throw new Error('lost final response');
  };
  await assert.rejects(f.api.publishPlatformBrandProfile(ids.owner, { accentColor: '#111111' }), /lost final response/);
  assert.equal((await f.live()).accentColor, '#111111', 'Old final request committed despite transport rejection');
  f.state.after = null;
  await f.db.exec(read(migration));
  f.state.after = operation => { if (operation === 'rpc:publish_platform_brand_profile') throw new Error('lost atomic response'); };
  assert.match(String((await f.atomic({ accentColor: '#222222' })).error), /lost atomic response/);
  assert.equal((await f.live()).accentColor, '#222222', 'Atomic commit survives lost response; UI success still needs matching evidence');
});
