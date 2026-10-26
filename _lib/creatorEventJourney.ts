import { runCurrentAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
import { withAuthorityReadDeadline } from "./entitlementAuthority";
import { buildCreatorEventSummary, parseCreatorEventRow, type CreatorEventSummary } from "./liveEvents";
import { supabase } from "./supabase";

export type CreatorEventLifecycleAction = "publish" | "start" | "delay" | "reschedule" | "end" | "cancel" | "mark_no_show" | "stop_sales";
export type CreatorEventDestination = { allowed: boolean; reason: string; itemId: string | null; kind: "live" | "replay" | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailable = (): CreatorEventDestination => ({ allowed: false, reason: "entry_unavailable", itemId: null, kind: null });

export async function resolveCreatorEventDestination(creatorEventId: string): Promise<CreatorEventDestination> {
  if (!uuid.test(creatorEventId)) return unavailable();
  const result = await withAuthorityReadDeadline((supabase as any).rpc("resolve_creator_event_destination", { p_creator_event_id: creatorEventId }), null) as { data: unknown; error: unknown } | null;
  if (!result || result.error || !result.data || typeof result.data !== "object" || Array.isArray(result.data)) return unavailable();
  const row = result.data as Record<string, unknown>;
  if (typeof row.allowed !== "boolean" || typeof row.reason !== "string") return unavailable();
  if (!row.allowed) return { ...unavailable(), reason: row.reason };
  if (row.creatorEventId !== creatorEventId || row.itemId !== creatorEventId
    || (row.kind !== "live" && row.kind !== "replay")) return unavailable();
  return { allowed: true, reason: row.reason, itemId: row.itemId, kind: row.kind };
}

export async function manageCreatorEventLifecycle(event: CreatorEventSummary, action: CreatorEventLifecycleAction, input: {
  startsAt?: string | null; endsAt?: string | null; timeZone?: string; message?: string; materialChange?: boolean;
} = {}): Promise<CreatorEventSummary> {
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<Record<string, unknown>>("manage_creator_event_lifecycle", {
    p_creator_event_id: event.id, p_action: action, p_expected_updated_at: event.updatedAt,
    p_starts_at: input.startsAt ?? null, p_ends_at: input.endsAt ?? null,
    p_time_zone: input.timeZone ?? event.timeZone, p_message: input.message?.trim() || null,
    p_material_change: input.materialChange === true,
  }, event.hostUserId);
  if (error || !data || data.id !== event.id || data.host_user_id !== event.hostUserId) {
    throw new Error("This event action could not be confirmed. Refresh the event before trying again.");
  }
  const parsed = parseCreatorEventRow(data as unknown as Parameters<typeof parseCreatorEventRow>[0]);
  if (!parsed) throw new Error("The updated event could not be verified. Refresh before continuing.");
  return buildCreatorEventSummary(parsed);
}
