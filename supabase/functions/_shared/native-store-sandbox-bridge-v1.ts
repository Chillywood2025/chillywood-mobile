/** Preparatory native-store intake, not an enabled webhook or grant projector.
 * Server-owned configuration only. Never construct it from request fields.
 * A successful call authenticates and encrypts bytes, but does NOT persist,
 * acknowledge, dispatch a purchase, qualify a provider, or grant access.
 * Worker-private result: observations/subjects and base64 observation metadata
 * contain identities. Never log this object or serialize it to a client.
 * Existing AES AAD binds connection revision/project, not this app/store tuple.
 * Durable integration must bind the tuple to an immutable connection revision
 * and revalidate it during replay; scopeKey itself is not cryptographic proof.
 */
import { authenticateRevenueCatEnvelope, RouterBoundaryError, type RouterConnection } from "./revenuecat-router-envelope.ts";
import { createLosslessRouterEnvelope, isRepresentableUnicode, type LosslessRouterEnvelope } from "./revenuecat-lossless-envelope.ts";

export type NativeStoreSandboxConnectionV1 = RouterConnection & {
  bridgeProtocol: "native-store-sandbox-v1";
  appId: string;
  store: "APP_STORE" | "PLAY_STORE";
  environment: "SANDBOX";
};
export type NativeStoreSandboxIntakeV1 = {
  protocol: "native-store-sandbox-intake-v1";
  connectionId: string;
  connectionRevision: number;
  projectId: string;
  scopeKey: string;
  envelope: LosslessRouterEnvelope;
  disposition: "purchase_unqualified" | "reconciliation_required";
  reasons: string[];
  /** Opaque provider identities, NOT resolved account ownership. A worker must
   * reconcile both sides and all legacy/new consumers within this project. */
  reconciliationSubjects: string[];
  reconciliationScope: "project";
  correlation: "unsupported";
  durable: false;
  acknowledgementAllowed: false;
  dispatchAllowed: false;
  grantsAccess: false;
  financialAuthority: false;
};
const exactText = (value: unknown): value is string => typeof value === "string"
  && value.length > 0 && value.length <= 512 && value === value.trim()
  && !/[\u0000-\u001f\u007f]/u.test(value) && isRepresentableUnicode(value);

function snapshot(value: NativeStoreSandboxConnectionV1): NativeStoreSandboxConnectionV1 {
  if (!value || value.bridgeProtocol !== "native-store-sandbox-v1" || !exactText(value.projectId)
    || !exactText(value.appId) || !["APP_STORE", "PLAY_STORE"].includes(value.store)
    || value.environment !== "SANDBOX" || !value.authentication || !value.encryption
    || !(value.encryption.key instanceof Uint8Array))
    throw new RouterBoundaryError("native_store_sandbox_configuration_unavailable", 503);
  // Snapshot before the first await. A caller changing configuration while the
  // body streams must not mix authentication, encryption, project or app scope.
  return { ...value, authentication: { ...value.authentication },
    encryption: { ...value.encryption, key: new Uint8Array(value.encryption.key) } };
}

export async function prepareNativeStoreSandboxIntakeV1(
  request: Request, configuration: NativeStoreSandboxConnectionV1,
): Promise<NativeStoreSandboxIntakeV1> {
  const connection = snapshot(configuration);
  const envelope = await createLosslessRouterEnvelope(await authenticateRevenueCatEnvelope(request, connection));
  const event = envelope.observation;
  const reasons = [...event.issues];
  if (event.appId !== connection.appId) reasons.push("native_store_app_mismatch");
  if (event.store !== connection.store) reasons.push("native_store_store_mismatch");
  if (event.environment !== "SANDBOX") reasons.push("native_store_sandbox_required");
  if (!event.eventAt) reasons.push("native_store_event_time_required");
  const transfer = event.eventType === "TRANSFER" || event.transferredFrom.length > 0 || event.transferredTo.length > 0;
  if (transfer) reasons.push("native_store_transfer_reconciliation_required");
  if (event.eventType !== "NON_RENEWING_PURCHASE") reasons.push("native_store_lifecycle_reconciliation_required");
  if (!event.userId || !event.productId || !event.transactionId || !event.originalTransactionId)
    reasons.push("native_store_purchase_identity_incomplete");
  // No TEST_STORE opaque customer can be adopted by this separate protocol.
  const subjects = [...new Set([event.userId, event.originalUserId, ...event.aliases,
    ...event.conflictingUserIds, ...event.transferredFrom, ...event.transferredTo].filter((s): s is string => s !== null))];
  if (subjects.some(s => s.startsWith("scv3_teststore_"))) reasons.push("native_store_test_store_identity_unsupported");
  const disposition = reasons.length === 0 ? "purchase_unqualified" : "reconciliation_required";
  // Offering names, a matching SKU/user, SDK success and client transaction
  // hints are never per-intent correlation. No runtime flag can enable it.
  reasons.push("native_store_correlation_unsupported");
  return { protocol: "native-store-sandbox-intake-v1", connectionId: connection.connectionId,
    connectionRevision: connection.connectionRevision, projectId: connection.projectId,
    scopeKey: JSON.stringify(["native-store-sandbox-v1", "revenuecat", connection.projectId,
      connection.appId, connection.store, "SANDBOX"]), envelope, disposition,
    reasons: [...new Set(reasons)], reconciliationSubjects: subjects, reconciliationScope: "project",
    correlation: "unsupported", durable: false, acknowledgementAllowed: false,
    dispatchAllowed: false, grantsAccess: false, financialAuthority: false };
}

export type NativeStoreSandboxJournalResultV1 = {
  protocol: "native-store-sandbox-journal-result-v1";
  receiptId: string; connectionId: string; connectionRevision: number; projectId: string; rawSha256: string;
  status: "recorded" | "duplicate" | "conflict";
  durable: true; correlation: "unsupported"; acknowledgementAllowed: false;
  dispatchAllowed: false; grantsAccess: false; financialAuthority: false;
};

/** Persist exactly once; a timeout/transport error has an UNKNOWN write outcome.
 * Do not retry here or report a purchase failure/safe repurchase. Provider
 * redelivery is handled by the journal's immutable raw/event keys instead.
 * This function does not send an HTTP acknowledgement or qualify correlation.
 */
export async function persistNativeStoreSandboxIntakeV1(request: Request,
  configuration: NativeStoreSandboxConnectionV1,
  persist: (intake: NativeStoreSandboxIntakeV1) => Promise<unknown>,
): Promise<NativeStoreSandboxJournalResultV1> {
  const intake = await prepareNativeStoreSandboxIntakeV1(request, configuration);
  const freeze = (value: unknown): void => {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  };
  freeze(intake);
  const result = await persist(intake);
  const fields = ["protocol", "receiptId", "connectionId", "connectionRevision", "projectId", "rawSha256", "status",
    "durable", "correlation", "acknowledgementAllowed", "dispatchAllowed", "grantsAccess", "financialAuthority"];
  const value = result as NativeStoreSandboxJournalResultV1;
  if (!result || typeof result !== "object" || Array.isArray(result) || Object.keys(result).length !== fields.length
    || !fields.every(k => Object.hasOwn(result, k)) || value.protocol !== "native-store-sandbox-journal-result-v1"
    || typeof value.receiptId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value.receiptId)
    || value.connectionId !== intake.connectionId || value.connectionRevision !== intake.connectionRevision
    || value.projectId !== intake.projectId || value.rawSha256 !== intake.envelope.rawSha256
    || !["recorded", "duplicate", "conflict"].includes(value.status) || value.durable !== true
    || value.correlation !== "unsupported" || value.acknowledgementAllowed !== false
    || value.dispatchAllowed !== false || value.grantsAccess !== false || value.financialAuthority !== false)
    throw new RouterBoundaryError("native_store_journal_result_unavailable", 503);
  return Object.freeze({ ...value });
}
