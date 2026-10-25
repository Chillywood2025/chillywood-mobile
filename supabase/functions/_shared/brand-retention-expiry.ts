const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Rpc = (name: string, args: Record<string, unknown>) => Promise<{data: unknown; error?: unknown}>;
type Binding = {assetId: string; claimToken: string; provider: string; bucket: string; objectKey: string;
  storageObjectId: string; storageVersion: string; providerOrigin: string; providerContractSha256: string;
  exactVersionDelete: boolean; permanentlyAbsent: boolean; metadataPresent: boolean; observationOnly: boolean; deleteAcknowledged: boolean};
type Operation = "DELETE" | "HEAD" | "INFO" | "GET";
type Origin = (binding: Binding, operation: Operation) => Promise<Response>;
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
    if (binding.providerOrigin !== project.origin || !["DELETE", "HEAD", "INFO", "GET"].includes(method)) throw Error("brand_expiry_binding_invalid");
    const key = binding.objectKey.split("/").map(encodeURIComponent).join("/");
    const route = method === "INFO" ? "info/" : method === "DELETE" ? "" : "authenticated/";
    const url = new URL(`/storage/v1/object/${route}${binding.bucket}/${key}`, project.origin);
    if (method === "DELETE" || method === "HEAD") url.searchParams.set("versionId", binding.storageVersion);
    try {
      return await request(url, {method: method === "INFO" ? "GET" : method, headers: {Authorization: `Bearer ${serviceKey}`, apikey: serviceKey},
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000)});
    } catch { throw Error("brand_expiry_origin_failed"); }
  };
}

// Missing is an authenticated, bounded structured observation, not an arbitrary
// 400/404, an SDK message, HEAD400, or evidence about backups. Never buffer media.
async function missing(response: Response): Promise<boolean> {
  if (![400, 404].includes(response.status)) { void response.body?.cancel().catch(() => {}); return false; }
  const reader = response.body?.getReader();
  if (!reader) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("observation_timeout")), 15_000); });
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65536) return false;
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = object(JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes)));
    return !!body && ["NoSuchKey", "NoSuchObject", "not_found"].includes(String(body.code))
      && (body.statusCode === undefined || ["400", "404"].includes(String(body.statusCode)));
  } catch { return false; }
  finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}

async function observeAbsent(binding: Binding, origin: Origin): Promise<boolean> {
  if (!await missing(await origin(binding, "INFO"))) return false;
  const head = await origin(binding, "HEAD");
  void head.body?.cancel().catch(() => {});
  if (![400, 404].includes(head.status)) return false;
  // A successful current GET is pending even after a DELETE acknowledgement and
  // arbitrarily long elapsed time. A later invocation may observe convergence.
  return await missing(await origin(binding, "GET"));
}

// One explicit asset, no prefix/list/schedule. The database issues and rechecks
// an irreversible exact claim only after 720h, holds/references, and qualification.
// Structured missing observations through the provider API are not proof about
// backups or permanence. Uncertain RPC outcomes are never retried here.
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
  if (typeof binding.observationOnly !== "boolean" || typeof binding.metadataPresent !== "boolean" || typeof binding.deleteAcknowledged !== "boolean") throw Error("brand_expiry_binding_invalid");
  const record = async (outcome: string) => {
    const receipt = await call("record_platform_brand_retention_transport_result", {
    p_asset_id: assetId, p_claim_token: binding.claimToken, p_outcome: outcome,
    });
    if (receipt.status !== outcome || receipt.assetId !== assetId || receipt.claimToken !== binding.claimToken
      || receipt.permanentlyAbsent !== false) throw Error("brand_expiry_receipt_unconfirmed");
  };
  let outcome = binding.deleteAcknowledged === true ? "delete_acknowledged" : "failed";
  if (!binding.observationOnly && binding.metadataPresent) {
    // The database rechecks every guard and inserts an immutable intent before
    // granting a single dispatch. Unknown RPC outcomes never reach the provider.
    const permit = await call("prepare_platform_brand_retention_dispatch", {p_asset_id: assetId, p_claim_token: binding.claimToken});
    if (typeof permit.status !== "string") throw Error("brand_expiry_binding_invalid");
    if (!["dispatch_authorized", "observe_only"].includes(String(permit.status))) return {status: permit.status, permanentlyAbsent: false};
    for (const field of ["assetId", "claimToken", "storageObjectId", "storageVersion", "provider", "bucket", "objectKey", "providerOrigin", "providerContractSha256", "exactVersionDelete", "permanentlyAbsent"] as const) {
      if (permit[field] !== binding[field]) throw Error("brand_expiry_binding_invalid");
    }
    if (permit.deleteAcknowledged === true) outcome = "delete_acknowledged";
    if (permit.status === "dispatch_authorized") {
      if (permit.metadataPresent !== true || permit.observationOnly !== false || permit.deleteAcknowledged !== false) throw Error("brand_expiry_binding_invalid");
      try {
        const response = await deps.origin(binding, "DELETE");
        void response.body?.cancel().catch(() => {});
        if ([200, 204, 404].includes(response.status)) outcome = "delete_acknowledged";
      } catch { /* immutable intent prevents replay, including uncertain dispatch */ }
      // Commit acknowledged versus uncertain before observation. Failure here
      // leaves the intent, so subsequent invocations can only reconcile reads.
      await record(outcome);
    }
  }
  try { if (await observeAbsent(binding, deps.origin)) outcome = "observed_absent"; }
  catch { /* preserve pending state; never retry provider calls in this invocation */ }
  await record(outcome);
  return {status: outcome, permanentlyAbsent: false};
}
