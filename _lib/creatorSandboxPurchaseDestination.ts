import { supabase } from "./supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Live Stage offers are not yet represented in the generated Database types.
// Keep this read boundary narrow and validate the returned row before routing.
const offerReader = supabase as unknown as {
  from(table: "paid_live_watch_party_offers" | "paid_watch_party_offers"): {
    select(columns: "id,party_id"): {
      eq(column: "id", value: string): {
        maybeSingle(): Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
};

// The test tool chooses a destination, never constructs a charge. The buyer
// surface then obtains its current offer, exact intent and store quote normally.
export async function resolveCreatorSandboxPurchaseDestination(sourceType: string, sourceId: string) {
  if (!UUID.test(sourceId)) throw new Error("Enter a valid source UUID.");
  if (sourceType === "paid_content") return { pathname: "/player/[id]", params: { id: sourceId, source: "creator-video" } };
  if (sourceType === "creator_tip") return { pathname: "/channel/[userId]", params: { userId: sourceId } };
  if (sourceType === "event") return { pathname: "/event/[eventId]", params: { eventId: sourceId } };
  const isStage = sourceType === "live_watch_party_access" || sourceType === "live_watch_party_seat";
  if (sourceType !== "watch_party_live" && !isStage) throw new Error("This source has no contextual checkout.");
  const { data, error } = isStage
    ? await offerReader
      .from("paid_live_watch_party_offers")
      .select("id,party_id")
      .eq("id", sourceId)
      .maybeSingle()
    : await offerReader
      .from("paid_watch_party_offers")
      .select("id,party_id")
      .eq("id", sourceId)
      .maybeSingle();
  const row = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown> : null;
  if (error || !row || row.id !== sourceId || typeof row.party_id !== "string"
    || !row.party_id || row.party_id !== row.party_id.trim()) {
    throw new Error("The exact room for this offer could not be verified. Refresh before trying again.");
  }
  return { pathname: isStage ? "/watch-party/live-stage/[partyId]" : "/watch-party/[partyId]", params: { partyId: row.party_id } };
}
