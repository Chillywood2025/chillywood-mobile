/** JSONB-safe storage for an already authenticated envelope. This wrapper
 * preserves original AES AAD and raw ciphertext; it confers no receipt authority.
 * Legacy parsers and their wire format remain unchanged.
 */
import { decryptRouterEnvelope, RouterBoundaryError, type RouterConnection, type RouterEnvelope, type RouterObservation } from "./revenuecat-router-envelope.ts";

export type LosslessRouterEnvelope = Omit<RouterEnvelope, "observation"> & {
  storageProtocol: "rc-router-lossless-envelope-v1";
  originalObservationBase64: string; originalObservationSha256: string;
  observation: RouterObservation;
};
export const isRepresentableUnicode = (v: string): boolean => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v);
const scalarKeys = ["eventId", "eventType", "appId", "store", "environment", "eventAt", "userId", "originalUserId", "productId", "transactionId", "originalTransactionId"] as const;
const arrayKeys = ["issues", "aliases", "transferredFrom", "transferredTo", "conflictingUserIds"] as const;
export function sanitizeRouterObservation(original: RouterObservation): RouterObservation {
  const out = structuredClone(original); let changed = false;
  for (const k of scalarKeys) if (out[k] !== null && !isRepresentableUnicode(out[k])) { out[k] = null; changed = true; }
  for (const k of arrayKeys) out[k] = out[k].filter(v => { const valid = isRepresentableUnicode(v); changed ||= !valid; return valid; });
  if (changed) { out.parseStatus = "invalid"; out.issues.push("invalid_unicode_observation"); }
  return out;
}
const row = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const encodeBase64 = (v: Uint8Array) => btoa(Array.from(v, b => String.fromCharCode(b)).join(""));
const sha256 = async (v: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(v))), b => b.toString(16).padStart(2, "0")).join("");
const canonical = (v: unknown) => JSON.stringify(v, (_k, x) => row(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
export async function createLosslessRouterEnvelope(envelope: RouterEnvelope): Promise<LosslessRouterEnvelope> {
  const serialized = new TextEncoder().encode(JSON.stringify(envelope.observation));
  if (serialized.length > 1048576) throw new RouterBoundaryError("lossless_observation_limit", 413);
  return { ...envelope, storageProtocol: "rc-router-lossless-envelope-v1",
    originalObservationBase64: encodeBase64(serialized), originalObservationSha256: await sha256(serialized),
    observation: sanitizeRouterObservation(envelope.observation) };
}
export async function reconstructLosslessRouterEnvelope(envelope: LosslessRouterEnvelope): Promise<RouterEnvelope> {
  if (!row(envelope) || envelope.storageProtocol !== "rc-router-lossless-envelope-v1"
    || typeof envelope.originalObservationBase64 !== "string" || envelope.originalObservationBase64.length > 1398104
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(envelope.originalObservationBase64)
    || typeof envelope.originalObservationSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(envelope.originalObservationSha256))
    throw new RouterBoundaryError("lossless_storage_invalid", 503);
  const serialized = Uint8Array.from(atob(envelope.originalObservationBase64), x => x.charCodeAt(0));
  if (serialized.length > 1048576 || encodeBase64(serialized) !== envelope.originalObservationBase64
    || await sha256(serialized) !== envelope.originalObservationSha256) throw new RouterBoundaryError("lossless_storage_invalid", 503);
  let original: RouterObservation;
  try {
    original = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(serialized));
    if (canonical(sanitizeRouterObservation(original)) !== canonical(envelope.observation)) throw Error("normalization");
  } catch { throw new RouterBoundaryError("lossless_storage_invalid", 503); }
  const { storageProtocol: _protocol, originalObservationBase64: _encoded, originalObservationSha256: _digest, ...rest } = envelope;
  return { ...rest, observation: original };
}
export async function decryptLosslessRouterEnvelope(envelope: LosslessRouterEnvelope, connection: RouterConnection): Promise<Uint8Array> {
  return await decryptRouterEnvelope(await reconstructLosslessRouterEnvelope(envelope), connection);
}
