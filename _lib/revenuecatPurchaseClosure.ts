export type RevenueCatPurchaseValidationOptions = {
  expectedProductIdentifier: string;
  isCustomerInfo: (value: unknown) => boolean;
};

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): value is UnknownRecord => (
  !!value && typeof value === "object" && !Array.isArray(value)
);
const exactText = (value: unknown) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return typeof value === "string" && value === normalized ? normalized : "";
};
const nullableExactText = (value: unknown) => value === null || !!exactText(value);
const isoTimestamp = (value: unknown) => {
  const normalized = exactText(value);
  return !!normalized
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)
    && Number.isFinite(Date.parse(normalized));
};

/**
 * Validates only the provider facts that the native RevenueCat bridge can
 * actually guarantee. Google Play may complete a purchase before assigning an
 * order id, so Android's purchase token is an equally valid transaction
 * correlation signal. Durable access and money authority still come only from
 * the verified webhook projection.
 */
export function isRevenueCatPurchaseResultForProduct(
  value: unknown,
  options: RevenueCatPurchaseValidationOptions,
) {
  if (!record(value) || !options.isCustomerInfo(value.customerInfo) || !record(value.transaction)) return false;
  const expectedProductIdentifier = exactText(options.expectedProductIdentifier);
  const productIdentifier = exactText(value.productIdentifier);
  const transactionProductIdentifier = exactText(value.transaction.productIdentifier);
  const transactionIdentifier = value.transaction.transactionIdentifier;
  const purchaseToken = value.transaction.purchaseToken;
  const hasTransactionCorrelation = !!exactText(transactionIdentifier) || !!exactText(purchaseToken);
  return !!expectedProductIdentifier
    && productIdentifier === expectedProductIdentifier
    && transactionProductIdentifier === expectedProductIdentifier
    && nullableExactText(transactionIdentifier)
    && nullableExactText(purchaseToken)
    && hasTransactionCorrelation
    && isoTimestamp(value.transaction.purchaseDate);
}

export function isRevenueCatUserCancellation(error: unknown) {
  if (!record(error)) return false;
  if (error.userCancelled === true) return true;
  const combined = [error.code, error.codeName, error.message, error.underlyingErrorMessage]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .join(" ");
  return combined.includes("cancel");
}

/**
 * RevenueCat uses code 6 when the store reports that the selected product is
 * already owned. This is not purchase success and must never grant access by
 * itself, but it is a precise signal to run the provider restore/reconciliation
 * path instead of asking the customer to buy the same subscription again.
 */
export function isRevenueCatExistingPurchase(error: unknown) {
  if (!record(error)) return false;
  const userInfo = record(error.userInfo) ? error.userInfo : {};
  const code = exactText(String(error.code ?? ""));
  const readableCodes = [
    error.codeName,
    error.readableErrorCode,
    userInfo.readableErrorCode,
  ].map((value) => String(value ?? "").trim().toUpperCase());
  if (code === "6" || readableCodes.includes("PRODUCT_ALREADY_PURCHASED_ERROR")) return true;

  const message = [error.message, error.underlyingErrorMessage]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .join(" ");
  return /\balready (?:purchased|subscribed)\b/u.test(message);
}

export type CreatorDigitalCheckoutShellInput = {
  betaEnvironment: "closed-beta" | "public-v1";
  liveMoneyEnabled: boolean;
  paidContentCheckoutEnabled: boolean;
  payoutsEnabled: boolean;
  cashoutEnabled: boolean;
  platform: string;
  providerConfigured: boolean;
  appStorePurchasesEnabled: boolean;
};

/**
 * This controls only whether a customer-facing checkout shell may open. Exact
 * account, product, offer, target, price, environment, receipt and grant
 * authority remain server/provider verified inside each purchase helper.
 */
export function isCreatorDigitalCheckoutShellAvailable(
  input: CreatorDigitalCheckoutShellInput,
) {
  if (input.platform !== "ios" && input.platform !== "android") return false;
  if (!input.providerConfigured) return false;
  if (input.platform === "ios" && !input.appStorePurchasesEnabled) return false;

  const productionCheckout = input.liveMoneyEnabled && input.paidContentCheckoutEnabled;
  const closedBetaSandboxCheckout = input.betaEnvironment === "closed-beta"
    && !input.liveMoneyEnabled
    && !input.payoutsEnabled
    && !input.cashoutEnabled;
  return productionCheckout || closedBetaSandboxCheckout;
}

export type ExistingPurchaseReconciliation<TCustomerInfo, TVerifiedAuthority> =
  | { status: "verified"; customerInfo: TCustomerInfo; authority: TVerifiedAuthority }
  | { status: "provider_restored"; customerInfo: TCustomerInfo; authority: null }
  | { status: "authority_changed"; customerInfo: TCustomerInfo | null; authority: null }
  | { status: "restore_failed"; customerInfo: null; authority: null };

/**
 * Reconciles an already-owned store subscription without substituting provider
 * state for app authority. Account/session continuity is checked around the
 * restore, and success requires the caller's exact backend authority poll.
 */
export async function reconcileRevenueCatExistingPurchase<TCustomerInfo, TVerifiedAuthority>(options: {
  restore: () => Promise<TCustomerInfo>;
  authorityCurrent: () => Promise<boolean>;
  waitForAuthority: () => Promise<TVerifiedAuthority | null>;
}): Promise<ExistingPurchaseReconciliation<TCustomerInfo, TVerifiedAuthority>> {
  if (!await options.authorityCurrent()) {
    return { status: "authority_changed", customerInfo: null, authority: null };
  }
  let customerInfo: TCustomerInfo;
  try {
    customerInfo = await options.restore();
  } catch {
    return { status: "restore_failed", customerInfo: null, authority: null };
  }
  if (!await options.authorityCurrent()) {
    return { status: "authority_changed", customerInfo, authority: null };
  }
  const authority = await options.waitForAuthority();
  if (!await options.authorityCurrent()) {
    return { status: "authority_changed", customerInfo, authority: null };
  }
  return authority
    ? { status: "verified", customerInfo, authority }
    : { status: "provider_restored", customerInfo, authority: null };
}

export type ProviderAuthorityPollOptions<T> = {
  attempts: number;
  delayMs: number;
  read: () => Promise<T>;
  accepts: (value: T) => boolean;
  authorityCurrent: () => Promise<boolean>;
  wait?: (delayMs: number) => Promise<void>;
};

const defaultWait = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

/** Bounded, generation-aware polling for asynchronous provider projections. */
export async function pollProviderAuthority<T>(options: ProviderAuthorityPollOptions<T>): Promise<T | null> {
  const attempts = Math.max(1, Math.trunc(options.attempts));
  const wait = options.wait ?? defaultWait;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!await options.authorityCurrent()) return null;
    const value = await options.read();
    if (!await options.authorityCurrent()) return null;
    if (options.accepts(value)) return value;
    if (attempt + 1 < attempts) await wait(Math.max(0, Math.trunc(options.delayMs)));
  }
  return null;
}
