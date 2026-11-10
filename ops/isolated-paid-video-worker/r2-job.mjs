import fs from 'node:fs/promises';
import path from 'node:path';
import { inspectPaidVideo } from './scan.mjs';
import { validateR2Object } from './r2-native.mjs';
import { r2Digest, r2Exact, r2Fail, r2Hash, r2ObjectTuple, r2Snapshot, r2Uuid, signR2Raw } from './r2-protocol.mjs';

export function validateR2ScanTicket(ticket, now = Date.now()) {
  if (!r2Exact(ticket, ['protocol', 'ticketId', 'uploadId', 'workerId', 'qualificationSha256', 'profile', 'issuedAt', 'expiresAt', 'object'])
    || ticket.protocol !== 'scpv-worker-ticket-r2-v1' || ticket.profile !== 'scpv-mp4-h264-aac-v1'
    || !r2Uuid(ticket.ticketId) || !r2Uuid(ticket.workerId) || !r2Hash(ticket.qualificationSha256)
    || typeof ticket.uploadId !== 'string' || !ticket.uploadId.startsWith('scpv_upload_') || !r2Uuid(ticket.uploadId.slice(12))
    || !Number.isFinite(Date.parse(ticket.issuedAt)) || Date.parse(ticket.issuedAt) > now
    || !Number.isFinite(Date.parse(ticket.expiresAt)) || Date.parse(ticket.expiresAt) <= now
    || Date.parse(ticket.expiresAt) - Date.parse(ticket.issuedAt) > 600000
    || Date.parse(ticket.expiresAt) <= Date.parse(ticket.issuedAt)) r2Fail('paid_video_r2_scan_ticket_invalid');
  validateR2Object(ticket.object, true); return ticket;
}
export async function signR2ScanResult({ ticket, key, result, now = Date.now() }) {
  // Rejected evidence remains useful after expiry for monotonic removal. Clean
  // results require a current ticket and can never resurrect a negative state.
  validateR2ScanTicket(ticket, result?.verdict === 'rejected' ? Date.parse(ticket.issuedAt) : now);
  if (result?.protocol !== 'scpv-byte-scan-v1' || !['clean', 'rejected'].includes(result.verdict)
    || result.profile !== ticket.profile || result.sha256 !== ticket.object.expectedSha256
    || result.byteLength !== ticket.object.expectedByteLength || result.moderation !== 'unreviewed') r2Fail('paid_video_r2_scan_result_invalid');
  const raw = JSON.stringify({ protocol: 'scpv-worker-result-r2-v1', ticketId: ticket.ticketId, uploadId: ticket.uploadId,
    workerId: ticket.workerId, qualificationSha256: ticket.qualificationSha256, object: ticket.object, result });
  return { raw, signature: await signR2Raw(raw, key) };
}

export async function executeR2ScanTicket({ ticket: input, workerKey, transport, workDirectory, scanner, now = Date.now }) {
  const ticket = r2Snapshot(validateR2ScanTicket(input, now()));
  if (!path.isAbsolute(workDirectory) || path.resolve(workDirectory) !== workDirectory
    || await fs.realpath(workDirectory) !== workDirectory) r2Fail('paid_video_work_directory_untrusted');
  const stat = await fs.lstat(workDirectory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) r2Fail('paid_video_work_directory_untrusted');
  const directory = await fs.mkdtemp(path.join(workDirectory, 'r2-scan-')); await fs.chmod(directory, 0o700);
  try {
    // Exact accepted identity is mandatory. No HEAD/latest/probe discovery.
    const observed = await transport.readForScan(ticket.object, Math.min(Date.parse(ticket.expiresAt), now() + 5000));
    if (!r2Exact(observed, ['bytes', 'identity']) || !(observed.bytes instanceof Uint8Array)
      || observed.bytes.length !== ticket.object.expectedByteLength || await r2Digest(observed.bytes) !== ticket.object.expectedSha256
      || r2ObjectTuple({ ...ticket.object, identity: observed.identity }) !== r2ObjectTuple(ticket.object)) r2Fail('paid_video_r2_scan_binding_changed');
    const file = path.join(directory, 'immutable.mp4'); await fs.writeFile(file, observed.bytes, { flag: 'wx', mode: 0o600 });
    const result = await inspectPaidVideo({ ...scanner, file, expectedSha256: ticket.object.expectedSha256,
      expectedByteLength: ticket.object.expectedByteLength, now });
    return await signR2ScanResult({ ticket, key: workerKey, result, now: now() });
  } finally { await fs.rm(directory, { recursive: true }); }
}
