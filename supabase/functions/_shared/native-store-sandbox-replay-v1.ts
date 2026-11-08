/** Worker-private historical evidence replay, never purchase qualification.
 * Read the raw parent and its ORIGINAL immutable connection revision from trusted
 * persistence. A later delivery revision is not the parent's encryption scope.
 * Connection configuration and revoked status must not come from HTTP inputs.
 * Revocation blocks new intake, not historical read-only reconciliation. This
 * function does not enable a worker, acknowledge delivery, or project access.
 */
import { RouterBoundaryError, observeRevenueCatBytes } from "./revenuecat-router-envelope.ts";
import { decryptLosslessRouterEnvelope, isRepresentableUnicode, sanitizeRouterObservation,
  type LosslessRouterEnvelope } from "./revenuecat-lossless-envelope.ts";
import type { NativeStoreSandboxConnectionV1 } from "./native-store-sandbox-bridge-v1.ts";

export type NativeStoreSandboxReceiptRowV1 = {
  id: string; project_id: string; raw_sha256: string; raw_byte_length: number;
  connection_id: string; connection_revision: number; envelope: LosslessRouterEnvelope;
};
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const exact = (value: unknown): value is string => typeof value === "string" && value.length > 0
  && value.length <= 512 && value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value)
  && isRepresentableUnicode(value);
const fail = () => new RouterBoundaryError("native_store_replay_unavailable", 503);

/** The caller resolves exactly one original key/configuration. No lookup by
 * customer, SKU, latest revision, or fallback key is accepted here. Missing keys
 * block replay. The old shared-secret value is required by the existing decrypt
 * contract, not used to claim new provider authentication; never fabricate it.
 * Output contains private provider identities. Never log or return to a client.
 */
export async function replayNativeStoreSandboxReceiptV1(stored: NativeStoreSandboxReceiptRowV1,
  originalConnection: NativeStoreSandboxConnectionV1, originalRevisionRevoked: boolean) {
  let row: NativeStoreSandboxReceiptRowV1;
  let connection: NativeStoreSandboxConnectionV1;
  try {
    // Detach metadata, observation and key bytes before any asynchronous work.
    row = structuredClone(stored);
    connection = structuredClone(originalConnection);
  } catch { throw fail(); }
  if (!row || !connection || typeof originalRevisionRevoked !== "boolean"
    || !uuid(row.id) || !uuid(row.connection_id) || !Number.isSafeInteger(row.connection_revision)
    || row.connection_revision < 1 || !exact(row.project_id)
    || typeof row.raw_sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(row.raw_sha256)
    || !Number.isSafeInteger(row.raw_byte_length) || row.raw_byte_length < 1 || row.raw_byte_length > 262144
    || connection.bridgeProtocol !== "native-store-sandbox-v1" || !exact(connection.projectId)
    || !exact(connection.appId) || !["APP_STORE", "PLAY_STORE"].includes(connection.store)
    || connection.environment !== "SANDBOX" || !connection.authentication || !connection.encryption
    || !(connection.encryption.key instanceof Uint8Array)
    || row.connection_id !== connection.connectionId || row.connection_revision !== connection.connectionRevision
    || row.project_id !== connection.projectId || !row.envelope
    || row.raw_sha256 !== row.envelope.rawSha256 || row.raw_byte_length !== row.envelope.rawByteLength)
    throw fail();
  // structuredClone retains shared backing for SharedArrayBuffer views.
  connection.encryption.key = new Uint8Array(connection.encryption.key);
  let raw: Uint8Array;
  try { raw = await decryptLosslessRouterEnvelope(row.envelope, connection); }
  catch { throw fail(); }
  // Decrypt already proves ciphertext/AAD/hash/length and stored observation.
  // Derive the returned observation afresh, not from mutable database metadata.
  const observation = sanitizeRouterObservation(observeRevenueCatBytes(raw));
  const reasons = [...observation.issues];
  if (observation.appId !== connection.appId) reasons.push("native_store_app_mismatch");
  if (observation.store !== connection.store) reasons.push("native_store_store_mismatch");
  if (observation.environment !== "SANDBOX") reasons.push("native_store_sandbox_required");
  if (originalRevisionRevoked) reasons.push("native_store_original_revision_revoked");
  const subjects = [...new Set([observation.userId, observation.originalUserId, ...observation.aliases,
    ...observation.conflictingUserIds, ...observation.transferredFrom, ...observation.transferredTo]
    .filter((value): value is string => value !== null))];
  for (const value of Object.values(observation)) if (Array.isArray(value)) Object.freeze(value);
  Object.freeze(observation);
  // No disposition can turn historical byte integrity into purchase authority.
  return Object.freeze({ protocol: "native-store-sandbox-replay-v1" as const,
    receiptId: row.id, connectionId: row.connection_id, connectionRevision: row.connection_revision,
    projectId: row.project_id, rawSha256: row.raw_sha256, rawByteLength: row.raw_byte_length,
    scopeKey: JSON.stringify(["native-store-sandbox-v1", "revenuecat", connection.projectId,
      connection.appId, connection.store, "SANDBOX"]),
    replayVerified: true as const, originalRevisionRevoked,
    observation, reconciliationSubjects: Object.freeze(subjects), reconciliationScope: "project" as const,
    reasons: Object.freeze([...new Set([...reasons, "native_store_correlation_unsupported"])]),
    correlation: "unsupported" as const, acknowledgementAllowed: false as const,
    dispatchAllowed: false as const, grantsAccess: false as const, financialAuthority: false as const });
}
