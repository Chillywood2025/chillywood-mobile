import AsyncStorage from "@react-native-async-storage/async-storage";
import { paidVideoId, paidVideoUuid, parsePaidVideoV2Response } from "./isolatedPaidVideoV2";
import { IsolatedPaidVideoTransferError, isPaidVideoS3ObjectVersion as version, parsePaidVideoV2TransferResponse, parsePaidVideoV2ObjectReceipt, parsePaidVideoV2ProbeResponse, samePaidVideoReceiptIdentity, paidVideoNativeTransferConfiguration } from "./isolatedPaidVideoTransfer";

type Row = Record<string, unknown>;
export type PaidVideoTransferStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
export type PaidVideoTransferUpload = Readonly<{ id: string; incarnation: string; expectedSha256: string; expectedByteLength: number }>;
export type PaidVideoTransferBinding = Readonly<{ sessionGeneration: string; configurationDigest: string; now?: number }>;
export type PaidVideoTransferAttemptInput = Readonly<{ requestId: string; sessionGeneration: string; configurationDigest: string; upload: PaidVideoTransferUpload }>;
export type PaidVideoTransferAttempt = PaidVideoTransferAttemptInput & Readonly<{ userId: string;
  state: "prepared" | "unknown" | "retired_unknown" | "recorded" | "not_applied";
  putState: "unknown" | "acknowledged" | "exists_unverified" | null;
  observation: Readonly<{ transferId: string; objectVersion: string; checkedAtMs: number; expiresAtMs: number; sessionGeneration: string; configurationDigest: string }> | null;
  receipt: ReturnType<typeof parsePaidVideoV2ObjectReceipt> | null;
  notAppliedReason: "invalid_request" | "authority_retired" | "capability_unavailable" | null;
}>;
type Code = "invalid_request" | "invalid_response" | "request_conflict" | "unresolved_attempt" | "attempt_missing" | "storage_corrupt" | "storage_unavailable";
export class PaidVideoTransferJournalError extends Error { constructor(readonly code: Code) { super(`Paid Video transfer journal: ${code}.`); } }
const fail = (code: Code): never => { throw new PaidVideoTransferJournalError(code); };
const row = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: unknown, expected: readonly string[]): v is Row => row(v) && Object.keys(v).sort().join(",") === [...expected].sort().join(",");
const digest = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const member = (v: unknown, values: readonly string[]) => typeof v === "string" && values.includes(v);
const milliseconds = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function copy<T>(value: T): T {
  const raw = JSON.stringify(value, (_key, v) => { if (v === undefined || typeof v === "function" || typeof v === "symbol" || typeof v === "bigint" || (typeof v === "number" && !Number.isFinite(v))) throw Error("Invalid JSON"); return v; });
  if (raw.length > 2_000_000) throw Error("Journal bound"); return freeze(JSON.parse(raw) as T);
}
const sameUpload = (a: PaidVideoTransferUpload, b: PaidVideoTransferUpload) => a.id === b.id && a.incarnation === b.incarnation && a.expectedSha256 === b.expectedSha256 && a.expectedByteLength === b.expectedByteLength;
const validUpload = (v: unknown): v is PaidVideoTransferUpload => keys(v, ["id", "incarnation", "expectedSha256", "expectedByteLength"])
  && paidVideoId(v.id, "upload") && paidVideoUuid(v.incarnation) && digest(v.expectedSha256)
  && typeof v.expectedByteLength === "number" && Number.isSafeInteger(v.expectedByteLength) && v.expectedByteLength >= 1 && v.expectedByteLength <= 16_777_216;
function context(attempt: PaidVideoTransferAttempt, binding?: PaidVideoTransferBinding) {
  return { userId: attempt.userId, requestId: attempt.requestId, originalSessionId: attempt.sessionGeneration, upload: attempt.upload,
    originalConfigurationDigest: attempt.configurationDigest,
    sessionGeneration: binding?.sessionGeneration ?? attempt.sessionGeneration,
    configurationDigest: binding?.configurationDigest ?? attempt.configurationDigest, ...(binding?.now !== undefined ? { now: binding.now } : {}) };
}
function validateBinding(value: PaidVideoTransferBinding) {
  if (!keys(value, ["sessionGeneration", "configurationDigest", ...(row(value) && Object.hasOwn(value, "now") ? ["now"] : [])])
    || !paidVideoUuid(value.sessionGeneration) || !digest(value.configurationDigest) || (value.now !== undefined && !milliseconds(value.now))) return fail("invalid_request");
  return copy(value);
}
const unresolved = (attempt: PaidVideoTransferAttempt) => attempt.state === "prepared" || attempt.state === "unknown";
const keyFor = (userId: string) => `@chillywood/isolated-paid-video-transfers:v2:${userId}`;
const queues = new Map<string, Promise<void>>(), poisoned = new Set<string>();
const fresh = new Map<string, { token: symbol; owner: symbol }>();
const ticketKey = (key: string, requestId: string) => `${key}:${requestId}`;
async function exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const prior = queues.get(key) ?? Promise.resolve(); let release!: () => void;
  const next = new Promise<void>(resolve => { release = resolve; }); queues.set(key, next); await prior;
  try { return await operation(); } finally { release(); if (queues.get(key) === next) queues.delete(key); }
}
function stored(raw: string, userId: string): PaidVideoTransferAttempt[] {
  try {
    if (raw.length > 2_000_000) return fail("storage_corrupt"); const data: unknown = JSON.parse(raw);
    if (!keys(data, ["version", "userId", "attempts"]) || data.version !== 2 || data.userId !== userId || !Array.isArray(data.attempts) || data.attempts.length > 1000) return fail("storage_corrupt");
    const requests = new Set<string>(), uploads = new Set<string>();
    return data.attempts.map((v: unknown) => {
      if (!keys(v, ["requestId", "sessionGeneration", "configurationDigest", "upload", "userId", "state", "putState", "observation", "receipt", "notAppliedReason"])
        || !paidVideoUuid(v.requestId) || requests.has(v.requestId) || !paidVideoUuid(v.sessionGeneration) || !digest(v.configurationDigest)
        || !validUpload(v.upload) || v.userId !== userId || !member(v.state, ["prepared", "unknown", "retired_unknown", "recorded", "not_applied"])
        || !(v.putState === null || member(v.putState, ["unknown", "acknowledged", "exists_unverified"]))) return fail("storage_corrupt");
      const attempt = v as unknown as PaidVideoTransferAttempt; requests.add(attempt.requestId);
      if (attempt.state === "retired_unknown" && attempt.configurationDigest !== paidVideoNativeTransferConfiguration) return fail("storage_corrupt");
      if (attempt.state !== "not_applied") { if (uploads.has(attempt.upload.id)) return fail("storage_corrupt"); uploads.add(attempt.upload.id); }
      if (attempt.observation !== null) {
        const observation = attempt.observation;
        if (!keys(observation, ["transferId", "objectVersion", "checkedAtMs", "expiresAtMs", "sessionGeneration", "configurationDigest"])
          || !paidVideoUuid(observation.transferId) || !version(observation.objectVersion) || !milliseconds(observation.checkedAtMs)
          || !milliseconds(observation.expiresAtMs) || observation.expiresAtMs <= observation.checkedAtMs || observation.expiresAtMs - observation.checkedAtMs > 30_000
          || !paidVideoUuid(observation.sessionGeneration) || !digest(observation.configurationDigest)) return fail("storage_corrupt");
      }
      if (attempt.receipt !== null) {
        parsePaidVideoV2ObjectReceipt(attempt.receipt, context(attempt));
        if (attempt.state !== "recorded" || attempt.observation && (attempt.observation.transferId !== attempt.receipt.transferId || attempt.observation.objectVersion !== attempt.receipt.objectVersion)) return fail("storage_corrupt");
      } else if (attempt.state === "recorded") return fail("storage_corrupt");
      if (attempt.state === "not_applied") {
        if (!member(attempt.notAppliedReason, ["invalid_request", "authority_retired", "capability_unavailable"]) || attempt.putState !== null || attempt.observation !== null || attempt.receipt !== null) return fail("storage_corrupt");
      } else if (attempt.notAppliedReason !== null) return fail("storage_corrupt");
      if (attempt.state === "prepared" && (attempt.putState !== null || attempt.observation !== null || attempt.receipt !== null)) return fail("storage_corrupt");
      return attempt;
    });
  } catch { return fail("storage_corrupt"); }
}

/** Durable local intent, never upload/scan/auth authority. A first-use local
 * opportunity is not permission to PUT after an Auth gap. Only the captured
 * transport can establish whether it entered the network mutation boundary. */
export function createIsolatedPaidVideoTransferJournal({ userId, storage = AsyncStorage }: { userId: string; storage?: PaidVideoTransferStorage }) {
  if (!paidVideoUuid(userId)) return fail("invalid_request"); const key = keyFor(userId), owner = Symbol();
  async function read() { let raw: string | null; try { raw = await storage.getItem(key); } catch { return fail("storage_unavailable"); }
    return raw === null ? [] : stored(raw, userId); }
  async function write(items: PaidVideoTransferAttempt[]) {
    if (poisoned.has(key)) return fail("storage_unavailable");
    try { const raw = JSON.stringify({ version: 2, userId, attempts: items }); stored(raw, userId);
      await storage.setItem(key, raw); if (await storage.getItem(key) !== raw) return fail("storage_unavailable"); }
    catch { poisoned.add(key); return fail("storage_unavailable"); }
  }
  function revoke(requestId: string) { if (!paidVideoUuid(requestId)) return fail("invalid_request"); fresh.delete(ticketKey(key, requestId)); }
  async function update(requestId: string, operation: (attempt: PaidVideoTransferAttempt) => PaidVideoTransferAttempt) {
    return exclusive(key, async () => { const items = await read(), index = items.findIndex(a => a.requestId === requestId);
      if (index < 0) return fail("attempt_missing"); const next = operation(items[index]);
      if (next !== items[index]) { items[index] = next; await write(items); } return copy(items[index]); });
  }
  return Object.freeze({
    async adoptRetained(value: unknown, binding: { requestId: string; uploadId: string; currentSessionGeneration: string; currentConfigurationDigest: string }) {
      if (!keys(binding, ["requestId", "uploadId", "currentSessionGeneration", "currentConfigurationDigest"])
        || !paidVideoUuid(binding.requestId) || !paidVideoId(binding.uploadId, "upload") || !paidVideoUuid(binding.currentSessionGeneration)
        || !digest(binding.currentConfigurationDigest)) return fail("invalid_request");
      let response: ReturnType<typeof parsePaidVideoV2Response<"upload.read">>;
      try { response = parsePaidVideoV2Response(copy(value), { command: "upload.read", requestId: binding.requestId,
        actor: { userId, accountId: userId, sessionGeneration: binding.currentSessionGeneration }, configurationDigest: binding.currentConfigurationDigest,
        payload: { uploadId: binding.uploadId } }); } catch { return fail("invalid_response"); }
      if (response.status !== "ok") return fail("invalid_response");
      const data = response.data as unknown as Row, descriptor = data.transfer;
      if (descriptor === null) return Object.freeze({ attempt: null, mayPut: false as const, stopBeforePut: null });
      if (!keys(descriptor, ["requestId", "originalSessionId", "configurationDigest"]) || !paidVideoUuid(descriptor.requestId)
        || !paidVideoUuid(descriptor.originalSessionId) || !digest(descriptor.configurationDigest)) return fail("invalid_response");
      const upload = response.data.upload;
      const candidate: PaidVideoTransferAttempt = copy({ userId, requestId: descriptor.requestId, sessionGeneration: descriptor.originalSessionId,
        configurationDigest: descriptor.configurationDigest,
        upload: { id: upload.id, incarnation: upload.incarnation, expectedSha256: upload.expectedSha256, expectedByteLength: upload.expectedByteLength },
        state: "unknown", putState: null, observation: null, receipt: null, notAppliedReason: null });
      return exclusive(key, async () => {
        const items = await read(), existing = items.find(item => item.requestId === candidate.requestId);
        if (existing) {
          if (existing.sessionGeneration !== candidate.sessionGeneration || existing.configurationDigest !== candidate.configurationDigest
            || !sameUpload(existing.upload, candidate.upload) || existing.state === "not_applied") return fail("request_conflict");
          // Readback can retire a first-use local opportunity, never recreate it.
          fresh.delete(ticketKey(key, existing.requestId));
          if (existing.state === "prepared") { const index = items.indexOf(existing); items[index] = { ...existing, state: "unknown" }; await write(items);
            return Object.freeze({ attempt: copy(items[index]), mayPut: false as const, stopBeforePut: null }); }
          return Object.freeze({ attempt: copy(existing), mayPut: false as const, stopBeforePut: null });
        }
        if (items.some(item => item.upload.id === candidate.upload.id && item.state !== "not_applied")) return fail("request_conflict");
        // Several retained unknown transfers may be discovered after reinstall.
        // Adoption is read-only recovery; prepare still blocks new PUTs while
        // any such transfer is unresolved.
        await write([...items, candidate]); return Object.freeze({ attempt: copy(candidate), mayPut: false as const, stopBeforePut: null });
      });
    },
    async prepare(input: PaidVideoTransferAttemptInput) {
      if (!keys(input, ["requestId", "sessionGeneration", "configurationDigest", "upload"]) || !paidVideoUuid(input.requestId)
        || !paidVideoUuid(input.sessionGeneration) || !digest(input.configurationDigest) || !validUpload(input.upload)) return fail("invalid_request");
      const attempt: PaidVideoTransferAttempt = copy({ ...input, userId, state: "prepared", putState: null, observation: null, receipt: null, notAppliedReason: null });
      return exclusive(key, async () => {
        if (poisoned.has(key)) return fail("storage_unavailable"); const items = await read(), prior = items.find(a => a.requestId === attempt.requestId);
        if (prior) { if (!sameUpload(prior.upload, attempt.upload) || prior.configurationDigest !== attempt.configurationDigest) return fail("request_conflict");
          return Object.freeze({ attempt: copy(prior), mayPut: false, stopBeforePut: null }); }
        if (items.some(a => unresolved(a))) return fail("unresolved_attempt");
        if (items.some(a => a.upload.id === attempt.upload.id && a.state !== "not_applied")) return fail("request_conflict");
        if (attempt.configurationDigest === paidVideoNativeTransferConfiguration && items.some(a => a.configurationDigest === paidVideoNativeTransferConfiguration
          && a.state !== "not_applied" && a.upload.incarnation === attempt.upload.incarnation)) return fail("request_conflict");
        await write([...items, attempt]); const id = ticketKey(key, attempt.requestId), token = Symbol(); fresh.set(id, { owner, token });
        const stopBeforePut = async (error: unknown) => {
          if (!(error instanceof IsolatedPaidVideoTransferError) || error.requestId !== attempt.requestId || error.outcome !== "not_sent"
            || !member(error.code, ["invalid_request", "authority_retired", "capability_unavailable"])) return fail("invalid_response");
          return update(attempt.requestId, current => {
            if (fresh.get(id)?.token !== token || fresh.get(id)?.owner !== owner || current.state !== "prepared"
              || current.sessionGeneration !== attempt.sessionGeneration || current.configurationDigest !== attempt.configurationDigest || !sameUpload(current.upload, attempt.upload)) return fail("invalid_response");
            fresh.delete(id); return { ...current, state: "not_applied", notAppliedReason: error.code as PaidVideoTransferAttempt["notAppliedReason"] };
          });
        };
        return Object.freeze({ attempt: copy(attempt), mayPut: true, stopBeforePut });
      });
    },
    list: async () => exclusive(key, async () => copy(await read())),
    async retireUnknown(requestId: string, currentBinding: PaidVideoTransferBinding) {
      const binding = validateBinding(currentBinding); revoke(requestId);
      return update(requestId, prior => {
        if (binding.configurationDigest !== paidVideoNativeTransferConfiguration || prior.configurationDigest !== paidVideoNativeTransferConfiguration
          || !["prepared", "unknown", "retired_unknown"].includes(prior.state)) return fail("invalid_request");
        // Local retirement is not cancellation or proof of absence. Keep every
        // identity and observation, and never recreate the first-PUT closure.
        return prior.state === "retired_unknown" ? prior : { ...prior, state: "retired_unknown" };
      });
    },
    async markUnknown(requestId: string) { revoke(requestId); return update(requestId, prior => prior.state === "prepared" ? { ...prior, state: "unknown" } : prior); },
    async recordPut(requestId: string, value: unknown) {
      revoke(requestId); let response: unknown; try { response = copy(value); } catch { return fail("invalid_response"); }
      return update(requestId, prior => {
        let parsed: ReturnType<typeof parsePaidVideoV2TransferResponse>; try { parsed = parsePaidVideoV2TransferResponse(response, context(prior)); } catch { return fail("invalid_response"); }
        if (prior.state === "not_applied") return fail("invalid_response");
        if (prior.state === "recorded") return prior;
        return { ...prior, state: prior.state === "retired_unknown" ? "retired_unknown" : "unknown", putState: parsed.state };
      });
    },
    async recordProbe(requestId: string, value: unknown, currentBinding: PaidVideoTransferBinding) {
      revoke(requestId); const binding = validateBinding(currentBinding); let response: unknown; try { response = copy(value); } catch { return fail("invalid_response"); }
      return update(requestId, prior => {
        let raw: Row; try { const parsed = parsePaidVideoV2ProbeResponse(response, context(prior, binding)); raw = JSON.parse(parsed.observationRaw) as Row; } catch { return fail("invalid_response"); }
        if (prior.state === "not_applied") return fail("invalid_response");
        const observation = { transferId: raw.transferId as string, objectVersion: raw.objectVersion as string, checkedAtMs: raw.checkedAtMs as number,
          expiresAtMs: raw.expiresAtMs as number, sessionGeneration: binding.sessionGeneration, configurationDigest: binding.configurationDigest };
        if (prior.receipt && (prior.receipt.transferId !== observation.transferId || prior.receipt.objectVersion !== observation.objectVersion)) return fail("invalid_response");
        if (prior.observation && (prior.observation.transferId !== observation.transferId || prior.observation.objectVersion !== observation.objectVersion)) return fail("invalid_response");
        if (prior.state === "recorded" || prior.observation && prior.observation.checkedAtMs >= observation.checkedAtMs) return prior;
        return { ...prior, state: prior.state === "retired_unknown" ? "retired_unknown" : "unknown", observation };
      });
    },
    async recordReceipt(requestId: string, value: unknown, currentBinding: PaidVideoTransferBinding) {
      revoke(requestId); const binding = validateBinding(currentBinding); let response: unknown; try { response = copy(value); } catch { return fail("invalid_response"); }
      return update(requestId, prior => {
        let receipt: ReturnType<typeof parsePaidVideoV2ObjectReceipt>; try { receipt = parsePaidVideoV2ObjectReceipt(response, context(prior, binding)); } catch { return fail("invalid_response"); }
        if (prior.state === "not_applied" || prior.receipt && !samePaidVideoReceiptIdentity(prior.receipt, receipt)
          || prior.observation && (prior.observation.transferId !== receipt.transferId || prior.observation.objectVersion !== receipt.objectVersion)) return fail("invalid_response");
        if (prior.state === "recorded") return prior;
        return { ...prior, state: "recorded", receipt };
      });
    },
  });
}
