import { runCurrentAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
export type CreatorAuctionHeldEntry = {
  id: string; lane: "event" | "room"; createdAt: string; currency: "usd"; grossMinor: number;
  netMinor: number | null; creatorMinor: number | null; platformMinor: number | null; recoveryObligationMinor: number | null;
  observedAt: string | null; holdReasons: string[]; providerRefreshStatus: "unknown" | "pending" | "fresh" | "stale"; lastCheckedAt: string | null;
};
export type CreatorAuctionHeldPage = { entries: CreatorAuctionHeldEntry[]; nextCursor: string | null };
const invalid = () => new Error("Held auction details are unavailable. Refresh to try again; no payout is initiated here.");
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const amount = (value: unknown, negative = false) => value === null || Number.isSafeInteger(value) && (negative || Number(value) >= 0);
export async function readCreatorAuctionHeldEarnings(after: string | null = null): Promise<CreatorAuctionHeldPage> {
  if (after !== null && !uuid(after)) throw invalid();
  const result = await runCurrentAccountBoundSupabaseMutationRpc<unknown>("list_creator_auction_held_earnings", { p_after: after, p_limit: 20 });
  const data = result.data as Record<string, unknown> | null;
  if (result.error || !data || data.financialAuthority !== false || data.notPayable !== true || !Array.isArray(data.entries) || data.entries.length > 20
    || (data.nextCursor !== null && !uuid(data.nextCursor))) throw invalid();
  const entries = data.entries.map((row: Record<string, unknown>) => {
    if (!row || !uuid(row.id) || !["event", "room"].includes(String(row.lane)) || !date(row.createdAt) || row.currency !== "usd"
      || !Number.isSafeInteger(row.grossMinor) || Number(row.grossMinor) <= 0
      || !amount(row.netMinor, true) || !amount(row.creatorMinor) || !amount(row.platformMinor) || !amount(row.recoveryObligationMinor)
      || (row.observedAt !== null && !date(row.observedAt)) || (row.lastCheckedAt !== null && !date(row.lastCheckedAt))
      || !["unknown", "pending", "fresh", "stale"].includes(String(row.providerRefreshStatus))
      || !Array.isArray(row.holdReasons) || row.holdReasons.length > 100 || row.holdReasons.some(reason => typeof reason !== "string" || !/^[a-z0-9_]{1,100}$/.test(reason))
      || row.financialAuthority !== false || row.notPayable !== true) throw invalid();
    return { id: row.id, lane: row.lane, createdAt: row.createdAt, currency: row.currency, grossMinor: row.grossMinor,
      netMinor: row.netMinor, creatorMinor: row.creatorMinor, platformMinor: row.platformMinor, recoveryObligationMinor: row.recoveryObligationMinor,
      observedAt: row.observedAt, holdReasons: row.holdReasons, providerRefreshStatus: row.providerRefreshStatus, lastCheckedAt: row.lastCheckedAt } as CreatorAuctionHeldEntry;
  });
  if (new Set(entries.map(row => row.id)).size !== entries.length) throw invalid();
  return { entries, nextCursor: data.nextCursor as string | null };
}
