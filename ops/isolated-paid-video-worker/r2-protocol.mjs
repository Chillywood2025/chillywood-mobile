import { validateR2Object } from './r2-native.mjs';

// Separate wire contract: S3 VersionId and native R2 upload identities are never
// interchangeable. All signatures cover canonical UTF-8 JSON, including route.
export const r2Exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export const r2Uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
export const r2Hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
export const r2Fail = code => { throw Error(code); };
export const r2Snapshot = value => { const copy = structuredClone(value); const freeze = item => {
  if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); } return item;
}; return freeze(copy); };
export const r2ObjectTuple = object => JSON.stringify(['provider', 'bucket', 'routeId', 'objectKey', 'incarnation', 'expectedSha256', 'expectedByteLength']
  .map(key => object[key]).concat(object.identity ? [object.identity.kind, object.identity.nativeVersion, object.identity.etag] : []));
export const r2Digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', value))].map(n => n.toString(16).padStart(2, '0')).join('');

export async function r2Within(start, deadline, now = Date.now, discard = () => {}) {
  const remaining = deadline - now();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 15000) r2Fail('paid_video_r2_deadline_invalid');
  let timer, late = false;
  const operation = Promise.resolve().then(start);
  operation.then(value => { if (late) discard(value); }, () => {});
  try { return await Promise.race([operation, new Promise((_, reject) => {
    timer = setTimeout(() => { late = true; reject(Error('paid_video_r2_deadline_expired')); }, remaining);
  })]); } finally { clearTimeout(timer); }
}

export async function readR2Bytes(body, expectedLength, deadline, now = Date.now) {
  if (!body || !Number.isSafeInteger(expectedLength) || expectedLength < 1 || expectedLength > 16777216) r2Fail('paid_video_r2_body_invalid');
  const reader = body.getReader(), bytes = new Uint8Array(expectedLength); let used = 0;
  try {
    for (;;) {
      const part = await r2Within(() => reader.read(), deadline, now);
      if (part.done) break;
      if (!(part.value instanceof Uint8Array) || used + part.value.length > bytes.length) r2Fail('paid_video_r2_body_invalid');
      bytes.set(part.value, used); used += part.value.length;
    }
    if (used !== expectedLength || now() >= deadline) r2Fail('paid_video_r2_body_invalid');
    return bytes;
  } finally { void reader.cancel().catch(() => {}); }
}

const tokenKeys = ['protocol', 'operation', 'keyId', 'profileId', 'qualificationSha256', 'bindingId', 'uploadId', 'resourceId',
  'requestId', 'configurationDigest', 'subject', 'object', 'range', 'grantId', 'issuedAtMs', 'expiresAtMs'];
export function validateR2GatewayToken(token, now = Date.now()) {
  if (!r2Exact(token, tokenKeys) || token.protocol !== 'scpv-r2-gateway-token-v1'
    || !['upload', 'probe', 'scan', 'range'].includes(token.operation)
    || !['keyId', 'profileId', 'bindingId', 'requestId'].every(key => r2Uuid(token[key]))
    || !r2Hash(token.qualificationSha256) || !r2Hash(token.configurationDigest)
    || !/^scpv_upload_[0-9a-f-]{36}$/u.test(token.uploadId) || !r2Uuid(token.uploadId.slice(12))
    || !/^scv1_resource_[0-9a-f-]{36}$/u.test(token.resourceId) || !r2Uuid(token.resourceId.slice(14))
    || !Number.isSafeInteger(token.issuedAtMs) || !Number.isSafeInteger(token.expiresAtMs)
    || token.issuedAtMs > now || token.expiresAtMs <= now || token.expiresAtMs - token.issuedAtMs > 5000
    || token.expiresAtMs <= token.issuedAtMs) r2Fail('paid_video_r2_token_invalid');
  if (token.operation === 'scan') {
    if (!r2Exact(token.subject, ['kind', 'workerId']) || token.subject.kind !== 'worker' || !r2Uuid(token.subject.workerId)) r2Fail('paid_video_r2_subject_invalid');
  } else if (!r2Exact(token.subject, ['kind', 'userId', 'sessionGeneration']) || token.subject.kind !== 'session'
    || !r2Uuid(token.subject.userId) || !r2Uuid(token.subject.sessionGeneration)) r2Fail('paid_video_r2_subject_invalid');
  validateR2Object(token.object, token.operation !== 'upload');
  if ((token.operation === 'upload' && token.object.identity !== undefined)
    || token.object.objectKey.split('/')[2] !== token.resourceId) r2Fail('paid_video_r2_token_binding_invalid');
  if (token.operation === 'range') {
    if (!r2Uuid(token.grantId) || !r2Exact(token.range, ['start', 'end']) || !Number.isSafeInteger(token.range.start) || !Number.isSafeInteger(token.range.end)
      || token.range.start < 0 || token.range.end < token.range.start || token.range.end >= token.object.expectedByteLength
      || token.range.end - token.range.start + 1 > 524288) r2Fail('paid_video_r2_range_invalid');
  } else if (token.range !== null || token.grantId !== null) r2Fail('paid_video_r2_range_invalid');
  return token;
}

async function hmacKey(key, usage) {
  if (!(key instanceof Uint8Array) || key.byteLength !== 32) r2Fail('paid_video_r2_key_invalid');
  return crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}
export async function signR2Raw(raw, key) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 16384) r2Fail('paid_video_r2_payload_invalid');
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(key, 'sign'), new TextEncoder().encode(raw)))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function verifyR2Raw(raw, signature, key) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 16384 || !r2Hash(signature)) return false;
  const bytes = Uint8Array.from(signature.match(/../gu), value => Number.parseInt(value, 16));
  return crypto.subtle.verify('HMAC', await hmacKey(key, 'verify'), bytes, new TextEncoder().encode(raw));
}
export async function signR2GatewayToken(token, key, now = Date.now()) {
  validateR2GatewayToken(token, now); const raw = JSON.stringify(token);
  return { raw, signature: await signR2Raw(raw, key) };
}
