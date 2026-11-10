import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { Buffer } from 'node:buffer';
import { executeR2ScanTicket, validateR2ScanTicket } from './r2-job.mjs';
import { resolveDefinitionSnapshot } from '../native-paid-video-scanner-runtime/definition-snapshots.mjs';
import { createR2GatewayClient, readR2Json } from './r2-http.mjs';
import { r2Digest, r2Exact, r2Fail, r2ObjectTuple, r2Uuid, r2Within } from './r2-protocol.mjs';

async function privateParent(file) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) r2Fail('paid_video_scanner_private_path_required');
  const directory = path.dirname(file), stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) r2Fail('paid_video_scanner_private_path_required');
  if (await fs.realpath(directory) !== directory) r2Fail('paid_video_scanner_private_path_required');
}
async function syncPrivateDirectory(file) {
  await privateParent(file);
  const handle = await fs.open(path.dirname(file), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
}
export async function readScannerSecret(file, limit = 8192) {
  await privateParent(file); const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 || stat.size < 1 || stat.size > limit) r2Fail('paid_video_scanner_secret_invalid');
    const value = await handle.readFile({ encoding: 'utf8' });
    if (Buffer.byteLength(value) > limit) r2Fail('paid_video_scanner_secret_invalid'); return value.trim();
  } finally { await handle.close(); }
}
export async function persistR2ScannerResult(file, value) {
  await privateParent(file); const raw = JSON.stringify(value);
  if (Buffer.byteLength(raw) > 32768) r2Fail('paid_video_scanner_result_invalid');
  const handle = await fs.open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(raw); await handle.sync(); } finally { await handle.close(); }
  // File fsync alone does not make the new directory entry crash-durable.
  await syncPrivateDirectory(file);
  if (await fs.readFile(file, 'utf8') !== raw) r2Fail('paid_video_scanner_result_uncertain');
}
export async function completeR2ScannerResult(file, ticketId) {
  if (!r2Uuid(ticketId)) r2Fail('paid_video_scanner_ticket_invalid');
  await privateParent(file);
  // link() is atomic and refuses an existing destination. After its directory
  // fsync, power loss cannot erase both the pending and completed evidence.
  await fs.link(file, `${file}.completed-${ticketId}`);
  await syncPrivateDirectory(file);
  await fs.unlink(file);
  await syncPrivateDirectory(file);
}

export function createR2ScannerRuntime(configuration, { request = fetch, now = Date.now } = {}) {
  const base = new URL(configuration.authorityOrigin), claims = (() => {
    try { return JSON.parse(Buffer.from(configuration.rpcToken.split('.')[1], 'base64url').toString('utf8')); } catch { return null; }
  })();
  if (base.protocol !== 'https:' || base.origin !== configuration.authorityOrigin || base.username || base.password
    || claims?.role !== 'sbx_v1_r2_scanner' || claims.worker_id !== configuration.workerId || claims.profile_id !== configuration.gateway?.profileId
    || !configuration.anonKey || !r2Uuid(configuration.workerId)
    || !(configuration.workerKey instanceof Uint8Array) || configuration.workerKey.length !== 32) r2Fail('paid_video_scanner_runtime_invalid');
  const client = createR2GatewayClient(configuration.gateway, { request, now });
  const rpc = async (name, parameters, deadline = now() + 5000) => {
    if (!['native_paid_video_r2_worker_v1', 'native_paid_video_r2_scan_admit_v1', 'native_paid_video_r2_next_v1'].includes(name)) r2Fail('paid_video_scanner_rpc_invalid');
    const response = await r2Within(() => request(new URL('/rest/v1/rpc/' + name, base), { method: 'POST', redirect: 'error',
      signal: AbortSignal.timeout(Math.max(1, Math.ceil(deadline - now()))), headers: { 'content-type': 'application/json',
        apikey: configuration.anonKey, authorization: 'Bearer ' + configuration.rpcToken }, body: JSON.stringify(parameters) }), deadline, now,
    value => { void value?.body?.cancel().catch(() => {}); });
    if (!response.ok) { void response.body?.cancel(); r2Fail('paid_video_scanner_rpc_unavailable'); }
    return readR2Json(response, 32768, deadline, now);
  };
  const process = async (ticket, resultPath) => {
    validateR2ScanTicket(ticket, now());
    if (ticket.workerId !== configuration.workerId || ticket.qualificationSha256 !== configuration.gateway.qualificationSha256
      || ticket.object.bucket !== configuration.gateway.bucket || ticket.object.routeId !== configuration.gateway.routeId) r2Fail('paid_video_scanner_profile_mismatch');
    const transport = { readForScan: async (object, deadline) => {
      const admission = await rpc('native_paid_video_r2_scan_admit_v1', { p_upload_id: ticket.uploadId.slice(12), p_ticket_id: ticket.ticketId }, deadline);
      const token = client.parseAdmission(admission);
      if (token.operation !== 'scan' || token.uploadId !== ticket.uploadId || token.requestId !== ticket.ticketId
        || token.subject.kind !== 'worker' || token.subject.workerId !== configuration.workerId
        || r2ObjectTuple(token.object) !== r2ObjectTuple(object)) r2Fail('paid_video_scanner_read_mismatch');
      return client.execute(admission, null, deadline);
    } };
    const scanner = { ...configuration.scanner };
    if (scanner.definitionSnapshotsDirectory !== undefined) {
      if (scanner.databaseDirectory !== undefined) r2Fail('paid_video_scanner_definition_mode_conflict');
      const selected = await resolveDefinitionSnapshot({ root: scanner.definitionSnapshotsDirectory, certificateDirectory: scanner.certificateDirectory,
        sigtool: scanner.binaries.sigtool, now: now() });
      scanner.databaseDirectory = selected.directory; delete scanner.definitionSnapshotsDirectory;
    }
    const signed = await executeR2ScanTicket({ ticket, workerKey: configuration.workerKey, transport,
      workDirectory: configuration.workDirectory, scanner, now });
    // This exact signed result is durable BEFORE the consequential completion
    // request. A crash/unknown response leaves a sentinel and stops supervision.
    await persistR2ScannerResult(resultPath, { protocol: 'scpv-r2-scanner-pending-v1', ticket, ...signed });
    const completion = await rpc('native_paid_video_r2_worker_v1', { p_action: 'complete', p_upload_id: null,
      p_worker_id: null, p_raw_body: signed.raw, p_signature: signed.signature });
    if (!r2Exact(completion, ['protocol', 'state', 'resultSha256']) || completion.protocol !== 'scpv-r2-worker-completion-v1'
      || completion.state !== 'recorded' || completion.resultSha256 !== await r2Digest(new TextEncoder().encode(signed.raw))) r2Fail('paid_video_scanner_completion_unknown');
    return { ticketId: ticket.ticketId, uploadId: ticket.uploadId, resultSha256: completion.resultSha256 };
  };
  return Object.freeze({
    async run({ uploadId, resultPath }) {
      if (typeof uploadId !== 'string' || !uploadId.startsWith('scpv_upload_') || !r2Uuid(uploadId.slice(12))) r2Fail('paid_video_scanner_upload_invalid');
      await privateParent(resultPath); try { await fs.lstat(resultPath); r2Fail('paid_video_scanner_pending_result'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const ticket = await rpc('native_paid_video_r2_worker_v1', { p_action: 'lease', p_upload_id: uploadId.slice(12),
        p_worker_id: configuration.workerId, p_raw_body: null, p_signature: null });
      return process(ticket, resultPath);
    },
    async next({ resultPath }) {
      await privateParent(resultPath); try { await fs.lstat(resultPath); r2Fail('paid_video_scanner_pending_result'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const ticket = await rpc('native_paid_video_r2_next_v1', { p_worker_id: configuration.workerId });
      return ticket === null ? null : process(ticket, resultPath);
    },
  });
}

const sleepUntilStopped = (ms, signal) => new Promise(resolve => {
  let timer;
  const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
  timer = setTimeout(finish, ms); signal.addEventListener('abort', finish, { once: true }); if (signal.aborted) finish();
});
export async function superviseR2Scanner({ runtime, resultPath, signal, pollMs = 30000, maxJobs = Infinity, sleep = sleepUntilStopped }) {
  if (!Number.isInteger(pollMs) || pollMs < 30000 || pollMs > 300000
    || maxJobs !== Infinity && (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 10000)) r2Fail('paid_video_scanner_supervisor_invalid');
  let jobs = 0, idle = 0;
  while (!signal.aborted && jobs < maxJobs) {
    // An error exits the supervisor. The service must not blindly restart past
    // a pending result or treat an expired lease as proof completion failed.
    const result = await runtime.next({ resultPath });
    if (result !== null) {
      await completeR2ScannerResult(resultPath, result.ticketId); jobs++; idle = 0;
    } else idle = Math.min(idle + 1, 4);
    if (!signal.aborted && jobs < maxJobs) await sleep(Math.min(300000, pollMs * 2 ** Math.max(0, idle - 1)), signal);
  }
  return { jobs, stopped: signal.aborted };
}
