type Flight = { controller: AbortController; promise: Promise<unknown>; readers: number };
const flights = new Map<string, Flight>();
const retired = () => new Error('Live read retired.');

/** Coalesce identical in-flight reads, never cache their results. One consumer
 * abort cannot cancel another consumer. Authority generation is part of key.
 * Keep ownership until the source settles, even if it ignores cancellation.
 * Retired flights reject new readers instead of overlapping or serving stale data.
 */
export function readSharedLiveSnapshot<T>(ownerKey: string, requestKey: string, signal: AbortSignal,
  read: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (signal.aborted) return Promise.reject(retired());
  const key = JSON.stringify([ownerKey, requestKey]);
  let flight = flights.get(key);
  if (flight?.controller.signal.aborted) return Promise.reject(retired());
  if (!flight) {
    // Bound both bookkeeping and work. Do not bypass ownership when saturated;
    // callers can retry after their normal backoff once existing sources settle.
    if (flights.size >= 128) return Promise.reject(new Error('Live read capacity reached.'));
    const controller = new AbortController();
    const owned: Flight = { controller, readers: 0, promise: Promise.resolve() };
    owned.promise = Promise.resolve().then(() => {
      if (controller.signal.aborted) throw retired();
      return read(controller.signal);
    }).finally(() => { if (flights.get(key) === owned) flights.delete(key); });
    flights.set(key, owned);
    flight = owned;
  }
  const owned = flight;
  owned.readers += 1;
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const release = () => {
      if (done) return false;
      done = true;
      signal.removeEventListener('abort', abort);
      owned.readers -= 1;
      if (!owned.readers && flights.get(key) === owned) {
        owned.controller.abort();
      }
      return true;
    };
    const abort = () => { if (release()) reject(retired()); };
    signal.addEventListener('abort', abort, { once: true });
    owned.promise.then(value => { if (release()) resolve(value as T); }, error => { if (release()) reject(error); });
    if (signal.aborted) abort();
  });
}
