// One aggregate budget spans dispute pagination, refund balance lookups and all
// SQL waits. Exhaustion never means a complete observation or financial release.
export function createMerchObservationBudget(transport: typeof fetch = fetch, milliseconds=75000) {
  if(!Number.isInteger(milliseconds)||milliseconds<1000||milliseconds>75000)throw Error("merch_observation_budget_invalid");
  const deadline = Date.now() + milliseconds;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  let requests = 0;
  const run = async <T>(work: () => PromiseLike<T>, maxWait = 75000): Promise<T> => {
    const remaining = Math.min(maxWait, deadline - Date.now());
    if (remaining <= 0 || controller.signal.aborted) throw Error("merch_observation_deadline");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([Promise.resolve(work()), new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(Error("merch_observation_deadline")), remaining);
      })]);
    } finally { if (timeout) clearTimeout(timeout); }
  };
  const limitedFetch: typeof fetch = async (input, init) => {
    if (controller.signal.aborted || Date.now() >= deadline || requests >= 64)
      throw Error("merch_observation_budget_exhausted");
    if (init?.method !== "GET" || typeof input !== "string" || !input.startsWith("https://api.stripe.com/v1/"))
      throw Error("merch_observation_get_only");
    requests++;
    return await run(() => transport(input, { ...init,
      signal: AbortSignal.any([controller.signal, ...(init.signal ? [init.signal] : [])]),
    }), 15000);
  };
  return { run, transport: limitedFetch, remaining: () => Math.max(0,64-requests), close: () => { clearTimeout(timer); controller.abort(); } };
}
