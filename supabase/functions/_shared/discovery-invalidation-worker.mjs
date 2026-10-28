// No phone-push/payment calls, content reads or activation. Each database call
// atomically owns its claims, Broadcast inserts and exact completion records.
const reply = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export function createDiscoveryInvalidationHandler({ adminClient, deadlineMs = 10_000 }) {
  const rpc = async (name, args) => {
    const controller = new AbortController();
    let timer;
    try {
      const request = adminClient.rpc(name, args);
      const response = await Promise.race([
        typeof request.abortSignal === 'function' ? request.abortSignal(controller.signal) : request,
        new Promise((_, reject) => { timer = setTimeout(() => {
          controller.abort(); reject(new Error('discovery_worker_deadline'));
        }, deadlineMs); }),
      ]);
      if (response.error) throw new Error('discovery_worker_storage');
      return response.data;
    } finally { clearTimeout(timer); }
  };
  return async request => {
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    const token = request.headers.get('x-chillywood-discovery-token');
    if (!token || token.length < 32 || token.length > 256) return reply(401, { error: 'unauthorized' });
    try {
      if (await rpc('authorize_discovery_invalidation_worker', { p_token: token }) !== true) {
        return reply(401, { error: 'unauthorized' });
      }
      // Ignore caller-supplied batch sizes/scopes. An invocation is one batch,
      // never an unbounded drain loop or permission to activate the worker.
      const result = await rpc('flush_discovery_invalidations', { p_limit: 100 });
      if (!result || typeof result.enabled !== 'boolean'
        || !['claimed', 'completed', 'failed', 'superseded', 'topics', 'deferred'].every(key =>
          Number.isInteger(result[key]) && result[key] >= 0 && result[key] <= 100)) {
        throw new Error('discovery_worker_invalid_result');
      }
      return reply(200, Object.fromEntries(['enabled', 'claimed', 'completed', 'failed', 'superseded', 'topics', 'deferred'].map(key => [key, result[key]])));
    } catch {
      // A timed-out response is unknown, not a failed delivery. A later worker
      // reads durable state; it never replays an externally cached claimed batch.
      return reply(503, { error: 'discovery_worker_unavailable' });
    }
  };
}
