import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { validateObjectBinding } from './private-object.mjs';

const fail = code => { throw new Error(code); };
const tuple = object => ['provider', 'bucket', 'routeId', 'objectKey', 'incarnation', 'expectedSha256', 'expectedByteLength'].map(key => object?.[key]);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

// actor comes from the gateway's authenticated JWT, never from request JSON.
// authorize calls the private upload RPC. A qualified caller must never route
// this function before binding its actual JWT to the expected Auth session.
export async function transferReservedUpload({ request, actor, uploadId, requestId, authorize, transport, now = Date.now }) {
  if (!(request instanceof Request) || request.method !== 'PUT' || request.headers.get('content-type') !== 'video/mp4'
    || !uuid.test(requestId) || !uuid.test(actor?.userId) || !uuid.test(actor?.sessionGeneration)
    || !/^scpv_upload_[a-f0-9-]{36}$/u.test(uploadId)) fail('paid_video_transfer_request_invalid');
  const context = Object.freeze({ actor, uploadId, requestId });
  const issued = structuredClone(await authorize({ ...context, action: 'issue', transferId: null }));
  if (issued?.protocol === 'scpv-upload-admission-v1' && issued.state === 'unknown' && issued.dispatchAllowed === false)
    return { state: 'unknown', uploadId, requestId };
  const validate = value => {
    if (value?.protocol !== 'scpv-upload-admission-v1' || value.state !== 'leased' || value.dispatchAllowed !== true
      || !uuid.test(value.transferId) || value.actor?.userId !== actor.userId || value.actor?.sessionGeneration !== actor.sessionGeneration
      || value.uploadId !== uploadId || value.requestId !== requestId || !Number.isFinite(value.validUntilMs)
      || value.validUntilMs <= now() || value.validUntilMs > now() + 5000) fail('paid_video_upload_authority_invalid');
    validateObjectBinding(value.object);
    if (value.object.objectVersion !== undefined) fail('paid_video_upload_authority_invalid');
  };
  validate(issued);
  const length = issued.object.expectedByteLength;
  if (request.headers.get('content-length') !== String(length) || !request.body) fail('paid_video_transfer_length_invalid');
  const reader = request.body.getReader(), chunks = []; let count = 0;
  try {
    while (true) {
      const remaining = issued.validUntilMs - now(); if (remaining <= 0) fail('paid_video_upload_body_deadline');
      let timer;
      const result = await Promise.race([reader.read(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('paid_video_upload_body_deadline')), remaining); })])
        .finally(() => clearTimeout(timer));
      if (result.done) break;
      count += result.value.length; if (count > length) fail('paid_video_transfer_length_invalid'); chunks.push(result.value);
    }
    if (count !== length) fail('paid_video_transfer_length_invalid');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  if (createHash('sha256').update(bytes).digest('hex') !== issued.object.expectedSha256) fail('paid_video_upload_bytes_mismatch');
  const before = await authorize({ ...context, action: 'check', transferId: issued.transferId }); validate(before);
  if (before.transferId !== issued.transferId || JSON.stringify(tuple(before.object)) !== JSON.stringify(tuple(issued.object))) fail('paid_video_upload_authority_changed');
  const result = await transport.writeOnce(before.object, bytes, before.validUntilMs);
  // Once PUT was attempted, an unavailable/changed post-check is ambiguous.
  // Never claim success, delete the object, retry, or create another key.
  try {
    const after = await authorize({ ...context, action: 'check', transferId: issued.transferId }); validate(after);
    if (after.transferId !== issued.transferId || JSON.stringify(tuple(after.object)) !== JSON.stringify(tuple(issued.object))) fail('paid_video_upload_authority_changed');
  } catch { return { state: 'unknown', uploadId, requestId }; }
  return { state: result.state, uploadId, requestId };
}
