/** Server-side immutable quote preparation, not provider correlation.
 * Load catalog and expected digest from trusted server persistence only.
 * Matching a SKU does not identify which resource a customer purchased.
 */
import { isRepresentableUnicode } from "./revenuecat-lossless-envelope.ts";
import { RouterBoundaryError } from "./revenuecat-router-envelope.ts";

export type NativeStoreSandboxCatalogV1 = {
  protocol: "native-store-sandbox-catalog-v1";
  bindingId: string;
  revision: number;
  projectId: string;
  appId: string;
  store: "APP_STORE" | "PLAY_STORE";
  environment: "SANDBOX";
  /** Exact qualified wire representation, never split on ':' or normalized. */
  wireProductId: string;
  productType: "one_time";
  basePlanId: null;
  resourceId: string;
  resourceRevision: number;
  creatorId: string;
  amountMinor: number;
  currency: "usd";
  quantity: 1;
  asset: { id: string; incarnation: string; sha256: string; byteLength: number;
    resourceRevision: number; profile: "scpv-mp4-h264-aac-v1" };
};
export type NativeStoreSandboxCatalogSnapshotV1 = {
  binding: NativeStoreSandboxCatalogV1;
  digest: string;
};
const row = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 512
  && v === v.trim() && !/[\u0000-\u001f\u007f]/u.test(v) && isRepresentableUnicode(v);
const positive = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const uuid = (v: unknown): v is string => typeof v === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
const digest = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const oldId = (v: unknown, kind: string) => typeof v === "string" && v.startsWith(`scv1_${kind}_`) && uuid(v.slice(`scv1_${kind}_`.length));
const fields = ["protocol", "bindingId", "revision", "projectId", "appId", "store", "environment", "wireProductId",
  "productType", "basePlanId", "resourceId", "resourceRevision", "creatorId", "amountMinor", "currency", "quantity", "asset"];
const assetFields = ["id", "incarnation", "sha256", "byteLength", "resourceRevision", "profile"];
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && expected.every(k => Object.hasOwn(v, k));

/** Immutable digest binds the entire quoted asset and economic/store scope.
 * It is a content fingerprint, not a signature, provider proof or authority.
 * Persistence must enforce immutable bindingId/revision and pin this digest on
 * the intent. No caller-supplied digest may replace that retained expectation.
 */
export async function snapshotNativeStoreSandboxCatalogV1(input: unknown): Promise<NativeStoreSandboxCatalogSnapshotV1> {
  if (!row(input) || !keys(input, fields) || input.protocol !== "native-store-sandbox-catalog-v1"
    || typeof input.bindingId !== "string" || !input.bindingId.startsWith("nssv1_catalog_") || !uuid(input.bindingId.slice(14))
    || !positive(input.revision) || !exact(input.projectId) || !exact(input.appId)
    || (input.store !== "APP_STORE" && input.store !== "PLAY_STORE") || input.environment !== "SANDBOX"
    || !exact(input.wireProductId) || input.productType !== "one_time" || input.basePlanId !== null
    || !oldId(input.resourceId, "resource") || !positive(input.resourceRevision) || !uuid(input.creatorId)
    || !positive(input.amountMinor) || input.currency !== "usd" || input.quantity !== 1
    || !row(input.asset) || !keys(input.asset, assetFields) || !oldId(input.asset.id, "asset")
    || !uuid(input.asset.incarnation) || !digest(input.asset.sha256) || !positive(input.asset.byteLength)
    || input.asset.byteLength > 16_777_216 || input.asset.resourceRevision !== input.resourceRevision
    || input.asset.profile !== "scpv-mp4-h264-aac-v1")
    throw new RouterBoundaryError("native_store_catalog_invalid", 503);
  // Construct canonical field order and detach before hashing asynchronously.
  const binding = Object.fromEntries(fields.map(k => [k, k === "asset"
    ? Object.fromEntries(assetFields.map(a => [a, (input.asset as Record<string, unknown>)[a]])) : input[k]])) as NativeStoreSandboxCatalogV1;
  Object.freeze(binding.asset); Object.freeze(binding);
  const bytes = new TextEncoder().encode(JSON.stringify(binding));
  const fingerprint = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(b => b.toString(16).padStart(2, "0")).join("");
  return Object.freeze({ binding, digest: fingerprint });
}

/** Compare only against an explicitly selected, server-retained binding. Never
 * search for the newest pending intent or pick a binding using SKU/identity.
 * This result is NOT proof the provider event belongs to that intent.
 */
export async function compareNativeStoreSandboxCatalogV1(input: unknown, expectedDigest: string, reported: {
  projectId: string; appId: string | null; store: string | null; environment: string | null; productId: string | null;
}) {
  const observed = { ...reported };
  const snapshot = await snapshotNativeStoreSandboxCatalogV1(input);
  const reasons: string[] = [];
  if (!digest(expectedDigest) || snapshot.digest !== expectedDigest) reasons.push("native_store_catalog_digest_mismatch");
  for (const field of ["projectId", "appId", "store", "environment"] as const)
    if (observed[field] !== snapshot.binding[field]) reasons.push(`native_store_catalog_${field}_mismatch`);
  if (observed.productId !== snapshot.binding.wireProductId) reasons.push("native_store_catalog_product_mismatch");
  return Object.freeze({ protocol: "native-store-sandbox-catalog-comparison-v1" as const,
    catalogMatches: reasons.length === 0, reasons: Object.freeze(reasons), snapshot,
    correlation: "unsupported" as const, dispatchAllowed: false as const, grantsAccess: false as const,
    financialAuthority: false as const });
}
