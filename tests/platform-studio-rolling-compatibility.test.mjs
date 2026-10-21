import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { makeFixture, ids, read, sqlPolicy } from './helpers/studio-authority-fixture.mjs';
import { loadStudioFunctions } from './helpers/studio-source-harness.mjs';

const historyRoot = fileURLToPath(new URL('./fixtures/studio-legacy-cutover/', import.meta.url));
const provenance = JSON.parse(fs.readFileSync(`${historyRoot}/provenance.json`, 'utf8'));
const migrations = [
  '20261015073423_platform_studio_publication_and_audience_authority.sql',
  '20261019020049_platform_studio_rolling_brand_compatibility.sql',
  '20261019020052_platform_studio_rolling_audience_compatibility.sql',
];
const assetId = '70000000-0000-4000-8000-000000000007';
const historicalNames = path => provenance.files.find(file => file.path === path).declarations.map(row => row.name);

test('rolling compatibility executes hash-bound historical declarations without Git at runtime', () => {
  assert.equal(provenance.commit, '423b10f12ae2a3b6c42c1587210fadaea5418b18');
  for (const file of provenance.files) {
    const source = fs.readFileSync(`${historyRoot}/${file.path}.txt`, 'utf8');
    const hash = value => createHash('sha256').update(value).digest('hex');
    assert.equal(hash(source), file.fixtureSha256, file.path);
    let offset = 0;
    for (const declaration of file.declarations) {
      assert.equal(hash(source.slice(offset, offset + declaration.end - declaration.start)), declaration.sha256, declaration.name);
      offset += declaration.end - declaration.start + 2;
    }
  }
});

// Only transport/native IO is replaced. Historical request orchestration, row
// parsing, readiness and UI notices execute unchanged; SQL performs authority,
// mutation, publication and visibility checks. This is not native storage proof.
async function rollingFixture(t) {
  const fixture = await makeFixture();
  t.after(() => fixture.db.close());
  // Match the production helper's private ACL: direct invoker policies must
  // use their explicit authorized wrapper, not inherit fixture PUBLIC execute.
  await fixture.db.exec('revoke execute on function public.whole_app_exact_current_session_authority_internal() from public, anon, authenticated');
  // The base read/publication fixture intentionally omits asset writes. Load
  // the actual deployed owner policies for historical upload/archive requests.
  for (const name of ['platform_brand_assets_insert_owner_draft', 'platform_brand_assets_update_owner_safe_fields']) {
    await fixture.db.exec(sqlPolicy('supabase/migrations/20260827233000_social_attachment_storage_policy_composition_closure.sql', name));
  }
  const state = { actor: ids.owner, trace: [], errors: [], before: null, after: null, objects: new Set() };
  let queue = Promise.resolve();
  const query = (sql, values = [], actor = state.actor) => {
    const next = queue.then(() => fixture.as(actor ? 'authenticated' : 'anon', actor, sql, values))
      .then(value => JSON.parse(JSON.stringify(value)));
    queue = next.catch(() => {});
    return next;
  };
  const result = async (operation, payload, work) => {
    state.trace.push({ operation, payload: payload ? JSON.parse(JSON.stringify(payload)) : null });
    try {
      await state.before?.(operation, payload);
      const data = await work();
      await state.after?.(operation, data);
      return { data, error: null };
    } catch (error) { error.message = `${operation}: ${error.message}`; state.errors.push(error); return { data: null, error }; }
  };
  const rpc = (name, args) => result(`rpc:${name}`, args, async () => (await query(
    `select public.${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`)}) result`, Object.values(args))).rows[0].result);
  const supabase = {
    auth: { getSession: async () => ({ data: { session: state.actor ? { user: { id: state.actor }, access_token: 'fixture-token' } : null }, error: null }) },
    from(table) {
      assert.ok(['platform_brand_profiles', 'platform_brand_assets', 'channel_followers', 'channel_audience_requests'].includes(table));
      let payload, mode = 'select', single = false, nullable = false, pending, limit, representation = false;
      const filters = [], values = [];
      const builder = {
        upsert(value) { payload = value; mode = 'upsert'; return this; },
        insert(value) { payload = value; mode = 'insert'; return this; },
        update(value) { payload = value; mode = 'update'; return this; },
        select() { representation = true; return this; }, returns() { return this; }, order() { return this; },
        limit(value) { limit = value; return this; },
        eq(key, value) { values.push(value); filters.push(`${key}=$${values.length}`); return this; },
        in(key, value) { values.push(value); filters.push(`${key}=any($${values.length})`); return this; },
        is(key, value) { assert.equal(value, null); filters.push(`${key} is null`); return this; },
        single() { single = true; return this; },
        maybeSingle() { single = true; nullable = true; return this; },
        then(resolve, reject) {
          pending ??= result(`${table}:${mode}`, payload, async () => {
            let sql;
            if (mode === 'insert' || mode === 'upsert') {
              const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
              const names = entries.map(([key]) => key);
              values.push(...entries.map(([, value]) => value));
              sql = `insert into public.${table}(${names}) values(${names.map((_, i) => `$${i + 1}`)})`;
              if (mode === 'upsert') sql += ` on conflict(owner_user_id) do update set ${names.filter(key => key !== 'owner_user_id').map(key => `${key}=excluded.${key}`)}`;
              if (representation) sql += ' returning *';
            } else {
              sql = `select * from public.${table}`;
              if (mode === 'update') {
                const assignments = Object.entries(payload).map(([key, value]) => { values.push(value); return `${key}=$${values.length}`; });
                sql = `update public.${table} set ${assignments}`;
              }
              if (filters.length) sql += ` where ${filters.join(' and ')}`;
              if (mode === 'update' && representation) sql += ' returning *';
              else if (limit) sql += ` limit ${Number(limit)}`;
            }
            const rows = (await query(sql, values)).rows;
            if (single) {
              if (rows.length !== 1 && !(nullable && rows.length === 0)) throw new Error('PostgREST expected one returned row');
              return rows[0] ?? null;
            }
            return rows;
          });
          return pending.then(resolve, reject);
        },
      };
      return builder;
    },
    rpc(name, args) {
      return { maybeSingle: () => result(`rpc:${name}`, args, async () => (await query(
        `select * from public.${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`)})`, Object.values(args))).rows[0] ?? null) };
    },
    storage: { from: () => ({
      createSignedUrl: async path => ({ data: { signedUrl: `https://fixture.invalid/${path}` }, error: null }),
      upload: async path => { state.objects.add(path); return { data: { path }, error: null }; },
      remove: async paths => { paths.forEach(path => state.objects.delete(path)); return { data: [], error: null }; },
    }) },
  };
  const context = {
    supabase, runCurrentAccountBoundSupabaseMutationRpc: rpc,
    SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture-anon',
    // Native IO resolves synchronously in this fixture; timeout behavior belongs
    // to native/helper tests, not the historical SQL request sequence.
    withTimeout: async promise => promise,
    File: class { constructor(uri) { this.uri = uri; } },
    FileSystem: { FileSystemUploadType: { BINARY_CONTENT: 0 }, cacheDirectory: null,
      uploadAsync: async (url, _uri, options) => {
        state.trace.push({ operation: 'storage:upload', payload: { url, method: options.httpMethod, upsert: options.headers['x-upsert'] } });
        state.objects.add(url.split('/platform-brand-assets/')[1]); return { status: 200 };
      },
    },
    fetch: async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer }),
    reviewPlatformBrandAsset: () => { throw new Error('Unexpected legacy missing-RPC fallback'); },
  };
  const originalBrand = loadStudioFunctions('_lib/platformBranding.ts.txt', historicalNames('_lib/platformBranding.ts'), context, historyRoot);
  const brand = { ...originalBrand, ...loadStudioFunctions('_lib/platformBranding-rolling.ts.txt', historicalNames('_lib/platformBranding-rolling.ts'), { ...context, ...originalBrand }, historyRoot) };
  // The original declarations intentionally have no local reader declarations;
  // keep their IO boundary while supplying the actual historical readers here.
  Object.assign(context, { readPlatformBrandStudio: brand.readPlatformBrandStudio, readPublicPlatformBranding: brand.readPublicPlatformBranding });
  const current = loadStudioFunctions('_lib/platformBranding.ts', ['toProfileUpsert', 'publishPlatformBrandProfile', 'readPublicPlatformBranding', 'removePlatformBrandAsset'], { ...context, ...brand });
  const audience = loadStudioFunctions('_lib/channelAudience.ts.txt', historicalNames('_lib/channelAudience.ts'), {
    supabase, readMyPlatformRoleMemberships: async () => [],
    hasPlatformRoleMembership: () => false, hasPlatformStaffPermission: () => false,
  }, historyRoot);
  const draft = () => brand.readPlatformBrandStudio(ids.owner).then(bundle => bundle.profile);
  const live = async (modern = false) => {
    const prior = state.actor; state.actor = null;
    try { return await (modern ? current : brand).readPublicPlatformBranding(ids.owner); }
    finally { state.actor = prior; }
  };
  const atomic = patch => current.publishPlatformBrandProfile(ids.owner, { ...brand.createDefaultPlatformBrandProfile(ids.owner), ...patch });
  const migrate = async () => {
    for (const name of migrations) await fixture.db.exec(read(`supabase/migrations/${name}`));
    // Current removal requires the new server-timed, account-bound RPC. Execute
    // its actual SQL here; full retention/storage behavior has a separate migrated fixture.
    const retention = 'supabase/migrations/20261021030421_platform_brand_exact_retention_lifecycle.sql';
    await fixture.db.exec('create schema if not exists private');
    for (const signature of ['private.platform_brand_retention_lock', 'public.remove_platform_brand_asset']) {
      const source=read(retention), start=source.indexOf(`create function ${signature}(`);
      assert.ok(start>=0); await fixture.db.exec(source.slice(start,source.indexOf('$$;',start)+3));
    }
    await fixture.db.exec('revoke all on function private.platform_brand_retention_lock() from public,anon,authenticated; revoke all on function public.remove_platform_brand_asset(uuid) from public,anon; grant execute on function public.remove_platform_brand_asset(uuid) to authenticated;');
  };
  const seedAsset = async () => {
    await fixture.db.query(`insert into platform_brand_assets(id,owner_user_id,asset_type,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type)
      values($1,$2,'hero_image','supabase','platform-brand-assets',$3,$3,'image/png')`, [assetId, ids.owner, `${ids.owner}/hero.png`]);
    await fixture.db.query("update platform_brand_assets set scan_status='clean' where id=$1", [assetId]);
  };
  const request = async (kind = 'follow') => Number((await fixture.db.query(
    'insert into channel_audience_requests(channel_user_id,requester_user_id,request_kind) values($1,$2,$3) returning id', [ids.owner, ids.requester, kind])).rows[0].id);
  const followers = () => fixture.db.query('select * from channel_followers where channel_user_id=$1 and follower_user_id=$2', [ids.owner, ids.requester]).then(value => value.rows);
  const ui = async patch => {
    let notice, profileSaves = 0;
    const handler = loadStudioFunctions('app/channel-settings.tsx.txt', historicalNames('app/channel-settings.tsx'), {
      ...brand, user: { id: ids.owner }, getCurrentBrandDraft: () => patch,
      brandProfileSaveInFlightRef: { current: false }, setBrandSaving() {}, setSaving() {}, setNotice() {}, setBrandDraft() {},
      setBrandNotice(value) { notice = value; }, loadPlatformBranding: () => brand.readPlatformBrandStudio(ids.owner),
      saveCurrentProfileSettingsIfNeeded: async () => { profileSaves++; },
    }, historyRoot);
    await handler.publishBrandStudioAndProfile();
    return { notice, profileSaves };
  };
  return { ...fixture, state, query, brand, current, audience, draft, live, atomic, migrate, seedAsset, request, followers, ui };
}

test('known current and stale publication metadata save only drafts through the actual old upsert', async t => {
  const f = await rollingFixture(t);
  const cached = await f.brand.publishPlatformBrandProfile(ids.owner, { accentColor: '#111111' });
  await f.migrate();
  await f.brand.savePlatformBrandProfileDraft(ids.owner, { ...cached, accentColor: '#222222' });
  assert.equal((await f.draft()).accentColor, '#222222');
  assert.equal((await f.live()).profile.accentColor, '#111111');
  const published = await f.atomic({ accentColor: '#333333' });
  const saved = await f.brand.savePlatformBrandProfileDraft(ids.owner, { ...cached, accentColor: '#444444' });
  assert.equal(saved.accentColor, '#444444');
  assert.equal(Date.parse(saved.publishedAt), Date.parse(published.publishedAt), 'Old metadata cannot roll publication time back');
  assert.equal((await f.db.query('select published_at=$2::timestamptz as same from platform_brand_profiles where owner_user_id=$1', [ids.owner, published.publishedAt])).rows[0].same, true);
  assert.equal((await f.live()).profile.accentColor, '#333333');
  const nullMetadata = await f.brand.savePlatformBrandProfileDraft(ids.owner, { ...cached, accentColor: '#555555', publishedAt: null });
  assert.equal(Date.parse(nullMetadata.publishedAt), Date.parse(published.publishedAt), 'NULL from an older cache is draft metadata, not unpublication');
  assert.equal((await f.live()).profile.accentColor, '#333333');
  // Historical and current declarations run in separate VM realms. Compare
  // their JSON projections, not those realms' distinct Array prototypes.
  assert.deepEqual(JSON.parse(JSON.stringify(await f.live())), JSON.parse(JSON.stringify(await f.live(true))), 'Both branding readers project the same committed publication');
});

test('unrecognized cached publication metadata requires a Studio reload without changing draft or public state', async t => {
  const f = await rollingFixture(t); await f.migrate();
  await f.atomic({ accentColor: '#111111' });
  const before = await f.draft();
  await assert.rejects(f.brand.savePlatformBrandProfileDraft(ids.owner, { ...before, accentColor: '#222222', publishedAt: '2001-01-01T00:00:00.000Z' }), /brand_publish_rpc_required/);
  assert.deepEqual(await f.draft(), before);
  assert.equal((await f.live()).profile.accentColor, '#111111');
});

test('legacy Publish remains unsupported and its initial request remains an ordinary draft save', async t => {
  const f = await rollingFixture(t); await f.migrate();
  await f.atomic({ accentColor: '#111111' });
  const cached = await f.draft(); f.state.trace = [];
  await assert.rejects(f.brand.publishPlatformBrandProfile(ids.owner, { ...cached, accentColor: '#222222' }), /brand_publish_rpc_required/);
  const writes = f.state.trace.filter(row => row.operation === 'platform_brand_profiles:upsert');
  assert.equal(writes.length, 2);
  assert.equal(writes[0].payload.published_at, cached.publishedAt);
  assert.notEqual(writes[1].payload.published_at, cached.publishedAt);
  assert.equal((await f.draft()).accentColor, '#222222');
  assert.equal((await f.live()).profile.accentColor, '#111111');
});

test('EXPECTED old UI limitation: rejected publication can still display success, without a public commit', async t => {
  const f = await rollingFixture(t); await f.migrate();
  const empty = await f.ui({ accentColor: '#111111' });
  assert.match(empty.notice, /settings published/);
  assert.match(String(f.state.errors.at(-1)), /brand_publish_rpc_required/);
  assert.equal(empty.profileSaves, 0);
  assert.equal(await f.live(), null);
  await f.seedAsset(); await f.atomic({ heroImageAssetId: assetId, accentColor: '#222222' });
  const previous = await f.ui({ ...await f.draft(), accentColor: '#333333' });
  assert.match(previous.notice, /public Platform is updated/);
  assert.match(String(f.state.errors.at(-1)), /brand_publish_rpc_required/);
  assert.equal(previous.profileSaves, 0);
  assert.equal((await f.live()).profile.accentColor, '#222222');
});

test('legacy baseline archives; current removal rejects referenced drafts before retaining media', async t => {
  const f = await rollingFixture(t); await f.migrate();
  for (const client of [f.brand, f.current]) {
    const asset = await f.brand.uploadPlatformBrandAsset({ ownerUserId: ids.owner, assetType: 'hero_image', file: { uri: 'file:///fixture.png', name: 'fixture.png', mimeType: 'image/png', size: 1 } });
    assert.equal(f.state.trace.find(row => row.operation === 'storage:upload').payload.upsert, 'false');
    assert.equal(asset.assetState, 'draft'); assert.equal(asset.moderationStatus, 'pending_review');
    await f.brand.savePlatformBrandProfileDraft(ids.owner, { heroImageAssetId: asset.id });
    assert.equal((await f.draft()).heroImageAssetId, asset.id);
    assert.equal(await f.live(), null);
    if (client === f.current) {
      await assert.rejects(client.removePlatformBrandAsset(asset), /brand_asset_in_use/);
      assert.equal((await f.draft()).heroImageAssetId, asset.id, 'Rejected current removal preserves the selected draft');
      assert.equal((await f.db.query('select deleted_at from platform_brand_assets where id=$1', [asset.id])).rows[0].deleted_at, null);
      await f.brand.savePlatformBrandProfileDraft(ids.owner, { heroImageAssetId: null });
      await client.removePlatformBrandAsset(asset);
    } else {
      // This historical fixture intentionally omits the new retention triggers;
      // native full-schema tests cover the new direct-owner in-use rejection.
      await client.removePlatformBrandAsset(asset);
      await f.brand.savePlatformBrandProfileDraft(ids.owner, { heroImageAssetId: null });
    }
    assert.equal((await f.draft()).heroImageAssetId, null);
    assert.equal((await f.db.query('select asset_state from platform_brand_assets where id=$1', [asset.id])).rows[0].asset_state, 'archived');
    assert.equal((await f.brand.readPlatformBrandStudio(ids.owner)).assets.length, 0, 'Studio filters deleted rows out');
    assert.equal((await f.as('anon', null, 'select id from platform_brand_assets where id=$1', [asset.id])).rows.length, 0);
    for (const actor of [ids.owner, null]) {
      const access = await f.as(actor ? 'authenticated' : 'anon', actor,
        'select public.platform_brand_storage_access_allowed($1,$2) allowed', ['platform-brand-assets', asset.storagePath]);
      assert.equal(access.rows[0].allowed, false, 'Archived object remains inaccessible to owner and public storage reads');
    }
  }
  assert.equal(f.state.objects.size, 2, 'Remove archives rows; it does not delete storage objects');
});

test('legacy asset publication alone cannot expose media without a visible committed snapshot', async t => {
  const f = await rollingFixture(t); await f.migrate(); await f.seedAsset();
  await assert.rejects(f.brand.publishPlatformBrandProfile(ids.owner, { heroImageAssetId: assetId }), /brand_publish_rpc_required/);
  assert.equal((await f.db.query('select asset_state from platform_brand_assets where id=$1', [assetId])).rows[0].asset_state, 'draft');
  assert.equal(await f.live(), null);
  assert.equal((await f.as('anon', null, 'select id from platform_brand_assets where id=$1', [assetId])).rows.length, 0);
  await f.atomic({ heroImageAssetId: assetId });
  assert.equal((await f.live()).assets[0].id, assetId);
  await f.db.query("update user_profiles set platform_access_visibility='private' where user_id=$1", [ids.owner]);
  assert.equal(await f.live(), null);
  assert.equal((await f.as('anon', null, 'select id from platform_brand_assets where id=$1', [assetId])).rows.length, 0);
});

test('old media operations retain their real partial-failure boundaries', async t => {
  const f = await rollingFixture(t); await f.migrate();
  f.state.before = operation => { if (operation === 'platform_brand_assets:insert') throw new Error('asset row unavailable'); };
  await assert.rejects(f.brand.uploadPlatformBrandAsset({ ownerUserId: ids.owner, assetType: 'hero_image', file: { uri: 'file:///fixture.png', name: 'fixture.png', mimeType: 'image/png', size: 1 } }), /asset row unavailable/);
  assert.equal(f.state.objects.size, 0, 'Old insert failure still attempts storage cleanup');
  f.state.before = null;
  await f.seedAsset(); await f.atomic({ heroImageAssetId: assetId });
  const selected = (await f.brand.readPlatformBrandStudio(ids.owner)).heroImage;
  await f.brand.removePlatformBrandAsset(selected);
  f.state.before = operation => { if (operation === 'platform_brand_profiles:upsert') throw new Error('draft save unavailable'); };
  await assert.rejects(f.brand.savePlatformBrandProfileDraft(ids.owner, { heroImageAssetId: null }), /draft save unavailable/);
  assert.equal((await f.draft()).heroImageAssetId, assetId, 'Failed selection save did not clear the draft reference');
  assert.equal((await f.db.query('select asset_state from platform_brand_assets where id=$1', [assetId])).rows[0].asset_state, 'archived', 'Earlier archive is not rolled back');
  assert.equal((await f.live()).heroImage, null, 'Archived public media is hidden even though the following draft save failed');
});

test('private personal Profile stays private while the new public Platform identity projection works', async t => {
  const f = await rollingFixture(t); await f.migrate();
  const old = await f.as('anon', null, 'select * from read_public_channel_profile($1)', [ids.owner]);
  assert.equal(old.rows.length, 0, 'Old Profile-first Platform rendering still requires a client update');
  const modern = await f.as('anon', null, 'select * from read_public_platform_identity($1)', [ids.owner]);
  assert.equal(modern.rows[0].display_name, 'Public Name');
  assert.equal(Object.hasOwn(modern.rows[0], 'avatar_url'), false);
  assert.equal(Object.hasOwn(modern.rows[0], 'profile_background_url'), false);
});

test('actual old Audience approve performs a non-mutating preflight then receives its atomic final row', async t => {
  const f = await rollingFixture(t); await f.migrate(); const id = await f.request();
  let observedPreflight = false;
  f.state.after = async operation => {
    if (operation === 'channel_followers:insert') {
      observedPreflight = true;
      assert.equal((await f.followers()).length, 0);
      assert.equal((await f.db.query('select status from channel_audience_requests where id=$1', [id])).rows[0].status, 'pending');
    }
  };
  const result = await f.audience.approveChannelAudienceRequest(id);
  assert.equal(observedPreflight, true);
  assert.equal(result.status, 'completed'); assert.equal(result.requestId, id); assert.equal(result.requestStatus, 'approved');
  assert.equal((await f.followers()).length, 1);
  assert.deepEqual(f.state.trace.filter(row => row.operation.endsWith(':insert') || row.operation.endsWith(':update')).map(row => row.operation), ['channel_followers:insert', 'channel_audience_requests:update']);
});

test('actual old Audience decline needs no follower insert and returns the exact declined request', async t => {
  const f = await rollingFixture(t); await f.migrate(); const id = await f.request();
  const result = await f.audience.declineChannelAudienceRequest(id);
  assert.equal(result.status, 'completed'); assert.equal(result.requestId, id); assert.equal(result.requestStatus, 'declined');
  assert.equal((await f.followers()).length, 0);
  assert.equal(f.state.trace.some(row => row.operation === 'channel_followers:insert'), false);
  const subscriber = await f.request('subscriber_access');
  assert.equal((await f.audience.approveChannelAudienceRequest(subscriber)).status, 'unsupported');
  assert.equal((await f.audience.declineChannelAudienceRequest(subscriber)).status, 'completed');
  assert.equal((await f.followers()).length, 0, 'Compatibility does not create subscriber authority');
});

test('loss after the old follow preflight creates no follower; a changed final request rejects cleanly', async t => {
  const f = await rollingFixture(t); await f.migrate(); const id = await f.request();
  f.state.after = operation => { if (operation === 'channel_followers:insert') throw new Error('lost preflight response'); };
  assert.equal((await f.audience.approveChannelAudienceRequest(id)).status, 'error');
  assert.equal((await f.followers()).length, 0);
  f.state.after = null;
  f.state.before = async operation => { if (operation === 'channel_audience_requests:update') await f.db.query("update channel_audience_requests set status='canceled' where id=$1", [id]); };
  assert.equal((await f.audience.approveChannelAudienceRequest(id)).status, 'error');
  assert.equal((await f.followers()).length, 0);
});

test('old Audience retries observe committed status after response loss, without repeating approval', async t => {
  const f = await rollingFixture(t); await f.migrate(); const id = await f.request();
  f.state.after = operation => { if (operation === 'channel_audience_requests:update') throw new Error('lost committed response'); };
  assert.equal((await f.audience.approveChannelAudienceRequest(id)).status, 'error');
  assert.equal((await f.followers()).length, 1);
  f.state.after = null;
  const retry = await f.audience.approveChannelAudienceRequest(id);
  assert.equal(retry.status, 'noop'); assert.equal(retry.reason, 'request_not_pending');
  assert.equal((await f.followers()).length, 1);
});

test('a pre-cutover follower plus pending request is preserved and the old final review can complete', async t => {
  const f = await rollingFixture(t); const id = await f.request();
  await f.db.query('insert into channel_followers(channel_user_id,follower_user_id) values($1,$2)', [ids.owner, ids.requester]);
  await f.migrate();
  assert.equal((await f.followers()).length, 1, 'Do not delete a relationship whose original intent cannot be reconstructed');
  const result = await f.audience.approveChannelAudienceRequest(id);
  assert.equal(result.status, 'completed'); assert.equal(result.requestId, id);
  assert.equal((await f.followers()).length, 1);
  assert.equal(f.state.trace.some(row => row.operation === 'channel_followers:insert'), false);
});
