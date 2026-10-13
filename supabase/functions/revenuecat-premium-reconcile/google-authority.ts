import {
  resolveRevenueCatStoreProductIdentifier,
  type RevenueCatObject,
} from "./authority.ts";

const safeId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_.:-]{1,512}$/u.test(value);
const millis = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/** Only provider-read, same-owner Google sandbox subscriptions qualify. */
export const eligibleGooglePremiumSubscription = (
  subscription: RevenueCatObject,
  userId: string,
  now: number,
) => {
  const entitlements = subscription.entitlements as RevenueCatObject | null;
  return subscription.object === "subscription" &&
    safeId(subscription.id) &&
    subscription.customer_id === userId &&
    subscription.original_customer_id === userId &&
    subscription.environment === "sandbox" &&
    subscription.store === "play_store" &&
    subscription.ownership === "purchased" &&
    subscription.gives_access === true &&
    subscription.pending_payment === false &&
    ["active", "trialing", "in_grace_period"].includes(
      String(subscription.status),
    ) &&
    millis(subscription.starts_at) &&
    millis(subscription.current_period_starts_at) &&
    subscription.starts_at <= subscription.current_period_starts_at &&
    subscription.current_period_starts_at <= now &&
    millis(subscription.current_period_ends_at) &&
    subscription.current_period_ends_at > now &&
    subscription.current_period_ends_at >
      subscription.current_period_starts_at &&
    entitlements?.object === "list" &&
    (entitlements.next_page == null || entitlements.next_page === "") &&
    Array.isArray(entitlements.items) &&
    entitlements.items.some((item) =>
      item?.lookup_key === "premium" && item?.state === "active"
    );
};

/** Bind a complete provider transaction history to both ends of this period. */
export const googlePremiumSnapshot = (
  subscription: RevenueCatObject,
  product: RevenueCatObject,
  transactions: RevenueCatObject[],
  userId: string,
  now: number,
) => {
  if (!eligibleGooglePremiumSubscription(subscription, userId, now)) {
    throw new Error("google_premium_subscription_invalid");
  }
  const storeProduct = resolveRevenueCatStoreProductIdentifier(
    subscription,
    product,
  );
  const parts = storeProduct.split(":");
  if (
    parts.length !== 2 || parts[0] !== "premium_subscription" ||
    !/^[a-z0-9][a-z0-9-]{0,62}$/u.test(parts[1])
  ) {
    throw new Error("google_premium_product_invalid");
  }
  if (
    !transactions.length || transactions.some((transaction) => (
      transaction.object !== "subscription_transaction" ||
      !safeId(transaction.id) ||
      !millis(transaction.purchased_at) || transaction.purchased_at > now ||
      transaction.purchased_at < Number(subscription.starts_at)
    ))
  ) throw new Error("google_premium_transactions_invalid");
  const ids = new Set(transactions.map((transaction) => transaction.id));
  if (ids.size !== transactions.length) {
    throw new Error("google_premium_transactions_ambiguous");
  }
  const sorted = [...transactions].sort((a, b) =>
    Number(a.purchased_at) - Number(b.purchased_at)
  );
  const original = sorted[0];
  const current = sorted[sorted.length - 1];
  if (
    original.purchased_at !== subscription.starts_at ||
    current.id !== subscription.store_subscription_identifier ||
    current.purchased_at !== subscription.current_period_starts_at ||
    ![parts[0], storeProduct].includes(
      String(current.product_store_identifier),
    ) ||
    (sorted.length > 1 && sorted[1].purchased_at === original.purchased_at) ||
    (sorted.length > 1 &&
      sorted[sorted.length - 2].purchased_at === current.purchased_at)
  ) {
    throw new Error("google_premium_transaction_binding_invalid");
  }
  return {
    customerId: userId,
    environment: "sandbox",
    entitlement: "premium",
    expiresAt: Number(subscription.current_period_ends_at),
    givesAccess: true,
    originalCustomerId: userId,
    originalTransactionId: String(original.id),
    ownership: "purchased",
    productIdentifier: parts[0],
    basePlanId: parts[1],
    startsAt: Number(subscription.current_period_starts_at),
    status: String(subscription.status),
    store: "play_store",
    subscriptionId: String(subscription.id),
  };
};
