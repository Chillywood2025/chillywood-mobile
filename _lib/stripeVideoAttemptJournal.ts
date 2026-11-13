/** IDs only. Never persist access tokens, checkout URLs or payment authority. */
export type StripeVideoAttempt = { requestId: string; orderId: string | null };
export type StripeVideoAttemptStorage = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
};
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const locks = new WeakMap<StripeVideoAttemptStorage, Map<string, Promise<void>>>();

/** Legacy web keys remain readable. Each account/video has one unresolved order.
 * Serialize the entire request and refresh, not merely each storage write. */
export async function withStripeVideoAttempt<T>(storage: StripeVideoAttemptStorage, buyerId: string, videoId: string,
  current: () => void, operation: (journal: {
    read(): Promise<StripeVideoAttempt | null>;
    prepare(newId: () => string): Promise<StripeVideoAttempt>;
    remember(attempt: StripeVideoAttempt, orderId: string): Promise<void>;
    retireUnpaid(attempt: StripeVideoAttempt): Promise<void>;
  }) => Promise<T>): Promise<T> {
  if (!uuid(buyerId) || !uuid(videoId)) throw new Error("Checkout identity is invalid.");
  const key = `stripe-video-sandbox:${buyerId}:${videoId}`;
  let registry = locks.get(storage);
  if (!registry) { registry = new Map(); locks.set(storage, registry); }
  const previous = registry.get(key) ?? Promise.resolve();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  registry.set(key, pending);
  await previous;
  const read = async (): Promise<StripeVideoAttempt | null> => {
    current();
    const requestId = await storage.getItem(key), orderId = await storage.getItem(`${key}:order`);
    current();
    if (requestId === null && orderId === null) return null;
    if (!uuid(requestId) || (orderId !== null && !uuid(orderId))) throw new Error("Saved checkout needs recovery before another attempt.");
    return { requestId, orderId };
  };
  const match = async (attempt: StripeVideoAttempt) => {
    const saved = await read();
    if (!saved || saved.requestId !== attempt.requestId || (attempt.orderId !== null && saved.orderId !== attempt.orderId)) {
      throw new Error("Saved checkout identity changed.");
    }
    return saved;
  };
  try {
    current();
    return await operation({ read,
      async prepare(newId) {
        const existing = await read(); if (existing) return existing;
        const requestId = newId(); if (!uuid(requestId)) throw new Error("Checkout request identity is invalid.");
        current(); await storage.setItem(key, requestId);
        const saved = await read();
        if (!saved || saved.requestId !== requestId) throw new Error("Checkout attempt could not be saved.");
        return saved;
      },
      async remember(attempt, orderId) {
        if (!uuid(orderId)) throw new Error("Checkout order identity is invalid.");
        const saved = await match(attempt);
        if (saved.orderId !== null && saved.orderId !== orderId) throw new Error("Checkout order identity changed.");
        current(); await storage.setItem(`${key}:order`, orderId);
        if ((await read())?.orderId !== orderId) throw new Error("Checkout order could not be saved.");
      },
      async retireUnpaid(attempt) {
        // Caller must verify an authenticated exact unpaid terminal response.
        await match(attempt); current(); await storage.removeItem(`${key}:order`);
        current(); await storage.removeItem(key);
        if (await read()) throw new Error("Checkout recovery could not be saved.");
      },
    });
  } finally { release(); if (registry.get(key) === pending) registry.delete(key); }
}
