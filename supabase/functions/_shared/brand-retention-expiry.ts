const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Rpc = (name: string, args: Record<string, unknown>) => Promise<{data: unknown; error?: unknown}>;
type Binding = {assetId: string; claimToken: string; provider: string; bucket: string; objectKey: string;
  storageObjectId: string; storageVersion: string; providerOrigin: string; providerContractSha256: string;
  exactVersionDelete: boolean; permanentlyAbsent: boolean};
type Origin = (binding: Binding, method: "DELETE" | "HEAD") => Promise<Response>;
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
function validate(binding: Binding) {
  if (!binding || !UUID.test(binding.assetId) || !UUID.test(binding.claimToken) || !UUID.test(binding.storageObjectId)
    || binding.provider !== "supabase" || binding.bucket !== "platform-brand-assets"
    || typeof binding.objectKey !== "string" || binding.objectKey.length > 1024
    || !/^[A-Za-z0-9][A-Za-z0-9_./-]+$/.test(binding.objectKey)
    || binding.objectKey.split("/").some(part => !part || part === "." || part === "..")
    || typeof binding.storageVersion !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(binding.storageVersion)
    || binding.exactVersionDelete !== true || binding.permanentlyAbsent !== false
    || !/^[a-f0-9]{64}$/.test(binding.providerContractSha256)) throw Error("brand_expiry_binding_invalid");
}

// Provider capability must have been qualified against the deployed Storage
// build, not inferred from upstream source. Version-specific DELETE plus the
// permanent key fence protects the original incarnation; no plain-key fallback.
// https://github.com/supabase/storage/blob/master/src/http/routes/object/deleteObject.ts
export function createBrandExpiryOrigin(projectUrl: string, serviceKey: string, request: typeof fetch = fetch): Origin {
  let project: URL;
  try { project = new URL(projectUrl); } catch { throw Error("brand_expiry_config_invalid"); }
  if (project.protocol !== "https:" || project.username || project.password || project.search || project.hash
    || !["", "/"].includes(project.pathname) || !serviceKey) throw Error("brand_expiry_config_invalid");
  return async (binding, method) => {
    validate(binding);
    if (binding.providerOrigin !== project.origin || !["DELETE", "HEAD"].includes(method)) throw Error("brand_expiry_binding_invalid");
    const key = binding.objectKey.split("/").map(encodeURIComponent).join("/");
    const url = new URL(`/storage/v1/object/${method === "HEAD" ? "authenticated/" : ""}${binding.bucket}/${key}`, project.origin);
    url.searchParams.set("versionId", binding.storageVersion);
    try {
      return await request(url, {method, headers: {Authorization: `Bearer ${serviceKey}`, apikey: serviceKey},
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000)});
    } catch { throw Error("brand_expiry_origin_failed"); }
  };
}

// One explicit asset, no prefix/list/schedule. The database issues and rechecks
// an irreversible exact claim only after 720h, holds/references, and qualification.
// HTTP404 is an observation through the provider API, not proof about backups
// or permanence. Uncertain RPC outcomes are never retried in this invocation.
export async function expirePlatformBrandAsset(assetId: string, deps: {rpc: Rpc; origin: Origin}) {
  if (!UUID.test(assetId)) throw Error("brand_expiry_asset_invalid");
  const call = async (name: string, args: Record<string, unknown>) => {
    try {
      const result = await deps.rpc(name, args), data = object(result.data);
      if (result.error || !data) throw Error("unconfirmed");
      return data;
    } catch { throw Error("brand_expiry_rpc_unconfirmed"); }
  };
  const claim = await call("begin_platform_brand_retention_transport", {p_asset_id: assetId});
  if (typeof claim.status !== "string") throw Error("brand_expiry_claim_invalid");
  if (claim.status !== "claimed") return {status: claim.status, permanentlyAbsent: false};
  if (claim.assetId !== assetId || typeof claim.claimToken !== "string" || !UUID.test(claim.claimToken)) throw Error("brand_expiry_claim_invalid");
  const read = await call("read_platform_brand_retention_expiry_claim", {p_asset_id: assetId, p_claim_token: claim.claimToken});
  if (typeof read.status !== "string") throw Error("brand_expiry_binding_invalid");
  if (read.status !== "authorized") return {status: read.status, permanentlyAbsent: false};
  const binding = Object.freeze({...read}) as unknown as Binding;
  validate(binding);
  if (binding.assetId !== assetId || binding.claimToken !== claim.claimToken) throw Error("brand_expiry_binding_invalid");
  let outcome = "failed";
  try {
    const response = await deps.origin(binding, "DELETE");
    await response.body?.cancel();
    if (response.status === 200 || response.status === 204 || response.status === 404) {
      outcome = "delete_acknowledged";
      const observed = await deps.origin(binding, "HEAD");
      await observed.body?.cancel();
      if (observed.status === 404) outcome = "observed_absent";
    }
  } catch { /* preserve claim for independently requalified exact retry */ }
  const receipt = await call("record_platform_brand_retention_transport_result", {
    p_asset_id: assetId, p_claim_token: binding.claimToken, p_outcome: outcome,
  });
  if (receipt.status !== outcome || receipt.assetId !== assetId || receipt.claimToken !== binding.claimToken
    || receipt.permanentlyAbsent !== false) throw Error("brand_expiry_receipt_unconfirmed");
  return {status: outcome, permanentlyAbsent: false};
}
