import { createQualificationHandler, type QualificationConnection } from "../_shared/isolated-test-store-qualification.ts";

// No provider management API, commerce SDK, user/auth lookup or Stripe imports.
// Deliberately separate names: an older qualification/commerce flag cannot start capture.
function connection(): QualificationConnection | null {
  if (Deno.env.get("RCQ_CAPTURE_V1_ENABLED") !== "true") return null;
  try {
    const encoded = Deno.env.get("RCQ_CAPTURE_V1_STORAGE_KEY_BASE64") ?? "";
    const revision = Deno.env.get("RCQ_CAPTURE_V1_CONNECTION_REVISION") ?? "";
    if (!/^[A-Za-z0-9+/]{43}=$/u.test(encoded) || !/^[1-9][0-9]*$/u.test(revision)) return null;
    const key = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    if (btoa(String.fromCharCode(...key)) !== encoded) return null;
    return { connectionId: Deno.env.get("RCQ_CAPTURE_V1_CONNECTION_ID") ?? "", connectionRevision: Number(revision),
      projectId: Deno.env.get("RCQ_CAPTURE_V1_PROJECT_ID") ?? "", appId: Deno.env.get("RCQ_CAPTURE_V1_APP_ID") ?? "",
      authentication: { method: "shared_secret", keyVersion: Deno.env.get("RCQ_CAPTURE_V1_AUTH_KEY_VERSION") ?? "",
        secret: Deno.env.get("RCQ_CAPTURE_V1_AUTHORIZATION_VALUE") ?? "" },
      encryption: { keyId: Deno.env.get("RCQ_CAPTURE_V1_STORAGE_KEY_ID") ?? "", key } };
  } catch { return null; }
}

export const handler = createQualificationHandler({ connection, persist: async (id, revision, envelope, observation) => {
  const base = new URL(Deno.env.get("SUPABASE_URL") ?? "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash
    || base.pathname !== "/" || !key || /[\r\n]/u.test(key)) throw Error("capture_backend_unavailable");
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 4500);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(new URL("/rest/v1/rpc/isolated_test_store_capture_ingest_v1", base), {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ p_connection_id: id, p_connection_revision: revision,
        p_envelope: envelope, p_observation: observation }),
    });
    if (response.status !== 200 || !response.body) throw Error("capture_storage_unknown");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.length; if (size > 16384) throw Error("capture_result_limit"); chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally {
    clearTimeout(timer); controller.abort();
    if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
} });
if (import.meta.main) Deno.serve(handler);
