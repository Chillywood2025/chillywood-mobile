import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { boundedRange, createPrivateS3Transport, deliverBoundedRange } from './private-object.mjs';
import { transferReservedUpload } from './upload-broker.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();

test('actual local HTTP object fixture: signed conditional upload, version-pinned bytes, bounded range and post-I/O authority', async () => {
  const version = 'opaque/+==%2F%25&?#' + 'x'.repeat(300);
  const config = { routeId: randomUUID(), bucket: 'synthetic-private-video', region: 'us-east-1', accessKeyId: 'TESTACCESSKEY12345678', secretAccessKey: 'synthetic-local-secret-value-not-a-real-key-00000000' };
  const host = `${config.bucket}.s3.${config.region}.amazonaws.com`;
  const resourceId = 'scv1_resource_' + randomUUID(), assetId = 'scv1_asset_' + randomUUID(), incarnation = randomUUID();
  const bytes = Buffer.alloc(1024 * 1024, 7), binding = { objectKey: `sandbox-commerce-v1/${randomUUID()}/${resourceId}/${assetId}/${incarnation}.mp4`,
    provider: 's3', bucket: config.bucket, routeId: config.routeId, incarnation, expectedSha256: digest(bytes), expectedByteLength: bytes.length };
  let stored = null, badRange = false, wrongVersion = false, rangeRead = 0, totalRequests = 0;
  const server = http.createServer(async (req, res) => {
    try {
      totalRequests++;
      const chunks = []; for await (const chunk of req) chunks.push(chunk); const body = Buffer.concat(chunks);
      const auth = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/([^,]+), SignedHeaders=([^,]+), Signature=([a-f0-9]{64})$/u.exec(req.headers.authorization ?? '');
      assert.ok(auth); assert.equal(auth[1], config.accessKeyId);
      const names = auth[3].split(';'); assert.ok(names.includes('host')); assert.ok(names.includes('x-amz-content-sha256'));
      const url = new URL(req.url, 'https://' + host), datetime = req.headers['x-amz-date'], day = datetime.slice(0, 8);
      assert.equal(auth[2], `${day}/${config.region}/s3/aws4_request`);
      const canonical = [req.method, url.pathname, url.search.slice(1), names.map(name => `${name}:${name === 'host' ? host : req.headers[name]}\n`).join(''), names.join(';'), digest(body)].join('\n');
      const key = hmac(hmac(hmac(hmac('AWS4' + config.secretAccessKey, day), config.region), 's3'), 'aws4_request');
      assert.equal(auth[4], hmac(key, ['AWS4-HMAC-SHA256', datetime, auth[2], digest(canonical)].join('\n')).toString('hex'));
      assert.equal(req.headers['x-amz-content-sha256'], digest(body));
      assert.equal(decodeURIComponent(url.pathname), '/' + binding.objectKey);
      if (req.method === 'PUT') {
        assert.equal(req.headers['if-none-match'], '*'); assert.ok(names.includes('if-none-match'));
        assert.equal(req.headers['content-type'], 'video/mp4'); assert.equal(req.headers['x-amz-acl'], undefined);
        assert.equal(req.headers['x-amz-checksum-sha256'], Buffer.from(digest(body), 'hex').toString('base64'));
        if (stored) { res.writeHead(412); res.end(); return; }
        stored = body; res.writeHead(200, { 'x-amz-version-id': version, 'x-amz-checksum-sha256': req.headers['x-amz-checksum-sha256'] }); res.end(); return;
      }
      assert.ok(stored); assert.ok(req.method === 'GET' || req.method === 'HEAD');
      if (url.search) assert.equal(url.searchParams.get('versionId'), version);
      const headers = { 'content-type': 'video/mp4', 'content-length': String(stored.length), etag: '"fixture-etag"', 'x-amz-version-id': wrongVersion ? 'wrong' : version };
      if (req.method === 'HEAD') { res.writeHead(200, headers); res.end(); return; }
      assert.equal(url.searchParams.get('versionId'), version); assert.equal(req.headers['if-match'], '"fixture-etag"');
      if (req.headers.range) {
        rangeRead++; const [, start, end] = /^bytes=(\d+)-(\d+)$/u.exec(req.headers.range);
        headers['content-range'] = `bytes ${start}-${end}/${stored.length}`; headers['content-length'] = String(Number(end) - Number(start) + 1);
        res.writeHead(badRange ? 200 : 206, headers); res.end(stored.subarray(Number(start), Number(end) + 1));
      } else { res.writeHead(200, headers); res.end(stored); }
    } catch (error) { res.writeHead(500); res.end(String(error.message)); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (url, options) => {
    const parsed = new URL(url); assert.equal(parsed.origin, 'https://' + host); assert.equal(options.redirect, 'error');
    // Explicit fixture-only translation. Production source accepts only its
    // server-configured HTTPS AWS hostname and has no loopback switch.
    const headers = { ...options.headers }; delete headers.host;
    const response = await fetch(origin + parsed.pathname + parsed.search, { ...options, headers });
    assert.notEqual(response.status, 500, response.status === 500 ? await response.clone().text() : undefined);
    return response;
  };
  const transport = createPrivateS3Transport(config, { request });
  try {
    const uploadActor = { userId: randomUUID(), sessionGeneration: randomUUID() }, uploadId = 'scpv_upload_' + randomUUID();
    const uploadRequestId = randomUUID(), transferId = randomUUID();
    const admission = { protocol: 'scpv-upload-admission-v1', state: 'leased', dispatchAllowed: true, transferId,
      actor: uploadActor, uploadId, requestId: uploadRequestId, object: binding, validUntilMs: Date.now() + 4000 };
    const uploadRequest = () => new Request('https://fixture.invalid/private-upload/' + uploadId,
      { method: 'PUT', headers: { 'content-type': 'video/mp4', 'content-length': String(bytes.length) }, body: bytes });
    let uploadAuthorizations = 0;
    assert.deepEqual(await transferReservedUpload({ request: uploadRequest(), actor: uploadActor, uploadId, requestId: uploadRequestId,
      authorize: async context => { uploadAuthorizations++; assert.equal(context.actor.userId, uploadActor.userId); return admission; }, transport }),
    { state: 'acknowledged', uploadId, requestId: uploadRequestId });
    assert.equal(uploadAuthorizations, 3);
    const beforeUnknown = totalRequests;
    assert.deepEqual(await transferReservedUpload({ request: uploadRequest(), actor: uploadActor, uploadId, requestId: uploadRequestId,
      authorize: async () => ({ protocol: 'scpv-upload-admission-v1', state: 'unknown', dispatchAllowed: false, transferId }), transport }),
    { state: 'unknown', uploadId, requestId: uploadRequestId });
    assert.equal(totalRequests, beforeUnknown);
    let checkCount = 0;
    assert.deepEqual(await transferReservedUpload({ request: uploadRequest(), actor: uploadActor, uploadId, requestId: uploadRequestId,
      authorize: async () => { if (++checkCount === 3) throw Error('creator_revoked_after_put'); return admission; }, transport }),
    { state: 'unknown', uploadId, requestId: uploadRequestId });
    assert.deepEqual(await transport.writeOnce(binding, bytes, Date.now() + 10000), { state: 'exists_unverified' });
    assert.equal(stored.length, bytes.length);
    const scanned = await transport.readForScan(binding, Date.now() + 10000);
    assert.deepEqual(scanned.bytes, bytes); assert.equal(scanned.objectVersion, version);
    const pinned = { ...binding, objectVersion: version };
    assert.deepEqual(await transport.readRange(pinned, { start: 100, end: 199 }, Date.now() + 10000), bytes.subarray(100, 200));
    badRange = true; await assert.rejects(transport.readRange(pinned, { start: 100, end: 199 }, Date.now() + 10000), /range_response_invalid/u); badRange = false;
    wrongVersion = true; await assert.rejects(transport.readRange(pinned, { start: 100, end: 199 }, Date.now() + 10000), /origin_metadata_invalid/u); wrongVersion = false;
    await assert.rejects(transport.writeOnce({ ...binding, objectKey: binding.objectKey + '?override' }, bytes, Date.now() + 10000), /object_binding_invalid/u);
    await assert.rejects(transport.readRange({ ...pinned, bucket: 'other-private-bucket' }, { start: 1, end: 2 }, Date.now() + 10000), /object_route_mismatch/u);
    const actor = { userId: randomUUID(), sessionGeneration: randomUUID() }, grantId = 'scv1_grant_' + randomUUID();
    const access = () => ({ protocol: 'scpv-current-access-v3', actor, resourceId, grantId, receiptId: 'scv1_receipt_' + randomUUID(),
      originalTransactionId: 'fixture-original', customerId: 'fixture-customer', projectId: 'fixture-project', validUntilMs: Date.now() + 4000, object: pinned });
    const admitted = access(); let authorizations = 0;
    const response = await deliverBoundedRange({ actor, resourceId, grantId, rangeHeader: null, transport, authorize: async () => { authorizations++; return admitted; } });
    assert.equal(response.status, 206); assert.equal(response.headers.get('content-length'), String(512 * 1024));
    assert.match(response.headers.get('cache-control'), /no-store/u); assert.equal(authorizations, 2); assert.equal((await response.arrayBuffer()).byteLength, 512 * 1024);
    const initialRangeRead = rangeRead; let calls = 0;
    await assert.rejects(deliverBoundedRange({ actor, resourceId, grantId, rangeHeader: 'bytes=0-100', transport,
      authorize: async () => { if (++calls === 2) throw Error('current_test_store_project_hold'); return access(); } }), /current_test_store_project_hold/u);
    assert.equal(rangeRead, initialRangeRead + 1); assert.equal(calls, 2);
    const count = totalRequests;
    await assert.rejects(deliverBoundedRange({ actor, resourceId, grantId, rangeHeader: 'bytes=0-100', transport,
      authorize: async () => ({ ...access(), protocol: 'generic-delivery-v1' }) }), /current_access_required/u);
    assert.equal(totalRequests, count);
    let changedCalls = 0; const a = access();
    await assert.rejects(deliverBoundedRange({ actor, resourceId, grantId, rangeHeader: 'bytes=0-100', transport,
      authorize: async () => ++changedCalls === 1 ? a : { ...a, customerId: 'transferred-customer' } }), /authority_changed/u);
    const unknown = createPrivateS3Transport(config, { request: async () => { throw Error('lost_response'); } });
    assert.deepEqual(await unknown.writeOnce(binding, bytes, Date.now() + 10000), { state: 'unknown' });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('range parsing rejects multi-range and unsafe numbers and caps suffix/open ranges', () => {
  assert.deepEqual(boundedRange('bytes=-999999999', 1024 * 1024), { start: 512 * 1024, end: 1024 * 1024 - 1 });
  assert.deepEqual(boundedRange('bytes=10-', 1024 * 1024), { start: 10, end: 10 + 512 * 1024 - 1 });
  for (const header of ['bytes=0-1,3-4', 'bytes=-0', 'bytes=9007199254740992-', 'bytes=10-9', 'bytes=1048576-', 'invalid']) {
    assert.throws(() => boundedRange(header, 1024 * 1024), /range_invalid/u);
  }
});
