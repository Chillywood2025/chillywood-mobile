import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "config/ios/app-store-products.json");
const storeKitPath = path.join(root, "config/ios/Chillywood.storekit");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const storeKit = JSON.parse(fs.readFileSync(storeKitPath, "utf8"));

const fail = (message) => {
  console.error(`iOS commerce catalog guard failed: ${message}`);
  process.exitCode = 1;
};

if (manifest.schemaVersion !== 1) fail("schemaVersion must be 1");
if (manifest.bundleIdentifier !== "com.chillywood.mobile") fail("bundle identifier must remain com.chillywood.mobile");
if (manifest.liveMoneyEnabled !== false) fail("live money must remain disabled");
if (!Array.isArray(manifest.catalog) || manifest.catalog.length !== 30) fail("catalog must contain exactly 30 finite products");
if (Array.isArray(manifest.disabledDynamicConcepts) && manifest.disabledDynamicConcepts.length > 0) {
  fail("finite creator-money concepts must not remain marked dynamically disabled");
}

const allowedConcepts = new Set([
  "premium",
  "creator_tip",
  "seat_pass",
  "paid_video",
  "event_pass",
  "vip_pass",
  "channel_subscription",
]);
const allowedTypes = new Set(["auto_renewable_subscription", "consumable"]);
const ids = new Set();
const packages = new Set();
const groups = new Set();
const conceptCounts = new Map();

for (const entry of manifest.catalog) {
  if (!/^com\.chillywood\.[a-z0-9.]+$/.test(entry.productId ?? "")) fail(`invalid product ID: ${entry.productId ?? "missing"}`);
  if (ids.has(entry.productId)) fail(`duplicate product ID: ${entry.productId}`);
  ids.add(entry.productId);
  if (!allowedConcepts.has(entry.concept)) fail(`unsupported concept: ${entry.concept}`);
  if (!allowedTypes.has(entry.type)) fail(`unsupported product type: ${entry.type}`);
  if (entry.status !== "sandbox_only") fail(`${entry.productId} must remain sandbox_only`);
  if (!entry.package || packages.has(entry.package)) fail(`${entry.productId} must have a unique RevenueCat package identifier`);
  packages.add(entry.package);
  conceptCounts.set(entry.concept, (conceptCounts.get(entry.concept) ?? 0) + 1);

  if (entry.concept === "premium") {
    if (entry.type !== "auto_renewable_subscription") fail(`${entry.productId} Premium must be recurring`);
    if (entry.entitlement !== "premium" || entry.subscriptionGroup !== "chillywood_premium") fail(`${entry.productId} Premium mapping drifted`);
  } else if (entry.concept === "channel_subscription") {
    if (entry.type !== "auto_renewable_subscription") fail(`${entry.productId} channel subscription must be recurring`);
    if (!entry.subscriptionGroup || entry.entitlement !== null) fail(`${entry.productId} channel subscription group/entitlement drifted`);
    if (groups.has(entry.subscriptionGroup)) fail(`${entry.productId} must use an independent subscription group`);
    groups.add(entry.subscriptionGroup);
  } else {
    if (entry.type !== "consumable") fail(`${entry.productId} must be consumable`);
    if (entry.entitlement !== null) fail(`${entry.productId} must not grant a direct entitlement`);
  }

  const dynamicSuffix = entry.productId.replace(/^com\.chillywood\./, "");
  if (/[0-9a-f]{8}-[0-9a-f-]{27,}/i.test(dynamicSuffix)) fail(`${entry.productId} appears to encode runtime identity`);
}

const expectedCounts = {
  premium: 2,
  creator_tip: 4,
  seat_pass: 4,
  paid_video: 4,
  event_pass: 4,
  vip_pass: 4,
  channel_subscription: 8,
};
for (const [concept, count] of Object.entries(expectedCounts)) {
  if ((conceptCounts.get(concept) ?? 0) !== count) fail(`${concept} must have ${count} finite products`);
}

const storeKitEntries = [
  ...(storeKit.products ?? []),
  ...(storeKit.subscriptionGroups ?? []).flatMap((group) => group.subscriptions ?? []),
];
const storeKitIds = storeKitEntries.map((entry) => entry.productID).sort();
const manifestIds = [...ids].sort();
if (JSON.stringify(storeKitIds) !== JSON.stringify(manifestIds)) fail("StoreKit IDs must exactly match the canonical manifest");

const channelGroups = (storeKit.subscriptionGroups ?? []).filter((group) =>
  (group.subscriptions ?? []).some((entry) => String(entry.productID ?? "").startsWith("com.chillywood.channel.subscription.slot")),
);
if (channelGroups.length !== 8) fail("StoreKit must contain eight independent channel subscription groups");
if ((storeKit.subscriptionGroups ?? []).length !== 9) fail("StoreKit must contain Premium plus eight creator subscription groups");

const finitePrices = new Set(["0.99", "2.99", "4.99", "9.99"]);
for (const entry of manifest.catalog.filter((item) => ["creator_tip", "seat_pass", "paid_video", "event_pass", "vip_pass"].includes(item.concept))) {
  if (!finitePrices.has(String(entry.referencePrice))) fail(`${entry.productId} must use a reviewed finite price tier`);
}
for (const entry of manifest.catalog.filter((item) => item.concept === "channel_subscription")) {
  if (String(entry.referencePrice) !== "4.99" || entry.duration !== "P1M") fail(`${entry.productId} must remain $4.99 monthly`);
}

if (!process.exitCode) console.log(`iOS commerce catalog guard passed (${manifest.catalog.length} finite products; live money disabled).`);
