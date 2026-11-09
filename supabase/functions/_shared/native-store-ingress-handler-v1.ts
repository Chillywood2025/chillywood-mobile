import { persistNativeStoreSandboxIntakeV1, type NativeStoreSandboxConnectionV1, type NativeStoreSandboxIntakeV1 } from "./native-store-sandbox-bridge-v1.ts";
import { RouterBoundaryError } from "./revenuecat-router-envelope.ts";
export type NativeStoreIngressDependenciesV1 = {
  connection(): NativeStoreSandboxConnectionV1 | null;
  persist(intake: NativeStoreSandboxIntakeV1): Promise<unknown>;
  reconcile?(rawReceiptId: string, deadlineMs: number): Promise<unknown>;
};
const response = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify({ ...body,
  acknowledgementAllowed: false, dispatchAllowed: false, grantsAccess: false, financialAuthority: false }), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});
/** Default-off authenticated intake with optional bounded native reconciliation.
 * Durable native storage/effects cannot acknowledge a shared provider delivery.
 * Unknown/mixed events remain project evidence. No retry or scheduler exists. */
export function createNativeStoreIngressHandlerV1(deps: NativeStoreIngressDependenciesV1) {
  const io = Object.freeze({ ...deps });
  return async (request: Request): Promise<Response> => {
    const deadline = performance.now() + 15000;
    let durable = false;
    const bounded = async <T,>(call: () => Promise<T>, cap: number): Promise<T> => {
      const budget = Math.min(cap, deadline - performance.now());
      if (budget <= 0) throw new RouterBoundaryError("native_store_ingress_uncertain", 503);
      const end = performance.now() + budget;
      let timer: ReturnType<typeof setTimeout>;
      try {
        const value = await Promise.race([call(), new Promise<never>((_r, reject) => {
          timer = setTimeout(() => reject(new RouterBoundaryError("native_store_ingress_uncertain", 503)), budget);
        })]);
        if (performance.now() >= end || performance.now() >= deadline) throw new RouterBoundaryError("native_store_ingress_uncertain", 503);
        return value;
      } finally { clearTimeout(timer!); }
    };
    try {
      const connection = io.connection();
      if (!connection) throw new RouterBoundaryError("native_store_ingress_disabled", 503);
      const intakeDeadline = Math.min(deadline, performance.now() + 10000);
      let intakeActive = true;
      const result = await (async () => {
        try {
          return await bounded(() => persistNativeStoreSandboxIntakeV1(request, connection,
            intake => bounded(() => {
              // Async preparation can finish after its caller timed out. Do not
              // begin a new durable write after that phase has been retired.
              if (!intakeActive || performance.now() >= intakeDeadline)
                throw new RouterBoundaryError("native_store_ingress_uncertain", 503);
              return io.persist(intake);
            }, 5000)), Math.max(0, intakeDeadline - performance.now()));
        } finally { intakeActive = false; }
      })();
      durable = true;
      // Only confirmed immutable parent identity enters the worker. A conflict
      // remains held; an uncertain write never invents an ID or invokes effects.
      if (result.status !== "conflict" && io.reconcile) {
        await bounded(() => io.reconcile!(result.receiptId, Math.max(1, Math.floor(deadline - performance.now()))), 15000);
      }
      return response(503, { status: result.status === "conflict" ? "recorded_conflict" : "recorded_processing_unavailable",
        durable: true, retryable: true });
    } catch (error) {
      // A lost/late effect response cannot erase confirmed intake. Provider
      // redelivery may re-enter the same durable identity; no inline retry here.
      if (durable) return response(503, { status: "recorded_processing_unavailable", durable: true, retryable: true });
      const safe = error instanceof RouterBoundaryError ? error : new RouterBoundaryError("native_store_ingress_unavailable", 503);
      return response(safe.status, { error: safe.code, retryable: safe.status >= 500 });
    }
  };
}
