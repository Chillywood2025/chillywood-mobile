/**
 * A synchronous latch for user actions that begin asynchronous work before
 * navigation or mutation. React state alone cannot close the same-frame tap
 * window because the next press can arrive before the disabled prop renders.
 */
export function createActionSingleFlightLatch() {
  let active = false;

  return {
    isActive() {
      return active;
    },
    release() {
      active = false;
    },
    tryAcquire() {
      if (active) return false;
      active = true;
      return true;
    },
  };
}

/**
 * Coalesce concurrent operations for one exact authority/target key. The key
 * is removed only after settlement, so failures are retryable and do not
 * create a permanent lockout.
 *
 * @template T
 * @param {Map<string, Promise<unknown>>} registry
 * @param {string} key
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 */
export function runKeyedSingleFlight(registry, key, operation) {
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey) return Promise.reject(new Error("Single-flight operation key is required."));

  const existing = registry.get(normalizedKey);
  if (existing) return /** @type {Promise<T>} */ (existing);

  const pending = Promise.resolve().then(operation);
  registry.set(normalizedKey, pending);
  const release = () => {
    if (registry.get(normalizedKey) === pending) registry.delete(normalizedKey);
  };
  void pending.then(release, release);
  return pending;
}
