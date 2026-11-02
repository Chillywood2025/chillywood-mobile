import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";
import { supabase } from "./supabase";

export type PublicPartyRoomCounts = Record<string, { liveRoomCount: number; discoveryHintKey?: string }>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const normalizePartyCountTitleIds = (values: readonly string[]) =>
  [...new Set(values.filter(value => uuid.test(value)).map(value => value.toLowerCase()))].sort();

/** Counts are canonical public metadata, never raw room/member/chat rows.
 * Invalid/local-only title identifiers cannot turn into an unbounded scan. */
export async function readPublicPartyRoomCounts(titleIds: readonly string[], signal: AbortSignal): Promise<PublicPartyRoomCounts> {
  const ids = normalizePartyCountTitleIds(titleIds);
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  const current = () => !signal.aborted && !!authority && authority.state === "ACTIVE" && !authority.restoreOnly
    && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
  if (!current()) throw new Error("Public Party counts require a current session.");
  const counts: PublicPartyRoomCounts = {};
  // The server accepts at most 100 exact title IDs. Never request all rooms,
  // silently truncate a large catalogue, or retain partial batch results.
  for (let offset = 0; offset < ids.length; offset += 100) {
    if (!current()) throw new Error("Public Party count read retired.");
    const batch = ids.slice(offset, offset + 100);
    const { data, error } = await supabase.rpc("read_public_party_room_counts", { p_title_ids: batch }).abortSignal(signal);
    if (!current() || error || !data || typeof data !== "object" || Array.isArray(data)) throw new Error("Public Party counts unavailable.");
    const result = data as { total?: unknown; byTitle?: unknown; scopes?: unknown };
    if (!Number.isSafeInteger(result.total) || Number(result.total) < 0 || !Array.isArray(result.byTitle)) throw new Error("Invalid public Party counts.");
    const seen = new Set<string>();
    const scopes = new Map<string, string>();
    if (result.scopes !== undefined) {
      if (!Array.isArray(result.scopes)) throw new Error("Invalid public Party count scopes.");
      for (const scope of result.scopes) {
        if (!scope || typeof scope !== "object" || !batch.includes(scope.titleId) || scopes.has(scope.titleId)
          || typeof scope.key !== "string" || !uuid.test(scope.key)) throw new Error("Invalid public Party count scope.");
        scopes.set(scope.titleId, scope.key.toLowerCase());
      }
    }
    for (const row of result.byTitle) {
      if (!row || typeof row !== "object" || !batch.includes(row.titleId) || seen.has(row.titleId)
        || !Number.isSafeInteger(row.count) || row.count < 0) throw new Error("Invalid public Party title count.");
      if (result.scopes !== undefined && row.count > 0 && !scopes.has(row.titleId)) throw new Error("Missing public Party count scope.");
      seen.add(row.titleId);
      if (row.count > 0) counts[row.titleId] = { liveRoomCount: row.count,
        ...(scopes.has(row.titleId) ? { discoveryHintKey: scopes.get(row.titleId)! } : {}) };
    }
  }
  return counts;
}
