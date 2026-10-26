import { supabase } from "./supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// The test tool chooses a destination, never constructs a charge. The buyer
// surface then obtains its current offer, exact intent and store quote normally.
export async function resolveCreatorSandboxPurchaseDestination(sourceType: string, sourceId: string) {
  if (!UUID.test(sourceId)) throw new Error("Enter a valid source UUID.");
  if (sourceType === "paid_content") return { pathname: "/player/[id]", params: { id: sourceId, source: "creator-video" } };
  if (sourceType === "creator_tip") return { pathname: "/channel/[userId]", params: { userId: sourceId } };
  if (sourceType === "event") return { pathname: "/event/[eventId]", params: { eventId: sourceId } };
  const isStage = sourceType === "live_watch_party_access" || sourceType === "live_watch_party_seat";
  if (sourceType !== "watch_party_live" && !isStage) throw new Error("This source has no contextual checkout.");
  const { data, error } = await supabase
    .from(isStage ? "paid_live_watch_party_offers" : "paid_watch_party_offers")
    .select("id,party_id")
    .eq("id", sourceId)
    .maybeSingle();
  if (error || !data || data.id !== sourceId || typeof data.party_id !== "string"
    || !data.party_id || data.party_id !== data.party_id.trim()) {
    throw new Error("The exact room for this offer could not be verified. Refresh before trying again.");
  }
  return { pathname: isStage ? "/watch-party/live-stage/[partyId]" : "/watch-party/[partyId]", params: { partyId: data.party_id } };
}
