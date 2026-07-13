#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];

const requireText = (label, source, needle) => {
  if (!source.includes(needle)) failures.push(`${label} missing: ${needle}`);
};
const forbidText = (label, source, needle) => {
  if (source.includes(needle)) failures.push(`${label} must not include: ${needle}`);
};

const setupRoute = read("app/creator-monetization-setup.tsx");
const studioRoute = read("app/channel-studio/index.tsx");
const channelSettings = read("app/channel-settings.tsx");
const routeGuard = read("scripts/guard-route-contracts.mjs");
const moneyGuard = read("scripts/guard-money-center-policy.mjs");

requireText("creator setup route", setupRoute, "Redirect");
requireText("creator setup route", setupRoute, "/channel-studio?tab=monetization&focus=offers");
requireText("channel studio route", studioRoute, "ChannelStudioScreen");
requireText("channel studio implementation", channelSettings, "Platform Studio");
requireText("channel studio implementation", channelSettings, "Premium required");
requireText("channel studio implementation", channelSettings, "Manage Premium");
requireText("route contracts", routeGuard, "Platform Studio preferred route registration");
requireText("route contracts", routeGuard, "Premium target remains separate");
requireText("money center guard", moneyGuard, "creator setup compatibility redirect");
requireText("money center guard", moneyGuard, "Premium is separate from creator purchases.");

[
  "createPaymentLink",
  "checkout.session.create",
  "transferCreated: true",
  "payoutCreated: true",
  "manualPremiumGrant",
].forEach((needle) => forbidText("creator setup route", setupRoute, needle));

if (failures.length) {
  console.error("proof:creator-monetization-setup-compatibility failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("proof:creator-monetization-setup-compatibility passed");
console.log("- /creator-monetization-setup remains a compatibility redirect into Platform Studio Money Center offers.");
console.log("- Premium remains separate from creator purchases, payouts, and provider mutation.");
