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

const doc = read("docs/release/PLAY_INTERNAL_TEST_AAB_UPLOAD_TESTER_SMOKE.md");
const binaryDoc = read("docs/release/ANDROID_TESTER_BINARY_BUILD_INSTALL_SMOKE.md");
const testerUpdate = read("docs/release/TESTER_BUILD_CURRENT_RUNTIME_DELIVERY.md");
const finalPacket = read("docs/release/FINAL_STORE_RELEASE_READINESS_PLAY_SUBMISSION_PACKET.md");
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");
const roadmap = read("ROADMAP.md");
const goNoGo = read("docs/FINAL_PUBLIC_USE_GO_NO_GO.md");
const checklist = read("docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md");
const packageJson = read("package.json");

[
  "Play internal/closed testing AAB upload + tester smoke: Closed / Partial / Blocked",
  "EAS Update group",
  "INSTALL_FAILED_UPDATE_INCOMPATIBLE",
  "AAB path",
  "/tmp/app-android-tester-binary-build-install-smoke-20260625-235636/chillywood-production-aab-v57.aab",
  "Package ID",
  "com.chillywood.mobile",
  "Version name",
  "1.0.0",
  "Version code",
  "57",
  "a71b8a9b8e35a284e62b7843df5c7f16ba94c54487ca63bcf67aba04598c9efa",
  "Play track target",
  "internal",
  "Release Notes",
  "Tester Instructions",
  "Installed Play tester smoke is Partial / pending Play processing or tester install",
  "Known Disabled Systems",
  "Rollback Instructions",
  "This lane did not submit to Play production",
  "This lane did not mutate Google Play products/base plans, RevenueCat, Stripe, payouts, purchases, refunds, or provider dashboards",
  "Premium public purchase is OFF",
  "live_money_enabled remains OFF",
  "Creator-money is OFF",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement are OFF",
  "Provider refunds remain manual/external",
].forEach((needle) => requireText("Play internal AAB upload doc", doc, needle));

[
  "docs/release/PLAY_INTERNAL_TEST_AAB_UPLOAD_TESTER_SMOKE.md",
].forEach((needle) => {
  requireText("Android tester binary doc", binaryDoc, needle);
  requireText("tester update doc", testerUpdate, needle);
  requireText("final release packet", finalPacket, needle);
  requireText("current state", currentState, needle);
  requireText("next task", nextTask, needle);
  requireText("roadmap", roadmap, needle);
  requireText("go/no-go", goNoGo, needle);
  requireText("final readiness checklist", checklist, needle);
});

[
  "proof:play-internal-test-aab-upload-tester-smoke",
  "guard:play-internal-test-aab-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

notes.push("Play internal AAB upload doc records reason, AAB metadata, internal track upload status, release notes, tester instructions, smoke pending status, rollback, and disabled money systems.");
notes.push("Installed Play tester smoke is honestly pending unless the owner-permitted attached device can verify Play tester availability for versionCode 57.");
notes.push("Related release/current-state docs reference the Play internal AAB upload tester smoke doc.");

if (failures.length) {
  console.error("Play internal test AAB upload tester smoke proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Play internal test AAB upload tester smoke proof passed.");
notes.forEach((note) => console.log(`- ${note}`));
