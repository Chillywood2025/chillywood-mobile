#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const notes = [];

const read = (relativePath) => {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
};

const requireText = (label, content, needle) => {
  if (!content.includes(needle)) failures.push(`${label} missing required text: ${needle}`);
};

const delivery = read("docs/release/TESTER_BUILD_CURRENT_RUNTIME_DELIVERY.md");
const finalPacket = read("docs/release/FINAL_STORE_RELEASE_READINESS_PLAY_SUBMISSION_PACKET.md");
const goNoGo = read("docs/FINAL_PUBLIC_USE_GO_NO_GO.md");
const checklist = read("docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md");
const appJson = read("app.json");
const packageJson = read("package.json");
const otaGenerationText = read("config/release/production-ota-generation.json");
let otaGeneration = {};
try {
  otaGeneration = JSON.parse(otaGenerationText || "{}");
} catch {
  failures.push("production OTA generation contract is malformed JSON");
}

[
  "Tester build / current runtime delivery: Closed / Partial / Blocked",
  "Delivery Decision",
  "EAS Update was enough",
  "Update / Build Metadata",
  "Update group",
  "4a21c89b-35ca-4997-8c62-28bb20f90469",
  "Package ID",
  "com.chillywood.mobile",
  "App version",
  "Android versionCode",
  "Runtime version",
  "Installed Device Smoke",
  "Update uptake is Partial",
  "Tester Instructions",
  "Known Disabled Systems",
  "Rollback Instructions",
  "This lane did not submit the app to production",
  "This lane did not mutate Google Play, RevenueCat, Stripe, payouts, purchases, refunds, or provider dashboards",
  "Premium public purchase remains OFF",
  "live_money_enabled remains OFF",
  "Creator-money remains OFF",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "Provider refunds remain manual/external",
].forEach((needle) => requireText("tester delivery doc", delivery, needle));

[
  "docs/release/TESTER_BUILD_CURRENT_RUNTIME_DELIVERY.md",
].forEach((needle) => {
  requireText("final release packet", finalPacket, needle);
  requireText("go/no-go", goNoGo, needle);
  requireText("final readiness checklist", checklist, needle);
});

const expectedIosRuntime = String(otaGeneration.iosRuntimeVersion ?? "").trim();
[
  "\"package\": \"com.chillywood.mobile\"",
  "\"version\": \"1.0.0\"",
  ...(expectedIosRuntime ? [`\"runtimeVersion\": \"${expectedIosRuntime}\"`] : []),
  "\"versionCode\": 55",
].forEach((needle) => requireText("app.json", appJson, needle));
if (!expectedIosRuntime) failures.push("production OTA generation contract is missing iosRuntimeVersion");
if (String(otaGeneration.channel ?? "").trim() === String(otaGeneration.supersedes?.channel ?? "").trim()) {
  failures.push("production OTA generation must not reuse the superseded channel");
}

[
  "proof:tester-build-current-runtime-delivery",
  "guard:tester-build-current-runtime-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

notes.push("Tester delivery doc records EAS Update decision, runtime/package/version metadata, update group, installed-device smoke, tester instructions, rollback, and disabled money systems.");
notes.push("Installed-device uptake is honestly marked Partial because the historical update group was published but not observed applied during the smoke window.");
notes.push(`Current source now requires isolated production OTA generation ${String(otaGeneration.generation ?? "unknown")} rather than reusing the historical production channel/runtime.`);
notes.push("Final packet, go/no-go, and final readiness checklist reference the tester delivery doc.");

if (failures.length) {
  console.error("Tester build/current runtime delivery proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Tester build/current runtime delivery proof passed.");
notes.forEach((note) => console.log(`- ${note}`));
