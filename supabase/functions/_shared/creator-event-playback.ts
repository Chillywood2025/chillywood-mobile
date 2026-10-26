// Watch-only event capability. Purchase/session/source authority is re-read for
// every playlist and media request; a signed URL alone is never an entitlement.
type EventSource = { allowed?: unknown; reason?: unknown; creatorEventId?: unknown; broadcastId?: unknown; recordId?: unknown; sourceUrl?: unknown; kind?: unknown };
type Dependencies = {
  secret: string;
  authenticate: (request: Request) => Promise<{ userId: string; sessionGeneration: string } | null>;
  readSource: (eventId: string, userId: string, sessionId: string) => Promise<EventSource | null>;
  fetchSource: (url: string) => Promise<Response>;
  now?: () => number;
};
type Capability = { scope: 'creator-event'; eventId: string; broadcastId: string; recordId: string; sourceHash: string; userId: string; sessionGeneration: string; exp: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const encoder = new TextEncoder();
const hashSource = async (source: string) => encode(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(source))));
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const decode = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')), c => c.charCodeAt(0));
const key = (secret: string) => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
const mediaKey = async (secret: string) => crypto.subtle.importKey('raw',
  await crypto.subtle.digest('SHA-256', encoder.encode(`creator-event-media:${secret}`)), 'AES-GCM', false, ['encrypt', 'decrypt']);
const referenceContext = (capability: Capability) => encoder.encode(JSON.stringify(capability));
async function sealReference(reference: string, capability: Capability, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: referenceContext(capability) },
    await mediaKey(secret), encoder.encode(reference)));
  return `${encode(iv)}.${encode(ciphertext)}`;
}
async function openReference(reference: string, capability: Capability, secret: string) {
  try {
    const parts = reference.split('.');
    if (parts.length !== 2 || reference.length > 3000) return null;
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(parts[0]), additionalData: referenceContext(capability) },
      await mediaKey(secret), decode(parts[1])));
  } catch { return null; }
}
const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, 'Content-Type': 'application/json' } });
const denied = (reason = 'event_access_unavailable', status = 403) => json(status, { allowed: false, canRenderPlayback: false, playbackUrl: null, reason });
const sourceUrl = (source: EventSource | null, eventId: string) => {
  if (source?.allowed !== true || source.creatorEventId !== eventId || typeof source.broadcastId !== 'string'
    || !UUID.test(source.broadcastId) || typeof source.recordId !== 'string' || !UUID.test(source.recordId)
    || (source.kind !== 'live' && source.kind !== 'replay') || typeof source.sourceUrl !== 'string') return null;
  try {
    const url = new URL(source.sourceUrl);
    return url.protocol === 'https:' && !url.username && !url.password && url.pathname.endsWith('.m3u8') ? url : null;
  } catch { return null; }
};
const mediaUrl = (root: URL, relative: string, base = root) => {
  if (!relative || relative.length > 1500 || /[\u0000-\u001f\u007f\\]/u.test(relative)) return null;
  try {
    const url = new URL(relative, base);
    const directory = root.pathname.slice(0, root.pathname.lastIndexOf('/') + 1);
    // Decode before checking traversal so encoded dot/slash variants cannot
    // escape the exact provider output directory.
    const path = decodeURIComponent(url.pathname);
    if (path.split('/').some(part => part === '..' || part === '.') || path.includes('\\')) return null;
    return url.origin === root.origin && path.startsWith(decodeURIComponent(directory)) && !url.username && !url.password ? url : null;
  } catch { return null; }
};

async function sign(capability: Capability, secret: string) {
  const body = encode(encoder.encode(JSON.stringify(capability)));
  return `${body}.${encode(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(body))))}`;
}
async function verify(token: string, eventId: string, secret: string, now: number): Promise<Capability | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2 || token.length > 1500) return null;
    if (!(await crypto.subtle.verify('HMAC', await key(secret), decode(parts[1]), encoder.encode(parts[0])))) return null;
    const value = JSON.parse(new TextDecoder().decode(decode(parts[0]))) as Capability;
    return value.scope === 'creator-event' && value.eventId === eventId && UUID.test(value.broadcastId) && UUID.test(value.recordId)
      && typeof value.sourceHash === 'string' && /^[a-zA-Z0-9_-]{43}$/.test(value.sourceHash)
      && UUID.test(value.userId) && UUID.test(value.sessionGeneration) && Number.isSafeInteger(value.exp)
      && value.exp > now && value.exp <= now + 300_000 ? value : null;
  } catch { return null; }
}

export async function handleCreatorEventPlayback(request: Request, dependencies: Dependencies, payload?: Record<string, unknown>): Promise<Response | null> {
  const url = new URL(request.url);
  const marker = '/functions/v1/spectator-playback';
  const markerIndex = url.pathname.indexOf(marker);
  const base = markerIndex >= 0 ? url.pathname.slice(0, markerIndex + marker.length) : '/functions/v1/spectator-playback';
  const route = url.pathname.slice(base.length).split('/').filter(Boolean);
  const state = request.method === 'POST' && payload?.mode === 'event_state';
  if (!state && !(request.method === 'GET' && route[0] === 'events')) return null;
  const eventId = String(state ? payload?.creatorEventId ?? '' : route[1] ?? '');
  if (!UUID.test(eventId) || !dependencies.secret) return denied('event_request_invalid', 400);
  const now = (dependencies.now ?? Date.now)();
  let capability: Capability;
  if (state) {
    const actor = await dependencies.authenticate(request);
    if (!actor || !UUID.test(actor.userId) || !UUID.test(actor.sessionGeneration)) return denied('session_authority_not_current');
    const source = await dependencies.readSource(eventId, actor.userId, actor.sessionGeneration);
    if (!sourceUrl(source, eventId)) return denied(typeof source?.reason === 'string' ? source.reason : 'playback_not_ready');
    capability = { scope: 'creator-event', eventId, broadcastId: source!.broadcastId as string,
      recordId: source!.recordId as string, sourceHash: await hashSource(source!.sourceUrl as string), ...actor, exp: now + 300_000 };
    const token = await sign(capability, dependencies.secret);
    return json(200, { allowed: true, canRenderPlayback: true, creatorEventId: eventId, kind: source!.kind,
      playbackIdentity: await hashSource(`${eventId}:${capability.broadcastId}:${capability.recordId}:${capability.sourceHash}:${source!.kind}`),
      playbackUrl: `${url.origin}${base}/events/${eventId}/index.m3u8?eventToken=${encodeURIComponent(token)}`,
      expiresAt: new Date(capability.exp).toISOString(), rawHlsUrlReturned: false, fullRoomTokenForSpectators: false });
  }
  const verified = await verify(url.searchParams.get('eventToken') ?? '', eventId, dependencies.secret, now);
  if (!verified) return denied('playback_capability_expired');
  capability = verified;
  const source = await dependencies.readSource(eventId, capability.userId, capability.sessionGeneration);
  const root = sourceUrl(source, eventId);
  if (!root || source?.broadcastId !== capability.broadcastId || source.recordId !== capability.recordId
    || await hashSource(source.sourceUrl as string) !== capability.sourceHash) return denied('event_access_changed');
  const reference = route.length === 3 && route[2] === 'media'
    ? await openReference(url.searchParams.get('ref') ?? '', capability, dependencies.secret) : null;
  const target = route.length === 3 && route[2] === 'index.m3u8' ? root
    : reference ? mediaUrl(root, reference) : null;
  if (!target) return denied('invalid_media_path', 400);
  const response = await dependencies.fetchSource(target.toString());
  if (!response.ok) { await response.body?.cancel(); return denied('playback_source_unavailable', 502); }
  const type = response.headers.get('Content-Type') ?? '';
  if (target.pathname.endsWith('.m3u8') || /mpegurl/i.test(type)) {
    const proxy = async (reference: string) => {
      const next = mediaUrl(root, reference, target);
      if (!next) throw new Error('event_playlist_reference_invalid');
      // References are encrypted and bound to this exact capability. Neither
      // provider origins/object keys nor signed query credentials reach buyers.
      const sealed = await sealReference(next.toString(), capability, dependencies.secret);
      return `${url.origin}${base}/events/${eventId}/media?ref=${encodeURIComponent(sealed)}&eventToken=${encodeURIComponent(url.searchParams.get('eventToken')!)}`;
    };
    try {
      const lines = (await response.text()).split(/\r?\n/);
      const rewritten: string[] = [];
      for (let line of lines) {
        const text = line.trim();
        if (!text) { rewritten.push(line); continue; }
        if (!text.startsWith('#')) { rewritten.push(await proxy(text)); continue; }
        // Steering JSON can contain further URLs outside the HLS URI grammar.
        // This lane does not hand those unprotected instructions to the player.
        if (text.startsWith('#EXT-X-CONTENT-STEERING')) throw new Error('unsupported_event_playlist');
        for (const match of [...line.matchAll(/URI="([^"]+)"/g)]) line = line.replace(match[0], `URI="${await proxy(match[1])}"`);
        rewritten.push(line);
      }
      return new Response(rewritten.join('\n'), { status: 200, headers: { ...HEADERS, 'Content-Type': 'application/vnd.apple.mpegurl' } });
    } catch { return denied('playback_playlist_invalid', 502); }
  }
  return new Response(response.body, { status: 200, headers: { ...HEADERS, 'Content-Type': type || 'application/octet-stream' } });
}
