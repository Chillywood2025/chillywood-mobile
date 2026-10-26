import { Platform } from "react-native";
import { captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";

export type CreatorPriceSourceType =
  | "paid_content" | "watch_party_live" | "live_watch_party_access"
  | "live_watch_party_seat" | "creator_tip" | "channel_subscription" | "vip_pass" | "event";

export type CreatorSupportedPrice = {
  priceKey: string;
  productKey: string;
  amountMinor: number;
  currency: "usd";
  label: string;
  provider: "revenuecat_app_store" | "revenuecat_google_play";
  providerProductId: string;
  environment: "sandbox" | "production";
  platform: "ios" | "android";
  status: string;
  providerVerified: boolean;
  availablePlatforms: ("ios" | "android")[];
  availabilityLabel: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const exactText = (value: unknown): value is string => typeof value === "string" && !!value && value === value.trim();
const sourceTypes: readonly CreatorPriceSourceType[] = ["paid_content", "watch_party_live", "live_watch_party_access", "live_watch_party_seat", "creator_tip", "channel_subscription", "vip_pass", "event"];

export function parseCreatorSupportedPrices(value: unknown, expected: {
  platform: "ios" | "android"; environment: "sandbox" | "production"; sourceType: CreatorPriceSourceType;
}): CreatorSupportedPrice[] | null {
  if (!Array.isArray(value)) return null;
  const prices: CreatorSupportedPrice[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    if (!exactText(row.priceId) || !UUID.test(row.priceId) || seen.has(row.priceId)
      || !exactText(row.productKey) || !exactText(row.providerProductId)
      || row.platform !== expected.platform || row.environment !== expected.environment
      || row.provider !== (expected.platform === "ios" ? "revenuecat_app_store" : "revenuecat_google_play")
      || !Number.isSafeInteger(row.amountMinor) || Number(row.amountMinor) <= 0 || row.currency !== "usd"
      || typeof row.providerVerified !== "boolean"
      || (expected.environment === "production"
        ? row.status !== "active" || !row.providerVerified
        : row.status !== "sandbox")) return null;
    seen.add(row.priceId);
    const amountMinor = row.amountMinor as number;
    prices.push({
      priceKey: row.priceId, productKey: row.productKey, amountMinor, currency: "usd",
      label: `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amountMinor / 100)}${expected.sourceType === "channel_subscription" ? "/month" : ""}`,
      provider: expected.platform === "ios" ? "revenuecat_app_store" : "revenuecat_google_play",
      providerProductId: row.providerProductId, environment: expected.environment, platform: expected.platform,
      status: String(row.status), providerVerified: row.providerVerified,
      availablePlatforms: [expected.platform], availabilityLabel: expected.platform === "ios" ? "iOS" : "Android",
    });
  }
  return prices.sort((a, b) => a.amountMinor - b.amountMinor || a.priceKey.localeCompare(b.priceKey));
}

export async function readCreatorSupportedPrices(
  sourceType: CreatorPriceSourceType,
  sourceId?: string,
  options: { environment?: "sandbox" | "production" } = {},
): Promise<CreatorSupportedPricesResult> {
  return readPricesForPlatform(sourceType, Platform.OS, sourceId, options);
}

async function readPricesForPlatform(
  sourceType: CreatorPriceSourceType, platform: string, sourceId: string | undefined,
  options: { environment?: "sandbox" | "production" },
): Promise<CreatorSupportedPricesResult> {
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  const unavailable: CreatorSupportedPricesResult = { status: "unavailable", subjectUserId: authority?.userId ?? null, prices: [] };
  const environment = options.environment ?? "sandbox";
  if ((platform !== "ios" && platform !== "android") || !sourceTypes.includes(sourceType)
    || (environment !== "sandbox" && environment !== "production")
    || (sourceId !== undefined && !UUID.test(sourceId)) || !authority || authority.restoreOnly) return unavailable;
  try {
    const subject = await captureAccountBoundSupabaseMutationSubject(authority.userId);
    if (!sameAccountSessionAuthority(authority, subject.authority)) return unavailable;
    const response = await invokeAccountBoundSupabaseMutationRpc<unknown>(subject, "list_creator_supported_prices", {
      p_source_type: sourceType, p_platform: platform, p_environment: environment, p_source_id: sourceId ?? null,
    });
    if (response.error || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) return unavailable;
    const prices = parseCreatorSupportedPrices(response.data, { platform, environment, sourceType });
    return prices ? { status: "resolved", subjectUserId: authority.userId, prices } : unavailable;
  } catch { return unavailable; }
}

/** Authoring spans both catalogs; buyer checkout remains bound to its own store. */
export async function readCreatorAuthoringPrices(
  sourceType: CreatorPriceSourceType, options: { environment?: "sandbox" | "production" } = {},
): Promise<CreatorSupportedPricesResult> {
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  const unavailable: CreatorSupportedPricesResult = { status: "unavailable", subjectUserId: authority?.userId ?? null, prices: [] };
  if (!authority || authority.restoreOnly) return unavailable;
  const results = await Promise.all([
    readPricesForPlatform(sourceType, "ios", undefined, options),
    readPricesForPlatform(sourceType, "android", undefined, options),
  ]);
  if (!sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())
    || results.some(result => result.status !== "resolved" || result.subjectUserId !== authority.userId)) return unavailable;
  const groups = new Map<string, CreatorSupportedPrice>();
  // iOS then Android makes the selected key deterministic and keeps a real catalog ID.
  for (const price of results.flatMap(result => result.prices)) {
    const key = `${price.environment}:${price.currency}:${price.amountMinor}`;
    const existing = groups.get(key);
    if (existing) {
      if (!existing.availablePlatforms.includes(price.platform)) existing.availablePlatforms.push(price.platform);
    } else groups.set(key, { ...price, availablePlatforms: [...price.availablePlatforms] });
  }
  const prices = [...groups.values()].map(price => ({ ...price, availabilityLabel:
    price.availablePlatforms.length === 2 ? "iOS and Android"
      : price.availablePlatforms[0] === "ios" ? "iOS only · Android unavailable" : "Android only · iOS unavailable",
  })).sort((a, b) => a.amountMinor - b.amountMinor || a.priceKey.localeCompare(b.priceKey));
  return { status: "resolved", subjectUserId: authority.userId, prices };
}

export type CreatorSupportedPricesResult = {
  status: "resolved" | "unavailable";
  subjectUserId: string | null;
  prices: CreatorSupportedPrice[];
};

