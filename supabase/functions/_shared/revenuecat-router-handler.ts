import { authenticateRevenueCatEnvelope, RouterBoundaryError, type RouterConnection, type RouterEnvelope } from "./revenuecat-router-envelope.ts";

export type RouterIngestResult = { protocol: "rc-router-ingress-result-v1"; receiptId: string;
  status: "recorded" | "duplicate" | "conflict"; acknowledgementAllowed: boolean;
  authorityGranted: false; legacyEffectsEnforced: false };
export type RouterHandlerDependencies = {
  connection: () => RouterConnection | null;
  persist: (connectionId: string, revision: number, envelope: RouterEnvelope) => Promise<RouterIngestResult>;
};
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});
export function createReceiptRouterHandler(deps: RouterHandlerDependencies) {
  return async (req: Request): Promise<Response> => {
    try {
      const connection = deps.connection();
      if (!connection) throw new RouterBoundaryError("router_configuration_unavailable", 503);
      const envelope = await authenticateRevenueCatEnvelope(req, connection);
      // Promise timeout is deliberately not interpreted as failed persistence:
      // provider redelivery uses the identical event/hash and durable SQL dedupe.
      let timer: ReturnType<typeof setTimeout> | undefined;
      let result: RouterIngestResult;
      try { result = await Promise.race([deps.persist(connection.connectionId, connection.connectionRevision, envelope),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new RouterBoundaryError("durable_ingress_uncertain", 503)), 5000); })]); }
      finally { clearTimeout(timer); }
      if (!result || result.protocol !== "rc-router-ingress-result-v1" || !["recorded", "duplicate", "conflict"].includes(result.status)
        || typeof result.receiptId !== "string" || result.authorityGranted !== false || result.legacyEffectsEnforced !== false
        || typeof result.acknowledgementAllowed !== "boolean") throw new RouterBoundaryError("durable_ingress_result_invalid", 503);
      // Until real negative effects and projectors are integrated, only an exact
      // TEST observation can be acknowledged. Persisted is not legacy-protected.
      const canAck = result.status !== "conflict" && result.acknowledgementAllowed
        && envelope.observation.parseStatus === "valid" && envelope.observation.eventType === "TEST";
      return json(canAck ? 200 : 503, { status: canAck ? "test_recorded" : "recorded_processing_unavailable",
        receiptId: result.receiptId, durable: true, retryable: !canAck, authorityGranted: false,
        legacyEffectsEnforced: false, providerDispatchAllowed: false });
    } catch (error) {
      const safe = error instanceof RouterBoundaryError ? error : new RouterBoundaryError("durable_ingress_unavailable", 503);
      return json(safe.status, { error: safe.code, authorityGranted: false, providerDispatchAllowed: false });
    }
  };
}
