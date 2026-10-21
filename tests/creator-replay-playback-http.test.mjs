import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const functionUrl = 'https://app.example.test/functions/v1/creator-replay-playback';
const origin = 'https://media.example.test/replays/fixture/';
const source = fs.readFileSync(process.env.REPLAY_EDGE_SOURCE ?? new URL('../supabase/functions/creator-replay-playback/index.ts', import.meta.url), 'utf8');
const compile = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(resources, options = {}) {
  const calls = [];
  const replay = { id: 'fixture', owner_user_id: 'owner', title: 'Synthetic replay', visibility: 'public', rights_status: 'creator_owned', save_status: 'ready', playback_record_id: 'record', moderation_status: 'clean', ...options.replay };
  const rows = {
    creator_replay_library_items: replay,
    spectator_hls_playback_records: { id: 'record', broadcast_session_id: 'session', playback_status: 'ready' },
    room_broadcast_sessions: { id: 'session', hls_playback_url: options.sourceUrl ?? `${origin}master.m3u8`, rights_status: 'creator_owned', playback_url_status: 'ready' },
  };
  const client = {
    from(table) { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: rows[table], error: null }) }; },
    rpc: async () => ({ data: true, error: null }),
    auth: { getUser: async () => ({ data: { user: options.user ? { id: options.user } : null }, error: null }) },
  };
  let handler;
  vm.runInNewContext(compile, {
    exports: {}, require: name => name.startsWith('npm:') ? { createClient: () => client } : {},
    Request, Response, Headers, URL, TextEncoder, Uint8Array, crypto: webcrypto, btoa, atob,
    Deno: { env: { get: name => name === 'SUPABASE_URL' ? 'https://app.example.test' : 'synthetic-test-only' }, serve: fn => { handler = fn; } },
    fetch: async function fetchFixture(url, init, depth = 0) {
      calls.push({ url, init });
      const body = resources[url];
      if (!body) return new Response('missing', { status: 404 });
      const response = typeof body === 'function' ? body(init) : new Response(body, { headers: { 'Content-Type': url.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' } });
      if (init?.redirect === 'follow' && [301, 302, 303, 307, 308].includes(response.status)) {
        if (depth > 8) throw new Error('modeled fetch redirect limit');
        return fetchFixture(new URL(response.headers.get('Location'), url).toString(), init, depth + 1);
      }
      Object.defineProperty(response, 'url', { value: url });
      return response;
    },
  });
  return { calls, replay, rows, request: (path = `${functionUrl}/records/fixture/index.m3u8`, init) => handler(new Request(path, init)) };
}
const uriLines = playlist => playlist.split(/\r?\n/).filter(line => line && !line.startsWith('#'));
const uriAttributes = playlist => [...playlist.matchAll(/URI="([^"]+)"/g)].map(match => match[1]);

test('actual replay handler rewrites nested rendition segments relative to their playlist', async () => {
  const h = fixture({
    [`${origin}master.m3u8`]: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=120000\nvideo/low.m3u8\n',
    [`${origin}video/low.m3u8`]: '#EXTM3U\n#EXTINF:4,\npart-1.ts\n#EXT-X-ENDLIST\n',
    [`${origin}video/part-1.ts`]: 'synthetic-media',
  });
  const master = await h.request(); assert.equal(master.status, 200);
  const variant = await h.request(uriLines(await master.text())[0]); assert.equal(variant.status, 200);
  const segment = uriLines(await variant.text())[0];
  assert.ok(segment.startsWith(`${functionUrl}/records/fixture/segment?`), 'nested segments must stay on the controlled route');
  const media = await h.request(segment); assert.equal(media.status, 200); assert.equal(await media.text(), 'synthetic-media');
  assert.equal(h.calls.at(-1).url, `${origin}video/part-1.ts`);
});

test('actual replay handler rewrites HLS map, key and rendition URI attributes', async () => {
  const h = fixture({ [`${origin}master.m3u8`]: '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio/index.m3u8"\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:4,\npart.m4s\n' });
  const response = await h.request(); const playlist = await response.text();
  assert.equal(response.status, 200);
  assert.equal(uriAttributes(playlist).length, 3);
  for (const uri of [...uriAttributes(playlist), ...uriLines(playlist)]) assert.ok(uri.startsWith(`${functionUrl}/records/fixture/segment?`), 'all media resources use controlled routes');
  assert.ok(!playlist.includes('https://media.example.test'));
});

test('actual replay handler preserves partial segment responses for byte-range playlists', async () => {
  const h = fixture({ [`${origin}part.mp4`]: init => {
    assert.equal(new Headers(init.headers).get('range'), 'bytes=4-7');
    return new Response('part', { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 4-7/20', 'Content-Length': '4', 'Accept-Ranges': 'bytes' } });
  } });
  const response = await h.request(`${functionUrl}/records/fixture/segment?path=part.mp4`, { headers: { Range: 'bytes=4-7' } });
  assert.equal(response.status, 206); assert.equal(response.headers.get('Content-Range'), 'bytes 4-7/20'); assert.equal(await response.text(), 'part');
});

test('actual replay handler rejects foreign and escaped resources before fetching', async () => {
  const h = fixture({});
  for (const path of ['https://foreign.example.test/a.ts', '../other/a.ts', '/other/a.ts', 'https://media.example.test/replays/other/a.ts']) {
    assert.equal((await h.request(`${functionUrl}/records/fixture/segment?path=${encodeURIComponent(path)}`)).status, 400);
  }
  assert.equal(h.calls.length, 0);
});

test('actual replay handler rechecks deleted, private and rights-revoked resources', async () => {
  for (const replay of [{ save_status: 'deleted' }, { visibility: 'draft' }, { rights_status: 'unknown_block_replay' }, { moderation_status: 'hidden' }]) {
    const h = fixture({}, { replay });
    assert.equal((await h.request()).status, 403);
    assert.equal((await h.request(`${functionUrl}/records/fixture/segment?path=part.ts`)).status, 403);
    assert.equal(h.calls.length, 0);
  }
});

test('private replay token follows nested playlists, init maps and segments without bypassing revocation', async () => {
  const h = fixture({
    [`${origin}master.m3u8`]: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=120000\nvideo/low.m3u8\n',
    [`${origin}video/low.m3u8`]: '#EXTM3U\n#EXT-X-MAP:URI="../shared/init.mp4"\n#EXTINF:4,\npart.m4s\n',
    [`${origin}shared/init.mp4`]: 'synthetic-init',
    [`${origin}video/part.m4s`]: 'synthetic-part',
  }, { replay: { visibility: 'draft' }, user: 'owner' });
  const state = await h.request(functionUrl, { method: 'POST', headers: { Authorization: 'Bearer synthetic-user' }, body: JSON.stringify({ replayId: 'fixture' }) });
  const readout = await state.json(); assert.equal(readout.canRenderPlayback, true);
  const token = new URL(readout.playbackUrl).searchParams.get('token'); assert.ok(token);
  const master = await h.request(readout.playbackUrl);
  const renditionUrl = uriLines(await master.text())[0]; assert.equal(new URL(renditionUrl).searchParams.get('token'), token);
  const rendition = await h.request(renditionUrl); const playlist = await rendition.text();
  const initUrl = uriAttributes(playlist)[0], segmentUrl = uriLines(playlist)[0];
  assert.equal(new URL(initUrl).searchParams.get('token'), token); assert.equal(new URL(segmentUrl).searchParams.get('token'), token);
  assert.equal(await (await h.request(initUrl)).text(), 'synthetic-init');
  assert.equal(await (await h.request(segmentUrl)).text(), 'synthetic-part');
  const before = h.calls.length;
  h.replay.save_status = 'deleted';
  assert.equal((await h.request(segmentUrl)).status, 403); assert.equal(h.calls.length, before);
});

test('manifest URI references outside the approved replay fail closed instead of escaping the proxy', async () => {
  for (const reference of ['https://foreign.example.test/key', '../../other/key', '/elsewhere/key']) {
    const h = fixture({ [`${origin}master.m3u8`]: `#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="${reference}"\n` });
    const response = await h.request(); assert.equal(response.status, 500);
    assert.equal(h.calls.length, 1); assert.doesNotMatch(await response.text(), /foreign\.example|elsewhere|other\/key/);
  }
});

test('MIME-identified extensionless nested playlists rewrite their own relative resources', async () => {
  const h = fixture({
    [`${origin}master.m3u8`]: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=120000\nvideo/rendition?quality=low\n',
    [`${origin}video/rendition?quality=low`]: () => new Response('#EXTM3U\n#EXTINF:4,\npart.ts?version=1\n', { headers: { 'Content-Type': 'application/x-mpegURL; charset=utf-8' } }),
    [`${origin}video/part.ts?version=1`]: 'part',
  });
  const master = await h.request(); const nested = await h.request(uriLines(await master.text())[0]);
  const segment = uriLines(await nested.text())[0]; const response = await h.request(segment);
  assert.equal(response.status, 200); assert.equal(await response.text(), 'part');
});

test('unsatisfiable range and missing upstream remain honest failures', async () => {
  const h = fixture({ [`${origin}part.mp4`]: () => new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */20' } }) });
  const range = await h.request(`${functionUrl}/records/fixture/segment?path=part.mp4`, { headers: { Range: 'bytes=30-' } });
  assert.equal(range.status, 416); assert.equal(range.headers.get('Content-Range'), 'bytes */20');
  assert.equal((await h.request()).status, 502);
  assert.equal((await h.request(`${functionUrl}/records/fixture/segment?path=missing.ts`)).status, 502);
});

test('URI attributes tolerate whitespace after separators without leaving a raw reference', async () => {
  const h = fixture({ [`${origin}master.m3u8`]: '#EXTM3U\n#EXT-X-MAP: URI="init.mp4"\n#EXT-X-KEY:METHOD=AES-128,\tURI="key.bin"\n' });
  const response = await h.request(); const playlist = await response.text();
  assert.equal(response.status, 200);
  for (const uri of uriAttributes(playlist)) assert.ok(uri.startsWith(`${functionUrl}/records/fixture/segment?`));
});

test('partial nested playlist is fetched whole before rewriting, while CORS supports media ranges', async () => {
  const h = fixture({ [`${origin}video/rendition`]: init => new Response(new Headers(init?.headers).has('Range') ? '#EXT' : '#EXTM3U\n#EXTINF:4,\npart.ts\n', {
    status: new Headers(init?.headers).has('Range') ? 206 : 200,
    headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
  }) });
  const response = await h.request(`${functionUrl}/records/fixture/segment?path=video%2Frendition`, { headers: { Range: 'bytes=0-3' } });
  assert.equal(response.status, 200); assert.equal(h.calls.length, 2);
  assert.equal(new Headers(h.calls[1].init?.headers).has('Range'), false);
  assert.ok(uriLines(await response.text())[0].startsWith(`${functionUrl}/records/fixture/segment?`));
  const preflight = await h.request(functionUrl, { method: 'OPTIONS' });
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /range/i);
  assert.match(response.headers.get('Access-Control-Expose-Headers'), /Content-Range/);
});

test('redirected playlists resolve relative children from the verified final location', async () => {
  const h = fixture({
    [`${origin}master.m3u8`]: () => new Response(null, { status: 302, headers: { Location: 'redirected/index.m3u8' } }),
    [`${origin}redirected/index.m3u8`]: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=120000\nlow.m3u8\n',
    [`${origin}redirected/low.m3u8`]: () => new Response(null, { status: 307, headers: { Location: 'video/low.m3u8' } }),
    [`${origin}redirected/video/low.m3u8`]: '#EXTM3U\n#EXTINF:4,\npart.ts\n',
    [`${origin}redirected/video/part.ts`]: 'redirected-media',
  });
  const master = await h.request(); assert.equal(master.status, 200);
  const nested = await h.request(uriLines(await master.text())[0]); assert.equal(nested.status, 200);
  const media = await h.request(uriLines(await nested.text())[0]); assert.equal(media.status, 200); assert.equal(await media.text(), 'redirected-media');
  assert.ok(h.calls.every(call => call.init.redirect === 'manual'));
});

test('redirect targets cannot escape the approved origin/directory and redirect loops are bounded', async () => {
  for (const target of ['https://foreign.example.test/private.m3u8', '../other/private.m3u8']) {
    const h = fixture({ [`${origin}master.m3u8`]: () => new Response(null, { status: 302, headers: { Location: target } }) });
    const response = await h.request(); assert.equal(response.status, 500); assert.equal(h.calls.length, 1);
    assert.doesNotMatch(await response.text(), /foreign\.example|other\/private/);
  }
  const loop = fixture({ [`${origin}master.m3u8`]: () => new Response(null, { status: 302, headers: { Location: 'master.m3u8' } }) });
  assert.equal((await loop.request()).status, 500); assert.ok(loop.calls.length <= 6);
});

test('a long approved signed source URL does not inherit the untrusted segment-path limit', async () => {
  const sourceUrl = `${origin}master.m3u8?signature=${'a'.repeat(900)}`;
  const h = fixture({
    [sourceUrl]: '#EXTM3U\n#EXTINF:4,\npart.ts\n',
    [`${origin}part.ts`]: 'synthetic-part',
  }, { sourceUrl });
  const playlist = await h.request(); assert.equal(playlist.status, 200);
  const media = await h.request(uriLines(await playlist.text())[0]); assert.equal(media.status, 200); assert.equal(await media.text(), 'synthetic-part');
  const before = h.calls.length;
  assert.equal((await h.request(`${functionUrl}/records/fixture/segment?path=${'a'.repeat(601)}`)).status, 400);
  assert.equal(h.calls.length, before);
});
