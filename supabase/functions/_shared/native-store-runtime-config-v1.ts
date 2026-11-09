/** Server-only configuration. No value is logged or returned to a caller.
 * Configuration entries describe immutable revisions; rotation never permits
 * a latest-key or latest-connection fallback for retained original receipts. */
import type { NativeStoreSandboxConnectionV1 } from "./native-store-sandbox-bridge-v1.ts";
type Row = Record<string, unknown>;
const row = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: unknown, names: string[]): v is Row => row(v) && Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
const text = (v: unknown, max = 512): v is string => typeof v === "string" && v.length > 0 && v.length <= max && v === v.trim()
  && !/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(v);
const revision = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const unavailable = () => Error("native_store_runtime_configuration_unavailable");
function copy(c: NativeStoreSandboxConnectionV1): NativeStoreSandboxConnectionV1 {
  return { ...c, authentication: { ...c.authentication }, encryption: { ...c.encryption, key: new Uint8Array(c.encryption.key) } };
}
export function parseNativeStoreRuntimeConnectionsV1(serialized: string | null | undefined): readonly NativeStoreSandboxConnectionV1[] {
  if (typeof serialized !== "string" || serialized.length < 1 || serialized.length > 131072) throw unavailable();
  let value: unknown;
  try { value = JSON.parse(serialized); } catch { throw unavailable(); }
  if (!keys(value, ["connections"]) || !Array.isArray(value.connections) || value.connections.length < 1 || value.connections.length > 32) throw unavailable();
  const seen = new Set<string>(), result: NativeStoreSandboxConnectionV1[] = [];
  for (const c of value.connections) {
    if (!keys(c, ["connectionId", "connectionRevision", "projectId", "appId", "store", "environment", "authentication", "encryption"])
      || !uuid(c.connectionId) || !revision(c.connectionRevision) || !text(c.projectId) || !text(c.appId)
      || !["APP_STORE", "PLAY_STORE"].includes(c.store as string) || c.environment !== "SANDBOX"
      || !keys(c.authentication, ["method", "keyVersion", "secret"]) || c.authentication.method !== "shared_secret"
      || !text(c.authentication.keyVersion) || !text(c.authentication.secret, 4096) || c.authentication.secret.length < 32
      || !keys(c.encryption, ["keyId", "keyBase64"]) || !text(c.encryption.keyId)
      || typeof c.encryption.keyBase64 !== "string" || !/^[A-Za-z0-9+/]{43}=$/u.test(c.encryption.keyBase64)) throw unavailable();
    const identity = JSON.stringify([c.connectionId, c.connectionRevision]);
    if (seen.has(identity)) throw unavailable(); seen.add(identity);
    let key: Uint8Array;
    try { key = Uint8Array.from(atob(c.encryption.keyBase64), x => x.charCodeAt(0)); } catch { throw unavailable(); }
    if (key.length !== 32 || btoa(String.fromCharCode(...key)) !== c.encryption.keyBase64) throw unavailable();
    result.push({ bridgeProtocol: "native-store-sandbox-v1", connectionId: c.connectionId, connectionRevision: c.connectionRevision,
      projectId: c.projectId, appId: c.appId, store: c.store as "APP_STORE" | "PLAY_STORE", environment: "SANDBOX",
      authentication: { method: "shared_secret", keyVersion: c.authentication.keyVersion, secret: c.authentication.secret },
      encryption: { keyId: c.encryption.keyId, key } });
  }
  return Object.freeze(result);
}
export function selectNativeStoreIngressConnectionV1(connections: readonly NativeStoreSandboxConnectionV1[], id: unknown, version: unknown): NativeStoreSandboxConnectionV1 {
  if (!uuid(id) || !revision(version)) throw unavailable();
  const matches = connections.filter(c => c.connectionId === id && c.connectionRevision === version);
  if (matches.length !== 1) throw unavailable();
  return copy(matches[0]);
}
export function resolveNativeStoreOriginalConnectionV1(connections: readonly NativeStoreSandboxConnectionV1[], registry: Readonly<Row>): NativeStoreSandboxConnectionV1 {
  const c = selectNativeStoreIngressConnectionV1(connections, registry.id, registry.revision);
  if (c.projectId !== registry.project_id || c.appId !== registry.app_id || c.store !== registry.store || c.environment !== registry.environment
    || c.authentication.keyVersion !== registry.auth_key_version || c.encryption.keyId !== registry.storage_key_id) throw unavailable();
  return c;
}
