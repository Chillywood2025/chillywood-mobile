import { Platform } from "react-native";
import { supabase } from "./supabase";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";
import { withAuthorityReadDeadline } from "./entitlementAuthority";

export type CreatorTipCustomQuote = {
  capabilityId: string; creatorId: string; buyerId: string; sessionId: string;
  amountCents: number; currency: "usd"; platform: "web" | "ios";
  routeKind: "external_browser_checkout"; storefrontCountry: string;
  environment: "test"; minAmountMinor: number; maxAmountMinor: number; expiresAt: string; eligibilityExpiresAt: string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const client = supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };

function normalizeTipCapability(payload: unknown, expected: {
  creatorId: string; buyerId: string; sessionId: string; amountCents: number; platform: string;
}, now: number, allowOutOfRange: boolean): CreatorTipCustomQuote | null {
  const row = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
  if (!row || row.available !== true || row.feature !== "creator_tip" || row.provider !== "stripe_connect"
    || row.creatorId !== expected.creatorId || row.buyerId !== expected.buyerId || row.sessionId !== expected.sessionId
    || row.amountCents !== expected.amountCents || !Number.isSafeInteger(expected.amountCents) || expected.amountCents <= 0
    || row.currency !== "usd" || row.environment !== "test" || row.paymentMethod !== "card"
    || row.platform !== expected.platform || !["web", "ios"].includes(expected.platform)
    || row.routeKind !== "external_browser_checkout"
    || typeof row.storefrontCountry !== "string" || !/^[A-Z]{2}$/.test(row.storefrontCountry)
    || row.storefrontCountry !== "US"
    || typeof row.capabilityId !== "string" || !uuid.test(row.capabilityId)
    || typeof row.minAmountMinor !== "number" || !Number.isSafeInteger(row.minAmountMinor) || row.minAmountMinor <= 0
    || typeof row.maxAmountMinor !== "number" || !Number.isSafeInteger(row.maxAmountMinor)
    || row.maxAmountMinor < row.minAmountMinor
    || (!allowOutOfRange && (expected.amountCents < row.minAmountMinor || expected.amountCents > row.maxAmountMinor))
    || typeof row.expiresAt !== "string" || !(Date.parse(row.expiresAt) > now)
    || typeof row.eligibilityExpiresAt !== "string" || !(Date.parse(row.eligibilityExpiresAt) > now)
    || row.noAccessGranted !== true || row.liveMoneyAction !== false) return null;
  return { capabilityId: row.capabilityId, creatorId: expected.creatorId, buyerId: expected.buyerId,
    sessionId: expected.sessionId, amountCents: expected.amountCents, currency: "usd", platform: row.platform as "web" | "ios",
    routeKind: "external_browser_checkout", storefrontCountry: row.storefrontCountry,
    environment: "test", minAmountMinor: row.minAmountMinor, maxAmountMinor: row.maxAmountMinor, expiresAt: row.expiresAt,
    eligibilityExpiresAt: row.eligibilityExpiresAt };
}

export function normalizeCreatorTipCustomQuote(payload: unknown, expected: Parameters<typeof normalizeTipCapability>[1], now = Date.now()) {
  return normalizeTipCapability(payload, expected, now, false);
}

export type CreatorTipCustomAvailability = { quote: CreatorTipCustomQuote | null; message: string };
export function normalizeCreatorTipCustomAvailability(payload: unknown, expected: Parameters<typeof normalizeTipCapability>[1], now = Date.now()): CreatorTipCustomAvailability {
  const quote = normalizeCreatorTipCustomQuote(payload, expected, now);
  if (quote) return { quote, message: "" };
  const row = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
  const bounds = row?.available === false ? normalizeTipCapability({ ...row, available: true }, expected, now, true) : null;
  const usd = (cents: number) => `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")} USD`;
  if (bounds && row?.reason === "amount_below_provider_minimum" && expected.amountCents < bounds.minAmountMinor) {
    return { quote: null, message: `Minimum for this verified payment route: ${usd(bounds.minAmountMinor)}. Your amount has not been changed.` };
  }
  if (bounds && row?.reason === "amount_above_provider_maximum" && expected.amountCents > bounds.maxAmountMinor) {
    return { quote: null, message: `Maximum for this verified payment route: ${usd(bounds.maxAmountMinor)}. Your amount has not been changed.` };
  }
  return { quote: null, message: "" };
}

export async function readCreatorTipCustomAvailability(creatorId: string, amountCents: number): Promise<CreatorTipCustomAvailability> {
  const unavailable = { quote: null, message: "" };
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  // Native platform/storefront eligibility comes from the server's trusted
  // capability binding, never Platform.OS or a client header alone.
  if (!authority || authority.restoreOnly || Platform.OS === "android" || !uuid.test(creatorId)
    || !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2147483647) return unavailable;
  try {
    const response = await withAuthorityReadDeadline(client.rpc("get_creator_tip_amount_quote", {
      p_creator_id: creatorId, p_amount_cents: amountCents,
    }), null);
    if (!response || response.error || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) return unavailable;
    return normalizeCreatorTipCustomAvailability(response.data, { creatorId, amountCents, buyerId: authority.userId,
      sessionId: authority.sessionGeneration, platform: Platform.OS });
  } catch { return unavailable; }
}

export async function readCreatorTipCustomQuote(creatorId: string, amountCents: number): Promise<CreatorTipCustomQuote | null> {
  return (await readCreatorTipCustomAvailability(creatorId, amountCents)).quote;
}
