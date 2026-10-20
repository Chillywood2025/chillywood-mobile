/** Opaque, filter-bound keyset cursors. Keep database timestamp precision intact. */
export type AdminCursorScope = Record<string, string | boolean>;
type Cursor = { v: 1; scope: AdminCursorScope; createdAt: string; id: string };
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const sameScope = (left: unknown, right: AdminCursorScope) => object(left)
  && Object.keys(left).length === Object.keys(right).length
  && Object.keys(right).every((key) => left[key] === right[key]);
const validId = (value: unknown) => (typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value)))
  && /^(?:[1-9][0-9]*|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(String(value));
const validTimestamp = (value: unknown): value is string => typeof value === "string"
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value)
  && Number.isFinite(Date.parse(value));
const timestampMicros = (value: string) => BigInt(Date.parse(value)) * 1000n
  + BigInt((value.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(3, 6));
const follows = (row: { id: string; createdAt: string }, previous: { id: string; createdAt: string }) => {
  const time = timestampMicros(row.createdAt), priorTime = timestampMicros(previous.createdAt);
  if (time !== priorTime) return time < priorTime;
  return /^\d+$/.test(row.id) && /^\d+$/.test(previous.id)
    ? BigInt(row.id) < BigInt(previous.id) : row.id.toLowerCase() < previous.id.toLowerCase();
};

export function parseAdminCursor(value: string | null | undefined, scope: AdminCursorScope): Cursor | null {
  if (value == null) return null;
  try {
    const cursor: unknown = JSON.parse(value);
    if (!object(cursor) || cursor.v !== 1 || !sameScope(cursor.scope, scope)
      || !validTimestamp(cursor.createdAt) || typeof cursor.id !== "string" || !validId(cursor.id)) throw new Error();
    return cursor as Cursor;
  } catch {
    throw new Error("Invalid or mismatched history cursor. Refresh the list.");
  }
}

export function parseAdminCursorPage(
  value: unknown, scope: AdminCursorScope, limit: number, previousCursor?: string | null,
): { items: Record<string, unknown>[]; nextCursor: string | null; hasMore: boolean } {
  const previous = parseAdminCursor(previousCursor, scope);
  if (!object(value) || !Array.isArray(value.items) || value.items.length > limit
    || value.items.some((row) => !object(row) || !validId(row.id) || !validTimestamp(row.created_at))
    || typeof value.hasMore !== "boolean"
    || (value.nextCursor !== null && typeof value.nextCursor !== "string")
    || value.hasMore !== (typeof value.nextCursor === "string")) {
    throw new Error("Invalid history page response. Refresh the list.");
  }
  const items = value.items as Record<string, unknown>[];
  const ids = items.map((row) => String(row.id));
  if (new Set(ids).size !== ids.length || (previous && ids.includes(previous.id))) {
    throw new Error("History pagination did not advance. Refresh the list.");
  }
  let boundary = previous;
  for (const row of items) {
    const key = { id: String(row.id), createdAt: row.created_at as string };
    if (boundary && !follows(key, boundary)) throw new Error("History pagination did not advance. Refresh the list.");
    boundary = { ...key, v: 1, scope };
  }
  const nextCursor = value.nextCursor as string | null;
  const next = parseAdminCursor(nextCursor, scope);
  if (next) {
    const last = items.at(-1);
    if (!last || nextCursor === previousCursor || next.id !== String(last.id)
      || next.createdAt !== last.created_at) {
      throw new Error("History pagination did not advance. Refresh the list.");
    }
  }
  return { items, nextCursor, hasMore: value.hasMore };
}

export const adminPageLimit = (value: number | undefined, fallback = 50, maximum = 200) =>
  Number.isFinite(value) ? Math.max(1, Math.min(maximum, Math.floor(Number(value)))) : fallback;
