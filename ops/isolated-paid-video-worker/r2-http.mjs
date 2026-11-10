import { validateR2Object } from './r2-native.mjs';
import { readR2Bytes, r2Digest, r2Exact, r2Fail, r2Hash, r2ObjectTuple, r2Snapshot, r2Uuid, r2Within, validateR2GatewayToken } from './r2-protocol.mjs';

export async function readR2Json(response, maximum, deadline, now = Date.now) {
  if (!response.body || !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(response.headers.get('content-type') ?? '')) r2Fail('paid_video_r2_response_invalid');
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try {
    for (;;) {
      const part = await r2Within(() => reader.read(), deadline, now); if (part.done) break;
      length += part.value.length; if (length > maximum) r2Fail('paid_video_r2_response_invalid'); chunks.push(part.value);
    }
    if (now() >= deadline) r2Fail('paid_video_r2_deadline_expired');
    const output = new Uint8Array(length); let position = 0;
    for (const part of chunks) { output.set(part, position); position += part.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(output));
  } finally { void reader.cancel().catch(() => {}); }
}

export function validateR2GatewayConfiguration(config) {
  if (!r2Exact(config, ['origin', 'routeId', 'bucket', 'profileId', 'qualificationSha256', 'keyId'])
    || ![config.routeId, config.profileId, config.keyId].every(r2Uuid) || !r2Hash(config.qualificationSha256)
    || typeof config.bucket !== 'string' || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u.test(config.bucket)) r2Fail('paid_video_r2_client_config_invalid');
  const origin = new URL(config.origin);
  if (origin.protocol !== 'https:' || origin.origin !== config.origin || origin.username || origin.password) r2Fail('paid_video_r2_client_config_invalid');
  return r2Snapshot(config);
}

export function createR2GatewayClient(input, { request = fetch, now = Date.now } = {}) {
  const config = validateR2GatewayConfiguration(input);
  const admit = envelope => {
    if (!r2Exact(envelope, ['raw', 'signature']) || typeof envelope.raw !== 'string' || envelope.raw.length > 8192
      || !r2Hash(envelope.signature)) r2Fail('paid_video_r2_admission_invalid');
    const token = r2Snapshot(validateR2GatewayToken(JSON.parse(envelope.raw), now()));
    if (token.keyId !== config.keyId || token.profileId !== config.profileId || token.qualificationSha256 !== config.qualificationSha256
      || token.object.bucket !== config.bucket || token.object.routeId !== config.routeId) r2Fail('paid_video_r2_admission_invalid');
    return token;
  };
  return Object.freeze({
    parseAdmission: admit,
    async execute(envelope, bytes, deadline) {
      const token = admit(envelope), limit = Math.min(deadline, token.expiresAtMs), upload = token.operation === 'upload';
      if (upload && (!(bytes instanceof Uint8Array) || bytes.length !== token.object.expectedByteLength)
        || !upload && bytes !== null) r2Fail('paid_video_r2_body_invalid');
      const response = await r2Within(() => request(`${config.origin}/scpv-r2-gateway-v1/${token.operation}/${token.bindingId}`, {
        method: upload ? 'PUT' : 'GET', redirect: 'error', signal: AbortSignal.timeout(Math.max(1, Math.ceil(limit - now()))),
        headers: { authorization: 'R2-HMAC ' + envelope.signature, 'x-chillywood-r2-token': envelope.raw,
          ...(upload ? { 'content-type': 'video/mp4', 'content-length': String(bytes.length) } : {}) }, ...(upload ? { body: bytes } : {}),
      }), limit, now, value => { void value?.body?.cancel().catch(() => {}); });
      if (response.status !== (token.operation === 'range' ? 206 : 200)) { void response.body?.cancel(); r2Fail('paid_video_r2_gateway_unavailable'); }
      if (upload || token.operation === 'probe') return await readR2Json(response, 16384, limit, now);
      const identity = JSON.parse(response.headers.get('x-chillywood-r2-identity') ?? 'null');
      validateR2Object({ ...token.object, identity }, true);
      const length = token.operation === 'range' ? token.range.end - token.range.start + 1 : token.object.expectedByteLength;
      if (r2ObjectTuple({ ...token.object, identity }) !== r2ObjectTuple(token.object)
        || response.headers.get('content-type') !== 'video/mp4' || response.headers.has('content-encoding')
        || response.headers.get('content-length') !== String(length)
        || (token.operation === 'range' && response.headers.get('content-range') !== `bytes ${token.range.start}-${token.range.end}/${token.object.expectedByteLength}`)
        || (token.operation === 'scan' && response.headers.has('content-range'))) { void response.body?.cancel(); r2Fail('paid_video_r2_response_invalid'); }
      const output = await readR2Bytes(response.body, length, limit, now);
      if (token.operation === 'scan' && await r2Digest(output) !== token.object.expectedSha256) r2Fail('paid_video_r2_bytes_mismatch');
      if (now() >= limit) r2Fail('paid_video_r2_deadline_expired');
      return { bytes: output, identity };
    },
  });
}
