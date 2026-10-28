/** Active-screen fallback, not a push-delivery or concurrent-capacity claim.
 * One coalesced pass per 120–180 seconds; hints are rate-limited to 30 seconds.
 * Errors back off up to ten minutes. Disposal retires in-flight results.
 * A deadline requests cancellation; it does not release source ownership until
 * check settles. Checks with concurrent readers must await all their readers.
 */
type FreshnessTimer = ReturnType<typeof setTimeout> | number;
export function startProfileFeedFreshness(options: {
  check: (signal: AbortSignal) => Promise<void>;
  isCurrent: () => boolean;
  now?: () => number;
  random?: () => number;
  schedule?: (callback: () => void, delay: number) => FreshnessTimer;
  cancel?: (timer: FreshnessTimer) => void;
}) {
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  let disposed = false;
  let running = false;
  let failures = 0;
  let lastStarted = now();
  let timer: FreshnessTimer | undefined;
  let dueAt = Infinity;
  let inFlight: AbortController | null = null;
  const current = () => !disposed && options.isCurrent();
  const arm = (delay: number, onlyEarlier = false) => {
    if (onlyEarlier && timer !== undefined && dueAt <= now() + delay) return;
    if (timer !== undefined) cancel(timer);
    timer = undefined;
    dueAt = Infinity;
    if (current()) {
      dueAt = now() + delay;
      timer = schedule(() => { timer = undefined; dueAt = Infinity; void run(); }, delay);
    }
  };
  const interval = () => Math.min(600_000, (120_000 + Math.max(0, Math.min(1, random())) * 60_000) * 2 ** failures);
  const run = async () => {
    if (!current() || running) return;
    const wait = 30_000 - (now() - lastStarted);
    if (wait > 0) { arm(wait); return; }
    running = true;
    lastStarted = now();
    const request = new AbortController();
    inFlight = request;
    const deadline = schedule(() => request.abort(), 20_000);
    try {
      await Promise.resolve().then(() => options.check(request.signal));
      if (request.signal.aborted) throw new Error("Freshness request retired.");
      failures = 0;
    }
    catch { request.abort(); failures = Math.min(3, failures + 1); }
    finally {
      cancel(deadline);
      if (inFlight === request) inFlight = null;
      running = false; arm(interval());
    }
  };
  arm(interval());
  return {
    hint: () => {
      if (!current() || running) return;
      // A disconnected transport can emit many hints on reconnection. One
      // scheduled authorized reread is sufficient; no durable rows are trusted.
      const cooldown = failures ? Math.min(600_000, 120_000 * 2 ** failures) : 30_000;
      arm(Math.max(1_000, cooldown - (now() - lastStarted)), true);
    },
    dispose: () => { disposed = true; inFlight?.abort(); if (timer !== undefined) cancel(timer); timer = undefined; },
  };
}

export function hasNewProfileFeedHead(
  head: { id: string; createdAt: string; rowId: string } | null,
  known: { id: string; createdAt: string | null }[],
  baseline: { createdAt: string; rowId: string } | null,
) {
  if (!head || known.some(item => item.id === head.id)) return false;
  const micros = (value: string | null) => {
    const milliseconds = Date.parse(value ?? "");
    if (!Number.isFinite(milliseconds)) return 0;
    const fraction = value?.match(/\.(\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1] ?? "";
    return milliseconds * 1000 + Number(fraction.padEnd(6, "0").slice(3, 6) || "0");
  };
  const at = micros(head.createdAt);
  if (baseline && (at < micros(baseline.createdAt)
    || (at === micros(baseline.createdAt) && head.rowId <= baseline.rowId))) return false;
  const newest = known.reduce((latest, item) => micros(item.createdAt) > latest ? micros(item.createdAt) : latest, 0);
  return at >= newest;
}
