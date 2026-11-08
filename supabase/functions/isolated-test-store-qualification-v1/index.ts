import { createAdminClient } from "../_shared/stripe-connect.ts";
import { createQualificationHandler, type QualificationConnection } from "../_shared/isolated-test-store-qualification.ts";

// Configured transport identity only; no behavioral evidence or economic secret
// fallback. Empty environment and empty SQL configuration both remain disabled.
function connection(): QualificationConnection | null {
  if (Deno.env.get("TEST_STORE_QUALIFICATION_ENABLED") !== "true") return null;
  try {
    const encoded = Deno.env.get("TEST_STORE_QUALIFICATION_STORAGE_KEY_BASE64") ?? "";
    const revision = Deno.env.get("TEST_STORE_QUALIFICATION_CONNECTION_REVISION") ?? "";
    if (!/^[A-Za-z0-9+/]{43}=$/u.test(encoded) || !/^[1-9][0-9]*$/u.test(revision)) return null;
    const key = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    if (btoa(String.fromCharCode(...key)) !== encoded) return null;
    return { connectionId: Deno.env.get("TEST_STORE_QUALIFICATION_CONNECTION_ID") ?? "", connectionRevision: Number(revision),
      projectId: Deno.env.get("TEST_STORE_QUALIFICATION_PROJECT_ID") ?? "", appId: Deno.env.get("TEST_STORE_QUALIFICATION_APP_ID") ?? "",
      authentication: { method: "shared_secret", keyVersion: Deno.env.get("TEST_STORE_QUALIFICATION_AUTH_KEY_VERSION") ?? "",
        secret: Deno.env.get("TEST_STORE_QUALIFICATION_AUTHORIZATION_VALUE") ?? "" },
      encryption: { keyId: Deno.env.get("TEST_STORE_QUALIFICATION_STORAGE_KEY_ID") ?? "", key } };
  } catch { return null; }
}
export const handler = createQualificationHandler({ connection, persist: async (id, revision, envelope, observation) => {
  const admin = createAdminClient(); if (!admin.configured) throw Error("qualification_backend_unavailable");
  const { data, error } = await admin.client.rpc("isolated_test_store_qualification_ingest_v1", {
    p_connection_id: id, p_connection_revision: revision, p_envelope: envelope, p_observation: observation,
  });
  if (error) throw Error("qualification_storage_unknown"); return data;
} });
if (import.meta.main) Deno.serve(handler);
