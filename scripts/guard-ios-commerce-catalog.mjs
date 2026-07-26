import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "config/ios/app-store-products.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const fail = (message) => {
  console.error(`iOS commerce catalog guard failed: ${message}`);
  process.exitCode = 1;
};

if (manifest.schemaVersion !== 1) fail("schemaVersion must be 1");
if (manifest.bundleIdentifier !== "com.chillywood.mobile") {
  fail("bundle identifier must remain com.chillywood.mobile");
}
if (manifest.liveMoneyEnabled !== false) fail("live money must remain disabled");
if (!Array.isArray(manifest.catalog) || manifest.catalog.length === 0) {
  fail("catalog must contain the reviewed finite products");
}

const ids = new Set();
const packages = new Set();
const allowedConcepts = new Set(["premium", "creator_tip", "seat_pass"]);
const allowedTypes = new Set(["auto_renewable_subscription", "consumable"]);

for (const entry of manifest.catalog ?? []) {
  if (!/^com\.chillywood\.(premium|tip|seatpass)\.[a-z0-9]+$/.test(entry.productId ?? "")) {
    fail(`invalid or dynamic product ID: ${entry.productId ?? "missing"}`);
  }
  if (ids.has(entry.productId)) fail(`duplicate product ID: ${entry.productId}`);
  ids.add(entry.productId);

  if (!allowedConcepts.has(entry.concept)) fail(`unsupported concept: ${entry.concept}`);
  if (!allowedTypes.has(entry.type)) fail(`unsupported product type: ${entry.type}`);
  if (entry.status !== "sandbox_only") fail(`${entry.productId} must remain sandbox_only`);
  if (!entry.package || packages.has(entry.package)) {
    fail(`${entry.productId} must have a unique RevenueCat package identifier`);
  }
  packages.add(entry.package);

  if (entry.concept === "premium") {
    if (entry.type !== "auto_renewable_subscription") {
      fail(`${entry.productId} Premium must be an auto-renewable subscription`);
    }
    if (entry.entitlement !== "premium" || entry.subscriptionGroup !== "chillywood_premium") {
      fail(`${entry.productId} must map to the Premium entitlement and group`);
    }
  } else {
    if (entry.type !== "consumable") fail(`${entry.productId} must be consumable`);
    if (entry.entitlement !== null) fail(`${entry.productId} must not grant an entitlement directly`);
  }

  if (/creator|user|video|event|channel|room|uuid/i.test(entry.productId.replace("com.chillywood.", ""))) {
    fail(`${entry.productId} appears to encode dynamic content identity`);
  }
}

for (const required of ["paid_video", "event_pass", "vip_access", "channel_subscription"]) {
  if (!manifest.disabledDynamicConcepts?.includes(required)) {
    fail(`${required} must remain explicitly disabled until a compliant finite mapping exists`);
  }
}

if (!process.exitCode) {
  console.log(
    `iOS commerce catalog guard passed (${manifest.catalog.length} finite products; live money disabled).`,
  );
}
