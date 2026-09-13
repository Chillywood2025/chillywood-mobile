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
