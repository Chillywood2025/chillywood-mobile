import { Platform } from "react-native";
import Purchases from "react-native-purchases";
import { captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";
import { withAuthorityReadDeadline } from "./entitlementAuthority";
import { configureRevenueCatOnce, syncRevenueCatCustomerIdentity } from "./revenuecat";

type Subject = Awaited<ReturnType<typeof captureAccountBoundSupabaseMutationSubject>>;
export type IosExternalCheckoutInput = { feature: "creator_tip" | "event_auction" | "room_seat_auction"; creatorId: string; amountMinor: number; sourceId: string; capabilityId?: string };
const current = (subject: Subject) => !subject.authority.restoreOnly
  && sameAccountSessionAuthority(subject.authority, getCurrentAccountSessionAuthoritySnapshot());

/** SDK availability is not store/provider approval. */
export const isIosExternalCheckoutSupported = () => Platform.OS === "ios" && typeof Purchases.getStorefront === "function";

/** Fresh StoreKit SDK observation, not cryptographic Apple attestation. */
export async function assertIosExternalStorefront(subject: Subject): Promise<{ countryCode: "USA" }> {
  if (!isIosExternalCheckoutSupported() || !current(subject)) throw new Error("App Store checkout eligibility is unavailable.");
  const configuration = configureRevenueCatOnce();
  if (!configuration.shouldConfigure || configuration.mode !== "ios-release") throw new Error("App Store checkout is not configured.");
  const identity = await syncRevenueCatCustomerIdentity(subject.authority.userId);
  if (!current(subject) || identity.status !== "identified" || !identity.matchesSourceUser
    || identity.sourceUserId !== subject.authority.userId || identity.appUserId !== subject.authority.userId) {
    throw new Error("Account changed before checking the App Store storefront.");
  }
  const storefront = await withAuthorityReadDeadline(Purchases.getStorefront(), null);
  // RevenueCat's installed hybrid Storefront contract exposes countryCode only.
  // Do not fabricate a numeric StoreKit identifier or cast an unsupported field.
  if (!current(subject) || storefront?.countryCode !== "USA") throw new Error("This checkout requires the United States App Store storefront.");
  return { countryCode: "USA" };
}

export async function admitIosExternalCheckout(subject: Subject, input: IosExternalCheckoutInput): Promise<string> {
  const storefront = await assertIosExternalStorefront(subject);
  const result = await invokeAccountBoundSupabaseMutationRpc<Record<string, unknown>>(subject, "admit_ios_external_session", {
    p_feature: input.feature, p_creator_id: input.creatorId, p_amount_minor: input.amountMinor,
    p_source_id: input.sourceId, p_country_code: storefront.countryCode, p_api_version: 1,
    ...(input.capabilityId ? { p_capability_id: input.capabilityId } : {}),
  });
  const row = result.data;
  if (result.error || !row || typeof row.capabilityId !== "string"
    || (input.capabilityId !== undefined && row.capabilityId !== input.capabilityId)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.capabilityId)
    || typeof row.expiresAt !== "string" || !(Date.parse(row.expiresAt) > Date.now())
    || row.verification !== "native_storefront_observation_unverified" || row.financialAuthority !== false || row.accessGranted !== false
    || !current(subject)) throw new Error("App Store checkout is not available for this account and amount. No checkout was opened.");
  return row.capabilityId;
}
