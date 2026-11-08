/** Record-only qualification intake. Configured identity is not behavioral
 * qualification. This module has no commerce, provisioning or grant adapter.
 */
import {
  authenticateRevenueCatEnvelope, decryptRouterEnvelope, observeRevenueCatBytes,
  MAX_RECEIPT_BYTES, RouterBoundaryError, type RouterConnection, type RouterEnvelope, type RouterObservation,
} from "./revenuecat-router-envelope.ts";

export type QualificationConnection = RouterConnection & { appId: string };
export type QualificationEnvelope = Omit<RouterEnvelope, "observation"> & {
  storageProtocol: "test-store-qualification-envelope-v1";
  originalObservationBase64: string; originalObservationSha256: string;
  observation: RouterObservation;
};
export type QualificationObservation = RouterObservation & {
  protocol: "test-store-qualification-observation-v1";
  projectId: string; configuredAppId: string;
  scopedOriginalTransactionId: string | null; scopedTransactionId: string | null;
  customerIds: string[]; economicLineageUnknown: boolean;
  qualificationOnly: true; authorityGranted: false;
};
export type QualificationResult = {
  protocol: "test-store-qualification-result-v1"; entryId: string;
  status: "captured" | "duplicate" | "sealed_duplicate" | "conflict";
  phase: "capturing" | "sealed"; durable: true; acknowledgementAllowed: true;
  behavioralQualificationGranted: false; authorityGranted: false;
};
export type QualificationDependencies = {
  connection: () => QualificationConnection | null;
  persist: (connectionId: string, revision: number, envelope: QualificationEnvelope, observation: QualificationObservation) => Promise<unknown>;
};
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 512
  && v.trim() === v && !/[\u0000-\u001f\u007f]/u.test(v);
const uuid = (v: unknown): v is string => typeof v === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
const row = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
// PostgreSQL COLLATE C compares UTF-8 bytes, while default JS sort compares
// UTF-16 code units. Qualification may retain arbitrary provider identities.
const byteOrder = (a: string, b: string): number => {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};
const validUnicode = (v: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v);
const scalarKeys = ["eventId", "eventType", "appId", "store", "environment", "eventAt", "userId", "originalUserId", "productId", "transactionId", "originalTransactionId"] as const;
const arrayKeys = ["issues", "aliases", "transferredFrom", "transferredTo", "conflictingUserIds"] as const;
function safeCommon(original: RouterObservation): RouterObservation {
  const out = structuredClone(original); let changed = false;
  for (const k of scalarKeys) if (out[k] !== null && !validUnicode(out[k])) { out[k] = null; changed = true; }
  for (const k of arrayKeys) out[k] = out[k].filter(v => { const valid = validUnicode(v); changed ||= !valid; return valid; });
  if (changed) { out.parseStatus = "invalid"; out.issues.push("invalid_unicode_observation"); }
  return out;
}
const encodeBase64 = (v: Uint8Array) => btoa(Array.from(v, b => String.fromCharCode(b)).join(""));
const sha256 = async (v: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(v))), b => b.toString(16).padStart(2, "0")).join("");
const canonical = (v: unknown) => JSON.stringify(v, (_k, x) => row(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
export async function createQualificationEnvelope(envelope: RouterEnvelope): Promise<QualificationEnvelope> {
  const serialized = new TextEncoder().encode(JSON.stringify(envelope.observation));
  if (serialized.length > 1048576) throw new RouterBoundaryError("qualification_observation_limit", 413);
  return { ...envelope, storageProtocol: "test-store-qualification-envelope-v1",
    originalObservationBase64: encodeBase64(serialized), originalObservationSha256: await sha256(serialized),
    observation: safeCommon(envelope.observation) };
}
/** Review helper reconstructs the exact original observation for shared AES AAD
 * verification. Sanitized identifiers are never substituted into that AAD.
 */
export async function reconstructQualificationEnvelope(envelope: QualificationEnvelope): Promise<RouterEnvelope> {
  if (!row(envelope) || envelope.storageProtocol !== "test-store-qualification-envelope-v1"
    || typeof envelope.originalObservationBase64 !== "string" || envelope.originalObservationBase64.length > 1398104
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(envelope.originalObservationBase64)
    || typeof envelope.originalObservationSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(envelope.originalObservationSha256))
    throw new RouterBoundaryError("qualification_storage_invalid", 503);
  const serialized = Uint8Array.from(atob(envelope.originalObservationBase64), x => x.charCodeAt(0));
  if (serialized.length > 1048576 || encodeBase64(serialized) !== envelope.originalObservationBase64
    || await sha256(serialized) !== envelope.originalObservationSha256) throw new RouterBoundaryError("qualification_storage_invalid", 503);
  let original: RouterObservation;
  try { original = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(serialized));
    if (canonical(safeCommon(original)) !== canonical(envelope.observation)) throw Error("normalization");
  } catch { throw new RouterBoundaryError("qualification_storage_invalid", 503); }
  const { storageProtocol: _protocol, originalObservationBase64: _encoded, originalObservationSha256: _digest, ...rest } = envelope;
  return { ...rest, observation: original };
}
export async function decryptQualificationEnvelope(envelope: QualificationEnvelope, c: QualificationConnection): Promise<Uint8Array> {
  return await decryptRouterEnvelope(await reconstructQualificationEnvelope(envelope), connectionSnapshot(c));
}
function connectionSnapshot(c: QualificationConnection): QualificationConnection {
  if (!c || !uuid(c.connectionId) || !Number.isSafeInteger(c.connectionRevision) || c.connectionRevision < 1
    || !text(c.projectId) || !text(c.appId) || c.authentication?.method !== "shared_secret"
    || !text(c.authentication.keyVersion) || typeof c.authentication.secret !== "string"
    || c.authentication.secret.length < 32 || c.authentication.secret.length > 4096 || /[\r\n]/u.test(c.authentication.secret)
    || !text(c.encryption?.keyId) || !(c.encryption.key instanceof Uint8Array) || c.encryption.key.length !== 32)
    throw new RouterBoundaryError("qualification_configuration_unavailable", 503);
  return { connectionId: c.connectionId, connectionRevision: c.connectionRevision, projectId: c.projectId, appId: c.appId,
    authentication: { ...c.authentication }, encryption: { keyId: c.encryption.keyId, key: new Uint8Array(c.encryption.key) } };
}
function freeze<T>(v: T): T {
  if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}
/** Exclusion descriptors, not payment verification. All independently retained
 * customer identifiers survive ambiguity. Economic keys require exact scope.
 */
export function observeQualificationBytes(raw: Uint8Array, configuration: QualificationConnection): QualificationObservation {
  const c = connectionSnapshot(configuration);
  if (!(raw instanceof Uint8Array) || raw.length > MAX_RECEIPT_BYTES) throw new RouterBoundaryError("qualification_body_limit", 413);
  const common = safeCommon(observeRevenueCatBytes(raw));
  const customers = [...new Set([common.userId, common.originalUserId, ...common.aliases, ...common.transferredFrom,
    ...common.transferredTo, ...common.conflictingUserIds].filter(text))].sort(byteOrder);
  const scoped = common.parseStatus === "valid" && common.appId === c.appId && common.store === "TEST_STORE" && common.environment === "SANDBOX";
  const original = scoped && text(common.originalTransactionId) ? common.originalTransactionId : null;
  const transaction = scoped && text(common.transactionId) ? common.transactionId : null;
  const noEconomicTest = common.parseStatus === "valid" && common.eventType === "TEST" && common.originalTransactionId === null
    && common.transactionId === null && common.productId === null && common.transferredFrom.length === 0 && common.transferredTo.length === 0
    && common.conflictingUserIds.length === 0 && (common.appId === null || common.appId === c.appId)
    && (common.store === null || common.store === "TEST_STORE") && (common.environment === null || common.environment === "SANDBOX");
  const completeLineage = scoped && !!original && !!transaction
    && typeof common.eventType === "string" && ["NON_RENEWING_PURCHASE", "CANCELLATION", "EXPIRATION", "BILLING_ISSUE", "REFUND", "REVOCATION"].includes(common.eventType)
    && text(common.userId) && common.originalUserId === common.userId && common.aliases.every(v => v === common.userId)
    && common.transferredFrom.length === 0 && common.transferredTo.length === 0 && common.conflictingUserIds.length === 0;
  return { ...common, protocol: "test-store-qualification-observation-v1", projectId: c.projectId, configuredAppId: c.appId,
    scopedOriginalTransactionId: original, scopedTransactionId: transaction, customerIds: customers,
    economicLineageUnknown: !noEconomicTest && !completeLineage, qualificationOnly: true, authorityGranted: false };
}
const response = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});
export function createQualificationHandler(deps: QualificationDependencies) {
  return async (req: Request): Promise<Response> => {
    try {
      const configured = deps.connection();
      if (!configured) throw new RouterBoundaryError("qualification_configuration_unavailable", 503);
      const c = connectionSnapshot(configured);
      const authenticated = await authenticateRevenueCatEnvelope(req, c);
      const raw = await decryptRouterEnvelope(authenticated, c);
      const envelope = await createQualificationEnvelope(authenticated);
      const observation = observeQualificationBytes(raw, c);
      freeze(envelope); freeze(observation);
      let timer: ReturnType<typeof setTimeout> | undefined, result: unknown;
      try {
        result = await Promise.race([deps.persist(c.connectionId, c.connectionRevision, envelope, observation),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new RouterBoundaryError("qualification_persistence_unknown", 503)), 5000); })]);
      } finally { clearTimeout(timer); }
      const fields = ["protocol", "entryId", "status", "phase", "durable", "acknowledgementAllowed", "behavioralQualificationGranted", "authorityGranted"];
      if (!row(result) || Object.keys(result).length !== fields.length || !fields.every(k => Object.hasOwn(result, k))
        || result.protocol !== "test-store-qualification-result-v1" || !uuid(result.entryId)
        || typeof result.status !== "string" || !["captured", "duplicate", "sealed_duplicate", "conflict"].includes(result.status)
        || typeof result.phase !== "string" || !["capturing", "sealed"].includes(result.phase)
        || result.durable !== true || result.acknowledgementAllowed !== true || result.behavioralQualificationGranted !== false || result.authorityGranted !== false
        || (result.phase === "sealed") !== (result.status === "sealed_duplicate"))
        throw new RouterBoundaryError("qualification_persistence_result_invalid", 503);
      return response(200, { status: result.status, entryId: result.entryId, durable: true,
        behavioralQualificationGranted: false, authorityGranted: false, economicProjectionAllowed: false });
    } catch (error) {
      const safe = error instanceof RouterBoundaryError ? error : new RouterBoundaryError("qualification_unavailable", 503);
      return response(safe.status, { error: safe.code, behavioralQualificationGranted: false, authorityGranted: false, economicProjectionAllowed: false });
    }
  };
}
