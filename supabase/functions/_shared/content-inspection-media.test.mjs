import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INSPECTION_MAX_RANGE_BYTES,
  deliverInspectionOriginal,
  inspectionMediaKind,
  inspectionResponseHeaders,
  matchesInspectionMediaSignature,
  parseInspectionRange,
  readInspectionBytes,
  validateInspectionOriginResponse,
} from './content-inspection-media.ts';

test('only reviewed inert media families are renderable', () => {
  assert.equal(inspectionMediaKind('image/jpeg'), 'image');
  assert.equal(inspectionMediaKind('video/mp4'), 'video');
  assert.equal(inspectionMediaKind('audio/ogg'), 'audio');
  for (const mime of ['image/svg+xml', 'text/html', 'application/pdf', 'application/octet-stream', 'text/plain']) {
    assert.equal(inspectionMediaKind(mime), null);
    assert.equal(matchesInspectionMediaSignature(mime, new Uint8Array()), false);
  }
  assert.equal(matchesInspectionMediaSignature('image/jpeg', Uint8Array.of(255, 216, 255)), true);
  assert.equal(matchesInspectionMediaSignature('image/jpeg', new TextEncoder().encode('<html>')), false);
  assert.equal(matchesInspectionMediaSignature('image/png', Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)), true);
  assert.equal(matchesInspectionMediaSignature('audio/wav', new TextEncoder().encode('RIFF1234WAVE')), true);
  assert.equal(matchesInspectionMediaSignature('audio/wav', new TextEncoder().encode('RIFF1234WEBP')), false);
});

test('ranges are exact, finite, single and bounded', () => {
  assert.deepEqual(parseInspectionRange('bytes=10-19', 100, 'video/mp4'), { start: 10, end: 19, partial: true });
  assert.deepEqual(parseInspectionRange('bytes=-10', 100, 'audio/mpeg'), { start: 90, end: 99, partial: true });
  assert.deepEqual(parseInspectionRange(null, 100, 'image/png'), { start: 0, end: 99, partial: false });
  assert.deepEqual(parseInspectionRange('bytes=0-', 100000000, 'video/mp4'), { start: 0, end: INSPECTION_MAX_RANGE_BYTES - 1, partial: true });
  for (const value of ['bytes=100-', 'bytes=9-3', 'bytes=0-1,2-3', 'bytes=-0', 'items=0-1', 'bytes=-', 'bytes=9007199254740992-']) {
    assert.throws(() => parseInspectionRange(value, 100, 'video/mp4'), { code: 'invalid_range' });
  }
  assert.throws(() => parseInspectionRange(null, 100, 'text/html'), { code: 'unsupported_format' });
  assert.throws(() => parseInspectionRange(null, 100000000, 'image/png'), { code: 'unsupported_size' });
});

test('origin response cannot replace bytes, encoding, MIME or range', async () => {
  const headers = {
    'Content-Range': 'bytes 0-2/100', 'Content-Length': '3',
    'Content-Type': 'image/jpeg', ETag: '"exact"',
  };
  const response = () => new Response(Uint8Array.of(255, 216, 255), { status: 206, headers });
  assert.doesNotThrow(() => validateInspectionOriginResponse(response(), 0, 2, 100, 'image/jpeg', '"exact"'));
  for (const change of [ { ETag: '"changed"' }, { 'Content-Type': 'text/html' }, { 'Content-Encoding': 'gzip' }, { 'Content-Range': 'bytes 1-3/100' }, { 'Content-Length': '4' } ]) {
    assert.throws(() => validateInspectionOriginResponse(new Response(null, { status: 206, headers: { ...headers, ...change } }), 0, 2, 100, 'image/jpeg', '"exact"'), { code: 'stale_or_invalid_original' });
  }
  assert.deepEqual(await readInspectionBytes(response(), 3), Uint8Array.of(255, 216, 255));
  await assert.rejects(readInspectionBytes(response(), 2), { code: 'origin_response_invalid' });
  await assert.rejects(readInspectionBytes(response(), 4), { code: 'origin_response_invalid' });
});

test('responses disable caches and vary across authenticated targets', () => {
  const headers = inspectionResponseHeaders();
  assert.match(headers.get('Cache-Control'), /no-store/);
  assert.equal(headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(headers.get('Vary'), /Authorization/);
  assert.match(headers.get('Vary'), /X-Inspection-Receipt/);
  assert.match(headers.get('Vary'), /Range/);
  assert.equal(headers.get('Location'), null);
});

const original = { provider: 's3', bucket: 'synthetic', objectKey: 'owner/source', mimeType: 'image/jpeg', sizeBytes: 100 };
const originalBytes = new Uint8Array(100);
originalBytes.set([255, 216, 255]);
function fakeOrigin(calls, options = {}) {
  return async (_binding, method, headers) => {
    calls.push(method);
    if (method === 'HEAD') return new Response(null, { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '100', ETag: '"stable"' } });
    assert.equal(headers['if-match'], '"stable"');
    const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(headers.range).map(Number);
    return new Response(originalBytes.slice(start, end + 1), { status: 206, headers: {
      'Content-Type': 'image/jpeg', 'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/100`, ETag: options.changed ? '"replacement"' : '"stable"',
    } });
  };
}

test('bounded original bytes are delivered only after final durable authorization/audit', async () => {
  const calls = [];
  const response = await deliverInspectionOriginal({ original, range: 'bytes=10-19', signal: new AbortController().signal,
    origin: fakeOrigin(calls), finalize: async () => { calls.push('audit'); } });
  assert.deepEqual(calls, ['HEAD', 'GET', 'GET', 'audit']);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), 'bytes 10-19/100');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), originalBytes.slice(10, 20));
  assert.equal(response.headers.get('ETag'), null);
  assert.equal(response.headers.get('Location'), null);
});

test('failed audit or revoked final authority produces no response bytes', async () => {
  const calls = [];
  await assert.rejects(deliverInspectionOriginal({ original, range: null, signal: new AbortController().signal,
    origin: fakeOrigin(calls), finalize: async () => { throw new Error('audit unavailable or revoked'); } }), /audit unavailable or revoked/);
});

test('replacement object fails before final audit; request cancellation also fails closed', async () => {
  let audited = false;
  await assert.rejects(deliverInspectionOriginal({ original, range: null, signal: new AbortController().signal,
    origin: fakeOrigin([], { changed: true }), finalize: async () => { audited = true; } }), { code: 'stale_or_invalid_original' });
  assert.equal(audited, false);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(deliverInspectionOriginal({ original, range: null, signal: controller.signal,
    origin: fakeOrigin([]), finalize: async () => { audited = true; } }));
  assert.equal(audited, false);
});
