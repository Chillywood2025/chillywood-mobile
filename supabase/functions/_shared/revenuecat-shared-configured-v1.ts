import { createAdminClient, readOptionalEnv, verifySharedWebhookSecret } from "./provider-readiness.ts";
import { readAuthenticatedRevenueCatBytes, RouterBoundaryError } from "./revenuecat-router-envelope.ts";
import { processConfiguredNativeStoreReceiptV1 } from "./native-store-configured-process-v1.ts";
import { parseNativeStoreRuntimeConnectionsV1 } from "./native-store-runtime-config-v1.ts";
import { createRevenueCatSharedHandlerV1, parseRevenueCatSharedRoutesV1, type RevenueCatLegacyHandlerV1 } from "./revenuecat-shared-routing-v1.ts";

/** No activation or provider mutation. Existing standalone native ingress keeps
 * its no-shared-ACK contract; this mounts only at the existing shared endpoint. */
export function configuredRevenueCatSharedHandlerV1(legacy: RevenueCatLegacyHandlerV1) {
  return createRevenueCatSharedHandlerV1({
    routes: () => {
      if (Deno.env.get("NATIVE_STORE_SHARED_ROUTING_ENABLED") !== "true") return null;
      if (Deno.env.get("NATIVE_STORE_INGRESS_ENABLED") !== "true" || Deno.env.get("NATIVE_STORE_RECONCILE_ENABLED") !== "true")
        throw Error("shared_routing_unavailable");
      const routes = parseRevenueCatSharedRoutesV1(Deno.env.get("NATIVE_STORE_SHARED_ROUTES_JSON"),
        parseNativeStoreRuntimeConnectionsV1(Deno.env.get("NATIVE_STORE_CONNECTIONS_JSON")));
      const secret = readOptionalEnv("REVENUECAT_WEBHOOK_SECRET");
      if (!secret || !verifySharedWebhookSecret(new Request("https://configuration.invalid", {
        headers: { authorization: routes[0].connection.authentication.secret },
      }), secret)) throw Error("shared_routing_unavailable");
      return routes;
    },
    legacy,
    readSharedBytes: async (request, connection) => {
      // Preserve the existing endpoint's Bearer/bare/explicit-header contract.
      // Only after that SAME credential verifies may native intake use its
      // immutable connection's exact Authorization representation. Raw BODY
      // bytes are never changed; legacy receives the original headers.
      const secret = readOptionalEnv("REVENUECAT_WEBHOOK_SECRET");
      if (!secret || !verifySharedWebhookSecret(request, secret))
        throw new RouterBoundaryError("provider_authentication_failed", 401);
      const headers = new Headers(request.headers);
      headers.set("authorization", connection.authentication.secret);
      headers.delete("x-chillywood-webhook-secret");
      return readAuthenticatedRevenueCatBytes(new Request(request, { headers }), connection);
    },
    persist: async intake => {
      const admin = createAdminClient(); if (!admin.configured) throw Error("shared_routing_unavailable");
      const { data, error } = await admin.client.rpc("native_store_sandbox_journal_v1", { p_intake: intake });
      if (error) throw Error("shared_routing_unavailable");
      return data;
    },
    reconcile: processConfiguredNativeStoreReceiptV1,
  });
}
