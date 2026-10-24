import { inspectionOriginConfig } from "./content-inspection-private-origin.ts";
import { buildCanonicalSignedHeaders } from "./media-upload-integrity.ts";
import { BUCKET, CONFLICT_PAYLOAD, DEADLINE, MAX_OBJECT_BYTES, MUTATION_RECEIPTS, OBJECTS, R2_ENDPOINT, sha256 } from "./r2-disposable-qualification-manifest.ts";
import type { Operation } from "./r2-disposable-qualification-manifest.ts";

export type Observation = { status: number; byteCount?: number; sha256?: string; observedAt: string };
export type Origin = (operation: Operation) => Promise<Observation>;
const encode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g,
  (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const bytes = (s: string) => new TextEncoder().encode(s);
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (n) => n.toString(16).padStart(2, "0")).join("");
const hmac = async (key: Uint8Array | ArrayBuffer, text: string) => {
  const imported = await crypto.subtle.importKey("raw", new Uint8Array(key),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", imported, bytes(text));
};

// Full body, not HEAD/ETag evidence. Never buffer more than the fixed cap.
export async function readBoundedBody(response: Response): Promise<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const length = response.headers.get("content-length");
  try {
    if (response.status !== 200 || response.headers.has("content-range") ||
      ![null, "identity"].includes(response.headers.get("content-encoding"))) throw Error("read_invalid");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_OBJECT_BYTES)) throw Error("read_invalid");
    if (!response.body) throw Error("read_invalid");
    reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_OBJECT_BYTES) throw Error("read_invalid");
      chunks.push(value);
    }
  } finally {
    if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    else await response.body?.cancel().catch(() => {});
  }
  if (length !== null && Number(length) !== size) throw Error("read_invalid");
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

// No arbitrary key, URL, method, payload or request headers are accepted.
// Configuration is the existing private R2 configuration; no new credential.
export function createQualificationOrigin(
  env: (name: string) => string | undefined,
  request: typeof fetch = fetch,
  now: () => number = Date.now,
): Origin {
  const config = inspectionOriginConfig(env), endpoint = new URL(config.endpoint);
  if (config.provider !== "cloudflare_r2" || config.bucket !== BUCKET || config.region !== "auto" || config.endpoint !== R2_ENDPOINT ||
    endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.port ||
    endpoint.search || endpoint.hash || !["", "/"].includes(endpoint.pathname) ||
    !/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname)) throw Error("origin_unsupported");
  const host = `${BUCKET}.${endpoint.hostname}`;
  const specs = {
      put_control: { method: "PUT", object: OBJECTS.control, payload: OBJECTS.control.payload },
      put_target: { method: "PUT", object: OBJECTS.target, payload: OBJECTS.target.payload },
      conflict_target: { method: "PUT", object: OBJECTS.target, payload: CONFLICT_PAYLOAD },
      get_control: { method: "GET", object: OBJECTS.control, payload: "" },
      get_target: { method: "GET", object: OBJECTS.target, payload: "" },
      delete_target: { method: "DELETE", object: OBJECTS.target, payload: "" },
      delete_control: { method: "DELETE", object: OBJECTS.control, payload: "" },
  } as const;
  // Private transport accepts only factory-owned specs. No receipt GET/DELETE,
  // permit adoption, raw transport export or caller-selected key exists.
  const dispatch = async (spec: { method: string; object: { key: string }; payload: string }): Promise<Observation> => {
    const started = now(), remaining = Date.parse(DEADLINE) - started;
    if (!Number.isFinite(started) || remaining <= 0) throw Error("deadline_passed");
    const path = `/${spec.object.key.split("/").map(encode).join("/")}`;
    const dateTime = new Date(started).toISOString().replace(/[:-]|\.\d{3}/g, ""), date = dateTime.slice(0, 8);
    const payloadHash = await sha256(bytes(spec.payload));
    const headers: Record<string, string> = { "x-amz-date": dateTime, "x-amz-content-sha256": payloadHash };
    if (spec.method === "PUT") Object.assign(headers, {
      "content-type": "text/plain; charset=utf-8", "content-length": String(bytes(spec.payload).length), "if-none-match": "*",
    });
    if (spec.method === "GET") headers["accept-encoding"] = "identity";
    const signed = buildCanonicalSignedHeaders(host, headers), scope = `${date}/auto/s3/aws4_request`;
    const canonical = [spec.method, path, "", signed.canonicalHeaders, signed.signedHeaders, payloadHash].join("\n");
    const toSign = ["AWS4-HMAC-SHA256", dateTime, scope, await sha256(bytes(canonical))].join("\n");
    const key = await hmac(await hmac(await hmac(await hmac(bytes(`AWS4${config.secretAccessKey}`), date), "auto"), "s3"), "aws4_request");
    headers.Authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signed.signedHeaders}, Signature=${hex(await hmac(key, toSign))}`;
    // Signing can consume time; never dispatch after the deadline.
    const budget = Math.min(15_000, Date.parse(DEADLINE) - now());
    if (budget <= 0) throw Error("deadline_passed");
    try {
      const response = await request(`https://${host}${path}`, {
        method: spec.method, headers, body: spec.method === "PUT" ? spec.payload : undefined,
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(budget),
      });
      if (spec.method === "GET" && response.status === 200) {
        const body = await readBoundedBody(response);
        return { status: 200, byteCount: body.length, sha256: await sha256(body), observedAt: new Date(now()).toISOString() };
      }
      await response.body?.cancel().catch(() => {});
      return { status: response.status, observedAt: new Date(now()).toISOString() };
    } catch { throw Error("qualification_origin_unconfirmed"); }
  };
  return async (operation) => {
    if (!Object.hasOwn(specs, operation)) throw Error("operation_not_allowlisted");
    if (Object.hasOwn(MUTATION_RECEIPTS, operation)) {
      const receipt = MUTATION_RECEIPTS[operation as keyof typeof MUTATION_RECEIPTS];
      // Only this call's fresh acknowledged create can authorize this dispatch.
      // Never persist/reuse a permit or interpret a receipt 412 as the tested
      // conflict response. Unknown/duplicate/locked receipts dispatch nothing.
      const acquired = await dispatch({ method: "PUT", object: receipt, payload: receipt.payload });
      if (acquired.status !== 200) throw Error("qualification_fence_not_acquired");
    }
    return dispatch(specs[operation]);
  };
}
