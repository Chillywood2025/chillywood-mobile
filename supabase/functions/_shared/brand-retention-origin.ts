import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 512 * 1024 * 1024;
export type BrandOriginBinding = {
  assetId: string;
  ownerId: string;
  sourceCreatedAt: string;
  storageObjectId: string;
  storageVersion: string;
  provider: "supabase";
  bucket: "platform-brand-assets";
  objectKey: string;
};

function validateBinding(binding: BrandOriginBinding) {
  if (!UUID.test(binding.assetId) || !UUID.test(binding.storageObjectId)
    || typeof binding.ownerId !== "string" || !/^[A-Za-z0-9_-]+$/.test(binding.ownerId)
    || typeof binding.sourceCreatedAt !== "string" || !Number.isFinite(Date.parse(binding.sourceCreatedAt))
    || typeof binding.storageVersion !== "string" || !binding.storageVersion || binding.storageVersion.length > 256
    || binding.provider !== "supabase" || binding.bucket !== "platform-brand-assets"
    || typeof binding.objectKey !== "string" || binding.objectKey.length > 1024
    || !/^[A-Za-z0-9_./-]+$/.test(binding.objectKey) || binding.objectKey.includes("..")
    || !binding.objectKey.startsWith(`${binding.ownerId}/`)) throw Error("brand_origin_binding_invalid");
}

// This worker transport provides bytes evidence only, never scan, ownership,
// retention enrollment, or physical-deletion authority. The caller must obtain
// the binding from the database and confirm the exact incarnation before and
// after transport. No credentials or signed URLs are returned or logged.
export function createBrandOriginVerifier(input: {
  projectUrl: string;
  signedUrl: (binding: BrandOriginBinding) => Promise<string>;
  bindingCurrent: (binding: BrandOriginBinding) => Promise<boolean>;
  fetcher?: typeof fetch;
}) {
  let project: URL;
  try { project = new URL(input.projectUrl); } catch { throw Error("brand_origin_config_invalid"); }
  if (project.protocol !== "https:" || project.username || project.password || project.search || project.hash
    || !["", "/"].includes(project.pathname)) throw Error("brand_origin_config_invalid");
  const current = async (binding: BrandOriginBinding) => {
    try { return await input.bindingCurrent(binding) === true; }
    catch { return false; }
  };
  return async (binding: BrandOriginBinding) => {
    validateBinding(binding);
    if (!await current(binding)) throw Error("brand_origin_binding_stale");
    let url: URL;
    try { url = new URL(await input.signedUrl(binding)); } catch { throw Error("brand_origin_signing_failed"); }
    if (url.origin !== project.origin || url.username || url.password || url.hash
      || !url.searchParams.get("token") || [...url.searchParams.keys()].some(key => key !== "token")
      || url.searchParams.getAll("token").length !== 1
      || url.pathname !== `/storage/v1/object/sign/${binding.bucket}/${binding.objectKey}`) {
      throw Error("brand_origin_signed_url_invalid");
    }
    let response: Response;
    try {
      response = await (input.fetcher ?? fetch)(url, {
        method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(120_000),
      });
    } catch { throw Error("brand_origin_read_failed"); }
    const length = Number(response.headers.get("content-length"));
    if (response.status !== 200 || !response.body || response.headers.has("content-range")
      || ![null, "identity"].includes(response.headers.get("content-encoding"))
      || !Number.isSafeInteger(length) || length <= 0 || length > MAX_BYTES) {
      await response.body?.cancel().catch(() => {});
      throw Error("brand_origin_full_read_required");
    }
    const hash = createHash("sha256");
    let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > length) throw Error("brand_origin_length_mismatch");
        hash.update(value);
      }
    } catch { throw Error("brand_origin_read_failed"); }
    finally { await reader.cancel().catch(() => {}); }
    if (size !== length) throw Error("brand_origin_length_mismatch");
    if (!await current(binding)) throw Error("brand_origin_binding_stale");
    return {
      protocol: "brand-origin-readback-v1", assetId: binding.assetId,
      storageObjectId: binding.storageObjectId, storageVersion: binding.storageVersion,
      sha256: hash.digest("hex"), sizeBytes: size, verifiedAt: new Date().toISOString(),
      fullReadback: true, scanEvidence: false, enrollmentAllowed: false,
    };
  };
}

// Service-worker orchestration. This is deliberately read-only: a later clean
// scan receipt must independently bind these exact bytes before admission.
export async function verifyPlatformBrandRetentionOrigin(assetId: string, deps: {
  projectUrl: string;
  adminClient: {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{data: unknown; error?: unknown}>;
    storage: {from: (bucket: string) => {createSignedUrl: (key: string, seconds: number) => Promise<{
      data: {signedUrl?: string} | null; error?: unknown;
    }>}};
  };
  fetcher?: typeof fetch;
}) {
  if (!UUID.test(assetId)) throw Error("brand_origin_binding_invalid");
  const read = async (): Promise<BrandOriginBinding | null> => {
    try {
      const result = await deps.adminClient.rpc("read_platform_brand_retention_binding", {p_asset_id: assetId});
      if (result.error || !result.data || typeof result.data !== "object" || Array.isArray(result.data)) return null;
      const binding = result.data as BrandOriginBinding;
      validateBinding(binding);
      return binding.assetId === assetId ? binding : null;
    } catch { return null; }
  };
  const fields: (keyof BrandOriginBinding)[] = ["assetId", "ownerId", "sourceCreatedAt", "storageObjectId", "storageVersion", "provider", "bucket", "objectKey"];
  // Constructing the verifier validates configuration before even reading SQL.
  const verify = createBrandOriginVerifier({
    projectUrl: deps.projectUrl, fetcher: deps.fetcher,
    bindingCurrent: async expected => {
      const actual = await read();
      return actual !== null && fields.every(field => actual[field] === expected[field]);
    },
    signedUrl: async binding => {
      const result = await deps.adminClient.storage.from(binding.bucket).createSignedUrl(binding.objectKey, 120);
      if (result.error || typeof result.data?.signedUrl !== "string") throw Error("brand_origin_signing_failed");
      return result.data.signedUrl;
    },
  });
  const binding = await read();
  if (!binding) throw Error("brand_origin_binding_unavailable");
  return {binding, readback: await verify(binding), recorded: false, enrollmentAllowed: false};
}
