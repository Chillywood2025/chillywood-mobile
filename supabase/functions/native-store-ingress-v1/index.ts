import { processConfiguredNativeStoreReceiptV1 } from "../_shared/native-store-configured-process-v1.ts";
import { createAdminClient } from "../_shared/provider-readiness.ts";
import { createNativeStoreIngressHandlerV1 } from "../_shared/native-store-ingress-handler-v1.ts";
import { parseNativeStoreRuntimeConnectionsV1, selectNativeStoreIngressConnectionV1 } from "../_shared/native-store-runtime-config-v1.ts";

// Disabled by default. No legacy provider destination or runtime flag changes.
export const handler = createNativeStoreIngressHandlerV1({
  connection: () => {
    if (Deno.env.get("NATIVE_STORE_INGRESS_ENABLED") !== "true") return null;
    try {
      const revision = Deno.env.get("NATIVE_STORE_INGRESS_CONNECTION_REVISION") ?? "";
      if (!/^[1-9][0-9]*$/u.test(revision)) return null;
      return selectNativeStoreIngressConnectionV1(parseNativeStoreRuntimeConnectionsV1(Deno.env.get("NATIVE_STORE_CONNECTIONS_JSON")),
        Deno.env.get("NATIVE_STORE_INGRESS_CONNECTION_ID"), Number(revision));
    } catch { return null; }
  },
  reconcile: async (rawReceiptId, deadlineMs) => {
    if (Deno.env.get("NATIVE_STORE_RECONCILE_ENABLED") !== "true") return;
    await processConfiguredNativeStoreReceiptV1(rawReceiptId, deadlineMs);
  },
  persist: async intake => {
    const admin = createAdminClient(); if (!admin.configured) throw Error("native_store_backend_unavailable");
    const { data, error } = await admin.client.rpc("native_store_sandbox_journal_v1", { p_intake: intake });
    if (error) throw Error("native_store_journal_unavailable");
    return data;
  },
});
if (import.meta.main) Deno.serve(handler);
