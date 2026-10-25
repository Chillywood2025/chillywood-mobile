import { createHash } from "node:crypto";
import type { BrandOriginBinding } from "./brand-retention-origin.ts";

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const BINDING_FIELDS = ["assetId", "ownerId", "sourceCreatedAt", "storageObjectId", "storageVersion", "provider", "bucket", "objectKey"] as const;
type Rpc = (name: string, args: Record<string, unknown>) => Promise<{data: unknown; error?: unknown}>;
type Observation = {observationId: string; observationToken: string; binding: BrandOriginBinding};
type EmptyReadback = {
  protocol: "brand-empty-test-origin-v1";
  sha256: string;
  sizeBytes: 0;
  httpStatus: 200;
  fullReadback: true;
  encoding: "identity";
  completedAt: string;
};

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const uuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

// Deliberately separate from the positive-byte verifier. Empty test evidence
// cannot satisfy its positive-size contract, a clean scan, or delivery access.
function validateBinding(value: unknown): BrandOriginBinding {
  const binding = object(value);
  if (!binding || !uuid(binding.assetId) || !uuid(binding.storageObjectId)
    || typeof binding.ownerId !== "string" || !/^[A-Za-z0-9_-]+$/.test(binding.ownerId)
    || typeof binding.sourceCreatedAt !== "string" || !Number.isFinite(Date.parse(binding.sourceCreatedAt))
    || typeof binding.storageVersion !== "string" || !binding.storageVersion || binding.storageVersion.length > 256
    || binding.provider !== "supabase" || binding.bucket !== "platform-brand-assets"
    || typeof binding.objectKey !== "string" || binding.objectKey.length > 1024
    || !/^[A-Za-z0-9_./-]+$/.test(binding.objectKey) || binding.objectKey.includes("..")
    || binding.objectKey.split("/").some(part => !part || part === ".")
    || !binding.objectKey.startsWith(`${binding.ownerId}/`)) throw Error("brand_empty_origin_binding_invalid");
  // Copy only the typed generation fields; RPC objects must not mutate them.
  return Object.freeze(Object.fromEntries(BINDING_FIELDS.map(field => [field, binding[field]]))) as BrandOriginBinding;
}

function observation(value: unknown, assetId: string): Observation {
  const record = object(value);
  if (!record || !uuid(record.observationId) || !uuid(record.observationToken)) throw Error("brand_empty_observation_invalid");
  const binding = validateBinding(record.binding);
  if (binding.assetId !== assetId) throw Error("brand_empty_observation_invalid");
  return Object.freeze({observationId: record.observationId, observationToken: record.observationToken, binding});
}

// This transport only measures the complete canonical private origin. SQL must
// independently admit the exact authorized archived source, frozen scan jobs,
// removal clock, delegation and current storage generation on both sides.
export function createBrandEmptyTestOriginVerifier(input: {
  projectUrl: string;
  signedUrl: (binding: BrandOriginBinding) => Promise<string>;
  bindingCurrent: (binding: BrandOriginBinding) => Promise<boolean>;
  fetcher?: typeof fetch;
}) {
  let project: URL;
  try { project = new URL(input.projectUrl); } catch { throw Error("brand_empty_origin_config_invalid"); }
  if (project.protocol !== "https:" || project.username || project.password || project.search || project.hash
    || !["", "/"].includes(project.pathname)) throw Error("brand_empty_origin_config_invalid");
  const current = async (binding: BrandOriginBinding) => {
    try { return await input.bindingCurrent(binding) === true; }
    catch { return false; }
  };
  return async (value: BrandOriginBinding): Promise<EmptyReadback> => {
    const binding = validateBinding(value);
    if (!await current(binding)) throw Error("brand_empty_origin_binding_stale");
    let url: URL;
    try { url = new URL(await input.signedUrl(binding)); } catch { throw Error("brand_empty_origin_signing_failed"); }
    if (url.origin !== project.origin || url.username || url.password || url.hash
      || !url.searchParams.get("token") || [...url.searchParams.keys()].some(key => key !== "token")
      || url.searchParams.getAll("token").length !== 1
      || url.pathname !== `/storage/v1/object/sign/${binding.bucket}/${binding.objectKey}`) {
      throw Error("brand_empty_origin_signed_url_invalid");
    }
    // Bound both fetching and EOF, including a transport that never completes
    // its stream. Cancellation is best-effort and must not itself block failure.
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(Error("brand_empty_origin_read_failed")); }, 120_000);
    });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let response: Response | undefined;
    const hash = createHash("sha256");
    let size = 0;
    try {
      try {
        response = await Promise.race([(input.fetcher ?? fetch)(url, {
          method: "GET", headers: {"Accept-Encoding": "identity"},
          redirect: "error", cache: "no-store", signal: controller.signal,
        }), deadline]);
      } catch { throw Error("brand_empty_origin_read_failed"); }
      const length = response.headers.get("content-length");
      if (response.status !== 200 || response.redirected || !response.body || response.headers.has("content-range")
        || ![null, "identity"].includes(response.headers.get("content-encoding"))
        || (length !== null && length !== "0")) throw Error("brand_empty_origin_full_read_required");
      try {
        reader = response.body.getReader();
        while (true) {
          const {done, value: chunk} = await Promise.race([reader.read(), deadline]);
          if (done) break;
          if (!(chunk instanceof Uint8Array)) throw Error("invalid_chunk");
          size += chunk.byteLength;
          if (size !== 0) throw Error("nonempty_origin");
          hash.update(chunk);
        }
      } catch { throw Error("brand_empty_origin_read_failed"); }
    } finally {
      clearTimeout(timer);
      controller.abort();
      if (reader) void reader.cancel().catch(() => {});
      else if (response?.body) void response.body.cancel().catch(() => {});
    }
    const sha256 = hash.digest("hex");
    if (size !== 0 || sha256 !== EMPTY_SHA256) throw Error("brand_empty_origin_read_failed");
    if (!await current(binding)) throw Error("brand_empty_origin_binding_stale");
    return {protocol: "brand-empty-test-origin-v1", sha256, sizeBytes: 0,
      httpStatus: 200, fullReadback: true, encoding: "identity", completedAt: new Date().toISOString()};
  };
}

// Only assetId is accepted from the operator. The observation capability and
// immutable measurements are obtained here, never from caller-supplied proof.
// An uncertain begin/record response is not retried in this invocation.
export async function recordPlatformBrandEmptyTestDisposition(assetId: string, deps: {
  projectUrl: string;
  adminClient: {
    rpc: Rpc;
    storage: {from: (bucket: string) => {createSignedUrl: (key: string, seconds: number) => Promise<{
      data: {signedUrl?: string} | null; error?: unknown;
    }>}};
  };
  fetcher?: typeof fetch;
}) {
  if (!uuid(assetId)) throw Error("brand_empty_origin_binding_invalid");
  const call = async (name: string, args: Record<string, unknown>) => {
    try {
      const result = await deps.adminClient.rpc(name, args);
      if (result.error || !object(result.data)) throw Error("unconfirmed");
      return result.data;
    } catch { throw Error("brand_empty_observation_unconfirmed"); }
  };
  let expected: Observation;
  // Validate configuration before starting any observation, even without bytes.
  const verify = createBrandEmptyTestOriginVerifier({
    projectUrl: deps.projectUrl, fetcher: deps.fetcher,
    bindingCurrent: async binding => {
      const actual = observation(await call("read_platform_brand_empty_observation", {
        p_observation_id: expected.observationId, p_observation_token: expected.observationToken,
      }), assetId);
      return actual.observationId === expected.observationId && actual.observationToken === expected.observationToken
        && BINDING_FIELDS.every(field => actual.binding[field] === binding[field]);
    },
    signedUrl: async binding => {
      const result = await deps.adminClient.storage.from(binding.bucket).createSignedUrl(binding.objectKey, 120);
      if (result.error || typeof result.data?.signedUrl !== "string") throw Error("brand_empty_origin_signing_failed");
      return result.data.signedUrl;
    },
  });
  expected = observation(await call("begin_platform_brand_empty_observation", {p_asset_id: assetId}), assetId);
  const result = await verify(expected.binding);
  const receipt = object(await call("record_platform_brand_empty_disposition", {
    p_observation_id: expected.observationId, p_observation_token: expected.observationToken, p_result: result,
  }));
  if (!receipt || receipt.recorded !== true || receipt.assetId !== assetId || !uuid(receipt.dispositionId)) {
    throw Error("brand_empty_disposition_not_confirmed");
  }
  // No private binding, observation token, provider errors or signed URL leaves
  // the worker. This is retention evidence only, not normal-media verification.
  return {recorded: true, assetId, dispositionId: receipt.dispositionId,
    evidenceKind: "empty_test", scanEvidence: false, expiryActivated: false};
}
