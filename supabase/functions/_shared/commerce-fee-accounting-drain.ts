type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{data: unknown; error?: unknown}> };
type Budget = { run: <T>(work: () => PromiseLike<T>, maxWait?: number) => Promise<T> };

/** One source, one attempt, no provider calls. A deadline is not a rollback
 * assertion: the durable queue exposes pending/retry/blocked state to owner
 * health and its source-bound operation is safe to inspect/retry independently.
 */
export async function drainCommerceFeeAccounting(client: RpcClient, sourceId: string, budget?: Budget) {
 const controller = new AbortController();
 let timeout: ReturnType<typeof setTimeout> | undefined;
 try {
  const work = async () => {
   const pending = client.rpc("process_commerce_fee_accounting_jobs", {p_limit: 1, p_source_id: sourceId});
   const abortable = pending as typeof pending & {abortSignal?: (signal: AbortSignal) => typeof pending};
   return await (typeof abortable.abortSignal === "function" ? abortable.abortSignal(controller.signal) : pending);
  };
  const result = await Promise.race([
   budget ? budget.run(work, 3000) : work(),
   new Promise<never>((_, reject) => {timeout=setTimeout(()=>{controller.abort();reject(Error("accounting_deadline"));},3000);}),
  ]);
  if (result.error || !result.data || typeof result.data !== "object"
   || !Array.isArray((result.data as Record<string,unknown>).outcomes)) throw Error("accounting_response_unavailable");
  return {status: "checked", ...result.data as Record<string,unknown>};
 } catch {
  return {status: "deferred", reason: "accounting_drain_incomplete", ownerHealthRpc: "get_owner_commerce_fee_accounting_health"};
 } finally {if(timeout)clearTimeout(timeout);controller.abort();}
}
