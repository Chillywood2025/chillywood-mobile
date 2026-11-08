import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';

export const hash = value => createHash('sha256').update(value).digest('hex');
const hex = /^[a-f0-9]{64}$/u, uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const fail = code => { throw new Error(code); };
const here = path.dirname(fileURLToPath(import.meta.url));
export function validateBinding(b) {
  const keys = ['protocol','projectRef','endpoint','installationId','sourceSha256','workerId','workerSha256','verifierId',
    'verifierEvidenceSha256','configurationDigest','routeId','qualificationSha256'];
  if (!b || Object.keys(b).sort().join() !== keys.sort().join() || b.protocol !== 'scpv-operations-binding-v1'
    || !/^[a-z0-9]{20}$/u.test(b.projectRef) || b.endpoint !== `https://${b.projectRef}.supabase.co`
    || ['installationId','workerId','verifierId','routeId'].some(k => !uuid.test(b[k]))
    || ['sourceSha256','workerSha256','verifierEvidenceSha256','configurationDigest','qualificationSha256'].some(k => !hex.test(b[k])))
    fail('paid_video_operations_binding_invalid');
  return structuredClone(b);
}
export async function privateDocument(file, maxBytes = 65536) {
  const h = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await h.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > maxBytes || (stat.mode & 0o077) || stat.uid !== process.getuid()) fail('paid_video_private_file_required');
    const raw = await h.readFile('utf8'), after = await h.stat();
    if (stat.dev !== after.dev || stat.ino !== after.ino || stat.size !== after.size || stat.mtimeMs !== after.mtimeMs || stat.ctimeMs !== after.ctimeMs)
      fail('paid_video_private_file_changed');
    return { raw, value: JSON.parse(raw) };
  } finally { await h.close(); }
}
export async function privateJson(file, maxBytes) { return (await privateDocument(file, maxBytes)).value; }
async function privateDirectory(directory) {
  if (!path.isAbsolute(directory)) fail('paid_video_private_directory_required');
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.uid !== process.getuid()) fail('paid_video_private_directory_required');
}
export async function durableJson(directory, name, value) {
  await privateDirectory(directory);
  const temporary = path.join(directory, `.${randomUUID()}.tmp`), destination = path.join(directory, name);
  const h = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try { await h.writeFile(JSON.stringify(value)); await h.sync(); } finally { await h.close(); }
  await fs.rename(temporary, destination);
  const d = await fs.open(directory, constants.O_RDONLY); try { await d.sync(); } finally { await d.close(); }
}
export async function journalState(directory, previous, next, event, detail = {}) {
  await privateDirectory(directory);
  const snapshot = { ...next }; delete snapshot.auditEntry;
  const record = { protocol: 'scpv-worker-audit-v2', previous: previous?.auditEntry ?? null,
    previousStateSha256: previous ? hash(JSON.stringify(previous)) : null, event, detail, recordedAt: new Date().toISOString(), state: snapshot };
  const raw = JSON.stringify(record), name = `audit-${randomUUID()}.json`;
  const h = await fs.open(path.join(directory, name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try { await h.writeFile(raw); await h.sync(); } finally { await h.close(); }
  const d = await fs.open(directory, constants.O_RDONLY); try { await d.sync(); } finally { await d.close(); }
  const state = { ...snapshot, auditEntry: { name, sha256: hash(raw) } };
  await durableJson(directory, 'state.json', state); return state;
}
async function validateAuditHead(directory, state) {
  const head = state?.auditEntry;
  if (!head || !/^audit-[a-f0-9-]{36}\.json$/u.test(head.name) || !hex.test(head.sha256)) fail('paid_video_audit_required');
  const document = await privateDocument(path.join(directory, head.name), 262144), expected = { ...state }; delete expected.auditEntry;
  if (hash(document.raw) !== head.sha256 || document.value.protocol !== 'scpv-worker-audit-v2'
    || JSON.stringify(document.value.state) !== JSON.stringify(expected)) fail('paid_video_audit_changed');
}
function requireStoppedGroup(attempt) {
  if (!attempt || !uuid.test(attempt.id)) fail('paid_video_scan_attempt_required');
  // No PID means no child received its configuration: dispatch is sequenced
  // strictly AFTER the process identity is durably recorded by onProcess.
  if (attempt.processGroupId === null) return;
  if (!Number.isSafeInteger(attempt.processGroupId) || attempt.processGroupId <= 1) fail('paid_video_scan_process_invalid');
  try { process.kill(-attempt.processGroupId, 0); }
  catch (error) { if (error.code === 'ESRCH') return; fail('paid_video_scan_process_uncertain'); }
  fail('paid_video_scan_process_still_running');
}
export async function workerStatus(directory) {
  await privateDirectory(directory);
  const doc = await privateDocument(path.join(directory, 'state.json')); await validateAuditHead(directory, doc.value);
  return { phase: doc.value.phase, expectedStateSha256: hash(doc.raw), leaseRequestId: JSON.parse(doc.value.raw).requestId,
    ticketId: doc.value.response?.result?.ticket?.ticketId ?? null, expiresAt: doc.value.response?.result?.ticket?.expiresAt ?? null,
    operatorUid: process.getuid(), attempt: doc.value.attempt ?? null };
}
export function createRpc({ binding, token, apiKey = token, request = fetch, now = Date.now }) {
  validateBinding(binding);
  if ([token, apiKey].some(value => typeof value !== 'string' || value.length < 20 || /[\r\n]/u.test(value))) fail('paid_video_service_credential_required');
  return async (action, raw, deadline, rpcName = 'isolated_paid_video_operations_v1') => {
    if (!['isolated_paid_video_operations_v1','isolated_paid_video_review_v1'].includes(rpcName)) fail('paid_video_rpc_invalid');
    const remaining = Math.min(10000, deadline - now()); if (remaining <= 0) fail('paid_video_runner_deadline');
    const response = await request(`${binding.endpoint}/rest/v1/rpc/${rpcName}`, { method: 'POST', redirect: 'error', cache: 'no-store',
      headers: { authorization: `Bearer ${token}`, apikey: apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ p_action: action, p_raw: raw }), signal: AbortSignal.timeout(Math.max(1, Math.floor(remaining))) });
    try {
      if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('application/json')) fail('paid_video_rpc_unacknowledged');
      const reader = response.body.getReader(), chunks = []; let length = 0;
      try {
        for (;;) { const next = await reader.read(); if (next.done) break; length += next.value.length;
          if (length > 65536) fail('paid_video_rpc_response_limit'); chunks.push(next.value); }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } finally { await response.body?.cancel().catch(() => {}); }
  };
}
function acknowledged(response, raw) {
  const request = JSON.parse(raw);
  return response?.protocol === 'scpv-operations-response-v1' && response.state === 'acknowledged'
    && response.requestId === request.requestId && response.requestSha256 === hash(raw) && response.result && typeof response.result === 'object';
}
function retainedTicket(result, binding) {
  const t = result?.ticket;
  if (result?.state !== 'leased' || JSON.stringify(result.binding) === undefined
    || Object.keys(binding).some(k => result.binding?.[k] !== binding[k]) || Object.keys(result.binding).length !== Object.keys(binding).length
    || t?.protocol !== 'scpv-worker-ticket-v1' || t.profile !== 'scpv-mp4-h264-aac-v1' || !uuid.test(t.ticketId)
    || !/^scpv_upload_[a-f0-9-]{36}$/u.test(t.uploadId) || !uuid.test(t.uploadId.slice(12)) || !uuid.test(t.incarnation)
    || t.routeId !== binding.routeId || t.provider !== 's3' || typeof t.objectVersion !== 'string' || t.objectVersion === 'null'
    || !/^[A-Za-z0-9._-]{1,256}$/u.test(t.objectVersion) || !Number.isFinite(Date.parse(t.expiresAt))) fail('paid_video_runner_ticket_invalid');
  return t;
}
function validTicket(result, binding, now) {
  const t = retainedTicket(result, binding);
  if (Date.parse(t.expiresAt) <= now() + 5000 || Date.parse(t.expiresAt) > now() + 600000) fail('paid_video_runner_ticket_invalid');
  return t;
}

// Bounded subprocess group: hard deadline kills the scanner AND its FFmpeg/AV
// children. IPC carries keys; no credential/bytes appear in argv or stdout.
export function runScanChild({ ticket, configuration, deadline, onProcess, now = Date.now }) {
  const remaining = Math.min(deadline, Date.parse(ticket.expiresAt) - 5000) - now();
  if (remaining <= 0 || remaining > 600000) fail('paid_video_runner_deadline');
  return new Promise((resolve, reject) => {
    const child = fork(path.join(here, 'scan-child.mjs'), [], { detached: true, stdio: ['ignore','ignore','ignore','ipc'],
      env: { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C', TZ: 'UTC' }, execArgv: [] });
    let settled = false;
    const registration = Promise.resolve().then(async () => {
      if (typeof onProcess !== 'function' || !Number.isSafeInteger(child.pid)) fail('paid_video_scan_process_record_required');
      await onProcess({ processGroupId: child.pid });
    });
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer);
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ }
      registration.finally(() => { if (error) reject(new Error(error)); else resolve(value); }).catch(() => {}); };
    const timer = setTimeout(() => finish('paid_video_scan_deadline'), remaining);
    child.once('error', () => finish('paid_video_scan_child_failed'));
    child.once('exit', () => finish('paid_video_scan_child_failed'));
    child.once('message', message => message?.ok === true ? finish(null, message.result) : finish('paid_video_scan_incomplete'));
    registration.then(() => { if (!settled) child.send({ ticket, configuration, deadline }); }, () => finish('paid_video_scan_process_record_failed'));
  });
}

// One durable operation at a time. Recover only reads a known request. An
// unknown response never becomes permission to repeat a POST or lease again.
export async function runWorker({ binding, directory, rpc, scan, deadline, maxJobs = 1, pollMs = 0, uploadId,
  recovery, recoveryAuthorizationSha256, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  binding = validateBinding(binding); await privateDirectory(directory);
  if (!Number.isSafeInteger(maxJobs) || maxJobs < 1 || maxJobs > 16 || !Number.isFinite(deadline)
    || deadline <= now() || deadline > now() + 600000 || !Number.isSafeInteger(pollMs) || pollMs < 0 || pollMs > 10000
    || (uploadId !== undefined && !/^scpv_upload_[a-f0-9-]{36}$/u.test(uploadId))) fail('paid_video_runner_bounds_invalid');
  const lock = path.join(directory, 'runner.lock');
  // A leftover lock is deliberate: an operator must prove the old process is
  // dead before removing it. Starting another worker is never automatic repair.
  await fs.mkdir(lock, { mode: 0o700 });
  let state; let completed = 0;
  const save = async (next, event = 'state', detail = {}) => { state = await journalState(directory, state, next, event, detail); };
  const send = async raw => {
    await save({ binding, phase: 'unknown', raw }, 'mutation_dispatch_prepared');
    let response; try { response = await rpc('execute', raw, deadline); } catch { return null; }
    if (!acknowledged(response, raw)) return null;
    await save({ binding, phase: 'acknowledged', raw, response }, 'mutation_acknowledged'); return response;
  };
  try {
    try { state = await privateJson(path.join(directory, 'state.json')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (state) await validateAuditHead(directory, state);
    if (state && JSON.stringify(state.binding) !== JSON.stringify(binding)) fail('paid_video_runner_retained_binding_changed');
    if (recovery) {
      const acknowledgedLeaseRetirement = state?.phase === 'acknowledged' && recovery.action === 'retire';
      if (!state || (!['scanning','interrupted_scan'].includes(state.phase) && !acknowledgedLeaseRetirement)
        || !['lease','lease-next'].includes(JSON.parse(state.raw).command) || !acknowledged(state.response, state.raw)
        || state.response.result.state !== 'leased'
        || !['resume','retire'].includes(recovery.action) || !uuid.test(recovery.requestId)
        || recovery.operatorUid !== process.getuid() || !hex.test(recoveryAuthorizationSha256)
        || recovery.authorizationSha256 !== recoveryAuthorizationSha256 || recovery.processesStoppedConfirmed !== true
        || recovery.expectedStateSha256 !== hash(JSON.stringify(state)) || typeof recovery.reason !== 'string'
        || recovery.reason.trim().length < 10 || recovery.reason.length > 1000 || !hex.test(recovery.resolutionEvidenceSha256)
        || recovery.leaseRequestId !== JSON.parse(state.raw).requestId || recovery.ticketId !== state.response?.result?.ticket?.ticketId)
        fail('paid_video_scan_recovery_invalid');
      retainedTicket(state.response.result, binding);
      // An initial lease acknowledgement has no dispatched child. A recovered
      // acknowledgement may retain a prior attempt: its group must still be
      // proved stopped. Never infer this from the phase alone.
      if (state.attempt || !acknowledgedLeaseRetirement) requireStoppedGroup(state.attempt);
      const audit = { ...recovery, authenticatedHostUid: process.getuid(), originalAuditEntry: state.auditEntry };
      // A fresh read confirms the exact original lease, never another POST.
      const recovered = await rpc('recover', state.raw, deadline);
      if (!acknowledged(recovered, state.raw) || JSON.stringify(recovered.result) !== JSON.stringify(state.response.result))
        fail('paid_video_scan_recovery_unconfirmed');
      if (recovery.action === 'retire') {
        await save({ ...state, phase: 'retired_scan', recovery: audit }, 'operator_retired_scan', audit);
        return { state: 'retired_scan', completed };
      }
      validTicket(recovered.result, binding, now);
      const current = await rpc('check', state.raw, deadline);
      if (!acknowledged(current, state.raw) || JSON.stringify(current.result) !== JSON.stringify(recovered.result)) fail('paid_video_scan_recovery_held');
      await save({ ...state, phase: 'acknowledged', recovery: audit }, 'operator_resumed_scan', audit);
    } else if (['scanning','interrupted_scan'].includes(state?.phase)) return { state: 'interrupted_scan', completed };
    if (state?.phase === 'unknown') {
      let response; try { response = await rpc('recover', state.raw, deadline); } catch { return { state: 'unknown', completed }; }
      if (!acknowledged(response, state.raw)) return { state: 'unknown', completed };
      await save({ ...state, phase: 'acknowledged', response });
    }
    while (completed < maxJobs && now() < deadline) {
      if (!state || ['complete','retired_scan'].includes(state.phase)) {
        const raw = JSON.stringify({ protocol: 'scpv-operations-request-v1', requestId: randomUUID(), command: uploadId ? 'lease' : 'lease-next',
          binding, ...(uploadId ? { uploadId } : {}) });
        if (!await send(raw)) return { state: 'unknown', completed };
      }
      const request = JSON.parse(state.raw), response = state.response;
      if (request.command === 'result') {
        if (response.result.accepted !== true) fail('paid_video_result_unacknowledged');
        await save({ ...state, phase: 'complete' }); completed++;
        if (uploadId) break;
      } else if (response.result.state === 'empty') {
        await save({ ...state, phase: 'complete' });
        if (!pollMs) return { state: 'empty', completed };
        await sleep(Math.min(pollMs, Math.max(0, deadline - now())));
      } else {
        const ticket = validTicket(response.result, binding, now), leaseRequestId = request.requestId;
        let current;
        try { current = await rpc('check', state.raw, deadline); } catch { return { state: 'held', completed }; }
        if (!acknowledged(current, state.raw) || JSON.stringify(current.result) !== JSON.stringify(response.result))
          return { state: 'held', completed };
        validTicket(current.result, binding, now);
        await save({ ...state, phase: 'scanning', attempt: { id: randomUUID(), processGroupId: null } }, 'scan_started');
        let signed;
        try { signed = await scan(ticket, Math.min(deadline, Date.parse(ticket.expiresAt) - 5000), async ({ processGroupId }) => {
          if (!Number.isSafeInteger(processGroupId) || processGroupId <= 1 || state.attempt.processGroupId !== null) fail('paid_video_scan_process_invalid');
          await save({ ...state, attempt: { ...state.attempt, processGroupId } }, 'scan_process_registered');
        }); }
        catch { await save({ ...state, phase: 'interrupted_scan' }, 'scan_incomplete'); return { state: 'interrupted_scan', completed }; }
        const result = JSON.parse(signed.raw);
        if (result.ticketId !== ticket.ticketId || result.uploadId !== ticket.uploadId || result.incarnation !== ticket.incarnation
          || result.objectVersion !== ticket.objectVersion || result.result?.sha256 !== ticket.expectedSha256
          || !hex.test(signed.signature) || now() >= deadline) fail('paid_video_runner_scan_binding_invalid');
        const raw = JSON.stringify({ protocol: 'scpv-operations-request-v1', requestId: randomUUID(), command: 'result', binding,
          leaseRequestId, raw: signed.raw, signature: signed.signature });
        if (!await send(raw)) return { state: 'unknown', completed };
      }
    }
    return { state: 'complete', completed };
  } finally { await fs.rmdir(lock); }
}

export async function verifySource(manifest, sourceRoot, expected) {
  if (!manifest || manifest.protocol !== 'scpv-operations-source-v1' || !Array.isArray(manifest.files)
    || hash(JSON.stringify(manifest)) !== expected || sourceRoot !== path.resolve(here, '../..')) fail('paid_video_source_manifest_invalid');
  for (const entry of manifest.files) {
    if (typeof entry.path !== 'string' || path.isAbsolute(entry.path) || entry.path.split('/').includes('..') || !hex.test(entry.sha256)) fail('paid_video_source_manifest_invalid');
    const file = path.join(sourceRoot, entry.path), stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || hash(await fs.readFile(file)) !== entry.sha256) fail('paid_video_source_changed');
  }
}
