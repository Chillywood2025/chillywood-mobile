import assert from 'node:assert/strict';
import {validateObjectBinding,boundedRange} from './private-object.mjs';
const fail=code=>{throw Error(code);};
// Native allocation protocol only. Existing Test Store V3 adapter is unchanged.
export async function deliverNativeBoundedRange({ actor: inputActor, resourceId, grantId, rangeHeader, authorize, transport, now = Date.now }) {
  const actor=Object.freeze({...inputActor}),protocol='nssv1-current-access-v1',identityKey='allocationId';
  assert.equal(typeof authorize, 'function');
  const request = Object.freeze({ actor, resourceId, grantId });
  const before = structuredClone(await authorize(request));
  if (before?.protocol !== protocol || before.actor?.userId !== actor.userId
    || before.actor?.sessionGeneration !== actor.sessionGeneration || before.resourceId !== resourceId || before.grantId !== grantId
    || !Number.isFinite(before.validUntilMs) || before.validUntilMs <= now() || before.validUntilMs > now() + 5000)
    fail('paid_video_current_access_required');
  for (const field of ['receiptId', 'originalTransactionId', identityKey, 'projectId']) {
    if (typeof before[field] !== 'string' || before[field].length < 1 || before[field].length > 512) fail('paid_video_current_access_required');
  }
  const binding = validateObjectBinding(before.object), range = boundedRange(rangeHeader, binding.expectedByteLength);
  if (binding.objectKey.split('/')[2] !== resourceId) fail('paid_video_current_access_required');
  const deadline = Math.min(before.validUntilMs, now() + 5000);
  const bytes = await transport.readRange(binding, range, deadline);
  const after = await authorize(request);
  if (!after || after.protocol !== before.protocol || after.actor?.userId !== actor.userId || after.actor?.sessionGeneration !== actor.sessionGeneration
    || after.resourceId !== resourceId || after.grantId !== grantId
    || ['provider', 'bucket', 'routeId', 'objectKey', 'incarnation', 'expectedSha256', 'expectedByteLength', 'objectVersion'].some(key => after.object?.[key] !== before.object[key])
    || after.receiptId !== before.receiptId || after.originalTransactionId !== before.originalTransactionId
    || after[identityKey] !== before[identityKey] || after.projectId !== before.projectId
    || !Number.isFinite(after.validUntilMs) || after.validUntilMs <= now() || now() >= deadline)
    fail('paid_video_authority_changed');
  return new Response(bytes, { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length),
    'Content-Range': `bytes ${range.start}-${range.end}/${binding.expectedByteLength}`, 'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Vary: 'Authorization, Range',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
}
