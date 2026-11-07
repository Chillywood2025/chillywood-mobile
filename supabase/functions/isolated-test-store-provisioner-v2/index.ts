import { createAdminClient } from "../_shared/stripe-connect.ts";
import { createProvisioningWorker, type ProvisioningConfig } from "../_shared/isolated-test-store-v2-provisioner.ts";

// Dedicated configuration only. No receipt/live/legacy secret fallback and no
// source-installed key or qualified provider facts. SQL controls also default off.
function configuration(): ProvisioningConfig | null {
  if (Deno.env.get("TEST_STORE_V2_PROVISIONING_ENABLED") !== "true") return null;
  try {
    const encoded = Deno.env.get("TEST_STORE_V2_STORAGE_KEY_BASE64") ?? "";
    const revision = Deno.env.get("TEST_STORE_V2_CONNECTION_REVISION") ?? "";
    if (!/^[A-Za-z0-9+/]{43}=$/u.test(encoded) || !/^[1-9][0-9]*$/u.test(revision)) return null;
    const key = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    if (btoa(String.fromCharCode(...key)) !== encoded) return null;
    return { enabled: true, qualification: "qualified",
      connectionId: Deno.env.get("TEST_STORE_V2_CONNECTION_ID") ?? "", connectionRevision: Number(revision),
      projectId: Deno.env.get("TEST_STORE_V2_PROJECT_ID") ?? "", appId: Deno.env.get("TEST_STORE_V2_APP_ID") ?? "",
      providerConfigurationDigest: Deno.env.get("TEST_STORE_V2_PROVIDER_CONFIGURATION_DIGEST") ?? "",
      qualificationEvidenceSha256: Deno.env.get("TEST_STORE_V2_PROVISIONING_QUALIFICATION_SHA256") ?? "",
      credentialRef: Deno.env.get("TEST_STORE_V2_PROVIDER_CREDENTIAL_REF") ?? "",
      credentialVersion: Deno.env.get("TEST_STORE_V2_PROVIDER_CREDENTIAL_VERSION") ?? "",
      secret: Deno.env.get("TEST_STORE_V2_PROVIDER_CREDENTIAL_SECRET") ?? "",
      encryption: { keyId: Deno.env.get("TEST_STORE_V2_STORAGE_KEY_ID") ?? "", key },
      limits: { timeoutMs: 5000, maxResponseBytes: 262144, pageSize: 100, maxPages: 10, maxItems: 1000 } };
  } catch { return null; }
}
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const admin = createAdminClient(); if (!admin.configured) throw Error("test_store_v2_backend_unavailable");
  const { data, error } = await admin.client.rpc(name, args);
  if (error) throw Error("test_store_v2_worker_rpc_uncertain"); return data;
}
export const handler = createProvisioningWorker(configuration, () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null, {
  next: planId => rpc("isolated_test_store_v2_provisioning_next_v1", { p_plan_id: planId }),
  claim: s => rpc("isolated_test_store_v2_provisioning_claim_v1", {
    p_plan_id: s.planId, p_operation: s.operation, p_request_id: s.requestId, p_cursor: s.cursor,
  }),
  record: r => rpc("isolated_test_store_v2_provisioning_record_v1", {
    p_ticket_id: r.ticketId, p_evidence: r.evidence, p_observation: r.observation,
  }),
  fetch: (url, init) => fetch(url, init),
});
if (import.meta.main) Deno.serve(handler);
