import { Platform } from "react-native";
import { captureAccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";

export type CreatorEventPlayback = {
  allowed: true; canRenderPlayback: true; creatorEventId: string; kind: "live" | "replay";
  playbackUrl: string; playbackIdentity: string; expiresAt: string; rawHlsUrlReturned: false; fullRoomTokenForSpectators: false;
} | { allowed: false; canRenderPlayback: false; playbackUrl: null; reason: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const endpoint = `${SUPABASE_URL.replace(/\/+$/u, "")}/functions/v1/spectator-playback`;
const denied = (reason: string): CreatorEventPlayback => ({ allowed: false, canRenderPlayback: false, playbackUrl: null, reason });

export function parseCreatorEventPlayback(value: unknown, eventId: string, now = Date.now()): CreatorEventPlayback {
  if (!UUID.test(eventId) || !value || typeof value !== "object" || Array.isArray(value)) return denied("playback_unavailable");
  const row = value as Record<string, unknown>;
  if (row.allowed === false && row.canRenderPlayback === false && row.playbackUrl === null) {
    return denied(typeof row.reason === "string" ? row.reason : "playback_unavailable");
  }
  if (row.allowed !== true || row.canRenderPlayback !== true || row.creatorEventId !== eventId
    || (row.kind !== "live" && row.kind !== "replay") || row.rawHlsUrlReturned !== false
    || row.fullRoomTokenForSpectators !== false || typeof row.playbackUrl !== "string" || typeof row.expiresAt !== "string"
    || typeof row.playbackIdentity !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(row.playbackIdentity)) return denied("playback_unavailable");
  const expires = Date.parse(row.expiresAt);
  if (!Number.isFinite(expires) || expires <= now + 5_000 || expires > now + 305_000) return denied("playback_expired");
  try {
    const url = new URL(row.playbackUrl), base = new URL(endpoint);
    const params = [...url.searchParams.keys()];
    if (url.protocol !== "https:" || url.origin !== base.origin || url.username || url.password || url.hash
      || url.pathname !== `${base.pathname}/events/${eventId}/index.m3u8`
      || params.length !== 1 || params[0] !== "eventToken" || !url.searchParams.get("eventToken")
      || row.playbackUrl !== row.playbackUrl.trim()) return denied("playback_unavailable");
    return { allowed: true, canRenderPlayback: true, creatorEventId: eventId, kind: row.kind, playbackUrl: url.toString(),
      playbackIdentity: row.playbackIdentity, expiresAt: row.expiresAt, rawHlsUrlReturned: false, fullRoomTokenForSpectators: false };
  } catch { return denied("playback_unavailable"); }
}

export async function readCreatorEventPlayback(eventId: string, signal?: AbortSignal): Promise<CreatorEventPlayback> {
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  if (!UUID.test(eventId) || !authority || authority.restoreOnly || signal?.aborted) return denied("account_verification_required");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 15_000);
  try {
    const subject = await captureAccountBoundSupabaseMutationSubject(authority.userId);
    if (controller.signal.aborted || !sameAccountSessionAuthority(authority, subject.authority)
      || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) return denied("account_changed");
    const response = await fetch(endpoint, { method: "POST", signal: controller.signal, headers: {
      apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${subject.accessToken}`, "Content-Type": "application/json", "x-chillywood-platform": Platform.OS,
    }, body: JSON.stringify({ mode: "event_state", creatorEventId: eventId }) });
    const data: unknown = await response.json();
    if (controller.signal.aborted || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) return denied("account_changed");
    const parsed = parseCreatorEventPlayback(data, eventId);
    if (!response.ok && parsed.allowed) return denied("playback_unavailable");
    return parsed;
  } catch { return denied("playback_unavailable"); }
  finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
}

export function creatorEventPlaybackUnavailableCopy(reason: string) {
  if (reason.includes("not_started") || reason.includes("waiting") || reason.includes("scheduled")) return "The show has not opened yet. Check the event page for its start time or a creator update.";
  if (reason.includes("replay") || reason.includes("expired")) return "Playback or replay access is not available now. Check your ticket's replay terms and refresh.";
  if (reason.includes("cancel") || reason.includes("no_show")) return "This show is not available. Check the event page and Purchases & My Tickets for updates.";
  return "Playback could not be verified for this account and event. Refresh access or return to the event for its current status.";
}
