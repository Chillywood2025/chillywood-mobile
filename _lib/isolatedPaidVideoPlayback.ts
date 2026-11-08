import { Platform } from "react-native";
import { captureAccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";
import { testStoreUuid } from "./isolatedTestStoreContract";
import { validTestStoreV3Quote, type TestStoreV3Quote } from "./isolatedTestStoreV3Contract";

export const PAID_VIDEO_PLAYBACK_METADATA_PROTOCOL = "scpv-range-metadata-v2" as const;
export type PaidVideoPlaybackSelection = Readonly<{ resourceId: string; grantId: string; quote: TestStoreV3Quote }>;
export type PaidVideoPlaybackLease = Readonly<{
  source: { uri: string; headers: Record<string, string> };
  selection: PaidVideoPlaybackSelection;
  expiresAt: number;
  active: () => boolean;
  dispose: () => void;
  onDispose: (callback: () => void) => () => void;
}>;
export class PaidVideoPlaybackError extends Error {
  constructor(readonly code: "invalid_selection" | "authority_retired" | "unavailable" | "expired") {
    super(code === "authority_retired" ? "Video access ended for this account session." : "Current video access is unavailable.");
  }
}
const id = (v: unknown, kind: string): v is string => typeof v === "string" && v.startsWith(`scv1_${kind}_`) && testStoreUuid(v.slice(`scv1_${kind}_`.length));
const valid = (selection: PaidVideoPlaybackSelection) => !!selection && id(selection.resourceId, "resource") && id(selection.grantId, "grant")
  && validTestStoreV3Quote(selection.quote) && selection.resourceId === selection.quote.resourceId
  && Object.keys(selection).sort().join(",") === "grantId,quote,resourceId";
export function paidVideoPlaybackSelectionKey(selection: PaidVideoPlaybackSelection): string {
  if (!valid(selection)) throw new PaidVideoPlaybackError("invalid_selection");
  const q = selection.quote, a = q.asset;
  return JSON.stringify([selection.resourceId, selection.grantId, q.offerId, q.offerRevision, q.resourceRevision, q.creatorId, q.kind, q.amountMinor, q.currency,
    a.id, a.incarnation, a.sha256, a.byteLength, a.resourceRevision, a.profile]);
}
function endpoint(selection: PaidVideoPlaybackSelection): string {
  const value = new URL(`${SUPABASE_URL.replace(/\/+$/u, "")}/functions/v1/isolated-paid-video-range-v1/${selection.resourceId}/${selection.grantId}`);
  if (value.protocol !== "https:" || value.username || value.password || value.search || value.hash) throw new PaidVideoPlaybackError("unavailable");
  return value.toString();
}
function immutable<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(immutable); Object.freeze(value); }
  return value;
}

/** This expiry is a final-authorized request observation, not permission for
 * later bytes. Every native range is independently checked by the server. */
export function parsePaidVideoPlaybackProbe(response: Response, selection: PaidVideoPlaybackSelection, expectedUrl: string, now = Date.now()): number {
  if (!valid(selection) || expectedUrl !== endpoint(selection) || response.status !== 206 || response.redirected
    || response.url !== expectedUrl || response.headers.has("location") || response.headers.has("content-encoding")) throw new PaidVideoPlaybackError("unavailable");
  const h = response.headers, a = selection.quote.asset;
  const fields: Record<string, string> = {
    "content-type": "video/mp4", "content-length": "1", "content-range": `bytes 0-0/${a.byteLength}`, "accept-ranges": "bytes",
    "x-chillywood-media-protocol": PAID_VIDEO_PLAYBACK_METADATA_PROTOCOL,
    "x-chillywood-resource-id": selection.resourceId, "x-chillywood-grant-id": selection.grantId,
    "x-chillywood-asset-id": a.id, "x-chillywood-incarnation": a.incarnation, "x-chillywood-sha256": a.sha256,
    "x-chillywood-byte-length": String(a.byteLength), "x-chillywood-resource-revision": String(a.resourceRevision),
    "x-chillywood-profile": a.profile,
  };
  if (Object.entries(fields).some(([key, value]) => h.get(key) !== value)
    || !/(?:^|,)\s*private\s*(?:,|$)/iu.test(h.get("cache-control") ?? "")
    || !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(h.get("cache-control") ?? "")) throw new PaidVideoPlaybackError("unavailable");
  const expiry = h.get("x-chillywood-authorized-until-ms") ?? "";
  if (!/^[1-9][0-9]{0,15}$/u.test(expiry) || !Number.isSafeInteger(Number(expiry))
    || Number(expiry) <= now || Number(expiry) > now + 5000) throw new PaidVideoPlaybackError("expired");
  return Number(expiry);
}

async function readSingleByte(response: Response, signal: AbortSignal): Promise<void> {
  if (response.body?.getReader) {
    const reader = response.body.getReader(); let length = 0;
    const abort = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener("abort", abort, { once: true });
    try { for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength;
      if (length > 1) throw new PaidVideoPlaybackError("unavailable"); } }
    finally { signal.removeEventListener("abort", abort); void reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (length !== 1) throw new PaidVideoPlaybackError("unavailable");
  } else if ((await response.arrayBuffer()).byteLength !== 1) throw new PaidVideoPlaybackError("unavailable");
}

/** Volatile local admission only: no durable media, bearer URL, grant creation,
 * restore fallback, SDK call, or positive receipt-to-access inference. */
export async function preparePaidVideoPlayback(authority: AccountSessionAuthorityBinding, reference: PaidVideoPlaybackSelection,
  signal: AbortSignal): Promise<PaidVideoPlaybackLease> {
  paidVideoPlaybackSelectionKey(reference);
  if (!["ios", "android"].includes(Platform.OS) || !authority || authority.restoreOnly || authority.userId !== authority.accountId
    || !testStoreUuid(authority.userId) || !testStoreUuid(authority.sessionGeneration)
    || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) throw new PaidVideoPlaybackError("authority_retired");
  const expected = Object.freeze({ ...authority });
  const selection = immutable(JSON.parse(JSON.stringify(reference)) as PaidVideoPlaybackSelection);
  const source = { uri: endpoint(selection), headers: {} as Record<string, string> };
  const callbacks = new Set<() => void>(), controller = new AbortController();
  let disposed = false, expiresAt = 0;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined, renewTimer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe = () => {};
  const dispose = () => {
    if (disposed) return;
    disposed = true; controller.abort(); clearTimeout(expiryTimer); clearTimeout(renewTimer);
    signal.removeEventListener("abort", dispose); unsubscribe();
    source.uri = ""; Object.keys(source.headers).forEach(key => { delete source.headers[key]; });
    for (const callback of callbacks) { try { callback(); } catch {} } callbacks.clear();
  };
  const current = (requireDeadline = false) => {
    if (disposed || signal.aborted || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) {
      dispose(); throw new PaidVideoPlaybackError("authority_retired");
    }
    if (requireDeadline && Date.now() >= expiresAt) { dispose(); throw new PaidVideoPlaybackError("expired"); }
  };
  unsubscribe = subscribeToAccountSessionAuthority(next => { if (!sameAccountSessionAuthority(expected, next)) dispose(); });
  signal.addEventListener("abort", dispose, { once: true });
  async function within<T>(operation: Promise<T>, deadline: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort = () => {};
    try {
      current(expiresAt !== 0);
      return await Promise.race([operation, new Promise<never>((_, reject) => {
        abort = () => reject(new PaidVideoPlaybackError("authority_retired"));
        controller.signal.addEventListener("abort", abort, { once: true });
        timer = setTimeout(() => { dispose(); reject(new PaidVideoPlaybackError("expired")); }, Math.max(0, deadline - Date.now()));
      })]);
    } finally { clearTimeout(timer); controller.signal.removeEventListener("abort", abort); }
  }
  async function probe(initial: boolean): Promise<number> {
    current(!initial);
    const uri = source.uri, deadline = initial ? Date.now() + 5000 : Math.min(expiresAt, Date.now() + 5000);
    const pending = fetch(uri, { method: "GET", headers: { ...source.headers, Range: "bytes=0-0" },
      signal: controller.signal, cache: "no-store", credentials: "omit", redirect: "error" });
    void pending.then(response => { if (disposed) void response.body?.cancel().catch(() => {}); }).catch(() => {});
    const response = await within(pending, deadline);
    try {
      current(!initial);
      const next = parsePaidVideoPlaybackProbe(response, selection, uri);
      await within(readSingleByte(response, controller.signal), deadline); current(!initial);
      if (next <= Date.now()) throw new PaidVideoPlaybackError("expired");
      return next;
    } finally { void response.body?.cancel().catch(() => {}); }
  }
  function schedule() {
    clearTimeout(expiryTimer); clearTimeout(renewTimer);
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) { dispose(); return; }
    expiryTimer = setTimeout(dispose, remaining);
    renewTimer = setTimeout(() => {
      // One request at a time. The old absolute deadline stays armed throughout
      // I/O; a later positive observation can never revive an expired owner.
      void probe(false).then(next => { current(true); expiresAt = next; schedule(); }).catch(dispose);
    }, Math.max(25, Math.min(1000, Math.floor(remaining / 2))));
  }
  try {
    current();
    const subject = await within(captureAccountBoundSupabaseMutationSubject(expected.userId, { waitForReadSettlement: true, signal: controller.signal }), Date.now() + 5000);
    if (!sameAccountSessionAuthority(expected, subject.authority)) { dispose(); throw new PaidVideoPlaybackError("authority_retired"); }
    current();
    source.headers = { Authorization: `Bearer ${subject.accessToken}`, apikey: SUPABASE_ANON_KEY, "X-Chillywood-Auth-Session": expected.sessionGeneration };
    expiresAt = await probe(true); current(true); schedule();
    return Object.freeze({ source, selection, get expiresAt() { return expiresAt; },
      active: () => !disposed && Date.now() < expiresAt && sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot()),
      dispose, onDispose(callback: () => void) { if (disposed) callback(); else callbacks.add(callback); return () => { callbacks.delete(callback); }; } });
  } catch (error) {
    dispose();
    if (error instanceof PaidVideoPlaybackError) throw error;
    throw new PaidVideoPlaybackError("unavailable");
  }
}
