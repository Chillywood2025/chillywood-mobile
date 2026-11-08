const PREFIX = "chillywood-sandbox-video-v3:";
const OFFER = /^scv1_offer_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** A share code carries only a sandbox offer identity. It is never a URL,
 * credential, quoted price, asset locator or permission to purchase. */
export function parsePaidVideoOfferCode(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 128) return null;
  const text = value.trim(), id = text.startsWith(PREFIX) ? text.slice(PREFIX.length) : text;
  return OFFER.test(id) ? id : null;
}
export function formatPaidVideoOfferCode(offerId: string): string {
  if (!OFFER.test(offerId)) throw new Error("invalid_sandbox_video_offer");
  return `${PREFIX}${offerId}`;
}
