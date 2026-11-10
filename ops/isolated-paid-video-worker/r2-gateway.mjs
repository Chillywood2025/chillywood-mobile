import { createPrivateR2NativeTransport, validateR2Object } from './r2-native.mjs';
import { readR2Bytes, r2Digest, r2Exact, r2Fail, r2Hash, r2ObjectTuple, r2Snapshot, r2Uuid, r2Within,
  signR2Raw, validateR2GatewayToken, verifyR2Raw } from './r2-protocol.mjs';

const headers = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', Vary: 'Authorization, Range' };
const reply = (status, value) => Response.json(value, { status, headers });
const authorityKeys = ['protocol', 'bindingId', 'profileId', 'qualificationSha256', 'authorityDigest', 'object', 'validUntilMs', 'dispatchAllowed'];

// authorize is a current service-only database boundary, not a caller boolean.
// For upload, BEFORE atomically commits the sole dispatch claim. COMMIT persists
// its returned identity. A lost claim/PUT/commit acknowledgment is permanently
// unknown for that incarnation, never permission to dispatch again.
export function createPrivateR2Gateway({ enabled = false, origin, binding, bucket, routeId, profileId, qualificationSha256,
  keyId, gatewayKey, verifierId, verifierKey, authorize, admission, now = Date.now }) {
  const unavailable = async () => reply(503, { protocol: 'scpv-r2-gateway-v1', state: 'unavailable' });
  if (enabled !== true) return unavailable;
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password
    || ![routeId, profileId, keyId, verifierId].every(r2Uuid) || !r2Hash(qualificationSha256)
    || !(gatewayKey instanceof Uint8Array) || gatewayKey.length !== 32
    || !(verifierKey instanceof Uint8Array) || verifierKey.length !== 32
    || verifierKey.every((byte, i) => byte === gatewayKey[i]) || typeof authorize !== 'function') r2Fail('paid_video_r2_gateway_config_invalid');
  const key = new Uint8Array(gatewayKey), probeKey = new Uint8Array(verifierKey);
  const transport = createPrivateR2NativeTransport({ binding, bucket, routeId }, { now });
  return async request => {
    let dispatched = false;
    try {
      const target = new URL(request.url), raw = request.headers.get('x-chillywood-r2-token'), signature = request.headers.get('authorization');
      if (target.origin !== origin || target.search || target.hash || target.username || target.password
        || typeof raw !== 'string' || raw.length > 8192 || !signature?.startsWith('R2-HMAC ')
        || !await verifyR2Raw(raw, signature.slice(8), key)) r2Fail('paid_video_r2_gateway_auth_required');
      const token = r2Snapshot(JSON.parse(raw));
      // SQL signs its exact JSONB text (including whitespace/order). Verify the
      // raw text before parsing; never reserialize before signature checking.
      validateR2GatewayToken(token, now());
      if (target.pathname !== `/scpv-r2-gateway-v1/${token.operation}/${token.bindingId}`
        || token.keyId !== keyId || token.profileId !== profileId || token.qualificationSha256 !== qualificationSha256
        || token.object.routeId !== routeId || token.object.bucket !== bucket
        || request.method !== (token.operation === 'upload' ? 'PUT' : 'GET')
        || request.headers.has('range') || request.headers.has('content-encoding')) r2Fail('paid_video_r2_gateway_binding_invalid');
      // Capacity ownership starts only after the signed route/operation and
      // headers are verified, and before reading bytes or claiming dispatch.
      if (token.operation === 'upload') {
        if (request.headers.get('content-type') !== 'video/mp4'
          || request.headers.get('content-length') !== String(token.object.expectedByteLength)) r2Fail('paid_video_r2_body_invalid');
      } else if (request.body || request.headers.has('content-length')) r2Fail('paid_video_r2_body_invalid');
      const execute = async lease => {
      const activeTransport = lease ? createPrivateR2NativeTransport({ bucket, routeId, binding: {
        get: (...args) => lease.read(binding.get(...args)), put: (...args) => lease.track(binding.put(...args)),
      } }, { now }) : transport;
      const deadline = token.expiresAtMs;
      const validateAuthority = value => {
        if (!r2Exact(value, authorityKeys) || value.protocol !== 'scpv-r2-authority-v1'
          || value.bindingId !== token.bindingId || value.profileId !== profileId || value.qualificationSha256 !== qualificationSha256
          || !r2Hash(value.authorityDigest) || typeof value.dispatchAllowed !== 'boolean'
          || !Number.isSafeInteger(value.validUntilMs) || value.validUntilMs <= now() || value.validUntilMs > now() + 5000
          || r2ObjectTuple(value.object ?? {}) !== r2ObjectTuple(token.object)) r2Fail('paid_video_r2_authority_invalid');
        validateR2Object(value.object, token.operation !== 'upload');
        return r2Snapshot(value);
      };
      const call = async (phase, outcome = null) => r2Within(() => authorize(token, { phase, outcome }), deadline, now);
      let bytes;
      if (token.operation === 'upload') {
        bytes = await readR2Bytes(lease && request.body ? lease.body(request.body) : request.body, token.object.expectedByteLength, deadline, now);
        if (await r2Digest(bytes) !== token.object.expectedSha256) r2Fail('paid_video_r2_bytes_mismatch');
        // From this call onward, even an uncertain RPC result precludes retry.
        dispatched = true;
      }
      const before = validateAuthority(await call('before'));
      if (before.dispatchAllowed !== (token.operation === 'upload')) r2Fail('paid_video_r2_dispatch_not_admitted');
      const limit = Math.min(deadline, before.validUntilMs);
      if (token.operation === 'upload') {
        const outcome = await activeTransport.writeOnce(token.object, bytes, limit);
        // Persist unknown/conflict as well. A failure here must not expose a
        // seemingly accepted identity or permit a later recovery to discover it.
        const committed = await call('commit', outcome);
        if (!r2Exact(committed, ['protocol', 'state', 'bindingId']) || committed.protocol !== 'scpv-r2-commit-v1'
          || committed.bindingId !== token.bindingId || committed.state !== outcome.state || now() >= limit) r2Fail('paid_video_r2_commit_unknown');
        return reply(200, { protocol: 'scpv-r2-transfer-v1', state: outcome.state, verificationRequired: true });
      }
      const observed = token.operation === 'range'
        ? { bytes: await activeTransport.readRange(token.object, token.range, limit), identity: token.object.identity }
        : await activeTransport.readForScan(token.object, limit);
      const after = validateAuthority(await call('after'));
      if (before.authorityDigest !== after.authorityDigest || after.dispatchAllowed || now() >= limit) r2Fail('paid_video_r2_authority_changed');
      if (token.operation === 'probe') {
        const checkedAtMs = now(), observationRaw = JSON.stringify({ protocol: 'scpv-object-observation-r2-v1', verifierId, token,
          identity: observed.identity, sha256: token.object.expectedSha256, byteLength: observed.bytes.length,
          checkedAtMs, expiresAtMs: Math.min(checkedAtMs + 30000, token.expiresAtMs) });
        const signature = await signR2Raw(observationRaw, probeKey);
        if (now() >= limit) r2Fail('paid_video_r2_deadline_expired');
        return reply(200, { protocol: 'scpv-upload-probe-r2-v1', state: 'observed', observationRaw, signature });
      }
      const outputHeaders = { ...headers, 'Content-Type': 'video/mp4', 'Content-Length': String(observed.bytes.length),
        'X-Chillywood-R2-Identity': JSON.stringify(observed.identity) };
      if (token.operation === 'range') {
        outputHeaders['Content-Range'] = `bytes ${token.range.start}-${token.range.end}/${token.object.expectedByteLength}`;
        outputHeaders['Accept-Ranges'] = 'bytes';
      }
      return new Response(observed.bytes, { status: token.operation === 'range' ? 206 : 200, headers: outputHeaders });
      };
      return await (admission ? admission.run(request, execute, unavailable) : execute(null));
    } catch {
      return reply(503, { protocol: 'scpv-r2-gateway-v1', state: dispatched ? 'unknown' : 'unavailable' });
    }
  };
}
