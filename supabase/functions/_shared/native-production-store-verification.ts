// Store truth is independent of the native witness and RevenueCat observation.
// These readers NEVER acknowledge/consume/finish purchases, change identity, or
// infer amounts from a product listing. Missing fields keep the sale HELD.
export type StoreContext = {
  provider: 'app_store' | 'google_play'; applicationId: string; appleAppId?: number;
  buyerId: string; productId: string; transactionId: string; purchaseToken?: string;
  expectedGoogleAccountId?: string;
};
export type StoreFacts = {
  transactionId: string; originalTransactionId: string; productId: string;
  grossMinor: number; currency: string; quantity: 1; purchasedAt: string;
  pricing?: { protocol: 'google-orders-usd-v1'; listingMinor: number; paidTotalMinor: number;
    taxMinor: number; taxInclusive: boolean; adjustmentMinor: number; pointsPresent: boolean;
    pointsCouponMinor: number | null; allocation: 'unknown' };
};
type ObjectValue = Record<string, unknown>;
export function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid_provider_object');
  return value as ObjectValue;
}
function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw Error('store_identity_mismatch');
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw Error('store_date_required');
  return new Date(value).toISOString();
}
function positiveCents(value: bigint): number {
  if (value <= 0n || value > 999999999n) throw Error('store_amount_unqualified');
  return Number(value);
}
// The current paid-video admission protocol uses USD cents only. Other currency
// exponents require a separate qualified contract, never rounding a payment.
export function googleMoneyCents(value: unknown): number {
  const money = object(value);
  equal(money.currencyCode, 'USD');
  const units = money.units ?? '0';
  if (typeof units !== 'string' || !/^(0|[1-9][0-9]{0,8})$/.test(units)
    || !Number.isInteger(money.nanos ?? 0) || Number(money.nanos ?? 0) < 0
    || Number(money.nanos ?? 0) >= 1e9 || Number(money.nanos ?? 0) % 10000000 !== 0)
    throw Error('store_amount_unqualified');
  const cents = BigInt(units) * 100n + BigInt(Number(money.nanos ?? 0) / 10000000);
  if (cents > 999999999n) throw Error('store_amount_unqualified');
  return Number(cents);
}
export function appleTransactionFacts(decoded: unknown, context: StoreContext): StoreFacts {
  const tx = object(decoded);
  equal(context.provider, 'app_store'); equal(tx.environment, 'Production');
  equal(tx.bundleId, context.applicationId); equal(tx.transactionId, context.transactionId);
  equal(tx.productId, context.productId); equal(tx.quantity, 1); equal(tx.currency, 'USD');
  equal(tx.inAppOwnershipType, 'PURCHASED');
  // Stable buyer identity, never an appUserID changed for one purchase.
  if (typeof tx.appAccountToken !== 'string' || tx.appAccountToken.toLowerCase() !== context.buyerId.toLowerCase()
    || tx.revocationDate !== undefined || tx.revocationReason !== undefined || tx.isUpgraded === true
    || !['Consumable', 'Non-Consumable'].includes(String(tx.type))) throw Error('store_purchase_held');
  if (!Number.isSafeInteger(tx.price) || Number(tx.price) <= 0 || Number(tx.price) % 10 !== 0
    || !Number.isSafeInteger(tx.purchaseDate) || Number(tx.purchaseDate) <= 0
    || typeof tx.originalTransactionId !== 'string' || !tx.originalTransactionId)
    throw Error('store_purchase_held');
  return { transactionId: context.transactionId, originalTransactionId: tx.originalTransactionId,
    productId: context.productId, grossMinor: positiveCents(BigInt(Number(tx.price) / 10)),
    currency: 'USD', quantity: 1, purchasedAt: new Date(Number(tx.purchaseDate)).toISOString() };
}
export function googleTransactionFacts(purchaseValue: unknown, orderValue: unknown, context: StoreContext): StoreFacts {
  const purchase = object(purchaseValue), order = object(orderValue);
  equal(context.provider, 'google_play');
  if (!context.purchaseToken || !context.expectedGoogleAccountId) throw Error('store_identity_unqualified');
  equal(purchase.orderId, context.transactionId); equal(order.orderId, context.transactionId);
  equal(order.purchaseToken, context.purchaseToken); equal(order.state, 'PROCESSED');
  equal(object(purchase.purchaseStateContext).purchaseState, 'PURCHASED');
  equal(purchase.obfuscatedExternalAccountId, context.expectedGoogleAccountId);
  if (purchase.testPurchaseContext !== undefined || !Array.isArray(purchase.productLineItem)
    || purchase.productLineItem.length !== 1 || !Array.isArray(order.lineItems) || order.lineItems.length !== 1)
    throw Error('store_purchase_held');
  const item = object(purchase.productLineItem[0]), line = object(order.lineItems[0]);
  equal(item.productId, context.productId); equal(line.productId, context.productId);
  const details = object(item.productOfferDetails);
  equal(details.quantity, 1); equal(details.refundableQuantity, 1);
  equal(object(line.oneTimePurchaseDetails).quantity, 1);
  const history = object(order.orderHistory);
  if (history.cancellationEvent || history.refundEvent || (history.partialRefundEvents !== undefined
    && (!Array.isArray(history.partialRefundEvents) || history.partialRefundEvents.length > 0)))
    throw Error('store_refund_held');
  const grossMinor = googleMoneyCents(order.total);
  equal(googleMoneyCents(line.total), grossMinor);
  const listingMinor = googleMoneyCents(line.listingPrice), taxMinor = googleMoneyCents(order.tax);
  equal(googleMoneyCents(line.tax), taxMinor);
  const taxInclusive = object(order.orderDetails ?? {}).taxInclusive ?? false;
  if (typeof taxInclusive !== 'boolean' || listingMinor <= 0 || taxMinor > grossMinor)
    throw Error('store_pricing_invalid');
  // The difference is an adjustment, not guessed fees, subsidy or proceeds.
  // Authenticated Store totals never replace the original listing quote.
  const adjustmentMinor = listingMinor + (taxInclusive ? 0 : taxMinor) - grossMinor;
  if (adjustmentMinor < 0 || adjustmentMinor > 999999999) throw Error('store_pricing_invalid');
  let pointsCouponMinor: number | null = null;
  if (order.pointsDetails !== undefined) {
    const points = object(order.pointsDetails);
    if (points.pointsCouponValue !== undefined) pointsCouponMinor = googleMoneyCents(points.pointsCouponValue);
    for (const field of ['pointsSpent','pointsDiscountRateMicros']) if (points[field] !== undefined
      && (typeof points[field] !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(String(points[field]))))
      throw Error('store_points_invalid');
    if (points.pointsDiscountRateMicros !== undefined && BigInt(String(points.pointsDiscountRateMicros)) > 1000000n)
      throw Error('store_points_invalid');
  }
  // A one-time Play purchase's original chain is the exact order, not a SKU.
  return { transactionId: context.transactionId, originalTransactionId: context.transactionId,
    productId: context.productId, grossMinor, currency: 'USD', quantity: 1,
    purchasedAt: date(purchase.purchaseCompletionTime), pricing: { protocol: 'google-orders-usd-v1',
      listingMinor, paidTotalMinor: grossMinor, taxMinor, taxInclusive, adjustmentMinor,
      pointsPresent: order.pointsDetails !== undefined, pointsCouponMinor, allocation: 'unknown' } };
}
async function boundedProviderJson(response: Response, error: string): Promise<unknown> {
  const limit = 65536;
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > limit)) {
    await response.body?.cancel();
    throw Error(error);
  }
  if (!response.body) throw Error('provider_response_empty');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw Error(error); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export async function readGooglePurchase(context: StoreContext, accessToken: string, signal: AbortSignal,
  fetcher: typeof fetch = fetch): Promise<StoreFacts> {
  if (context.provider !== 'google_play' || !context.purchaseToken || !accessToken) throw Error('store_reader_unqualified');
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(context.applicationId)}`;
  const read = async (path: string) => {
    const response = await fetcher(`${base}/${path}`, { headers: { Authorization: `Bearer ${accessToken}` },
      redirect: 'error', cache: 'no-store', signal });
    if (!response.ok) throw Error('store_reader_unavailable');
    return boundedProviderJson(response, 'store_response_too_large');
  };
  const purchase = await read(`purchases/productsv2/tokens/${encodeURIComponent(context.purchaseToken)}`);
  // Do not follow a response-controlled order ID or URL.
  equal(object(purchase).orderId, context.transactionId);
  const order = await read(`orders/${encodeURIComponent(context.transactionId)}`);
  return googleTransactionFacts(purchase, order, context);
}

export type IntegrityPolicy = { applicationId: string; nativeBuild: string; certificateSha256: string;
  requestHash: string; earliestMs: number; latestMs: number };
export function verifyGoogleIntegrityVerdict(value: unknown, policy: IntegrityPolicy): void {
  const payload = object(object(value).tokenPayloadExternal), request = object(payload.requestDetails);
  const app = object(payload.appIntegrity), device = object(payload.deviceIntegrity), account = object(payload.accountDetails);
  equal(request.requestPackageName, policy.applicationId); equal(request.requestHash, policy.requestHash);
  if (typeof request.timestampMillis !== 'string' || !/^[0-9]{13}$/.test(request.timestampMillis)
    || Number(request.timestampMillis) < policy.earliestMs || Number(request.timestampMillis) > policy.latestMs)
    throw Error('integrity_time_invalid');
  equal(app.appRecognitionVerdict, 'PLAY_RECOGNIZED'); equal(app.packageName, policy.applicationId);
  equal(app.versionCode, policy.nativeBuild); equal(account.appLicensingVerdict, 'LICENSED');
  if (!Array.isArray(app.certificateSha256Digest) || app.certificateSha256Digest.length !== 1
    || app.certificateSha256Digest[0] !== policy.certificateSha256
    || !Array.isArray(device.deviceRecognitionVerdict)
    || !device.deviceRecognitionVerdict.includes('MEETS_DEVICE_INTEGRITY')
    || !device.deviceRecognitionVerdict.includes('MEETS_STRONG_INTEGRITY')) throw Error('integrity_policy_failed');
}
export async function decodeGoogleIntegrity(token: string, policy: IntegrityPolicy, accessToken: string,
  signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<void> {
  if (!token || token.length > 32768 || !accessToken) throw Error('integrity_unqualified');
  const response = await fetcher(`https://playintegrity.googleapis.com/v1/${encodeURIComponent(policy.applicationId)}:decodeIntegrityToken`,
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrity_token: token }), redirect: 'error', cache: 'no-store', signal });
  if (!response.ok) throw Error('integrity_unavailable');
  verifyGoogleIntegrityVerdict(await boundedProviderJson(response, 'integrity_response_too_large'), policy);
}
