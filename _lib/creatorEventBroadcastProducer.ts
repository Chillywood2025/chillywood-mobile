import { Platform } from "react-native";
import { captureAccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";
import type { CreatorEventSummary } from "./liveEvents";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";

export type CreatorEventBroadcastResult = { creatorEventId: string; state: "prepared" | "starting" | "active" | "stopped" | "failed" | "uncertain" | "unavailable"; reason: string; canStart: boolean };
export async function controlCreatorEventBroadcast(event: Pick<CreatorEventSummary, "id" | "hostUserId">,
  action: "start" | "refresh" | "stop"): Promise<CreatorEventBroadcastResult> {
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  const unavailable: CreatorEventBroadcastResult = { creatorEventId: event.id, state: "unavailable", reason: "event_broadcast_unconfirmed", canStart: false };
  if (!authority || authority.userId !== event.hostUserId) return unavailable;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const subject = await captureAccountBoundSupabaseMutationSubject(event.hostUserId);
    if (!sameAccountSessionAuthority(authority, subject.authority) || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) return unavailable;
    const response = await fetch(`${SUPABASE_URL.replace(/\/+$/u, "")}/functions/v1/creator-event-broadcast`, {
      method: "POST", signal: controller.signal, headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${subject.accessToken}`,
        "Content-Type": "application/json", "x-chillywood-platform": Platform.OS }, body: JSON.stringify({ action, creatorEventId: event.id }),
    });
    const row: unknown = await response.json();
    if (!response.ok || controller.signal.aborted || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())
      || !row || typeof row !== "object" || Array.isArray(row)) return unavailable;
    const data = row as Record<string, unknown>;
    if (data.creatorEventId !== event.id || !["prepared", "starting", "active", "stopped", "failed", "uncertain", "unavailable"].includes(String(data.state))
      || typeof data.reason !== "string" || data.canStart !== (data.state === "active")
      || data.rawHlsUrlReturned !== false || data.fullRoomTokenForSpectators !== false) return unavailable;
    return { creatorEventId: event.id, state: data.state as CreatorEventBroadcastResult["state"], reason: data.reason, canStart: data.canStart as boolean };
  } catch { return unavailable; } finally { clearTimeout(timeout); }
}

export function creatorEventBroadcastStatusCopy(result: CreatorEventBroadcastResult) {
  if (result.reason === "event_broadcast_replay_recovery_required") return "This show includes a purchased replay. Contact platform support to recover the broadcast while preserving that replay. A replacement broadcast cannot start until this is resolved.";
  if (result.reason === "event_broadcast_original_terms_required") return "The original approved broadcast window or event terms have changed or expired. Contact platform support before trying to restart. Your event and purchase history are preserved.";
  if (result.reason === "event_broadcast_terminal_receipt_required") return "The provider has not confirmed that the previous broadcast stopped. Refresh readiness to check that attempt; a replacement will not start until shutdown is confirmed.";
  if (result.state === "active") return "The broadcast is verified and ready. Use Start verified event to open the show for ticket holders.";
  if (result.state === "stopped") return "The broadcast has stopped. Your event and purchase history remain available.";
  if (result.reason.includes("host_tracks")) return "Enter the host room and turn on your camera or microphone before starting the broadcast.";
  if (result.reason.includes("approval") || result.reason.includes("qualification")) return "Your creator broadcast qualification must be current before starting. Once platform setup and this show’s readiness checks pass, you can start your own show without a separate approval for each show. Your host room and event are saved.";
  if (result.reason.includes("worker")) return "Platform broadcast setup is not ready. Your host room and event are saved; refresh readiness when setup is complete.";
  if (result.reason.includes("cost_guard")) return "Live broadcasting is temporarily paused. Your event and ticket records are preserved.";
  if (result.state === "starting") return "The broadcast is starting. Refresh readiness until its stream and protected playback are verified.";
  if (result.state === "uncertain") return "The broadcast request is being reconciled. Refresh readiness to check the original attempt; starting again will not create a second broadcast.";
  return "Broadcast status could not be confirmed. Refresh readiness before opening the show.";
}
