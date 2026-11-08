import { captureAccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { captureIsolatedPaidVideoV2Client, newPaidVideoV2RequestId, paidVideoId, paidVideoUuid } from "./isolatedPaidVideoV2";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";

export type PaidVideoV2TransferUpload = Readonly<{ id: string; incarnation: string; expectedSha256: string; expectedByteLength: number }>;
export type PaidVideoV2TransferContext = Readonly<{ userId: string; sessionGeneration: string; configurationDigest: string; requestId: string;
  upload: PaidVideoV2TransferUpload; originalSessionId: string; originalConfigurationDigest: string; now?: number }>;
export type PaidVideoV2TransferResponse = Readonly<{ protocol: "scpv-transfer-v2"; state: "unknown" | "acknowledged" | "exists_unverified";
  uploadId: string; requestId: string; verificationRequired: true }>;
export type PaidVideoV2ObjectReceipt = Readonly<{ protocol: "scpv-object-receipt-v2"; state: "recorded"; uploadId: string; userId: string;
  originalSessionId: string; originalConfigurationDigest: string; requestId: string; transferId: string; incarnation: string; sha256: string; byteLength: number; objectVersion: string }>;
export type PaidVideoV2ObjectObservation = Readonly<{ protocol: "scpv-object-observation-v2"; userId: string; sessionId: string; uploadId: string;
  requestId: string; transferId: string; originalSessionId: string; originalConfigurationDigest: string; configurationDigest: string; verifierId: string; incarnation: string;
  sha256: string; byteLength: number; objectVersion: string; checkedAtMs: number; expiresAtMs: number }>;
export type PaidVideoV2ProbeResponse = Readonly<{ protocol: "scpv-upload-probe-v2"; state: "observed"; observationRaw: string; signature: string }>;
export class IsolatedPaidVideoTransferError extends Error {
  constructor(readonly code: "invalid_request" | "invalid_response" | "authority_retired" | "capability_unavailable" | "outcome_unknown",
    readonly requestId: string | null, readonly outcome: "not_sent" | "unknown") { super(`Paid Video transfer: ${code}.`); }
}
type Row = Record<string, unknown>;
const row = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: unknown, names: readonly string[]): value is Row => row(value) && Object.keys(value).sort().join(",") === [...names].sort().join(",");
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
/** Match the server's opaque S3 VersionId contract without requiring Node
 * Buffer or a TextEncoder polyfill in React Native. Never trim or decode it. */
export function isPaidVideoS3ObjectVersion(value: unknown): value is string {
  if (typeof value !== "string" || !value.length || value.length > 1024 || value === "null"
    || /[\u0000-\u001f\u007f\ud800-\udfff]/u.test(value)) return false;
  let bytes = 0;
  for (const scalar of value) {
    const point = scalar.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > 1024) return false;
  }
  return true;
}
const version = isPaidVideoS3ObjectVersion;
const sameUpload = (a: PaidVideoV2TransferUpload, b: PaidVideoV2TransferUpload) => a.id === b.id && a.incarnation === b.incarnation && a.expectedSha256 === b.expectedSha256 && a.expectedByteLength === b.expectedByteLength;
export function validPaidVideoV2TransferUpload(value: unknown): value is PaidVideoV2TransferUpload {
  return keys(value, ["id", "incarnation", "expectedSha256", "expectedByteLength"]) && paidVideoId(value.id, "upload") && paidVideoUuid(value.incarnation)
    && hash(value.expectedSha256) && integer(value.expectedByteLength) && value.expectedByteLength > 0 && value.expectedByteLength <= 16777216;
}
export function validPaidVideoV2TransferContext(value: unknown): value is PaidVideoV2TransferContext {
  return keys(value, ["userId", "sessionGeneration", "configurationDigest", "requestId", "upload", "originalSessionId", "originalConfigurationDigest", ...(row(value) && Object.hasOwn(value, "now") ? ["now"] : [])])
    && paidVideoUuid(value.userId) && paidVideoUuid(value.sessionGeneration) && hash(value.configurationDigest) && paidVideoUuid(value.requestId)
    && paidVideoUuid(value.originalSessionId) && hash(value.originalConfigurationDigest) && validPaidVideoV2TransferUpload(value.upload) && (value.now === undefined || integer(value.now));
}
function expect(condition: unknown, context: PaidVideoV2TransferContext): asserts condition {
  if (!condition) throw new IsolatedPaidVideoTransferError("invalid_response", context.requestId, "unknown");
}
function immutable<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(immutable); Object.freeze(value); } return value; }
function snapshot<T>(value: T): T { return immutable(JSON.parse(JSON.stringify(value)) as T); }
export function parsePaidVideoV2TransferResponse(value: unknown, context: PaidVideoV2TransferContext): PaidVideoV2TransferResponse {
  expect(validPaidVideoV2TransferContext(context) && keys(value, ["protocol", "state", "uploadId", "requestId", "verificationRequired"])
    && value.protocol === "scpv-transfer-v2" && ["unknown", "acknowledged", "exists_unverified"].includes(String(value.state))
    && value.uploadId === context.upload.id && value.requestId === context.requestId && value.verificationRequired === true, context);
  return snapshot(value as unknown as PaidVideoV2TransferResponse);
}
export function parsePaidVideoV2ObjectReceipt(value: unknown, context: PaidVideoV2TransferContext): PaidVideoV2ObjectReceipt {
  expect(validPaidVideoV2TransferContext(context) && keys(value, ["protocol", "state", "uploadId", "userId", "originalSessionId", "originalConfigurationDigest", "requestId", "transferId", "incarnation", "sha256", "byteLength", "objectVersion"])
    && value.protocol === "scpv-object-receipt-v2" && value.state === "recorded" && value.uploadId === context.upload.id && value.userId === context.userId
    && value.originalSessionId === context.originalSessionId && value.originalConfigurationDigest === context.originalConfigurationDigest && value.requestId === context.requestId && paidVideoUuid(value.transferId)
    && value.incarnation === context.upload.incarnation && value.sha256 === context.upload.expectedSha256 && value.byteLength === context.upload.expectedByteLength && version(value.objectVersion), context);
  return snapshot(value as unknown as PaidVideoV2ObjectReceipt);
}
export function parsePaidVideoV2ObjectObservation(value: unknown, context: PaidVideoV2TransferContext): PaidVideoV2ObjectObservation {
  const now = context.now ?? Date.now();
  expect(validPaidVideoV2TransferContext(context) && keys(value, ["protocol", "userId", "sessionId", "uploadId", "requestId", "transferId", "originalSessionId", "originalConfigurationDigest", "configurationDigest", "verifierId", "incarnation", "sha256", "byteLength", "objectVersion", "checkedAtMs", "expiresAtMs"])
    && value.protocol === "scpv-object-observation-v2" && value.userId === context.userId && value.sessionId === context.sessionGeneration
    && value.uploadId === context.upload.id && value.requestId === context.requestId && paidVideoUuid(value.transferId) && value.originalSessionId === context.originalSessionId && value.originalConfigurationDigest === context.originalConfigurationDigest
    && value.configurationDigest === context.configurationDigest && paidVideoUuid(value.verifierId) && value.incarnation === context.upload.incarnation
    && value.sha256 === context.upload.expectedSha256 && value.byteLength === context.upload.expectedByteLength && version(value.objectVersion)
    && integer(value.checkedAtMs) && integer(value.expiresAtMs) && value.checkedAtMs <= now + 5000 && value.expiresAtMs > now
    && value.expiresAtMs > value.checkedAtMs && value.expiresAtMs <= value.checkedAtMs + 30000, context);
  return snapshot(value as unknown as PaidVideoV2ObjectObservation);
}
export function parsePaidVideoV2ProbeResponse(value: unknown, context: PaidVideoV2TransferContext): PaidVideoV2ProbeResponse {
  expect(keys(value, ["protocol", "state", "observationRaw", "signature"]) && value.protocol === "scpv-upload-probe-v2" && value.state === "observed"
    && typeof value.observationRaw === "string" && value.observationRaw.length > 0 && value.observationRaw.length <= 4096 && hash(value.signature), context);
  let observation: unknown; try { observation = JSON.parse(value.observationRaw); } catch { throw new IsolatedPaidVideoTransferError("invalid_response", context.requestId, "unknown"); }
  parsePaidVideoV2ObjectObservation(observation, context);
  // Shape/binding validation does not verify this HMAC. Only the server's exact
  // reconciliation endpoint may authenticate it and issue an object receipt.
  return snapshot(value as unknown as PaidVideoV2ProbeResponse);
}

/** Caller journals before put/reconcile. An unknown PUT is never repeated.
 * All recovery reads use the original transfer request and original session. */
export async function capturePaidVideoV2TransferClient(authority: AccountSessionAuthorityBinding) {
  const expected = Object.freeze({ ...authority }); let retired = false;
  const unsubscribe = subscribeToAccountSessionAuthority(value => { if (!sameAccountSessionAuthority(expected, value)) retired = true; });
  const assertCurrent = (requestId: string | null, sent = false) => {
    if (retired || expected.restoreOnly || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot()))
      throw new IsolatedPaidVideoTransferError("authority_retired", requestId, sent ? "unknown" : "not_sent");
  };
  let authoring: Awaited<ReturnType<typeof captureIsolatedPaidVideoV2Client>> | null = null;
  let captured: Awaited<ReturnType<typeof captureAccountBoundSupabaseMutationSubject>>;
  try { assertCurrent(null); authoring = await captureIsolatedPaidVideoV2Client(expected);
    captured = await captureAccountBoundSupabaseMutationSubject(expected.userId, { waitForReadSettlement: true });
    if (!sameAccountSessionAuthority(expected, captured.authority)) retired = true; assertCurrent(null);
  } catch (error) { unsubscribe(); authoring?.dispose(); throw error; }
  const configurationDigest = authoring.configurationDigest, usedPut = new Set<string>(), usedReconcile = new Set<string>();
  function context(value: PaidVideoV2TransferContext): PaidVideoV2TransferContext {
    if (!validPaidVideoV2TransferContext(value) || value.now !== undefined || value.userId !== expected.userId || value.sessionGeneration !== expected.sessionGeneration || value.configurationDigest !== configurationDigest)
      throw new IsolatedPaidVideoTransferError("invalid_request", paidVideoUuid(value?.requestId) ? value.requestId : null, "not_sent");
    assertCurrent(value.requestId); return snapshot(value);
  }
  const url = (c: PaidVideoV2TransferContext) => `${SUPABASE_URL.replace(/\/+$/u, "")}/functions/v1/isolated-paid-video-upload-v2/${c.upload.id}`;
  const headers = (c: PaidVideoV2TransferContext) => ({ Authorization: `Bearer ${captured.accessToken}`, apikey: SUPABASE_ANON_KEY,
    "x-chillywood-auth-session": expected.sessionGeneration, "x-chillywood-request-id": c.requestId, "x-chillywood-native-configuration": configurationDigest });
  async function send(c: PaidVideoV2TransferContext, method: "GET" | "POST", body?: string): Promise<unknown> {
    assertCurrent(c.requestId);
    try { const response = await fetch(url(c), { method, headers: { ...headers(c), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body } : {}) });
      assertCurrent(c.requestId, true); if (!response.ok) throw new Error("unavailable");
      const result: unknown = await response.json(); assertCurrent(c.requestId, true); return result;
    } catch { assertCurrent(c.requestId, true); throw new IsolatedPaidVideoTransferError("outcome_unknown", c.requestId, "unknown"); }
  }
  return Object.freeze({ configurationDigest,
    dispose() { retired = true; unsubscribe(); authoring?.dispose(); },
    async put(value: PaidVideoV2TransferContext, bytes: Uint8Array<ArrayBuffer>): Promise<PaidVideoV2TransferResponse> {
      const c = context(value);
      if (c.originalSessionId !== expected.sessionGeneration || c.originalConfigurationDigest !== configurationDigest || !(bytes instanceof Uint8Array) || bytes.byteLength !== c.upload.expectedByteLength || usedPut.has(c.requestId))
        throw new IsolatedPaidVideoTransferError("invalid_request", c.requestId, "not_sent");
      usedPut.add(c.requestId); const body = bytes.slice(); let sent = false;
      try {
        // A fresh exact upload read is required after durable preparation. Its
        // short capability never gets reconstructed from a local saved draft.
        const response = await authoring!.request("upload.read", newPaidVideoV2RequestId(), { uploadId: c.upload.id }); assertCurrent(c.requestId);
        if (response.status !== "ok" || !response.data.upload.transferAvailable || response.capabilityExpiresAtMs <= Date.now()
          || response.data.upload.state !== "reserved" || Date.parse(response.data.upload.expiresAt) <= Date.now()
          || !sameUpload(c.upload, response.data.upload)) throw new IsolatedPaidVideoTransferError("capability_unavailable", c.requestId, "not_sent");
        assertCurrent(c.requestId); sent = true;
        const raw = await fetch(url(c), { method: "PUT", headers: { ...headers(c), "Content-Type": "video/mp4", "Content-Length": String(body.byteLength) }, body });
        assertCurrent(c.requestId, true); if (!raw.ok) throw new Error("unconfirmed");
        const result: unknown = await raw.json(); assertCurrent(c.requestId, true); return parsePaidVideoV2TransferResponse(result, c);
      } catch (error) {
        assertCurrent(c.requestId, sent);
        if (!sent) throw error instanceof IsolatedPaidVideoTransferError ? error : new IsolatedPaidVideoTransferError("capability_unavailable", c.requestId, "not_sent");
        throw new IsolatedPaidVideoTransferError("outcome_unknown", c.requestId, "unknown");
      } finally { body.fill(0); }
    },
    async probe(value: PaidVideoV2TransferContext): Promise<PaidVideoV2ProbeResponse | PaidVideoV2ObjectReceipt> {
      const c = context(value), response = await send(c, "GET");
      return row(response) && response.protocol === "scpv-object-receipt-v2" ? parsePaidVideoV2ObjectReceipt(response, c) : parsePaidVideoV2ProbeResponse(response, c);
    },
    async reconcile(value: PaidVideoV2TransferContext, probe: PaidVideoV2ProbeResponse): Promise<PaidVideoV2ObjectReceipt> {
      const c = context(value), parsed = parsePaidVideoV2ProbeResponse(probe, c), key = `${c.requestId}:${parsed.signature}`;
      if (usedReconcile.has(key)) throw new IsolatedPaidVideoTransferError("invalid_request", c.requestId, "not_sent");
      usedReconcile.add(key); assertCurrent(c.requestId);
      const response = await send(c, "POST", JSON.stringify({ protocol: "scpv-reconcile-v2", observationRaw: parsed.observationRaw, signature: parsed.signature }));
      return parsePaidVideoV2ObjectReceipt(response, c);
    },
  });
}
export type PaidVideoV2TransferClient = Awaited<ReturnType<typeof capturePaidVideoV2TransferClient>>;
