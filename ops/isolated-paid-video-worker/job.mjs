import fs from 'node:fs/promises';
import path from 'node:path';
import { inspectPaidVideo, signScanResult } from './scan.mjs';
import { validateObjectBinding } from './private-object.mjs';

// Ticket is fetched via the authenticated service worker RPC, never supplied by
// the upload client. Private directory, binaries, signature trust and HMAC key
// are operator-owned configuration. This module neither provisions nor polls.
export async function executeScanTicket({ ticket, workerKey, transport, workDirectory, scanner, now = Date.now }) {
  if (ticket?.protocol !== 'scpv-worker-ticket-v1' || ticket.profile !== 'scpv-mp4-h264-aac-v1'
    || !Number.isFinite(Date.parse(ticket.expiresAt)) || Date.parse(ticket.expiresAt) <= now()
    || !path.isAbsolute(workDirectory)) throw Error('paid_video_ticket_invalid');
  const stat = await fs.lstat(workDirectory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw Error('paid_video_work_directory_untrusted');
  const binding = validateObjectBinding({ provider: ticket.provider, bucket: ticket.bucket, routeId: ticket.routeId,
    objectKey: ticket.objectKey, incarnation: ticket.incarnation, expectedSha256: ticket.expectedSha256, expectedByteLength: ticket.expectedByteLength });
  const directory = await fs.mkdtemp(path.join(workDirectory, 'scan-')); await fs.chmod(directory, 0o700);
  try {
    const observed = await transport.readForScan(binding, Math.min(Date.parse(ticket.expiresAt), now() + 15000));
    const file = path.join(directory, 'immutable.mp4'); await fs.writeFile(file, observed.bytes, { flag: 'wx', mode: 0o600 });
    const result = await inspectPaidVideo({ ...scanner, file, expectedSha256: binding.expectedSha256,
      expectedByteLength: binding.expectedByteLength, now });
    if (result.verdict === 'clean' && Date.parse(ticket.expiresAt) <= now()) throw Error('paid_video_ticket_expired');
    return signScanResult({ key: workerKey, ticketId: ticket.ticketId, uploadId: ticket.uploadId,
      incarnation: ticket.incarnation, objectVersion: observed.objectVersion, result });
  } finally { await fs.rm(directory, { recursive: true }); }
}
