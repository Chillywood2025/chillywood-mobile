export type RevenueCatObject = Record<string, unknown>;

const SAFE_ID = /^[A-Za-z0-9_.:-]{1,512}$/u;
const SAFE_CUSTOMER_ID = /^[^\u0000-\u001F\u007F]{1,1500}$/u;

const toText = (value: unknown) => String(value ?? "").trim();

export const revenueCatProductId = (subscription: RevenueCatObject) =>
  toText(subscription.product_id);

export const revenueCatOriginalCustomerId = (subscription: RevenueCatObject) => {
  const value = toText(subscription.original_customer_id);
  return SAFE_CUSTOMER_ID.test(value) ? value : "";
};

export const resolveRevenueCatStoreProductIdentifier = (
  subscription: RevenueCatObject,
  product: RevenueCatObject,
) => {
  const productId = revenueCatProductId(subscription);
  if (
    !SAFE_ID.test(productId) ||
    product.object !== "product" ||
    toText(product.id) !== productId ||
    toText(product.type) !== "subscription"
  ) return "";
  return toText(product.store_identifier);
};
