/** Versioned, scope-bound keyset cursors. Values are validated before PostgREST interpolation. */
export type ProfileFeedPage<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };
export type ProfileFeedCursor = { version: 1; scope: string; at: string; id: string; snapshotAt?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
export function profileFeedPageLimit(value?: number) {
  return Number.isFinite(value) ? Math.max(1, Math.min(50, Math.floor(value!))) : 20;
}
export function encodeProfileFeedCursor(value: ProfileFeedCursor) { return encodeURIComponent(JSON.stringify(value)); }
export function decodeProfileFeedCursor(value: string | null | undefined, scope: string): ProfileFeedCursor | null {
  if (!value) return null;
  try {
    if (value.length > 1200) throw new Error();
    const parsed = JSON.parse(decodeURIComponent(value)) as ProfileFeedCursor;
    if (parsed.version !== 1 || parsed.scope !== scope || !uuid.test(parsed.id)
      || !iso.test(parsed.at) || !Number.isFinite(Date.parse(parsed.at))
      || (parsed.snapshotAt !== undefined && (!iso.test(parsed.snapshotAt) || !Number.isFinite(Date.parse(parsed.snapshotAt))))) throw new Error();
    return parsed;
  } catch { throw new Error("Invalid feed cursor. Refresh to start again."); }
}
