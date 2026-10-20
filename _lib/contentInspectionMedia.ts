import "react-native-get-random-values";
import { captureAccountBoundSupabaseMutationSubject, assertAccountBoundSupabaseMutationSubjectCurrent } from "./accountBoundSupabaseMutation";
import { sameAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { ContentInspectionError, isInspectionReason, isInspectionUuid, type InspectionTarget } from "./contentInspection";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";

export type InspectionMediaKind = "image" | "video" | "audio";
export type InspectionMediaUnavailable = "unsupported_media_inspection" | "unavailable_original" | "unsupported_format" | "quarantined_unrenderable";
export type InspectionMediaSource = { uri: string; headers: Record<string, string> };
export type InspectionMediaLease = {
  availability: "ready"; source: InspectionMediaSource; mediaKind: InspectionMediaKind;
  mimeType: string; expiresAt: number; active: () => boolean;
  dispose: () => void; onDispose: (callback: () => void) => () => void;
};
const endpoint = () => `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/admin-content-inspection`;
const mimeKinds: Record<string, InspectionMediaKind> = {
  "image/jpeg": "image", "image/png": "image", "image/webp": "image", "image/gif": "image",
  "video/mp4": "video", "video/quicktime": "video", "video/webm": "video",
  "audio/mpeg": "audio", "audio/mp4": "audio", "audio/wav": "audio", "audio/x-wav": "audio", "audio/webm": "audio", "audio/ogg": "audio",
};
function requestId() {
  const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function validatedInspectionStreamUrl(value: unknown, version: unknown): string {
  if (typeof value !== "string" || typeof version !== "string" || !/^[a-f0-9]{32,64}$/.test(version)) throw new ContentInspectionError("unavailable");
  const expected = new URL(endpoint()); const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== expected.origin || url.pathname !== expected.pathname
    || url.username || url.password || url.hash || url.search !== `?v=${version}`) throw new ContentInspectionError("unavailable");
  return url.toString();
}
function responseError(status: number, code: unknown) {
  return new ContentInspectionError(code === "content_inspection_disabled" ? "disabled"
    : status === 401 || status === 403 ? "denied" : "unavailable");
}

// A lease owns only volatile credentials. Disposal revokes local rendering, not the
// server receipt. The server independently rechecks authority on every GET/range.
export async function prepareInspectionMedia(authority: AccountSessionAuthorityBinding, contextId: string, target: InspectionTarget, reason: string, signal: AbortSignal): Promise<InspectionMediaLease | { availability: InspectionMediaUnavailable }> {
  if (!isInspectionUuid(contextId) || !isInspectionUuid(target.targetId) || !isInspectionReason(reason)) throw new ContentInspectionError("invalid");
  if (!["creator_video", "social_attachment"].includes(target.targetType)) return { availability: "unsupported_media_inspection" };
  let lease: InspectionMediaLease | undefined;
  const controller = new AbortController();
  const abort = () => { controller.abort(); lease?.dispose(); };
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 20_000);
  try {
    if (signal.aborted) throw new ContentInspectionError("account_changed");
    const subject = await captureAccountBoundSupabaseMutationSubject(authority.userId);
    const check = () => {
      if (controller.signal.aborted || authority.restoreOnly || !sameAccountSessionAuthority(authority, subject.authority)) throw new ContentInspectionError("account_changed");
      assertAccountBoundSupabaseMutationSubjectCurrent(subject);
    };
    check();
    const headers = { Authorization: `Bearer ${subject.accessToken}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" };
    const response = await fetch(endpoint(), { method: "POST", headers, body: JSON.stringify({ action: "prepare_media", contextId, ...target, reason: reason.trim(), requestId: requestId() }), signal: controller.signal, cache: "no-store", credentials: "omit", redirect: "error" });
    try { check(); } catch (error) { await response.body?.cancel(); throw error; }
    const data = await response.json(); check();
    if (!response.ok) throw responseError(response.status, data?.error);
    if (["unsupported_media_inspection", "unavailable_original", "unsupported_format", "quarantined_unrenderable"].includes(data?.availability)) return { availability: data.availability };
    if (data?.availability !== "ready" || !isInspectionUuid(data.receiptId ?? "") || mimeKinds[data.mimeType] !== data.mediaKind
      || !mimeKinds[data.mimeType] || !Number.isSafeInteger(data.sizeBytes) || data.sizeBytes <= 0
      || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now()
      || (data.mediaKind === "image" && data.sizeBytes > 16 * 1024 * 1024)) throw new ContentInspectionError("unavailable");
    const source = { uri: validatedInspectionStreamUrl(data.streamUrl, data.storedVersion), headers: { Authorization: headers.Authorization, apikey: headers.apikey, "X-Inspection-Receipt": data.receiptId } as Record<string, string> };
    // Verify a freshly authorized range before exposing a source to a native decoder.
    const probe = await fetch(source.uri, { headers: { ...source.headers, Range: "bytes=0-0" }, signal: controller.signal, cache: "no-store", credentials: "omit", redirect: "error" });
    await probe.body?.cancel();
    check();
    if (probe.status !== 206 || probe.headers.get("Content-Range") !== `bytes 0-0/${data.sizeBytes}` || probe.headers.get("Content-Type")?.split(";")[0] !== data.mimeType) throw responseError(probe.status, null);
    check();
    let disposed = false;
    const callbacks = new Set<() => void>();
    const expiresAt = Date.parse(data.expiresAt);
    const dispose = () => {
      if (disposed) return;
      disposed = true; clearTimeout(expiry); signal.removeEventListener("abort", abort);
      source.uri = ""; Object.keys(source.headers).forEach(key => { delete source.headers[key]; });
      callbacks.forEach(callback => callback()); callbacks.clear();
    };
    const expiry = setTimeout(dispose, Math.max(0, Math.min(expiresAt - Date.now(), 2_147_483_647)));
    lease = { availability: "ready", source, mediaKind: data.mediaKind, mimeType: data.mimeType, expiresAt, active: () => !disposed && Date.now() < expiresAt, dispose,
      onDispose(callback) { if (disposed) callback(); else callbacks.add(callback); return () => { callbacks.delete(callback); }; } };
    return lease;
  } catch (error) {
    lease?.dispose();
    if (error instanceof ContentInspectionError) throw error;
    throw new ContentInspectionError(error && typeof error === "object" && "code" in error && error.code === "account_changed" ? "account_changed" : "unavailable");
  } finally {
    clearTimeout(timeout);
    if (!lease) signal.removeEventListener("abort", abort);
  }
}
