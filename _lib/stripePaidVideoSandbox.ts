import { Platform, Linking } from "react-native";
import { supabase } from "./supabase";
import { withAuthorityReadDeadline } from "./entitlementAuthority";
import { captureAccountBoundSupabaseMutationSubject, assertAccountBoundSupabaseMutationSubjectCurrent } from "./accountBoundSupabaseMutation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export type StripeSandboxVideoAccess = {
  available: boolean; canAccess: boolean; checkoutAllowed: boolean; reason: string;
  videoId: string; creatorId?: string; priceId?: string; priceRevision?: number;
  amountMinor?: number; currency?: string; environment?: "sandbox"; provider?: "stripe";
};
export function parseStripeSandboxVideoAccess(data: unknown, videoId: string): StripeSandboxVideoAccess | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  if (typeof row.available !== "boolean" || typeof row.canAccess !== "boolean" || typeof row.checkoutAllowed !== "boolean"
    || typeof row.reason !== "string" || row.videoId !== videoId) return null;
  if (!row.available) return row.reason === "stripe_price_not_configured" && !row.canAccess && !row.checkoutAllowed
    ? row as StripeSandboxVideoAccess : null;
  if (row.environment !== "sandbox" || row.provider !== "stripe" || !UUID.test(String(row.creatorId))
    || !UUID.test(String(row.priceId)) || !Number.isSafeInteger(row.priceRevision) || Number(row.priceRevision) < 1
    || !Number.isSafeInteger(row.amountMinor) || Number(row.amountMinor) < 50 || row.currency !== "usd"
    || (row.canAccess && row.checkoutAllowed)) return null;
  return row as StripeSandboxVideoAccess;
}
export async function readStripeSandboxVideoAccess(videoId: string): Promise<StripeSandboxVideoAccess | null> {
  if (Platform.OS !== "web" || !UUID.test(videoId)) return null;
  try {
    const result = await withAuthorityReadDeadline((supabase as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{data: unknown; error: unknown}> }).rpc("resolve_stripe_sandbox_video_access", { p_video_id: videoId }), null);
    return result && !result.error ? parseStripeSandboxVideoAccess(result.data, videoId) : null;
  } catch { return null; }
}
export function validateStripeSandboxCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.origin === "https://checkout.stripe.com" && !url.username && !url.password
      && /^\/(?:c\/)?pay\//u.test(url.pathname) ? url.toString() : null;
  } catch { return null; }
}
/** Returning from Stripe never grants playback. Only fresh server access can do so. */
export async function openStripeSandboxVideoCheckout(videoId: string): Promise<string> {
  if (Platform.OS !== "web") throw new Error("This checkout is available on the website only.");
  const subject = await captureAccountBoundSupabaseMutationSubject();
  const offer = await readStripeSandboxVideoAccess(videoId);
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (!offer?.available || !offer.checkoutAllowed || offer.canAccess) throw new Error("Stripe sandbox checkout is not ready for this video. Refresh access before trying again.");
  // Keep unresolved requests across refreshes. Storage failure blocks rather than
  // creating another charge session on an ambiguous retry. No credentials stored.
  const key = `stripe-video-sandbox:${subject.authority.userId}:${videoId}`;
  let requestId = sessionStorage.getItem(key);
  if (requestId !== null && !UUID.test(requestId)) throw new Error("Saved checkout needs recovery before another attempt.");
  if (!requestId) { requestId = crypto.randomUUID(); sessionStorage.setItem(key, requestId); }
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  const result = await supabase.functions.invoke("stripe-paid-video-checkout", {
    headers: { Authorization: `Bearer ${subject.accessToken}`, "x-chillywood-platform": "web" },
    body: { videoId, requestId },
  });
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  const row = result.data as Record<string, unknown> | null;
  if (result.error || !row || row.requestId !== requestId || row.videoId !== videoId
    || row.buyerId !== subject.authority.userId || row.creatorId !== offer.creatorId
    || row.priceId !== offer.priceId || row.priceRevision !== offer.priceRevision
    || row.amountMinor !== offer.amountMinor || row.currency !== offer.currency
    || row.environment !== "sandbox" || row.provider !== "stripe" || !UUID.test(String(row.orderId))) {
    throw new Error("Checkout could not be confirmed. Your saved attempt will be reused; do not start another purchase.");
  }
  if (row.status === "failed" && row.canAccess === false && row.checkoutUrl == null) {
    sessionStorage.removeItem(`${key}:order`); sessionStorage.removeItem(key);
    return "The server verified that the previous checkout expired without payment. Select Unlock Video again to start a new checkout.";
  }
  sessionStorage.setItem(`${key}:order`, String(row.orderId));
  const url = validateStripeSandboxCheckoutUrl(row.checkoutUrl);
  if (!url || row.canAccess !== false || row.status !== "checkout_ready") {
    return "Checkout is pending or unavailable. Refresh video access; returning from checkout does not unlock this video.";
  }
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  await Linking.openURL(url);
  return "Sandbox checkout opened. Refresh video access after payment; only server-verified access unlocks playback.";
}

/** Reconcile the retained order, then caller must reread canonical access. */
export async function refreshStripeSandboxVideoPayment(videoId: string): Promise<string | null> {
  if (Platform.OS !== "web") return null;
  const subject = await captureAccountBoundSupabaseMutationSubject();
  const key = `stripe-video-sandbox:${subject.authority.userId}:${videoId}`;
  const requestId = sessionStorage.getItem(key);
  const orderId = sessionStorage.getItem(`${key}:order`);
  if (!orderId && !requestId) return null;
  if (!requestId || !UUID.test(requestId) || (orderId && !UUID.test(orderId))) throw new Error("Saved checkout identity is invalid.");
  const result = await supabase.functions.invoke("stripe-paid-video-checkout", {
    headers: { Authorization: `Bearer ${subject.accessToken}`, "x-chillywood-platform": "web" },
    body: orderId ? { orderId, action: "status" } : { videoId, requestId, action: "recover" },
  });
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (result.error || (orderId ? result.data?.orderId !== orderId : !UUID.test(String(result.data?.orderId))) || result.data?.buyerId !== subject.authority.userId
    || result.data?.videoId !== videoId || result.data?.environment !== "sandbox" || result.data?.provider !== "stripe"
    || result.data?.requestId !== sessionStorage.getItem(`stripe-video-sandbox:${subject.authority.userId}:${videoId}`)) {
    throw new Error("Checkout status could not be verified. Keep this saved attempt.");
  }
  sessionStorage.setItem(`${key}:order`, String(result.data.orderId));
  if (result.data.status === "failed" && result.data.canAccess === false && result.data.checkoutUrl == null) {
    sessionStorage.removeItem(`${key}:order`); sessionStorage.removeItem(key);
    return "The server verified that the previous checkout expired without payment. Select Unlock Video again to start a new checkout.";
  }
  return null;
}
