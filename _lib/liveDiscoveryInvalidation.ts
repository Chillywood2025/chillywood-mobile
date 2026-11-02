/** Opaque correlation only: never an identity, room record or access grant. */
export type DiscoveryLiveInvalidation = { keys: readonly string[] | null };
export const MAX_DISCOVERY_HINT_KEYS = 256;
export const MAX_DISCOVERY_IN_FLIGHT_KEYS = 4096;
const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let sourceEpoch = 0;
let fullInvalidationEpoch = 0;
const keyEpochs = new Map<string, number>();
/** A post-hint reader cannot attach to a pre-hint shared transport. The sole
 * coordinator advances this before callbacks; per-reader advances would defeat
 * deduplication between siblings receiving the same hint. */
export function recordDiscoveryInvalidation(value: DiscoveryLiveInvalidation) {
  if (value.keys !== null && !value.keys.length) return;
  sourceEpoch += 1;
  if (value.keys === null) { fullInvalidationEpoch = sourceEpoch; keyEpochs.clear(); return; }
  for (const key of value.keys) keyEpochs.set(key, sourceEpoch);
  // Losing an old affected-key receipt must never permit a held stale row.
  // Overflow conservatively retires older snapshots, with bounded memory.
  if (keyEpochs.size > MAX_DISCOVERY_IN_FLIGHT_KEYS) { fullInvalidationEpoch = sourceEpoch; keyEpochs.clear(); }
}
export const discoveryReadEpoch = () => sourceEpoch;
export function discoveryHintKey(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null;
  const value = (row as { discovery_hint_key?: unknown; discoveryHintKey?: unknown }).discovery_hint_key
    ?? (row as { discoveryHintKey?: unknown }).discoveryHintKey;
  return typeof value === 'string' && keyPattern.test(value) ? value.toLowerCase() : null;
}
export function parseDiscoveryInvalidation(value: unknown): DiscoveryLiveInvalidation {
  if (!value || typeof value !== 'object') return { keys: null };
  const keys = (value as { keys?: unknown }).keys;
  if (!Array.isArray(keys) || !keys.length || keys.length > MAX_DISCOVERY_HINT_KEYS
    || keys.some(key => typeof key !== 'string' || !keyPattern.test(key))) return { keys: null };
  return { keys: [...new Set(keys.map(key => key.toLowerCase()))] };
}
export function mergeDiscoveryInvalidations(a: DiscoveryLiveInvalidation | undefined, b: DiscoveryLiveInvalidation): DiscoveryLiveInvalidation {
  if (a?.keys === null || b.keys === null) return { keys: null };
  const keys = [...new Set([...(a?.keys ?? []), ...b.keys])];
  return { keys: keys.length > MAX_DISCOVERY_HINT_KEYS ? null : keys };
}

/** Fence only changes observed AFTER a read began. A fresh canonical read after
 * a hint remains authoritative even when a relationship-only change did not
 * increment the source row revision (for example unblock or Circle rejoin).
 * Unrelated global traffic must not require a silent network to make progress. */
export function createDiscoveryReadFence() {
  let changes: DiscoveryLiveInvalidation | undefined;
  let startedAt = sourceEpoch;
  const full = () => changes?.keys === null || fullInvalidationEpoch > startedAt;
  return {
    begin() { changes = undefined; startedAt = sourceEpoch; },
    invalidate(value?: DiscoveryLiveInvalidation) { changes = mergeDiscoveryInvalidations(changes, value ?? { keys: null }); },
    full,
    allows(row: unknown) {
      if (full()) return false;
      if (!changes?.keys?.length && sourceEpoch === startedAt) return true;
      const key = discoveryHintKey(row);
      return !!key && !changes?.keys?.includes(key) && (keyEpochs.get(key) ?? 0) <= startedAt;
    },
  };
}
