// Server-only private-origin reader, using the existing media-storage providers
// and configuration. Never return a signed origin URL to the inspection client.
import { buildCanonicalSignedHeaders } from "./media-upload-integrity.ts";
import { InspectionMediaError } from "./content-inspection-media.ts";

type OriginConfig = {
  provider: "s3" | "cloudflare_r2";
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};
export type InspectionOriginBinding = {
  provider: string;
  bucket: string;
  objectKey: string;
  originReadExpiresAt?: string;
};

export function inspectionOriginConfig(
  env: (name: string) => string | undefined,
): OriginConfig {
  const read = (name: string) => (env(name) ?? "").trim();
  const required = (name: string) => {
    const value = read(name);
    if (!value) {
      throw new InspectionMediaError(503, "private_origin_unavailable");
    }
    return value;
  };
  if (read("MEDIA_ORIGIN_PROVIDER").toLowerCase() === "cloudflare_r2") {
    if (
      read("MEDIA_ORIGIN_PRIVATE_ONLY").toLowerCase() !== "true" ||
      read("MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED").toLowerCase() !== "true"
    ) {
      throw new InspectionMediaError(503, "private_origin_unavailable");
    }
    return {
      provider: "cloudflare_r2",
      endpoint: required("MEDIA_ORIGIN_R2_ENDPOINT"),
      bucket: required("MEDIA_ORIGIN_BUCKET"),
      region: read("MEDIA_ORIGIN_R2_REGION") || "auto",
      accessKeyId: required("MEDIA_ORIGIN_R2_ACCESS_KEY_ID"),
      secretAccessKey: required("MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY"),
    };
  }
  if (read("S3_PROVIDER").toLowerCase() !== "hetzner") {
    throw new InspectionMediaError(503, "private_origin_unavailable");
  }
  return {
    provider: "s3",
    endpoint: required("S3_ENDPOINT"),
    bucket: required("S3_BUCKET"),
    region: required("S3_REGION"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
  };
}

const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
const hex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value), (v) => v.toString(16).padStart(2, "0"))
    .join("");
const bytes = (value: string) => new TextEncoder().encode(value);
const hmac = async (key: Uint8Array | ArrayBuffer, value: string) => {
  const material = new Uint8Array(
    key instanceof ArrayBuffer ? key : key.slice().buffer as ArrayBuffer,
  );
  const imported = await crypto.subtle.importKey(
    "raw",
    material,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", imported, bytes(value));
};

export function createInspectionOriginReader(
  config: OriginConfig,
  request: typeof fetch = fetch,
) {
  const endpoint = new URL(config.endpoint);
  if (
    endpoint.protocol !== "https:" || endpoint.username || endpoint.password ||
    endpoint.search || endpoint.hash ||
    !["", "/"].includes(endpoint.pathname) ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket)
  ) {
    throw new InspectionMediaError(503, "private_origin_unavailable");
  }
  const host = `${config.bucket}.${endpoint.host}`;
  return async (
    binding: InspectionOriginBinding,
    method: "GET" | "HEAD",
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<Response> => {
    if (
      binding.provider !== config.provider ||
      binding.bucket !== config.bucket ||
      !binding.objectKey || binding.objectKey.length > 1024 ||
      binding.objectKey.startsWith("/") ||
      binding.objectKey.includes("..") ||
      [...binding.objectKey].some((c) =>
        c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || c === "\\"
      )
    ) {
      throw new InspectionMediaError(409, "unavailable_original");
    }
    // Only exact range/validator headers are accepted; no arbitrary forwarding.
    if (
      Object.keys(headers).some((key) => !["range", "if-match"].includes(key))
    ) {
      throw new InspectionMediaError(500, "origin_request_invalid");
    }
    const now = Date.now();
    const expiresAt = binding.originReadExpiresAt === undefined
      ? null
      : Date.parse(binding.originReadExpiresAt);
    const expiresSeconds = expiresAt === null
      ? 30
      : Math.min(30, Math.floor((expiresAt - now) / 1000));
    if (!Number.isFinite(expiresSeconds) || expiresSeconds < 1) {
      throw new InspectionMediaError(403, "media_retired_or_expired");
    }
    const path = `/${binding.objectKey.split("/").map(encode).join("/")}`;
    const amzDate = new Date(now).toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = amzDate.slice(0, 8);
    const scope = `${date}/${config.region}/s3/aws4_request`;
    const signed = buildCanonicalSignedHeaders(host, headers);
    const query = Object.entries({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
      "X-Amz-Credential": `${config.accessKeyId}/${scope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expiresSeconds),
      "X-Amz-SignedHeaders": signed.signedHeaders,
    }).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) =>
      `${encode(key)}=${encode(value)}`
    ).join("&");
    const canonical = [
      method,
      path,
      query,
      signed.canonicalHeaders,
      signed.signedHeaders,
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const toSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      hex(await crypto.subtle.digest("SHA-256", bytes(canonical))),
    ].join("\n");
    const dateKey = await hmac(bytes(`AWS4${config.secretAccessKey}`), date);
    const regionKey = await hmac(dateKey, config.region);
    const serviceKey = await hmac(regionKey, "s3");
    const signingKey = await hmac(serviceKey, "aws4_request");
    const signature = hex(await hmac(signingKey, toSign));
    if (expiresAt !== null && Date.now() >= expiresAt) {
      throw new InspectionMediaError(403, "media_retired_or_expired");
    }
    const fetchSignal = expiresAt === null ? signal : AbortSignal.any([
      signal,
      AbortSignal.timeout(Math.max(1, Math.floor(expiresAt - Date.now()))),
    ]);
    try {
      return await request(
        `https://${host}${path}?${query}&X-Amz-Signature=${signature}`,
        {
          method,
          headers,
          signal: fetchSignal,
          redirect: "error",
          cache: "no-store",
        },
      );
    } catch {
      // Fetch errors may embed URLs or provider details; never propagate them.
      throw new InspectionMediaError(502, "private_origin_unavailable");
    }
  };
}
