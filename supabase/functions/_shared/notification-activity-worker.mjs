import { buildPlatformExpoPushMessage, IOS_NOTIFICATION_CATEGORIES } from './notification-payload.mjs';

const reply = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const knownErrors = new Set(['DeviceNotRegistered', 'MessageTooBig', 'MessageRateExceeded', 'InvalidCredentials']);

// Covers both fetch and response-body consumption, including an implementation
// that ignores abort. A timeout after reservation is an unknown delivery.
export async function withActivityDeadline(operation, milliseconds = 5_000) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('activity_deadline')); }, milliseconds);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function sendActivityPush(reservation, { fetchImpl = fetch, deadlineMs = 5_000 } = {}) {
  try {
    return await withActivityDeadline(async (signal) => {
      const payload = buildPlatformExpoPushMessage({
        to: reservation.token, platform: reservation.platform,
        title: reservation.title, body: reservation.body, data: reservation.data,
        badge: reservation.badge, androidChannelId: 'default',
        ttl: reservation.ttl,
        categoryId: IOS_NOTIFICATION_CATEGORIES.activity,
      });
      const response = await fetchImpl('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload), signal,
      });
      // An HTTP error alone does not establish whether a provider accepted work.
      if (!response.ok) return { status: 'unknown', errorCode: 'provider_http_error' };
      const body = await response.json();
      const ticket = Array.isArray(body?.data) ? body.data[0] : body?.data;
      if (ticket?.status === 'ok' && typeof ticket.id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(ticket.id)) {
        return { status: 'sent', providerMessageId: ticket.id };
      }
      const code = ticket?.details?.error;
      if (ticket?.status === 'error' && knownErrors.has(code)) return { status: 'failed', errorCode: code };
      return { status: 'unknown', errorCode: 'provider_result_unknown' };
    }, deadlineMs);
  } catch { return { status: 'unknown', errorCode: 'provider_result_unknown' }; }
}

export function createNotificationActivityHandler({ adminClient, fetchImpl = fetch, now = Date.now, deadlineMs = 5_000 }) {
  const rpc = async (name, args) => {
    const result = await withActivityDeadline(() => adminClient.rpc(name, args), deadlineMs);
    if (result.error) throw new Error('activity_storage_error');
    return result.data;
  };
  return async (request) => {
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    const credential = request.headers.get('x-chillywood-activity-token');
    if (!credential || credential.length > 256) return reply(401, { error: 'unauthorized' });
    try {
      if (await rpc('authorize_notification_activity_worker', { p_token: credential }) !== true) {
        return reply(401, { error: 'unauthorized' });
      }
      const started = now();
      const claims = await rpc('claim_notification_activity_batch', { p_limit: 10 });
      if (!Array.isArray(claims)) throw new Error('invalid_claim_result');
      let completed = 0;
      let unresolved = 0;
      let accepted = 0;
      for (const claim of claims.slice(0, 10)) {
        if (now() - started > 55_000) break;
        const fence = { p_event_id: claim.eventId, p_lease_token: claim.leaseToken };
        try {
          const plan = await rpc('prepare_notification_activity', fence);
          if (plan?.eligible !== true) continue;
          const tokens = Array.isArray(plan.tokenIds) ? [...new Set(plan.tokenIds)].slice(0, 10) : [];
          for (let i = 0; i < tokens.length; i += 5) {
            if (now() - started > 55_000) throw new Error('worker_budget');
            const outcomes = await Promise.allSettled(tokens.slice(i, i + 5).map(async (tokenId) => {
              const exact = { ...fence, p_push_token_id: tokenId };
              const reservation = await rpc('reserve_notification_activity_push', exact);
              if (reservation?.eligible !== true) return;
              const outcome = await sendActivityPush(reservation, { fetchImpl, deadlineMs });
              const saved = await rpc('complete_notification_activity_push', {
                ...exact, p_status: outcome.status,
                p_provider_message_id: outcome.providerMessageId ?? null,
                p_error_code: outcome.errorCode ?? null,
              });
              if (saved !== true) throw new Error('completion_unconfirmed');
              if (outcome.status === 'sent') accepted += 1;
              else unresolved += 1;
            }));
            if (outcomes.some((outcome) => outcome.status === 'rejected')) throw new Error('token_work_unconfirmed');
          }
          if (await rpc('finish_notification_activity', fence) === true) completed += 1;
        } catch {
          // Unreserved tokens can retry after the lease. Reserved tokens cannot.
          // Other recipients still receive their independently fenced work.
          unresolved += 1;
        }
      }
      return reply(200, { status: unresolved ? 'review_or_retry_pending' : 'ok', completed, accepted, unresolved });
    } catch { return reply(503, { error: 'activity_worker_unavailable' }); }
  };
}
