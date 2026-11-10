// Inactive independent R2 Workers binding adapter. No HTTP handler, deployment
// config, URL fallback, bucket lookup, list, delete or credential reader.
// Does not implement or reinterpret the frozen S3 objectVersion contract.
const MAX_BYTES = 16777216, MAX_RANGE = 512 * 1024;
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const uuidPattern = new RegExp(`^${uuid}$`, 'u');
const keyPattern = new RegExp(`^sandbox-commerce-v1/(${uuid})/scv1_resource_(${uuid})/scv1_asset_(${uuid})/(${uuid})\\.mp4$`, 'u');
const fail = code => { throw new Error(code); };
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', value))].map(n => n.toString(16).padStart(2, '0')).join('');
const idValue = value => typeof value === 'string' && /^[\x21-\x7e]{1,1024}$/u.test(value);

export function validateR2Object(object, requireIdentity = false) {
  const keys = ['provider', 'bucket', 'routeId', 'objectKey', 'incarnation', 'expectedSha256', 'expectedByteLength'];
  if (object?.identity !== undefined) keys.push('identity');
  const key = keyPattern.exec(object?.objectKey ?? '');
  if (!exact(object, keys) || object.provider !== 'cloudflare_r2' || typeof object.bucket !== 'string'
    || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u.test(object.bucket) || !uuidPattern.test(object.routeId)
    || !key || key[4] !== object.incarnation || !/^[a-f0-9]{64}$/u.test(object.expectedSha256)
    || !Number.isSafeInteger(object.expectedByteLength) || object.expectedByteLength < 1 || object.expectedByteLength > MAX_BYTES)
    fail('paid_video_r2_object_invalid');
  if (requireIdentity || object.identity !== undefined) {
    if (!exact(object.identity, ['kind', 'nativeVersion', 'etag']) || object.identity.kind !== 'r2-native-upload-v1'
      || !idValue(object.identity.nativeVersion) || !/^[a-f0-9]{32}(?:-[1-9][0-9]*)?$/u.test(object.identity.etag))
      fail('paid_video_r2_identity_invalid');
  }
  return object;
}

// R2 bindings offer no AbortSignal for these operations. A deadline timeout is
// an UNKNOWN result for writes, not cancellation or writer-drain evidence.
async function boundedOperation(start, deadline, now, discard = () => {}) {
  const remaining = deadline - now();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 15000) fail('paid_video_r2_deadline_invalid');
  let timer, timedOut = false;
  const operation = Promise.resolve().then(start);
  operation.then(value => { if (timedOut) discard(value); }, () => {});
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => { timedOut = true; reject(new Error('paid_video_r2_deadline_expired')); }, remaining);
    })]);
  } finally { clearTimeout(timer); }
}
const discardBody = value => { if (value?.body) void value.body.cancel().catch(() => {}); };
async function readBody(body, length, deadline, now) {
  if (!body || length < 1 || length > MAX_BYTES) fail('paid_video_r2_body_invalid');
  const reader = body.getReader(), output = new Uint8Array(length); let used = 0;
  try {
    while (true) {
      const item = await boundedOperation(() => reader.read(), deadline, now);
      if (item.done) break;
      if (!(item.value instanceof Uint8Array) || used + item.value.length > length) fail('paid_video_r2_body_invalid');
      output.set(item.value, used); used += item.value.length;
    }
    if (used !== length || now() >= deadline) fail('paid_video_r2_body_invalid');
    return output;
  } finally {
    // Cancellation itself has no deadline/abort contract. It must not extend a
    // denied range indefinitely when the underlying source never settles it.
    void reader.cancel().catch(() => {});
    try { reader.releaseLock(); } catch { /* Best effort after a pending read. */ }
  }
}
function metadata(value, object, range) {
  if (!value || value.key !== object.objectKey || value.size !== object.expectedByteLength
    || value.httpMetadata?.contentType !== 'video/mp4' || value.httpMetadata?.contentEncoding
    || !idValue(value.version) || !/^[a-f0-9]{32}(?:-[1-9][0-9]*)?$/u.test(value.etag)) fail('paid_video_r2_metadata_invalid');
  if (object.identity && (value.version !== object.identity.nativeVersion || value.etag !== object.identity.etag)) fail('paid_video_r2_upload_changed');
  if (range && (value.range?.offset !== range.start || value.range?.length !== range.end - range.start + 1)) fail('paid_video_r2_range_invalid');
  if (!range && value.range !== undefined && (value.range.offset !== 0 || value.range.length !== object.expectedByteLength))
    fail('paid_video_r2_full_body_required');
  return { kind: 'r2-native-upload-v1', nativeVersion: value.version, etag: value.etag };
}

export function createPrivateR2NativeTransport({ binding, bucket, routeId }, { now = Date.now } = {}) {
  if (!binding || typeof binding.get !== 'function' || typeof binding.put !== 'function'
    || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u.test(bucket) || !uuidPattern.test(routeId)) fail('paid_video_r2_route_invalid');
  const route = (object, required = false) => {
    validateR2Object(object, required);
    if (object.bucket !== bucket || object.routeId !== routeId) fail('paid_video_r2_route_mismatch');
  };
  return Object.freeze({
    async writeOnce(object, bytes, deadline) {
      route(object);
      if (object.identity !== undefined || !(bytes instanceof Uint8Array) || bytes.byteLength !== object.expectedByteLength
        || await digest(bytes) !== object.expectedSha256) fail('paid_video_r2_bytes_mismatch');
      let result;
      try {
        result = await boundedOperation(() => binding.put(object.objectKey, bytes, {
          onlyIf: new Headers({ 'If-None-Match': '*' }), sha256: object.expectedSha256,
          httpMetadata: { contentType: 'video/mp4', cacheControl: 'private, no-store' },
        }), deadline, now);
      } catch { return { state: 'unknown' }; }
      if (result === null) return { state: 'exists_unverified' };
      try { return { state: 'acknowledged', identity: metadata(result, object) }; }
      catch { return { state: 'unknown' }; }
    },
    async readForScan(object, deadline) {
      route(object);
      const value = await boundedOperation(() => binding.get(object.objectKey,
        object.identity ? { onlyIf: { etagMatches: object.identity.etag } } : undefined), deadline, now, discardBody);
      try {
        const identity = metadata(value, object), bytes = await readBody(value.body, object.expectedByteLength, deadline, now);
        if (await digest(bytes) !== object.expectedSha256 || now() >= deadline) fail('paid_video_r2_bytes_mismatch');
        return { bytes, identity };
      } finally { discardBody(value); }
    },
    async readRange(object, range, deadline) {
      route(object, true);
      if (!range || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0
        || range.end < range.start || range.end >= object.expectedByteLength || range.end - range.start + 1 > MAX_RANGE) fail('paid_video_r2_range_invalid');
      const value = await boundedOperation(() => binding.get(object.objectKey, { onlyIf: { etagMatches: object.identity.etag },
        range: { offset: range.start, length: range.end - range.start + 1 } }), deadline, now, discardBody);
      try { metadata(value, object, range); return await readBody(value.body, range.end - range.start + 1, deadline, now); }
      finally { discardBody(value); }
    },
  });
}

export function boundedR2Range(header, length) {
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_BYTES) fail('paid_video_r2_range_invalid');
  if (header === null) return { start: 0, end: Math.min(length, MAX_RANGE) - 1 };
  const match = /^bytes=([0-9]*)-([0-9]*)$/u.exec(header);
  if (!match || (!match[1] && !match[2])) fail('paid_video_r2_range_invalid');
  const a = Number(match[1]), b = Number(match[2]);
  if ((match[1] && !Number.isSafeInteger(a)) || (match[2] && !Number.isSafeInteger(b))) fail('paid_video_r2_range_invalid');
  if (!match[1]) { if (b <= 0) fail('paid_video_r2_range_invalid'); return { start: Math.max(0, length - Math.min(b, MAX_RANGE)), end: length - 1 }; }
  if (a >= length || (match[2] && b < a)) fail('paid_video_r2_range_invalid');
  return { start: a, end: Math.min(match[2] ? b : length - 1, length - 1, a + MAX_RANGE - 1) };
}
const tuple = object => JSON.stringify(['provider', 'bucket', 'routeId', 'objectKey', 'incarnation', 'expectedSha256', 'expectedByteLength']
  .map(key => object[key]).concat([object.identity.kind, object.identity.nativeVersion, object.identity.etag]));

// New protocol on purpose: the generic/S3 current-access response cannot admit
// R2, and an R2 response cannot flow into the frozen S3 adapter.
export async function deliverBoundedR2Range({ actor, resourceId, grantId, rangeHeader, authorize, transport, now = Date.now }) {
  const request = Object.freeze({ actor, resourceId, grantId });
  const validate = value => {
    if (value?.protocol !== 'scpv-current-access-r2-v1' || value.actor?.userId !== actor.userId || value.actor?.sessionGeneration !== actor.sessionGeneration
      || value.resourceId !== resourceId || value.grantId !== grantId || !Number.isFinite(value.validUntilMs)
      || value.validUntilMs <= now() || value.validUntilMs > now() + 5000) fail('paid_video_r2_current_access_required');
    for (const field of ['receiptId', 'originalTransactionId', 'customerId', 'projectId']) {
      if (typeof value[field] !== 'string' || value[field].length < 1 || value[field].length > 512) fail('paid_video_r2_current_access_required');
    }
    validateR2Object(value.object, true);
    if ('scv1_resource_' + keyPattern.exec(value.object.objectKey)[2] !== resourceId) fail('paid_video_r2_current_access_required');
  };
  const before = structuredClone(await authorize(request)); validate(before);
  const range = boundedR2Range(rangeHeader, before.object.expectedByteLength), deadline = before.validUntilMs;
  const bytes = await transport.readRange(before.object, range, deadline);
  const after = await authorize(request); validate(after);
  if (tuple(after.object) !== tuple(before.object) || ['receiptId', 'originalTransactionId', 'customerId', 'projectId'].some(key => before[key] !== after[key])
    || now() >= deadline) fail('paid_video_r2_authority_changed');
  return new Response(bytes, { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length),
    'Content-Range': `bytes ${range.start}-${range.end}/${before.object.expectedByteLength}`, 'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Vary: 'Authorization, Range',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
}
