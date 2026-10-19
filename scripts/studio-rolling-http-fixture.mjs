// Real PostgREST responses against the native runner's disposable database.
// No Auth server, host port, remote URL, production key, or source DB write.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const image = 'public.ecr.aws/supabase/postgrest:v14.14';
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const invoke = (args, input) => spawnSync('docker', args, {
  input, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
});
function output(result, label) {
  // Docker errors can contain its environment or curl configuration. Keep
  // diagnostics bounded to the operation and status, never credentials.
  assert.equal(result.status, 0, `${label} failed (exit ${result.status}, ${result.error?.code ?? 'no transport error'})`);
  return result.stdout.trim();
}

export async function runStudioRollingHttp({ container, database, owner, requester, query, full, pass }) {
  assert.match(container, /^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
  assert.match(database, /^codex_studio_[0-9]+_[a-f0-9]{12}$/u);
  assert.equal(query('select current_database();'), database, 'HTTP fixture must target the generated clone');
  for (const actor of [owner, requester]) {
    assert.match(actor.user, /^[a-f0-9-]{36}$/u);
    assert.match(actor.session, /^[a-f0-9-]{36}$/u);
  }
  const temp = mkdtempSync(path.join(os.tmpdir(), 'studio-rolling-http-'));
  const name = `studio-http-${process.pid}-${randomBytes(6).toString('hex')}`;
  const port = randomInt(35_000, 55_000);
  const jwtKey = randomBytes(48).toString('hex');
  let owned = false;
  const cleanAudience = () => query(`delete from public.channel_audience_requests
    where channel_user_id=${literal(owner.user)} and requester_user_id=${literal(requester.user)};
    delete from public.channel_followers where channel_user_id=${literal(owner.user)}
      and follower_user_id=${literal(requester.user)};`);
  const token = actor => {
    const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const body = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({
      role: actor ? 'authenticated' : 'anon', ...(actor ? { sub: actor.user, session_id: actor.session } : {}),
      iat: now, exp: now + 600,
    })}`;
    return `${body}.${createHmac('sha256', jwtKey).update(body).digest('base64url')}`;
  };
  function request(method, route, body, actor = owner, headers = {}) {
    assert.match(route, /^\/(?:channel_followers|channel_audience_requests|platform_brand_profiles|platform_brand_assets|rpc\/[a-z_]+)(?:\?|$)/u);
    const config = [
      `url = ${JSON.stringify(`http://127.0.0.1:${port}${route}`)}`,
      `request = ${JSON.stringify(method)}`, 'silent', 'show-error', 'max-time = 20',
      'write-out = "\\n%{http_code}"',
      ...Object.entries({ Authorization: `Bearer ${token(actor)}`, 'Content-Type': 'application/json', ...headers })
        .map(([key, value]) => `header = ${JSON.stringify(`${key}: ${value}`)}`),
      ...(body === undefined ? [] : [`data = ${JSON.stringify(JSON.stringify(body))}`]),
    ].join('\n');
    const raw = output(invoke(['exec', '-i', container, 'curl', '--config', '-'], config), 'local PostgREST HTTP request');
    const split = raw.lastIndexOf('\n');
    return { status: Number(raw.slice(split + 1)), body: split < 0 ? '' : raw.slice(0, split) };
  }
  const json = response => JSON.parse(response.body);
  const expect = (response, status, label) => {
    const code = response.body.startsWith('{') ? json(response).code ?? '' : '';
    assert.equal(response.status, status, `${label}: HTTP ${response.status}, SQL/PostgREST code ${code}`);
  };
  const audienceState = id => JSON.parse(query(`select jsonb_build_object(
    'status',(select status from public.channel_audience_requests where id=${id}),
    'followers',(select count(*) from public.channel_followers where channel_user_id=${literal(owner.user)}
      and follower_user_id=${literal(requester.user)}))::text;`));
  const snapshot = () => query(`select row_to_json(p)::text from public.platform_brand_publications p
    where owner_user_id=${literal(owner.user)};`);
  try {
    // Pin the official version to the resolved immutable image ID for this run.
    let inspected = invoke(['image', 'inspect', '--format', '{{.Id}}', image]);
    if (inspected.status !== 0) {
      output(invoke(['pull', image]), 'pull pinned local PostgREST image');
      inspected = invoke(['image', 'inspect', '--format', '{{.Id}}', image]);
    }
    const imageId = output(inspected, 'resolve pinned local PostgREST image');
    assert.match(imageId, /^sha256:[a-f0-9]{64}$/u);
    // Reuse only the selected local container's existing authenticator password.
    // It stays in memory/private temporary input and is never logged.
    output(invoke(['exec', container, 'sh', '-c',
      'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -X -h 127.0.0.1 -U authenticator -d "$1" -Atqc "select current_user"',
      'studio-http', database]), 'local authenticator connection');
    const password = output(invoke(['exec', container, 'sh', '-c', 'printf %s "$POSTGRES_PASSWORD"']), 'read local authenticator input');
    assert.ok(password && !/[\r\n]/u.test(password));
    const envFile = path.join(temp, 'postgrest.env');
    writeFileSync(envFile, [
      `PGRST_DB_URI=postgresql://authenticator:${encodeURIComponent(password)}@127.0.0.1:5432/${database}`,
      'PGRST_DB_SCHEMAS=public', 'PGRST_DB_ANON_ROLE=anon',
      `PGRST_JWT_SECRET=${jwtKey}`, 'PGRST_SERVER_HOST=127.0.0.1', `PGRST_SERVER_PORT=${port}`,
      'PGRST_DB_POOL=2', 'PGRST_LOG_LEVEL=crit',
    ].join('\n'), { mode: 0o600 });
    output(invoke(['run', '--detach', '--name', name, '--network', `container:${container}`,
      '--env-file', envFile, imageId]), 'start owned loopback-only PostgREST');
    owned = true;
    const network = JSON.parse(output(invoke(['inspect', '--format',
      '{{json .HostConfig}}', name]), 'verify PostgREST network'));
    const databaseContainerId = output(invoke(['inspect', '--format', '{{.Id}}', container]), 'resolve local database container');
    assert.ok([`container:${container}`, `container:${databaseContainerId}`].includes(network.NetworkMode), 'HTTP fixture must share only its selected local database network namespace');
    assert.deepEqual(network.PortBindings ?? {}, {}, 'HTTP fixture must not publish host ports');
    const deadline = Date.now() + 60_000;
    let ready = false;
    while (Date.now() < deadline) {
      try { ready = request('GET', '/channel_audience_requests?limit=0').status === 200; }
      catch { /* Startup can briefly refuse the local socket. */ }
      if (ready) break;
      await delay(250);
    }
    assert.ok(ready, 'local PostgREST did not become ready within 60 seconds');

    cleanAudience();
    const id = Number(query(`insert into public.channel_audience_requests(channel_user_id,requester_user_id)
      values(${literal(owner.user)},${literal(requester.user)}) returning id;`));
    assert.ok(Number.isSafeInteger(id) && id > 0);
    const preflight = request('POST', '/channel_followers', {
      channel_user_id: owner.user, follower_user_id: requester.user, updated_at: new Date().toISOString(),
    }, owner, { Prefer: 'return=minimal' });
    expect(preflight, 201, 'historical follower INSERT');
    assert.equal(preflight.body, '', 'historical minimal INSERT must have no response body');
    assert.deepEqual(audienceState(id), { status: 'pending', followers: 0 });
    pass('HTTP legacy minimal follower INSERT returns 201 without a relationship');

    const reviewed = request('PATCH', `/channel_audience_requests?id=eq.${id}&select=*`, {
      status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: owner.user, updated_at: new Date().toISOString(),
    }, owner, { Prefer: 'return=representation', Accept: 'application/vnd.pgrst.object+json' });
    expect(reviewed, 200, 'historical exact-id singular review PATCH');
    assert.equal(Number(json(reviewed).id), id);
    assert.equal(json(reviewed).status, 'approved');
    assert.equal(json(reviewed).reviewed_by, owner.user);
    assert.deepEqual(audienceState(id), { status: 'approved', followers: 1 });
    pass('HTTP legacy exact-id PATCH returns its single committed review and one follower');

    const before = snapshot();
    const rejected = request('POST', '/platform_brand_profiles?on_conflict=owner_user_id&select=*', {
      ...full(owner, { accent_color: '#123456' }), published_at: '2099-01-01T00:00:00.000Z',
    }, owner, { Prefer: 'resolution=merge-duplicates,return=representation', Accept: 'application/vnd.pgrst.object+json' });
    expect(rejected, 403, 'historical unknown publication timestamp');
    assert.equal(json(rejected).code, '42501');
    assert.equal(json(rejected).message, 'brand_publish_rpc_required');
    assert.equal(snapshot(), before, 'rejected old Publish must not change public content');
    const rejectedAssets = request('POST', '/rpc/publish_platform_brand_profile_assets', { p_asset_ids: [] });
    expect(rejectedAssets, 403, 'historical asset publication RPC');
    assert.equal(json(rejectedAssets).code, '42501');
    assert.equal(json(rejectedAssets).message, 'brand_publish_rpc_required');
    assert.equal(snapshot(), before);
    pass('HTTP legacy Publish returns 42501 without changing the public snapshot');

    query(`update public.user_profiles set platform_access_visibility='public' where user_id=${literal(owner.user)};`);
    const modern = request('POST', '/rpc/publish_platform_brand_profile', { p_profile: full(owner, { accent_color: '#654321' }) });
    expect(modern, 200, 'modern atomic publication RPC');
    assert.equal(json(modern).accent_color, '#654321');
    const publicRead = request('POST', '/rpc/read_public_platform_brand_profile', { profile_user_id: owner.user }, null,
      { Accept: 'application/vnd.pgrst.object+json' });
    expect(publicRead, 200, 'anonymous committed public branding reader');
    assert.equal(json(publicRead).accent_color, '#654321');
    pass('HTTP modern atomic Publish and anonymous committed public read agree');

    const publishedSnapshot = snapshot();
    for (const cached of [JSON.parse(before).published_at, null]) {
      const saved = request('POST', '/platform_brand_profiles?on_conflict=owner_user_id&select=*', {
        ...full(owner, { accent_color: cached ? '#456789' : '#567890' }),
        published_at: cached, updated_at: new Date().toISOString(),
      }, owner, { Prefer: 'resolution=merge-duplicates,return=representation', Accept: 'application/vnd.pgrst.object+json' });
      expect(saved, 201, 'historical cached-metadata draft upsert');
      assert.equal(json(saved).owner_user_id, owner.user);
      assert.equal(json(saved).accent_color, cached ? '#456789' : '#567890');
      assert.equal(Date.parse(json(saved).published_at), Date.parse(json(modern).published_at));
      assert.equal(snapshot(), publishedSnapshot, 'cached-metadata draft must not change the public snapshot');
    }
    pass('HTTP legacy known-stale and NULL draft metadata return normalized rows without publishing');

    for (const published of [false, true]) {
      const assetId = randomUUID();
      const objectKey = `${owner.user}/hero_image/${assetId}.png`;
      const inserted = request('POST', '/platform_brand_assets?select=*', {
        id: assetId, owner_user_id: owner.user, asset_type: 'hero_image', asset_state: 'draft',
        moderation_status: 'pending_review', storage_provider: 'supabase', storage_bucket: 'platform-brand-assets',
        storage_object_key: objectKey, storage_path: objectKey, mime_type: 'image/png', file_size_bytes: 1,
        original_file_name: 'local-http-fixture.png', updated_at: new Date().toISOString(),
      }, owner, { Prefer: 'return=representation', Accept: 'application/vnd.pgrst.object+json' });
      expect(inserted, 201, 'historical draft asset row insertion');
      if (published) {
        // Scanner completion is a local fixture input; actual file upload and
        // malware scanning remain outside this HTTP protocol test.
        query(`update public.platform_brand_assets set scan_status='clean' where id=${literal(assetId)};`);
        const selected = request('POST', '/rpc/publish_platform_brand_profile', {
          p_profile: full(owner, { accent_color: '#654321', hero_image_asset_id: assetId }),
        });
        expect(selected, 200, 'fixture public asset publication');
      }
      const archived = request('PATCH', `/platform_brand_assets?id=eq.${assetId}&owner_user_id=eq.${owner.user}`, {
        asset_state: 'archived', deleted_at: new Date().toISOString(),
      }, owner, { Prefer: 'return=minimal' });
      expect(archived, 204, 'historical minimal archive PATCH');
      assert.equal(archived.body, '');
      assert.equal(query(`select asset_state from public.platform_brand_assets where id=${literal(assetId)};`), 'archived');
      const publicAsset = request('GET', `/platform_brand_assets?id=eq.${assetId}&select=id`, undefined, null);
      expect(publicAsset, 200, 'anonymous archived asset metadata read');
      assert.deepEqual(json(publicAsset), []);
      for (const actor of [owner, null]) {
        const allowed = request('POST', '/rpc/platform_brand_storage_access_allowed', {
          p_bucket: 'platform-brand-assets', p_object_key: objectKey,
        }, actor);
        expect(allowed, 200, 'archived object storage authority');
        assert.equal(json(allowed), false);
      }
      if (published) {
        const hidden = request('POST', '/rpc/read_public_platform_brand_profile', { profile_user_id: owner.user }, null,
          { Accept: 'application/vnd.pgrst.object+json' });
        expect(hidden, 200, 'public branding after media archive');
        assert.equal(json(hidden).hero_image_asset_id, null);
      }
    }
    pass('HTTP old minimal archive PATCH succeeds for draft/public assets while deleted media access stays denied');
  } finally {
    try {
      if (owned) output(invoke(['rm', '--force', name]), 'remove owned PostgREST container');
    } finally {
      rmSync(temp, { recursive: true, force: true });
      cleanAudience();
    }
  }
}
