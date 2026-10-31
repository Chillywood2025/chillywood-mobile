import {
  getCurrentAccountSessionAuthoritySnapshot,
  parseAccountSessionAuthorityReadback,
  sameAccountSessionAuthority,
  type AccountSessionAuthorityBinding,
} from "./accountSessionAuthority";
import {
  captureAccountBoundSupabaseMutationSubject,
  invokeAccountBoundSupabaseMutationRpc,
  type AccountBoundSupabaseMutationResult,
} from "./accountBoundSupabaseMutation";
import { getAppMonetizationRuntimeFeatures } from "./featureFlags";
import { getRevenueCatConfigurationState, syncRevenueCatCustomerIdentity } from "./revenuecat";
import { isCreatorDigitalCheckoutShellAvailable as resolveCreatorDigitalCheckoutShell } from "./revenuecatPurchaseClosure";
import { getRuntimeConfig } from "./runtimeConfig";
import { Platform } from "react-native";
import "react-native-get-random-values";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type CreatorMoneyPurchaseSubject = {
  userId: string;
  accessToken: string;
  authority: AccountSessionAuthorityBinding;
};

export type CreatorMoneyPurchaseIntentExpectation = {
  userId: string;
  sourceType: string;
  sourceId: string;
  creatorId: string;
  provider: "revenuecat_app_store" | "revenuecat_google_play";
  providerProductId: string;
  environment: "sandbox" | "production";
  status: "pending" | "consumed";
  amountMinor: number;
  currency: string;
};

export type HistoricalCreatorMoneyPurchaseIntentExpectation = Pick<
  CreatorMoneyPurchaseIntentExpectation,
  "userId" | "sourceType" | "sourceId" | "creatorId"
>;

const exactText = (value: unknown) => (
  typeof value === "string" && value === value.trim() ? value : ""
);

export const CREATOR_MONEY_CHECKOUT_UNCONFIRMED_COPY = "This checkout could not be authorized for a new payment. Refresh Purchases & My Tickets before another attempt; do not repeat a purchase while its payment is unknown.";

/** A server-persisted, one-use claim must precede every non-event native Store call. */
export async function beginCreatorMoneyCheckout(subject: CreatorMoneyPurchaseSubject, intentId: string,
  expected: CreatorMoneyPurchaseIntentExpectation, selectedActionId?: string): Promise<boolean> {
  if (!UUID_PATTERN.test(intentId) || subject.userId !== expected.userId || expected.status !== "pending"
    || !["creator_tip", "paid_content", "watch_party_live", "vip_pass", "channel_subscription", "live_watch_party_access", "live_watch_party_seat"].includes(expected.sourceType)
    || !isCreatorMoneyPurchaseAuthorityCurrent(subject.authority)) return false;
  if (selectedActionId !== undefined && (!UUID_PATTERN.test(selectedActionId) || expected.sourceType !== "creator_tip")) return false;
  try {
    const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
    const attemptId = selectedActionId ?? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const response = await invokeCreatorMoneyPurchaseSubjectRpc<unknown>(subject, "begin_creator_money_checkout", {
      p_purchase_intent_id: intentId, p_checkout_attempt_id: attemptId,
    });
    if (response.error || !isCreatorMoneyPurchaseAuthorityCurrent(subject.authority)) return false;
    const row = response.data && typeof response.data === "object" && !Array.isArray(response.data) ? response.data as Record<string, unknown> : null;
    const quote = row?.quote && typeof row.quote === "object" && !Array.isArray(row.quote) ? row.quote as Record<string, unknown> : null;
    return !!row && validateCreatorMoneyPurchaseIntent(row, expected)?.id === intentId
      && row.startAuthorized === true && row.checkoutAttemptId === attemptId
      && typeof row.checkoutStartedAt === "string" && Number.isFinite(Date.parse(row.checkoutStartedAt))
      && quote?.amountMinor === expected.amountMinor && quote?.currency === expected.currency;
  } catch { return false; }
}

export function isCreatorDigitalCheckoutShellAvailable() {
  const runtime = getAppMonetizationRuntimeFeatures();
  const runtimeConfig = getRuntimeConfig();
  return resolveCreatorDigitalCheckoutShell({
    betaEnvironment: runtimeConfig.betaEnvironment,
    liveMoneyEnabled: runtime.liveMoneyEnabled,
    paidContentCheckoutEnabled: runtime.paidContentCheckoutEnabled,
    payoutsEnabled: runtime.payoutsEnabled,
    cashoutEnabled: runtime.cashoutEnabled,
    platform: Platform.OS,
    providerConfigured: getRevenueCatConfigurationState().shouldConfigure,
    appStorePurchasesEnabled: runtimeConfig.revenueCat.appStorePurchasesEnabled,
  });
}

export function captureCreatorMoneyPurchaseAuthority(): AccountSessionAuthorityBinding | null {
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  const userId = exactText(authority?.userId);
  if (
    !authority
    || authority.state !== "ACTIVE"
    || authority.restoreOnly
    || authority.accountId !== userId
    || !UUID_PATTERN.test(userId)
  ) return null;
  return authority;
}

export function isCreatorMoneyPurchaseAuthorityCurrent(
  expectedAuthority: AccountSessionAuthorityBinding | null | undefined,
) {
  return sameAccountSessionAuthority(
    expectedAuthority,
    getCurrentAccountSessionAuthoritySnapshot(),
  );
}

export async function prepareCreatorMoneyPurchaseSubject(
  expectedAuthority: AccountSessionAuthorityBinding | null = captureCreatorMoneyPurchaseAuthority(),
): Promise<CreatorMoneyPurchaseSubject | null> {
  if (
    !expectedAuthority
    || !isCreatorMoneyPurchaseAuthorityCurrent(expectedAuthority)
  ) return null;

  const subject = await captureAccountBoundSupabaseMutationSubject(expectedAuthority.userId).catch(() => null);
  const userId = exactText(subject?.authority.userId);
  if (
    !subject
    || !UUID_PATTERN.test(userId)
    || !sameAccountSessionAuthority(expectedAuthority, subject.authority)
  ) return null;

  const identity = await syncRevenueCatCustomerIdentity(userId);
  if (
    identity.status !== "identified"
    || identity.appUserId !== userId
    || identity.sourceUserId !== userId
    || identity.matchesSourceUser !== true
  ) return null;

  if (!await revalidateCreatorMoneyPurchaseSubject({
    userId,
    accessToken: subject.accessToken,
    authority: subject.authority,
  })) return null;

  if (!isCreatorMoneyPurchaseAuthorityCurrent(expectedAuthority)) return null;

  return { userId, accessToken: subject.accessToken, authority: subject.authority };
}

export async function revalidateCreatorMoneyPurchaseSubject(
  subject: CreatorMoneyPurchaseSubject,
): Promise<boolean> {
  try {
    const result = await invokeCreatorMoneyPurchaseSubjectRpc<unknown>(
      subject,
      "wave1_session_authority_readback",
    );
    const currentAuthority = result.error
      ? null
      : parseAccountSessionAuthorityReadback(result.data);
    return subject.userId === subject.authority.userId
      && sameAccountSessionAuthority(subject.authority, currentAuthority);
  } catch {
    return false;
  }
}

export function invokeCreatorMoneyPurchaseSubjectRpc<T>(
  subject: CreatorMoneyPurchaseSubject,
  functionName: string,
  args: Record<string, unknown> = {},
): Promise<AccountBoundSupabaseMutationResult<T>> {
  return invokeAccountBoundSupabaseMutationRpc<T>(
    { accessToken: subject.accessToken, authority: subject.authority },
    functionName,
    args,
  );
}

export function validateCreatorMoneyPurchaseIntent(
  value: unknown,
  expected: CreatorMoneyPurchaseIntentExpectation,
): { id: string; providerProductId: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = exactText(row.id);
  const amountMinor = row.amountMinor;
  if (
    !UUID_PATTERN.test(id)
    || exactText(row.userId) !== expected.userId
    || exactText(row.sourceType) !== expected.sourceType
    || exactText(row.sourceId) !== expected.sourceId
    || exactText(row.creatorId) !== expected.creatorId
    || exactText(row.provider) !== expected.provider
    || exactText(row.providerProductId) !== expected.providerProductId
    || exactText(row.environment) !== expected.environment
    || exactText(row.status) !== expected.status
    || typeof amountMinor !== "number"
    || !Number.isSafeInteger(amountMinor)
    || amountMinor !== expected.amountMinor
    || exactText(row.currency) !== expected.currency
  ) return null;
  return { id, providerProductId: expected.providerProductId };
}

// An already-owned response is bound to the immutable provider transaction
// that created the active grant, not to the creator's mutable current offer.
// Keep exact buyer/source/creator binding while allowing a legitimate purchase
// made on the other mobile store, at an older price, to suppress a duplicate
// charge after restore or device migration.
export function validateHistoricalCreatorMoneyPurchaseIntent(
  value: unknown,
  expected: HistoricalCreatorMoneyPurchaseIntentExpectation,
): { id: string; providerProductId: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = exactText(row.id);
  const provider = exactText(row.provider);
  const providerProductId = exactText(row.providerProductId);
  const environment = exactText(row.environment);
  const amountMinor = row.amountMinor;
  const currency = exactText(row.currency);
  if (
    !UUID_PATTERN.test(id)
    || exactText(row.userId) !== expected.userId
    || exactText(row.sourceType) !== expected.sourceType
    || exactText(row.sourceId) !== expected.sourceId
    || exactText(row.creatorId) !== expected.creatorId
    || (provider !== "revenuecat_app_store" && provider !== "revenuecat_google_play")
    || !providerProductId
    || providerProductId.length > 255
    || (environment !== "sandbox" && environment !== "production")
    || exactText(row.status) !== "consumed"
    || typeof amountMinor !== "number"
    || !Number.isSafeInteger(amountMinor)
    || amountMinor <= 0
    || !/^[a-z]{3}$/.test(currency)
  ) return null;
  return { id, providerProductId };
}
