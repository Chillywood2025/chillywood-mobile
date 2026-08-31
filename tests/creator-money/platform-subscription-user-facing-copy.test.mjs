import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { normalizePlatformSubscriptionNotificationCopy } from "../../_lib/userFacingProductCopy.ts";

test("legacy Platform Subscription notification rows use current product terminology", () => {
  assert.equal(
    normalizePlatformSubscriptionNotificationCopy("Channel Subscription started.", "channel_subscription_started"),
    "Platform Subscription started.",
  );
  assert.equal(
    normalizePlatformSubscriptionNotificationCopy(
      "Sandbox proof record: a viewer started a channel subscription.",
      "channel_subscription_started",
    ),
    "Sandbox proof record: a viewer started a Platform Subscription.",
  );
});

test("unrelated notification copy is not rewritten", () => {
  assert.equal(
    normalizePlatformSubscriptionNotificationCopy("Channel Subscription started.", "system_notice"),
    "Channel Subscription started.",
  );
  assert.equal(normalizePlatformSubscriptionNotificationCopy("", "channel_subscription_started"), "");
});

test("iOS subscription metadata uses Platform Subscription terminology and current scope", () => {
  const catalog = JSON.parse(fs.readFileSync("config/ios/app-store-products.json", "utf8"));
  const storeKit = fs.readFileSync("config/ios/Chillywood.storekit", "utf8");
  const products = catalog.catalog.filter((item) => item.concept === "channel_subscription");

  assert.equal(products.length, 8);
  for (const product of products) {
    assert.match(product.displayName, /^Platform Subscription/u);
    assert.match(product.referenceName, /Platform Subscription/u);
    assert.match(product.description, /ordinary Paid Videos included while active/u);
    assert.match(product.description, /VIP and Premium not included/u);
  }
  assert.doesNotMatch(storeKit, /Channel Subscription/u);
  assert.match(storeKit, /Platform Subscription/u);
});
