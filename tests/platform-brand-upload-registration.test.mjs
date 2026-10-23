import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { loadStubbed } from './customer-experience-adversarial-helpers.mjs';
import { makeFixture, ids, sessionId, read, sqlFunction, sqlPolicy } from './helpers/studio-authority-fixture.mjs';
import { installByteReceiptFixture } from './helpers/media-scan-byte-receipt-fixture.mjs';
import { applyBrandMigrationStatements } from './helpers/apply-brand-migration-statements.mjs';

const bucket = 'platform-brand-assets';
const authorityMigration = 'supabase/migrations/202608250002_whole_app_media_authority_closure.sql';
const policyMigration = 'supabase/migrations/20260827233000_social_attachment_storage_policy_composition_closure.sql';
const scannerMigration = 'supabase/migrations/20260530191115_media_malware_scanning_pipeline.sql';

// Native upload and PostgREST transport are adapters. SQL enforces actual
// session, Premium, INSERT/SELECT policies, incarnation and pending scan queue.
// This proves request ordering, not installed-device or live scanner delivery.
async function installFixture() {
  const f = await makeFixture();
  await f.db.exec(`create schema private;
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,version text,
      created_at timestamptz default now(),updated_at timestamptz default now(),metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select,insert on storage.objects to authenticated; grant select on storage.objects to anon;
    create table public.legal_holds(id uuid primary key default gen_random_uuid(),target_type text,target_id text,status text);`);
  for (const name of ['20261015073423_platform_studio_publication_and_audience_authority.sql',
    '20261019020049_platform_studio_rolling_brand_compatibility.sql']) await f.db.exec(read(`supabase/migrations/${name}`));
  await installByteReceiptFixture(f.db);
  const scanner = read(scannerMigration);
  const indexStart = scanner.indexOf('create unique index if not exists "media_scan_jobs_target_object_unique"');
  await f.db.exec(scanner.slice(indexStart, scanner.indexOf(';', indexStart) + 1));
  for (const name of ['enqueue_media_scan_job', 'enqueue_platform_brand_asset_scan']) await f.db.exec(sqlFunction(scannerMigration, name));
  const triggerStart = scanner.indexOf('create trigger "enqueue_platform_brand_asset_scan_after"');
  await f.db.exec(scanner.slice(triggerStart, scanner.indexOf(';', triggerStart) + 1));
  for (const [file, names] of [
    ['20261020141554_deleted_media_reference_retirement.sql', ['deleted_media_locator_columns', 'deleted_media_locator_document', 'deleted_media_normalize_locator', 'deleted_media_mentions', 'deleted_media_reference_identity']],
    ['20261020141458_deleted_content_retention.sql', ['deleted_content_hold_matches']],
  ]) {
    const source = read(`supabase/migrations/${file}`);
    for (const name of names) {
      const start = source.indexOf(`create function private.${name}(`);
      assert.ok(start >= 0); await f.db.exec(source.slice(start, source.indexOf('$$;', start) + 3));
    }
  }
  await applyBrandMigrationStatements(f.db, read('supabase/migrations/20261021134043_platform_brand_exact_retention_lifecycle.sql'));
  await f.db.exec(sqlPolicy(policyMigration, 'platform_brand_assets_insert_owner_draft'));
  await f.db.exec(sqlFunction(authorityMigration, 'media_scan_storage_key_available'));
  const authority = read(authorityMigration), start = authority.indexOf('create policy platform_brand_storage_insert_owner_prefix');
  await f.db.exec(authority.slice(start, authority.indexOf(';', start) + 1));
  await f.db.exec(sqlPolicy(policyMigration, 'platform_brand_storage_select_owner_or_public_safe'));
  return f;
}

// One WASM database, with each serial test rolled back, avoids accumulating
// retired PGlite heaps. Savepoints preserve realistic statement failure while
// allowing the next transport read to reconcile a rejected INSERT.
let installed;
after(async () => { if (installed) await (await installed).db.close(); });
async function fixture(t, options = {}) {
  const f = await (installed ??= installFixture());
  await f.db.exec('begin');
  t.after(() => f.db.exec('rollback'));
  const state = { actor: ids.owner, trace: [], objectKey: null, deletes: 0, inserts: 0 };
  const query = async (sql, values = [], actor = state.actor) => {
    const role = actor ? 'authenticated' : 'anon';
    await f.db.exec('savepoint request');
    try {
      await f.db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role, sub: actor, session_id: actor ? sessionId(actor) : undefined })]);
      await f.db.exec(`set role ${role}`);
      const result = await f.db.query(sql, values);
      await f.db.exec("reset role; select set_config('request.jwt.claims','{}',false); release savepoint request");
      return result;
    } catch (error) {
      await f.db.exec('rollback to savepoint request; release savepoint request');
      throw error;
    }
  };
  const sign = async (key, actor = state.actor) => {
    const result = await query('select name from storage.objects where bucket_id=$1 and name=$2', [bucket, key], actor);
    return result.rows.length > 0;
  };
  const upload = async key => {
    state.trace.push('upload'); state.objectKey = key;
    // No RETURNING: INSERT is deliberately allowed while SELECT remains denied.
    await query("insert into storage.objects(bucket_id,name,version,metadata) values($1,$2,'fixture-version-1','{\"size\":79}')", [bucket, key]);
    assert.equal(await sign(key), false, 'unregistered object cannot be signed by its uploader');
  };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-only-token' } }, error: null }) },
    from(table) {
      assert.equal(table, 'platform_brand_assets');
      let payload, pending;
      const filters = [], values = [];
      const builder = {
        insert(value) { payload = value; return this; }, select() { return this; }, returns() { return this; },
        setHeader(name, value) { assert.equal(name, 'Authorization'); assert.equal(value, 'Bearer fixture-only-token'); return this; },
        single() { return this; }, maybeSingle() { return this; },
        eq(key, value) { values.push(value); filters.push(`${key}=$${values.length}`); return this; },
        is(key, value) { assert.equal(value, null); filters.push(`${key} is null`); return this; },
        then(resolve, reject) {
          pending ??= (async () => {
            try {
              let rows;
              if (payload) {
                state.trace.push('register'); state.inserts++;
                if (options.rejectInsert) await f.db.query("update fixture_accounts set premium=false where user_id=$1", [ids.owner]);
                const entries = Object.entries(payload);
                rows = (await query(`insert into platform_brand_assets(${entries.map(([key]) => key)}) values(${entries.map((_, i) => `$${i + 1}`)}) returning *`, entries.map(([, value]) => value))).rows;
                if (options.throwInsertReply) throw new Error('insert transport threw after commit');
                if (options.loseInsertReply) return { data: null, error: new Error('insert acknowledgement lost') };
              } else {
                state.trace.push('readback');
                if (options.failReadback) throw new Error('readback unavailable');
                rows = (await query(`select * from platform_brand_assets${filters.length ? ` where ${filters.join(' and ')}` : ''}`, values)).rows;
                if (options.hideReadback) rows = [];
                if (options.corruptReadback && rows[0]) rows[0][options.corruptReadback] = 'unrelated-identity';
              }
              return { data: rows[0] ?? null, error: null };
            } catch (error) {
              if (options.throwInsertReply && payload) throw error;
              return { data: null, error };
            }
          })();
          return pending.then(resolve, reject);
        },
      };
      return builder;
    },
    storage: { from(name) {
      assert.equal(name, bucket);
      return {
        async createSignedUrl(key) {
          state.trace.push('sign');
          if (options.throwSign) throw new Error('sign transport unavailable');
          const allowed = await sign(key);
          return allowed && !options.failSign
            ? { data: { signedUrl: 'https://fixture.invalid/private-preview' }, error: null }
            : { data: null, error: new Error('object read unavailable') };
        },
        async upload(key) { await upload(key); return { data: { path: key }, error: null }; },
        async remove() { state.deletes++; return { data: null, error: new Error('unexpected remote deletion') }; },
      };
    } },
  };
  const api = loadStubbed(`${process.env.STUDIO_SOURCE_ROOT || process.cwd()}/_lib/platformBranding.ts`, {
    './supabase': { supabase, SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture-only-anon' },
    'expo-file-system': { File: class {} },
    'expo-file-system/legacy': { cacheDirectory: null, FileSystemUploadType: { BINARY_CONTENT: 0 },
      async uploadAsync(url, _uri, options) {
        assert.equal(options.headers.Authorization, 'Bearer fixture-only-token');
        await upload(decodeURIComponent(url.split(`/${bucket}/`)[1])); return { status: 200 };
      },
      getInfoAsync: async () => ({ size: 79 }),
    },
  });
  return { ...f, state, sign, api,
    run: (attempt, overrides = {}) => api.uploadPlatformBrandAsset({ ownerUserId: ids.owner, assetType: 'avatar',
      file: { uri: 'file:///fixture.png', name: 'fixture.png', mimeType: 'image/png', size: 79 }, attempt, ...overrides }),
    counts: async () => (await f.db.query(`select (select count(*) from platform_brand_assets)::int assets,
      (select count(*) from media_scan_jobs)::int jobs,(select count(*) from storage.objects)::int objects,
      (select count(*) from private.platform_brand_object_incarnations)::int incarnations`)).rows[0],
  };
}

test('Explicit retry reconciles committed-but-unconfirmed registration without another upload or INSERT', async t => {
  const options = { loseInsertReply: true, failReadback: true }, h = await fixture(t, options), attempt = {};
  await assert.rejects(h.run(attempt));
  const key = h.state.objectKey;
  options.failReadback = false;
  const asset = await h.run(attempt);
  assert.equal(asset.storageObjectKey, key);
  assert.equal(h.state.trace.filter(stage => stage === 'upload').length, 1);
  assert.equal(h.state.inserts, 1); assert.equal(h.state.deletes, 0);
  assert.deepEqual(await h.counts(), { assets: 1, jobs: 1, objects: 1, incarnations: 1 });
});

test('Explicit retry after rejected registration reuses acknowledged object and identity', async t => {
  const options = { rejectInsert: true }, h = await fixture(t, options), attempt = {};
  await assert.rejects(h.run(attempt));
  const key = h.state.objectKey;
  assert.deepEqual(await h.counts(), { assets: 0, jobs: 0, objects: 1, incarnations: 0 });
  options.rejectInsert = false;
  await h.db.query('update fixture_accounts set premium=true where user_id=$1', [ids.owner]);
  const asset = await h.run(attempt);
  assert.equal(asset.storageObjectKey, key);
  assert.equal(h.state.trace.filter(stage => stage === 'upload').length, 1);
  assert.equal(h.state.inserts, 2); assert.equal(h.state.deletes, 0);
  assert.deepEqual(await h.counts(), { assets: 1, jobs: 1, objects: 1, incarnations: 1 });
});

test('Explicit retry with unavailable readback does not begin any additional mutation', async t => {
  const h = await fixture(t, { loseInsertReply: true, failReadback: true }), attempt = {};
  await assert.rejects(h.run(attempt));
  await assert.rejects(h.run(attempt));
  assert.equal(h.state.trace.filter(stage => stage === 'upload').length, 1);
  assert.equal(h.state.inserts, 1); assert.equal(h.state.deletes, 0);
  assert.deepEqual(await h.counts(), { assets: 1, jobs: 1, objects: 1, incarnations: 1 });
});

test('A retained attempt cannot be reused with a different owner, type or source', async t => {
  const h = await fixture(t, { loseInsertReply: true, failReadback: true }), attempt = {};
  await assert.rejects(h.run(attempt));
  const prior = [...h.state.trace];
  for (const overrides of [{ ownerUserId: ids.outsider }, { assetType: 'logo' },
    { file: { uri: 'file:///different.png', name: 'fixture.png', mimeType: 'image/png', size: 79 } }]) {
    await assert.rejects(h.run(attempt, overrides));
    assert.deepEqual(h.state.trace, prior, 'reject changed identity before requests');
  }
});

test('Brand upload registers a pending private draft before requesting its owner preview', async t => {
  const h = await fixture(t), asset = await h.run();
  assert.deepEqual(h.state.trace, ['upload', 'register', 'sign']);
  assert.equal(asset.assetState, 'draft'); assert.equal(asset.scanStatus, 'pending_scan');
  assert.equal(asset.moderationStatus, 'pending_review'); assert.ok(asset.signedUrl);
  assert.deepEqual(await h.counts(), { assets: 1, jobs: 1, objects: 1, incarnations: 1 });
  const binding = (await h.db.query('select storage_object_id,storage_version from private.platform_brand_object_incarnations')).rows[0];
  const object = (await h.db.query('select id,version from storage.objects')).rows[0];
  assert.deepEqual(binding, { storage_object_id: object.id, storage_version: object.version });
  const scan = (await h.db.query('select status,attempt_count,completed_at from media_scan_jobs')).rows[0];
  assert.deepEqual(scan, { status: 'pending_scan', attempt_count: 0, completed_at: null });
  assert.equal((await h.db.query('select count(*)::int count from private.media_scan_byte_receipts')).rows[0].count, 0,
    'registration and preview must not fabricate scanner receipt authority');
  assert.equal(await h.sign(h.state.objectKey, null), false, 'pending draft is not public');
  assert.equal(await h.sign(h.state.objectKey, ids.outsider), false, 'another account cannot preview');
  await h.db.query('update auth.sessions set not_after=now()-interval \'1 second\' where user_id=$1', [ids.owner]);
  assert.equal(await h.sign(h.state.objectKey), false, 'expired exact session cannot preview');
});

for (const state of ['quarantined_at', 'deleted_at']) test(`Registered ${state} asset cannot be signed`, async t => {
  const h = await fixture(t), asset = await h.run();
  await h.db.query(`update platform_brand_assets set ${state}=clock_timestamp() where id=$1`, [asset.id]);
  assert.equal(await h.sign(h.state.objectKey), false);
  assert.equal(await h.sign(h.state.objectKey, null), false);
});

for (const options of [{ failSign: true }, { throwSign: true }]) test(`Preview outage does not discard acknowledged pending draft: ${JSON.stringify(options)}`, async t => {
  const h = await fixture(t, options), asset = await h.run();
  assert.equal(asset.signedUrl, ''); assert.equal(asset.scanStatus, 'pending_scan');
  assert.deepEqual(await h.counts(), { assets: 1, jobs: 1, objects: 1, incarnations: 1 });
  assert.equal(h.state.deletes, 0);
});

for (const options of [{ loseInsertReply: true }, { throwInsertReply: true }]) test(`Lost registration acknowledgement reconciles exact owned identity: ${JSON.stringify(options)}`, async t => {
  const h = await fixture(t, options), asset = await h.run();
  assert.equal(asset.storageObjectKey, h.state.objectKey);
  assert.deepEqual(h.state.trace, ['upload', 'register', 'readback', 'sign']);
  assert.equal(h.state.inserts, 1); assert.equal(h.state.deletes, 0);
  assert.deepEqual(await h.counts(), { assets: 1, jobs: 1, objects: 1, incarnations: 1 });
});

for (const options of [{ rejectInsert: true }, { loseInsertReply: true, failReadback: true }, { loseInsertReply: true, hideReadback: true }]) {
  test(`Unconfirmed registration stays failed without destructive compensation: ${JSON.stringify(options)}`, async t => {
    const h = await fixture(t, options);
    await assert.rejects(h.run());
    assert.equal(h.state.deletes, 0);
    assert.equal(h.state.trace.includes('sign'), false, 'never sign an unconfirmed identity');
    const expected = options.rejectInsert ? 0 : 1;
    assert.deepEqual(await h.counts(), { assets: expected, jobs: expected, objects: 1, incarnations: expected });
  });
}

test('Every identity field must match before uncertain registration can be acknowledged', async t => {
  const options = { loseInsertReply: true, corruptReadback: 'id' }, h = await fixture(t, options), attempt = {};
  // Reuse one database and the same real committed row across corrupt transport
  // responses. Neither a fresh upload nor a second scan job can hide a mismatch.
  for (const field of ['id', 'owner_user_id', 'asset_type', 'storage_provider', 'storage_bucket', 'storage_object_key', 'storage_path']) {
    options.corruptReadback = field;
    await assert.rejects(h.run(attempt), undefined, field);
    assert.equal(h.state.trace.includes('sign'), false, field);
  }
  assert.equal(h.state.deletes, 0); assert.equal(h.state.inserts, 1);
  assert.equal(h.state.trace.filter(stage => stage === 'upload').length, 1);
  assert.deepEqual(await h.counts(), { assets: 1, jobs: 1, objects: 1, incarnations: 1 });
});
