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

const doc = read("docs/release/ANDROID_TESTER_BINARY_BUILD_INSTALL_SMOKE.md");
const testerUpdate = read("docs/release/TESTER_BUILD_CURRENT_RUNTIME_DELIVERY.md");
const finalPacket = read("docs/release/FINAL_STORE_RELEASE_READINESS_PLAY_SUBMISSION_PACKET.md");
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");
const roadmap = read("ROADMAP.md");
const goNoGo = read("docs/FINAL_PUBLIC_USE_GO_NO_GO.md");
const checklist = read("docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md");
const packageJson = read("package.json");

[
  "Android tester binary build / install smoke: Closed / Partial / Blocked",
  "A fresh Android tester binary was chosen because EAS Update group",
  "4a21c89b-35ca-4997-8c62-28bb20f90469",
  "Package ID",
  "com.chillywood.mobile",
  "Git commit",
  "de3f9eb69798cebb5fab7fe0f34ce00fc0a10d8c",
  "Build profile",
  "production-apk",
  "Build ID",
  "9e31b4b1-bd02-405c-8eeb-7aae3550d598",
  "Play Internal / Closed Testing AAB Metadata",
  "d7cec74d-95f5-4cf5-be0e-eb53571efc18",
  "a71b8a9b8e35a284e62b7843df5c7f16ba94c54487ca63bcf67aba04598c9efa",
  "Local artifact path",
  "Version name",
  "Version code",
  "Runtime version",
  "Install result is Partial",
  "INSTALL_FAILED_UPDATE_INCOMPATIBLE",
  "no use attached device",
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
].forEach((needle) => requireText("android tester binary doc", doc, needle));

[
  "docs/release/ANDROID_TESTER_BINARY_BUILD_INSTALL_SMOKE.md",
].forEach((needle) => {
  requireText("tester update doc", testerUpdate, needle);
  requireText("final release packet", finalPacket, needle);
  requireText("current state", currentState, needle);
  requireText("next task", nextTask, needle);
  requireText("roadmap", roadmap, needle);
  requireText("go/no-go", goNoGo, needle);
  requireText("final readiness checklist", checklist, needle);
});

[
  "proof:android-tester-binary-build-install-smoke",
  "guard:android-tester-binary-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

notes.push("Android tester binary doc records build reason, EAS build metadata, package/version/runtime, install status, tester instructions, rollback, and disabled money systems.");
notes.push("Install smoke is honestly Partial because attached-device update-over-install failed with signature mismatch and no uninstall was performed.");
notes.push("Related release/current-state docs reference the tester binary build/install smoke doc.");

if (failures.length) {
  console.error("Android tester binary build/install smoke proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Android tester binary build/install smoke proof passed.");
notes.forEach((note) => console.log(`- ${note}`));
