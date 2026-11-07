import { createAdminClient } from "../_shared/provider-readiness.ts";
import { createReceiptRouterHandler } from "../_shared/revenuecat-router-handler.ts";
import type { RouterConnection } from "../_shared/revenuecat-router-envelope.ts";

// Separate, inactive endpoint. Nothing changes the legacy provider destination.
// No activation/provisioning API is provided and no provider HTTP call occurs.
function connection(): RouterConnection | null {
  if (Deno.env.get("RECEIPT_ROUTER_INGRESS_ENABLED") !== "true") return null;
  try {
    const method = Deno.env.get("RECEIPT_ROUTER_AUTH_METHOD");
    if (method !== "shared_secret") return null;
    const key = Deno.env.get("RECEIPT_ROUTER_STORAGE_KEY_BASE64") ?? "";
    if (!/^[A-Za-z0-9+/]{43}=$/u.test(key)) return null;
    return {
      connectionId: Deno.env.get("RECEIPT_ROUTER_CONNECTION_ID") ?? "",
      connectionRevision: Number(Deno.env.get("RECEIPT_ROUTER_CONNECTION_REVISION")),
      projectId: Deno.env.get("RECEIPT_ROUTER_PROJECT_ID") ?? "",
      authentication: { method, keyVersion: Deno.env.get("RECEIPT_ROUTER_AUTH_KEY_VERSION") ?? "",
        secret: Deno.env.get("RECEIPT_ROUTER_AUTHORIZATION_VALUE") ?? "" },
      encryption: { keyId: Deno.env.get("RECEIPT_ROUTER_STORAGE_KEY_ID") ?? "", key: Uint8Array.from(atob(key), c => c.charCodeAt(0)) },
    };
  } catch { return null; }
}
export const handler = createReceiptRouterHandler({ connection, persist: async (connectionId, revision, envelope) => {
  const admin = createAdminClient(); if (!admin.configured) throw Error("router_backend_unavailable");
  const { data, error } = await admin.client.rpc("receipt_router_ingest_v1", {
    p_connection_id: connectionId, p_connection_revision: revision, p_envelope: envelope,
  });
  if (error) throw Error("router_ingress_rejected"); return data;
} });
if (import.meta.main) Deno.serve(handler);
