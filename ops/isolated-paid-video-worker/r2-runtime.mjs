import { createPrivateR2Gateway } from './r2-gateway.mjs';
import { readR2Json } from './r2-http.mjs';
import { r2Within } from './r2-protocol.mjs';
import { r2IsolateAdmission } from './r2-admission.mjs';

// Source-only entrypoint. No account/bucket provisioning, credential discovery,
// permissive CORS, public object URL, broad service-role fallback or deployment.
// The dedicated RPC token may invoke only native_paid_video_r2_gateway_v1.
export function createR2WorkerRuntime(environment, context, { request = fetch, now = Date.now } = {}) {
  const unavailable = async () => Response.json({ protocol: 'scpv-r2-gateway-v1', state: 'unavailable' },
    { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  if (environment.PAID_VIDEO_R2_GATEWAY_V1_ENABLED !== 'true') return unavailable;
  try {
    const value = name => { if (typeof environment[name] !== 'string' || !environment[name]) throw Error('configuration_missing'); return environment[name]; };
    const key = name => { const text = value(name); if (!/^[a-f0-9]{64}$/u.test(text)) throw Error('key_invalid'); return Uint8Array.from(text.match(/../gu), part => Number.parseInt(part, 16)); };
    const base = new URL(value('PAID_VIDEO_R2_AUTHORITY_ORIGIN'));
    if (base.protocol !== 'https:' || base.origin !== value('PAID_VIDEO_R2_AUTHORITY_ORIGIN') || base.username || base.password) throw Error('origin_invalid');
    const rpcToken = value('PAID_VIDEO_R2_GATEWAY_RPC_TOKEN'), apiKey = value('PAID_VIDEO_R2_AUTHORITY_ANON_KEY');
    // Refuse an accidentally supplied broad service role token, even before an
    // operator-qualified narrow token is checked by the actual server.
    const parts = rpcToken.split('.');
    const claims = parts.length === 3 ? JSON.parse(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/'))) : null;
    if (claims?.role !== 'sbx_v1_r2_gateway' || claims.profile_id !== value('PAID_VIDEO_R2_PROFILE_ID')) throw Error('narrow_token_required');
    const media = environment.PAID_VIDEO_R2_MEDIA;
    const binding = { get: (...args) => media.get(...args), put: (...args) => {
      const pending = media.put(...args); context.waitUntil(pending.then(() => {}, () => {})); return pending;
    } };
    const authorize = async (token, { phase, outcome }) => {
      const deadline = token.expiresAtMs;
      const response = await r2Within(() => request(new URL('/rest/v1/rpc/native_paid_video_r2_gateway_v1', base), {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(Math.max(1, Math.ceil(deadline - now()))),
        headers: { 'content-type': 'application/json', apikey: apiKey, authorization: 'Bearer ' + rpcToken },
        body: JSON.stringify({ p_token: token, p_phase: phase, p_outcome: outcome }),
      }), deadline, now, value => { void value?.body?.cancel().catch(() => {}); });
      if (!response.ok) { void response.body?.cancel(); throw Error('authority_unavailable'); }
      return readR2Json(response, 16384, deadline, now);
    };
    return createPrivateR2Gateway({ enabled: true, binding, admission: r2IsolateAdmission, origin: value('PAID_VIDEO_R2_GATEWAY_ORIGIN'),
      bucket: value('PAID_VIDEO_R2_BUCKET'), routeId: value('PAID_VIDEO_R2_ROUTE_ID'), profileId: value('PAID_VIDEO_R2_PROFILE_ID'),
      qualificationSha256: value('PAID_VIDEO_R2_QUALIFICATION_SHA256'), keyId: value('PAID_VIDEO_R2_GATEWAY_KEY_ID'),
      gatewayKey: key('PAID_VIDEO_R2_GATEWAY_KEY_HEX'), verifierId: value('PAID_VIDEO_R2_VERIFIER_ID'),
      verifierKey: key('PAID_VIDEO_R2_VERIFIER_KEY_HEX'), authorize, now });
  } catch { return unavailable; }
}
export default { fetch(request, environment, context) { return createR2WorkerRuntime(environment, context)(request); } };
