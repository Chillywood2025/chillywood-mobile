import { createAdminClient } from "../_shared/stripe-connect.ts";
import { createIsolatedTestStoreV2Handler, type TestStoreV2Connection } from "../_shared/isolated-test-store-v2-receipt.ts";

// Dedicated Test Store connection only. No legacy router/secret fallback.
function connection(): TestStoreV2Connection | null {
  if (Deno.env.get("TEST_STORE_V2_INGRESS_ENABLED") !== "true") return null;
  try {
    const key = Deno.env.get("TEST_STORE_V2_STORAGE_KEY_BASE64") ?? "", revision = Deno.env.get("TEST_STORE_V2_CONNECTION_REVISION") ?? "";
    if (!/^[A-Za-z0-9+/]{43}=$/u.test(key) || !/^[1-9][0-9]*$/u.test(revision)) return null;
    const bytes = Uint8Array.from(atob(key), c => c.charCodeAt(0));
    if (btoa(String.fromCharCode(...bytes)) !== key) return null;
    return { connectionId: Deno.env.get("TEST_STORE_V2_CONNECTION_ID") ?? "", connectionRevision: Number(revision),
      projectId: Deno.env.get("TEST_STORE_V2_PROJECT_ID") ?? "", appId: Deno.env.get("TEST_STORE_V2_APP_ID") ?? "",
      providerConfigurationDigest: Deno.env.get("TEST_STORE_V2_PROVIDER_CONFIGURATION_DIGEST") ?? "",
      authentication: { method: "shared_secret", keyVersion: Deno.env.get("TEST_STORE_V2_AUTH_KEY_VERSION") ?? "", secret: Deno.env.get("TEST_STORE_V2_AUTHORIZATION_VALUE") ?? "" },
      encryption: { keyId: Deno.env.get("TEST_STORE_V2_STORAGE_KEY_ID") ?? "", key: bytes } };
  } catch { return null; }
}
export const handler = createIsolatedTestStoreV2Handler({ connection, persist: async (connectionId, revision, envelope, observation) => {
  const admin = createAdminClient(); if (!admin.configured) throw Error("test_store_v2_backend_unavailable");
  const { data, error } = await admin.client.rpc("isolated_test_store_ingest_v2", {
    p_connection_id: connectionId, p_connection_revision: revision, p_envelope: envelope, p_observation: observation,
  });
  if (error) throw Error("test_store_v2_ingress_uncertain"); return data;
} });
if (import.meta.main) Deno.serve(handler);
