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
