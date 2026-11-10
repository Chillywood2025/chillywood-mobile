import { boundedR2Range, validateR2Object } from './r2-native.mjs';
import { r2Exact, r2Fail, r2ObjectTuple, r2Snapshot, r2Uuid, r2Within } from './r2-protocol.mjs';

// Native allocation is deliberately not Test Store customer authority.
export async function deliverNativeR2Range({ actor: inputActor, resourceId, grantId, rangeHeader, authorize, transport, now = Date.now }) {
  const actor = r2Snapshot(inputActor), request = r2Snapshot({ actor, resourceId, grantId }), started = now();
  if (!r2Exact(actor, ['userId', 'sessionGeneration']) || !r2Uuid(actor.userId) || !r2Uuid(actor.sessionGeneration)
    || typeof authorize !== 'function') r2Fail('paid_video_r2_current_access_required');
  const validate = value => {
    if (!r2Exact(value, ['protocol', 'actor', 'resourceId', 'grantId', 'receiptId', 'originalTransactionId', 'allocationId', 'projectId', 'validUntilMs', 'object'])
      || value.protocol !== 'nssv1-current-access-r2-v1' || !r2Exact(value.actor, ['userId', 'sessionGeneration'])
      || value.actor.userId !== actor.userId || value.actor.sessionGeneration !== actor.sessionGeneration
      || value.resourceId !== resourceId || value.grantId !== grantId || !Number.isSafeInteger(value.validUntilMs)
      || value.validUntilMs <= now() || value.validUntilMs > now() + 5000) r2Fail('paid_video_r2_current_access_required');
    for (const field of ['receiptId', 'originalTransactionId', 'allocationId', 'projectId']) {
      if (typeof value[field] !== 'string' || value[field].length < 1 || value[field].length > 512) r2Fail('paid_video_r2_current_access_required');
    }
    validateR2Object(value.object, true);
    if (value.object.objectKey.split('/')[2] !== resourceId) r2Fail('paid_video_r2_current_access_required');
    return r2Snapshot(value);
  };
  const before = validate(await r2Within(() => authorize(request), started + 5000, now));
  const deadline = Math.min(started + 5000, before.validUntilMs), range = boundedR2Range(rangeHeader, before.object.expectedByteLength);
  const bytes = await r2Within(() => transport.readRange(before.object, range, deadline), deadline, now);
  if (!(bytes instanceof Uint8Array) || bytes.length !== range.end - range.start + 1) r2Fail('paid_video_r2_body_invalid');
  const after = validate(await r2Within(() => authorize(request), deadline, now));
  if (r2ObjectTuple(before.object) !== r2ObjectTuple(after.object)
    || ['receiptId', 'originalTransactionId', 'allocationId', 'projectId'].some(key => before[key] !== after[key])
    || now() >= deadline) r2Fail('paid_video_r2_authority_changed');
  return new Response(bytes, { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length),
    'Content-Range': `bytes ${range.start}-${range.end}/${before.object.expectedByteLength}`, 'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Vary: 'Authorization, Range',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
}
