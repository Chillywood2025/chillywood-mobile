// Exact-issued capability authentication precedes every status-only upgrade.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const STATUSES = new Set(['ringing', 'accepted', 'canceled', 'declined', 'missed', 'ended']);
const ID_FIELDS = ['observerId', 'inviteId', 'threadId', 'callUuid', 'recipientUserId',
  'recipientAccountId', 'recipientSessionGeneration'];

export function validSnapshot(value, observerId) {
  return value && typeof value === 'object' && ID_FIELDS.every(key => UUID.test(value[key])) &&
    value.observerId.toLowerCase() === observerId &&
    value.callUuid.toLowerCase() === value.inviteId.toLowerCase() &&
    value.recipientAccountId.toLowerCase() === value.recipientUserId.toLowerCase() &&
    typeof value.recipientInstallId === 'string' && value.recipientInstallId.length > 0 &&
    value.recipientInstallId.length <= 256 && ['voice', 'video'].includes(value.callType) &&
    typeof value.expiresAt === 'string' && Number.isFinite(Date.parse(value.expiresAt)) &&
    STATUSES.has(value.status);
}

// Same length-prefixed UTF-8 format is used locally by the native observer.
// The request carries only this digest, not the account/session/install fields.
export async function snapshotBinding(value, sha256) {
  const values = [...ID_FIELDS.map(key => value[key].toLowerCase()), value.recipientInstallId,
    value.callType, String(Date.parse(value.expiresAt))];
  return sha256(values.map(part => `${new TextEncoder().encode(part).length}:${part}`).join(''));
}

export function createNativeCallStateHandler({rpc, upgradeWebSocket, keepAlive, sha256,
  now = Date.now, monotonic = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout}) {
  const denied = (status = 403) => new Response(null, {status, headers: {'Cache-Control': 'no-store'}});
  async function boundedRpc(name, args, signal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, {once: true});
    let timer;
    try {
      if (signal?.aborted) throw new Error('retired');
      return await Promise.race([
        Promise.resolve().then(() => rpc(name, args, controller.signal)),
        new Promise((_, reject) => {timer = setTimer(() => {controller.abort(); reject(new Error('timeout'));}, 2000);}),
        new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('aborted')), {once: true})),
      ]);
    } finally {clearTimer(timer); signal?.removeEventListener('abort', abort);}
  }
  return async function handle(req) {
    const url = new URL(req.url);
    if (req.method !== 'GET' || req.headers.get('upgrade')?.toLowerCase() !== 'websocket' || url.search ||
        !['/functions/v1/ios-native-call-state', '/ios-native-call-state'].includes(url.pathname)) return denied(400);
    const observerId = req.headers.get('x-chilly-call-observer')?.toLowerCase();
    const connectionId = req.headers.get('x-chilly-call-connection')?.toLowerCase();
    const nativeGeneration = req.headers.get('x-chilly-call-generation')?.toLowerCase();
    const secret = req.headers.get('x-chilly-call-capability');
    const expectedBinding = req.headers.get('x-chilly-call-binding');
    if (!UUID.test(observerId || '') || !UUID.test(connectionId || '') || !UUID.test(nativeGeneration || '') ||
        !/^[A-Za-z0-9_-]{43}$/.test(secret || '') || !HASH.test(expectedBinding || '')) return denied();
    const args = {p_issuance_id: observerId, p_capability_hash: await sha256(secret),
      p_connection_id: connectionId, p_native_generation: nativeGeneration};
    let initial;
    try {initial = await boundedRpc('whole_app_claim_ios_call_state_observer', args, req.signal);} catch {return denied(503);}
    if (!validSnapshot(initial, observerId) || await snapshotBinding(initial, sha256) !== expectedBinding) return denied();
    const expiry = Date.parse(initial.expiresAt);
    const remaining = Math.min(300000, expiry - now());
    if (!(remaining > 0) || req.signal.aborted) return denied();
    const monotonicDeadline = monotonic() + remaining;
    let socket, response;
    try {({socket, response} = upgradeWebSocket(req, {idleTimeout: 0}));} catch {return denied(400);}
    let retired = false, timer, deadlineTimer, openTimer, sequence = 0, failures = 0;
    const lifetime = new AbortController();
    let resolveClosed;
    const closed = new Promise(resolve => {resolveClosed = resolve;});
    const stop = () => {
      if (retired) return;
      retired = true; lifetime.abort(); clearTimer(timer); clearTimer(deadlineTimer); clearTimer(openTimer);
      try {socket.close(1000, 'observer_closed');} catch { /* A failed transport cannot become a call action. */ }
      resolveClosed();
    };
    const eligible = () => !retired && monotonic() < monotonicDeadline && now() < expiry;
    async function tick() {
      if (!eligible()) {stop(); return;}
      try {
        const current = await boundedRpc('whole_app_read_ios_call_state_observer', args, lifetime.signal);
        if (!eligible()) {stop(); return;}
        if (!validSnapshot(current, observerId) || await snapshotBinding(current, sha256) !== expectedBinding) {stop(); return;}
        if (!eligible()) {stop(); return;}
        // Only this closed five-field status frame crosses back to the device.
        // No raw capabilities, account/session/install/thread IDs, UUID, or errors.
        socket.send(JSON.stringify({observerId, connectionId, nativeGeneration, sequence: ++sequence, status: current.status}));
        failures = 0;
        if (current.status !== 'ringing') {stop(); return;}
      } catch {
        if (++failures >= 3 || !eligible()) {stop(); return;}
      }
      if (eligible()) timer = setTimer(tick, 1000); else stop();
    }
    socket.onopen = () => {clearTimer(openTimer); if (eligible()) void tick(); else stop();};
    socket.onmessage = stop; // This endpoint accepts no commands or arbitrary payloads.
    socket.onclose = stop; socket.onerror = stop;
    deadlineTimer = setTimer(stop, remaining);
    openTimer = setTimer(stop, Math.min(8000, remaining));
    try {keepAlive(closed);} catch {stop(); return denied(503);}
    return response;
  };
}
