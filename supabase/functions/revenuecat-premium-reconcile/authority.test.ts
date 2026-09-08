import {
  resolveRevenueCatStoreProductIdentifier,
  revenueCatProductId,
} from "./authority.ts";

const MONTHLY_PRODUCT = "com.chillywood.premium.monthly";
const V2_PRODUCT_ID = "prod1a2b3c4d5e";

const assertEquals = (actual: unknown, expected: unknown, label: string) => {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
};

Deno.test("RevenueCat v2 subscription product_id resolves through the exact product resource", () => {
  const subscription = {
    object: "subscription",
    product: null,
    product_id: V2_PRODUCT_ID,
  };
  const product = {
    id: V2_PRODUCT_ID,
    object: "product",
    store_identifier: MONTHLY_PRODUCT,
    type: "subscription",
  };

  assertEquals(
    revenueCatProductId(subscription),
    V2_PRODUCT_ID,
    "v2 product id",
  );
  assertEquals(
    resolveRevenueCatStoreProductIdentifier(subscription, product),
    MONTHLY_PRODUCT,
    "store product identifier",
  );
});

Deno.test("RevenueCat product lookup cannot cross-bind another product resource", () => {
  assertEquals(
    resolveRevenueCatStoreProductIdentifier(
      { object: "subscription", product_id: V2_PRODUCT_ID },
      {
        id: "prod-other",
        object: "product",
        store_identifier: MONTHLY_PRODUCT,
        type: "subscription",
      },
    ),
    "",
    "mismatched product resource",
  );
});

Deno.test("RevenueCat non-subscription products cannot satisfy Premium reconciliation", () => {
  assertEquals(
    resolveRevenueCatStoreProductIdentifier(
      { object: "subscription", product_id: V2_PRODUCT_ID },
      {
        id: V2_PRODUCT_ID,
        object: "product",
        store_identifier: MONTHLY_PRODUCT,
        type: "one_time",
      },
    ),
    "",
    "non-subscription product",
  );
});
