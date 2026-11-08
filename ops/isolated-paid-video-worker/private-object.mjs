import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';

const MAX_BYTES = 16777216, MAX_RANGE = 512 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hmac = (key, bytes) => createHmac('sha256', key).update(bytes).digest();
const encode = value => encodeURIComponent(value).replace(/[!'()*]/gu, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const fail = code => { throw new Error(code); };
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const keyPattern = new RegExp(`^sandbox-commerce-v1/(${uuid})/scv1_resource_(${uuid})/scv1_asset_(${uuid})/(${uuid})\\.mp4$`, 'u');

export function validateObjectBinding(binding) {
  const match = keyPattern.exec(binding?.objectKey ?? '');
  if (!match || match[4] !== binding.incarnation || binding.provider !== 's3' || !new RegExp(`^${uuid}$`, 'u').test(binding.routeId)
    || typeof binding.bucket !== 'string' || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u.test(binding.bucket) || !/^[a-f0-9]{64}$/u.test(binding.expectedSha256)
    || !Number.isSafeInteger(binding.expectedByteLength) || binding.expectedByteLength < 1 || binding.expectedByteLength > MAX_BYTES
    || (binding.objectVersion !== undefined && (!/^[A-Za-z0-9._-]{1,256}$/u.test(binding.objectVersion) || binding.objectVersion === 'null')))
    fail('paid_video_object_binding_invalid');
  return binding;
}
async function readExactBody(response, length) {
  if (!response.body || length < 1 || length > MAX_BYTES) fail('paid_video_origin_body_invalid');
  const reader = response.body.getReader(), chunks = []; let count = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      count += value.length; if (count > length) fail('paid_video_origin_body_invalid'); chunks.push(value);
    }
    if (count !== length) fail('paid_video_origin_body_invalid');
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

// Server-configured S3 general-purpose bucket only. No user-selected endpoint,
// arbitrary method, public ACL, overwrite, deletion or presigned bearer URL.
// This source is not wired to an Edge route until actual S3 route qualification.
export function createPrivateS3Transport({ routeId, bucket, region, accessKeyId, secretAccessKey }, { request = fetch, now = Date.now } = {}) {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u.test(bucket) || !/^[a-z]{2}(?:-gov)?-[a-z]+-[1-9]$/u.test(region)
    || !new RegExp(`^${uuid}$`, 'u').test(routeId) || !/^[A-Z0-9]{16,128}$/u.test(accessKeyId) || typeof secretAccessKey !== 'string' || secretAccessKey.length < 32)
    fail('paid_video_route_configuration_invalid');
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  async function dispatch(method, binding, deadline, { body, version, range, etag } = {}) {
    validateObjectBinding(binding);
    if (binding.provider !== 's3' || binding.bucket !== bucket || binding.routeId !== routeId) fail('paid_video_object_route_mismatch');
    const started = now(); if (!Number.isFinite(deadline) || deadline <= started || deadline > started + 15000) fail('paid_video_origin_deadline_invalid');
    const pathname = '/' + binding.objectKey.split('/').map(encode).join('/');
    const query = version === undefined ? '' : 'versionId=' + encode(version);
    const dateTime = new Date(started).toISOString().replace(/[:-]|\.\d{3}/gu, ''), day = dateTime.slice(0, 8);
    const payloadHash = hash(body ?? '');
    const headers = { host, 'x-amz-date': dateTime, 'x-amz-content-sha256': payloadHash };
    if (method === 'PUT') Object.assign(headers, { 'content-type': 'video/mp4', 'content-length': String(body.length), 'if-none-match': '*',
      'x-amz-checksum-sha256': Buffer.from(payloadHash, 'hex').toString('base64'), 'cache-control': 'private, no-store' });
    else headers['accept-encoding'] = 'identity';
    if (range) headers.range = `bytes=${range.start}-${range.end}`;
    if (etag) headers['if-match'] = etag;
    // Fetch implementations may append identity to Accept-Encoding for range
    // requests. It is not an authority-bearing header; sign range and If-Match.
    const names = Object.keys(headers).filter(name => name !== 'accept-encoding').sort(), signedHeaders = names.join(';');
    const canonical = [method, pathname, query, names.map(name => `${name}:${headers[name].trim()}\n`).join(''), signedHeaders, payloadHash].join('\n');
    const scope = `${day}/${region}/s3/aws4_request`, stringToSign = ['AWS4-HMAC-SHA256', dateTime, scope, hash(canonical)].join('\n');
    const signingKey = hmac(hmac(hmac(hmac('AWS4' + secretAccessKey, day), region), 's3'), 'aws4_request');
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hmac(signingKey, stringToSign).toString('hex')}`;
    const remaining = deadline - now(); if (remaining <= 0) fail('paid_video_origin_deadline_invalid');
    return request(`https://${host}${pathname}${query ? '?' + query : ''}`, { method, headers, body,
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(Math.max(1, Math.floor(remaining))) });
  }
  const metadata = (response, binding, version) => {
    const actualVersion = response.headers.get('x-amz-version-id'), etag = response.headers.get('etag');
    if (response.status !== 200 || response.headers.get('content-length') !== String(binding.expectedByteLength)
      || response.headers.get('content-type') !== 'video/mp4' || response.headers.has('content-encoding')
      || !actualVersion || actualVersion === 'null' || !/^[A-Za-z0-9._-]{1,256}$/u.test(actualVersion)
      || (version !== undefined && actualVersion !== version) || !etag || !/^"[A-Za-z0-9._-]{1,128}"$/u.test(etag)) fail('paid_video_origin_metadata_invalid');
    return { version: actualVersion, etag };
  };
  return Object.freeze({
    async writeOnce(binding, bytes, deadline) {
      validateObjectBinding(binding);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== binding.expectedByteLength || hash(bytes) !== binding.expectedSha256 || binding.objectVersion !== undefined)
        fail('paid_video_upload_bytes_mismatch');
      // A lost response remains unknown. Never retry or manufacture a new key.
      let response;
      try { response = await dispatch('PUT', binding, deadline, { body: bytes }); }
      catch { return { state: 'unknown' }; }
      try {
        if (response.status !== 200) return { state: response.status === 412 ? 'exists_unverified' : 'unknown' };
        const version = response.headers.get('x-amz-version-id');
        if (!version || version === 'null' || !/^[A-Za-z0-9._-]{1,256}$/u.test(version)
          || response.headers.get('x-amz-checksum-sha256') !== Buffer.from(binding.expectedSha256, 'hex').toString('base64')) return { state: 'unknown' };
        return { state: 'acknowledged', objectVersion: version };
      } finally { await response.body?.cancel(); }
    },
    async readForScan(binding, deadline) {
      validateObjectBinding(binding);
      const head = await dispatch('HEAD', binding, deadline, { version: binding.objectVersion });
      const observed = metadata(head, binding, binding.objectVersion);
      const response = await dispatch('GET', binding, deadline, { version: observed.version, etag: observed.etag });
      try {
        const repeated = metadata(response, binding, observed.version);
        if (repeated.etag !== observed.etag || response.headers.has('content-range')) fail('paid_video_origin_changed');
        const bytes = await readExactBody(response, binding.expectedByteLength);
        if (hash(bytes) !== binding.expectedSha256) fail('paid_video_origin_bytes_mismatch');
        return { bytes, objectVersion: observed.version };
      } finally { await response.body?.cancel().catch(() => {}); }
    },
    async readRange(binding, range, deadline) {
      validateObjectBinding(binding);
      if (!binding.objectVersion || !Number.isSafeInteger(range?.start) || !Number.isSafeInteger(range?.end)
        || range.start < 0 || range.end >= binding.expectedByteLength || range.end < range.start || range.end - range.start + 1 > MAX_RANGE)
        fail('paid_video_range_invalid');
      const head = await dispatch('HEAD', binding, deadline, { version: binding.objectVersion });
      const observed = metadata(head, binding, binding.objectVersion);
      const response = await dispatch('GET', binding, deadline, { version: observed.version, etag: observed.etag, range });
      try {
        if (response.status !== 206 || response.headers.get('content-range') !== `bytes ${range.start}-${range.end}/${binding.expectedByteLength}`
          || response.headers.get('content-length') !== String(range.end - range.start + 1) || response.headers.get('content-type') !== 'video/mp4'
          || response.headers.has('content-encoding') || response.headers.get('x-amz-version-id') !== observed.version || response.headers.get('etag') !== observed.etag)
          fail('paid_video_range_response_invalid');
        return await readExactBody(response, range.end - range.start + 1);
      } finally { await response.body?.cancel().catch(() => {}); }
    },
  });
}

export function boundedRange(header, length) {
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_BYTES) fail('paid_video_range_invalid');
  if (header === null) return { start: 0, end: Math.min(length, MAX_RANGE) - 1 };
  const match = /^bytes=([0-9]*)-([0-9]*)$/u.exec(header);
  if (!match || (!match[1] && !match[2])) fail('paid_video_range_invalid');
  const a = Number(match[1]), b = Number(match[2]);
  if ((match[1] && !Number.isSafeInteger(a)) || (match[2] && !Number.isSafeInteger(b))) fail('paid_video_range_invalid');
  if (!match[1]) { if (b <= 0) fail('paid_video_range_invalid'); return { start: Math.max(0, length - Math.min(b, MAX_RANGE)), end: length - 1 }; }
  if (a >= length || (match[2] && b < a)) fail('paid_video_range_invalid');
  return { start: a, end: Math.min(match[2] ? b : length - 1, length - 1, a + MAX_RANGE - 1) };
}

// An authenticated private protocol-3 access RPC must implement authorize. It
// must consume current session/account/grant/media plus Test Store project,
// original and customer negatives on BOTH calls. No existing generic delivery
// RPC meets that contract. This adapter has no public route or default callback.
export async function deliverBoundedRange({ actor, resourceId, grantId, rangeHeader, authorize, transport, now = Date.now }) {
  assert.equal(typeof authorize, 'function');
  const request = Object.freeze({ actor, resourceId, grantId });
  const before = structuredClone(await authorize(request));
  if (before?.protocol !== 'scpv-current-access-v3' || before.actor?.userId !== actor.userId
    || before.actor?.sessionGeneration !== actor.sessionGeneration || before.resourceId !== resourceId || before.grantId !== grantId
    || !Number.isFinite(before.validUntilMs) || before.validUntilMs <= now() || before.validUntilMs > now() + 5000)
    fail('paid_video_current_access_required');
  for (const field of ['receiptId', 'originalTransactionId', 'customerId', 'projectId']) {
    if (typeof before[field] !== 'string' || before[field].length < 1 || before[field].length > 512) fail('paid_video_current_access_required');
  }
  const binding = validateObjectBinding(before.object), range = boundedRange(rangeHeader, binding.expectedByteLength);
  if ('scv1_resource_' + keyPattern.exec(binding.objectKey)[2] !== resourceId) fail('paid_video_current_access_required');
  const deadline = Math.min(before.validUntilMs, now() + 5000);
  const bytes = await transport.readRange(binding, range, deadline);
  const after = await authorize(request);
  if (!after || after.protocol !== before.protocol || after.actor?.userId !== actor.userId || after.actor?.sessionGeneration !== actor.sessionGeneration
    || after.resourceId !== resourceId || after.grantId !== grantId
    || ['provider', 'bucket', 'routeId', 'objectKey', 'incarnation', 'expectedSha256', 'expectedByteLength', 'objectVersion'].some(key => after.object?.[key] !== before.object[key])
    || after.receiptId !== before.receiptId || after.originalTransactionId !== before.originalTransactionId
    || after.customerId !== before.customerId || after.projectId !== before.projectId
    || !Number.isFinite(after.validUntilMs) || after.validUntilMs <= now() || now() >= deadline)
    fail('paid_video_authority_changed');
  return new Response(bytes, { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length),
    'Content-Range': `bytes ${range.start}-${range.end}/${binding.expectedByteLength}`, 'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Vary: 'Authorization, Range',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
}
