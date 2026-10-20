// Read-only, account/filter-bound keyset pagination. No cursor contains records.
export type HistoryPosition = { at: string; id: string };
export type HistoryPageMeta = { nextCursor: string | null; hasMore: boolean };
type Row = Record<string, unknown>;
type Cursor = {
  v: 1;
  scope: string;
  ceiling: string;
  positions: Record<string, HistoryPosition>;
  exhausted: string[];
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const isTime = (value: unknown): value is string => typeof value === "string"
  && TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
export const invalidHistoryCursor = () => Object.assign(new Error("Invalid or stale history cursor. Refresh this list."), { code: "invalid_history_cursor" });
const position = (row: Row, column: string): HistoryPosition => {
  const at = row[column], id = row.id;
  if (!isTime(at) || typeof id !== "string" || !UUID.test(id)) throw new Error("History source returned an invalid ordering key.");
  return { at, id };
};
// Keep PostgreSQL's microseconds; Date.parse alone collapses distinct positions.
const micros = (value: string) => Date.parse(value) * 1000
  + Number((value.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(3, 6));
const compare = (left: HistoryPosition, right: HistoryPosition) => micros(right.at) - micros(left.at)
  || (left.id < right.id ? 1 : left.id > right.id ? -1 : 0);
const verifyRows = (rows: Row[], column: string, after?: HistoryPosition) => {
  let previous = after;
  for (const row of rows) {
    const current = position(row, column);
    if (previous && compare(previous, current) >= 0) throw new Error("History source did not advance in deterministic order.");
    previous = current;
  }
};
const verifyCount = (value: unknown, rows: Row[]) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < rows.length
    || (value > 0 && rows.length === 0)) throw new Error("History source completeness is unavailable.");
  return value;
};
const encode = (value: Cursor) => JSON.stringify(value);
const decode = (value: unknown, scope: string, sources: string[]): Cursor => {
  if (value === null || value === undefined || value === "") return {
    v: 1, scope, ceiling: new Date().toISOString(), positions: {}, exhausted: [],
  };
  if (typeof value !== "string" || value.length > 16000) throw invalidHistoryCursor();
  let parsed: Cursor;
  try { parsed = JSON.parse(value); } catch { throw invalidHistoryCursor(); }
  if (!parsed || parsed.v !== 1 || parsed.scope !== scope || !isTime(parsed.ceiling)
    || !parsed.positions || typeof parsed.positions !== "object" || Array.isArray(parsed.positions)
    || !Array.isArray(parsed.exhausted) || parsed.exhausted.some((key) => !sources.includes(key))
    || Object.keys(parsed.positions).some((key) => !sources.includes(key))) throw invalidHistoryCursor();
  for (const value of Object.values(parsed.positions)) {
    if (!value || !isTime(value.at) || typeof value.id !== "string" || !UUID.test(value.id)
      || micros(value.at) > micros(parsed.ceiling)) throw invalidHistoryCursor();
  }
  return parsed;
};

export const applyHistoryBounds = (query: any, column: string, after: HistoryPosition | undefined, ceiling: string) => {
  query = query.lte(column, ceiling);
  if (after) query = query.or(`${column}.lt.${after.at},and(${column}.eq.${after.at},id.lt.${after.id})`);
  return query.order(column, { ascending: false }).order("id", { ascending: false });
};

export async function readHistoryPage<T extends Row>(input: {
  scope: string;
  cursor?: unknown;
  limit: number;
  column?: string;
  query: () => any;
}): Promise<{ items: T[] } & HistoryPageMeta> {
  const cursor = decode(input.cursor, input.scope, ["rows"]);
  const column = input.column ?? "created_at";
  const { data, count, error } = await applyHistoryBounds(input.query(), column, cursor.positions.rows, cursor.ceiling).limit(input.limit + 1);
  if (error) throw new Error(`History source unavailable: ${error.message ?? "query failed"}`);
  if (!Array.isArray(data)) throw new Error("History source returned an invalid response.");
  const rows = data as T[];
  const remaining = verifyCount(count, rows);
  verifyRows(rows, column, cursor.positions.rows);
  const items = rows.slice(0, input.limit);
  const hasMore = remaining > items.length;
  if (hasMore) cursor.positions.rows = position(items[items.length - 1], column);
  return { items, hasMore, nextCursor: hasMore ? encode(cursor) : null };
}

export type MergedHistorySource = {
  key: string;
  query: () => any;
  column?: string;
};

// Merge raw sources before selecting matches. Cursors advance only over consumed
// rows, so buffered/unreturned matches are never skipped. A scan-budget page can
// be empty and still have more history; it never claims a complete filtered list.
export async function readMergedHistoryPage<T extends Row>(input: {
  sources: MergedHistorySource[];
  scope: string;
  cursor?: unknown;
  limit: number;
  scanLimit?: number;
  normalize: (source: string, row: Row) => T;
  matches: (row: T) => boolean;
}): Promise<{ items: T[]; scanned: number; scanLimitReached: boolean; completeness: "complete" | "more_history" } & HistoryPageMeta> {
  const cursor = decode(input.cursor, input.scope, input.sources.map((source) => source.key));
  const scanLimit = Math.max(input.limit, input.scanLimit ?? 1000);
  const batchSize = Math.min(100, Math.max(25, input.limit + 1));
  const sources = input.sources.map((source) => ({ ...source, rows: [] as Row[], exhausted: cursor.exhausted.includes(source.key) }));
  const fill = async (source: typeof sources[number]) => {
    if (source.rows.length || source.exhausted) return;
    const column = source.column ?? "created_at";
    const { data, count, error } = await applyHistoryBounds(source.query(), column, cursor.positions[source.key], cursor.ceiling).limit(batchSize);
    if (error) throw new Error(`Audit source ${source.key} unavailable: ${error.message ?? "query failed"}`);
    if (!Array.isArray(data)) throw new Error(`Audit source ${source.key} returned an invalid response.`);
    source.rows = data;
    const remaining = verifyCount(count, data);
    verifyRows(source.rows, column, cursor.positions[source.key]);
    source.exhausted = data.length === remaining;
  };
  await Promise.all(sources.map(fill));
  const items: T[] = [];
  let scanned = 0;
  while (scanned < scanLimit && items.length < input.limit) {
    const available = sources.filter((source) => source.rows.length);
    if (!available.length) break;
    available.sort((left, right) => compare(position(left.rows[0], left.column ?? "created_at"), position(right.rows[0], right.column ?? "created_at"))
      || (left.key < right.key ? 1 : left.key > right.key ? -1 : 0));
    const source = available[0];
    const raw = source.rows.shift()!;
    cursor.positions[source.key] = position(raw, source.column ?? "created_at");
    scanned++;
    const normalized = input.normalize(source.key, raw);
    if (input.matches(normalized)) items.push(normalized);
    await fill(source);
  }
  const hasMore = sources.some((source) => source.rows.length > 0 || !source.exhausted);
  cursor.exhausted = sources.filter((source) => source.exhausted && !source.rows.length).map((source) => source.key);
  return {
    items, hasMore, nextCursor: hasMore ? encode(cursor) : null, scanned,
    scanLimitReached: scanned >= scanLimit && hasMore,
    completeness: hasMore ? "more_history" : "complete",
  };
}
