import { Linking, Platform } from "react-native";
import { randomUUID } from "expo-crypto";
import { supabase } from "./supabase";
import { withAuthorityReadDeadline } from "./entitlementAuthority";
import { captureAccountBoundSupabaseMutationSubject, assertAccountBoundSupabaseMutationSubjectCurrent } from "./accountBoundSupabaseMutation";
import { withNativeStripeVideoAttempt } from "./stripeVideoNativeAttemptJournal";
import { parseStripeSandboxVideoAccess, validateStripeSandboxCheckoutUrl, type StripeSandboxVideoAccess } from "./stripePaidVideoSandbox";
import { assertIosExternalStorefront } from "./iosExternalAdmission";
import { withGooglePlayExternalContentLink } from "./google-play-external-content-links";

const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const pending = "Checkout is pending. Refresh video access; this saved checkout will not be opened or charged again.";
const expired = "The server verified that checkout expired without payment. Select Unlock Video again to start a new checkout.";
type Row = Record<string, unknown>;

/** Historical access remains readable while checkout configuration is unavailable. */
export async function readNativeStripeSandboxVideoAccess(videoId: string): Promise<StripeSandboxVideoAccess | null> {
  const platform = Platform.OS;
  if ((platform !== "ios" && platform !== "android") || !uuid(videoId)) return null;
  try {
    const subject = await captureAccountBoundSupabaseMutationSubject();
    const current = () => assertAccountBoundSupabaseMutationSubjectCurrent(subject);
    const result = await withAuthorityReadDeadline((supabase as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }).rpc(
      "resolve_stripe_sandbox_video_access", { p_video_id: videoId, p_platform: platform }), null);
    current();
    const base = result && !result.error ? parseStripeSandboxVideoAccess(result.data, videoId) : null;
    if (!base) return null;
    const closed = { ...base, checkoutAllowed: false };
    if (!base.available || base.canAccess || !base.checkoutAllowed) return closed;
    try {
      const edge = await withAuthorityReadDeadline(supabase.functions.invoke("stripe-paid-video-checkout", {
        headers: { Authorization: `Bearer ${subject.accessToken}`, "x-chillywood-platform": platform },
        body: { action: "eligibility", videoId },
      }), null);
      current();
      const offer = edge && !edge.error ? parseStripeSandboxVideoAccess(edge.data, videoId) : null;
      if (!offer || edge?.data?.checkoutPlatform !== platform || offer.creatorId !== base.creatorId || offer.priceId !== base.priceId
        || offer.priceRevision !== base.priceRevision || offer.amountMinor !== base.amountMinor || offer.currency !== base.currency
        || offer.canAccess !== base.canAccess) return closed;
      return { ...base, checkoutAllowed: offer.checkoutAllowed };
    } catch { current(); return closed; }
  } catch { return null; }
}

async function operate(videoId: string, open: boolean): Promise<string | null> {
  const platform = Platform.OS;
  if (platform !== "ios" && platform !== "android") {
    if (!open) return null;
    throw new Error("Use the website checkout on this platform.");
  }
  if (!uuid(videoId)) throw new Error("Video identity is invalid.");
  const subject = await captureAccountBoundSupabaseMutationSubject();
  const current = () => assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  const invoke = async (body: Row): Promise<Row> => {
    current();
    const result = await supabase.functions.invoke("stripe-paid-video-checkout", {
      headers: { Authorization: `Bearer ${subject.accessToken}`, "x-chillywood-platform": platform }, body,
    });
    current();
    if (result.error || !result.data || typeof result.data !== "object" || Array.isArray(result.data)) {
      throw new Error("Checkout could not be verified. Keep the saved attempt and refresh access.");
    }
    return result.data as Row;
  };
  return withNativeStripeVideoAttempt(subject.authority.userId, videoId, current, async journal => {
    let attempt = await journal.read();
    const identity = (row: Row, requestId: string) => row.requestId === requestId && row.videoId === videoId
      && row.buyerId === subject.authority.userId && row.environment === "sandbox" && row.provider === "stripe";
    const order = (row: Row, requestId: string, orderId: string | null) => {
      if (!identity(row, requestId) || !uuid(row.orderId) || (orderId !== null && row.orderId !== orderId)
        || row.checkoutPlatform !== platform || !uuid(row.creatorId) || !uuid(row.priceId)
        || !Number.isSafeInteger(row.priceRevision) || Number(row.priceRevision) < 1
        || !Number.isSafeInteger(row.amountMinor) || Number(row.amountMinor) < 50 || row.currency !== "usd"
        || typeof row.canAccess !== "boolean" || !["prepared", "dispatched", "checkout_ready", "paid", "failed", "refunded", "held"].includes(String(row.status))) {
        throw new Error("Checkout identity could not be confirmed. Keep the saved attempt.");
      }
    };
    if (attempt) {
      const row = await invoke(attempt.orderId ? { orderId: attempt.orderId, action: "status" }
        : { videoId, requestId: attempt.requestId, action: "recover" });
      if (row.found === false) {
        if (attempt.orderId || !identity(row, attempt.requestId) || row.orderId != null || row.checkoutUrl != null) {
          throw new Error("Checkout recovery could not be confirmed.");
        }
        if (!open) return null;
        // Conclusive no-order recovery alone permits reusing this request ID.
      } else {
        order(row, attempt.requestId, attempt.orderId);
        await journal.remember(attempt, String(row.orderId));
        if (row.status === "failed" && row.canAccess === false && row.checkoutUrl == null) {
          await journal.retireUnpaid({ requestId: attempt.requestId, orderId: String(row.orderId) });
          return expired;
        }
        return pending; // Never reopen an existing order or replace its token.
      }
    } else if (!open) return null;
    current();
    const offer = await readNativeStripeSandboxVideoAccess(videoId);
    current();
    if (!offer?.available || !offer.checkoutAllowed || offer.canAccess) throw new Error("Sandbox checkout is not ready for this video.");
    attempt = attempt ?? await journal.prepare(randomUUID);
    const saved = attempt;
    const create = async (nativeObservation: Row): Promise<string> => {
      const row = await invoke({ videoId, requestId: saved.requestId, nativeObservation });
      order(row, saved.requestId, saved.orderId);
      if (row.creatorId !== offer.creatorId || row.priceId !== offer.priceId || row.priceRevision !== offer.priceRevision
        || row.amountMinor !== offer.amountMinor || row.currency !== offer.currency) throw new Error("Video price changed. Refresh access; keep the saved attempt.");
      await journal.remember(saved, String(row.orderId));
      if (row.status === "failed" && row.canAccess === false && row.checkoutUrl == null) {
        await journal.retireUnpaid({ requestId: saved.requestId, orderId: String(row.orderId) });
        throw new Error(expired);
      }
      const url = validateStripeSandboxCheckoutUrl(row.checkoutUrl);
      if (!url || row.status !== "checkout_ready" || row.canAccess !== false) throw new Error(pending);
      current();
      return url;
    };
    if (platform === "android") {
      await withGooglePlayExternalContentLink(async native => {
        current();
        const url = await create({ apiVersion: native.google_play_external_link_api_version,
          externalTransactionToken: native.google_play_external_transaction_token });
        current();
        return { url };
      });
    } else {
      const storefront = await assertIosExternalStorefront(subject);
      current();
      const url = await create({ apiVersion: 1, countryCode: storefront.countryCode });
      await assertIosExternalStorefront(subject);
      current();
      await Linking.openURL(url);
    }
    return "Sandbox checkout opened. Only server-verified payment unlocks video access.";
  });
}

export async function openNativeStripeSandboxVideoCheckout(videoId: string): Promise<string> {
  return (await operate(videoId, true))!;
}
export async function refreshNativeStripeSandboxVideoPayment(videoId: string): Promise<string | null> {
  return operate(videoId, false);
}
