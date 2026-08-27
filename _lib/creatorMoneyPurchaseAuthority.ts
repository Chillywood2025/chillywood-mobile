import {
  readCurrentAccountSessionAuthority,
  sameAccountSessionAuthority,
  type AccountSessionAuthorityBinding,
} from "./accountSessionAuthority";
import { syncRevenueCatCustomerIdentity } from "./revenuecat";
import { supabase } from "./supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type CreatorMoneyPurchaseSubject = {
  userId: string;
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

const readAuthenticatedUserId = async () => {
  try {
    const { data, error } = await supabase.auth.getUser();
    const userId = exactText(data.user?.id);
    return !error && UUID_PATTERN.test(userId) ? userId : null;
  } catch {
    return null;
  }
};

export async function prepareCreatorMoneyPurchaseSubject(): Promise<CreatorMoneyPurchaseSubject | null> {
  const userId = await readAuthenticatedUserId();
  const beforeAuthority = await readCurrentAccountSessionAuthority();
  if (!userId || !beforeAuthority || beforeAuthority.restoreOnly || beforeAuthority.userId !== userId) return null;

  const identity = await syncRevenueCatCustomerIdentity(userId);
  if (
    identity.status !== "identified"
    || identity.appUserId !== userId
    || identity.sourceUserId !== userId
    || identity.matchesSourceUser !== true
  ) return null;

  const stableUserId = await readAuthenticatedUserId();
  const stableAuthority = await readCurrentAccountSessionAuthority();
  if (
    stableUserId !== userId
    || !stableAuthority
    || stableAuthority.restoreOnly
    || stableAuthority.userId !== userId
    || !sameAccountSessionAuthority(beforeAuthority, stableAuthority)
  ) return null;

  return { userId, authority: stableAuthority };
}

export async function revalidateCreatorMoneyPurchaseSubject(
  subject: CreatorMoneyPurchaseSubject,
): Promise<boolean> {
  const currentUserId = await readAuthenticatedUserId();
  const currentAuthority = await readCurrentAccountSessionAuthority();
  return currentUserId === subject.userId
    && !!currentAuthority
    && !currentAuthority.restoreOnly
    && currentAuthority.userId === subject.userId
    && sameAccountSessionAuthority(subject.authority, currentAuthority);
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
