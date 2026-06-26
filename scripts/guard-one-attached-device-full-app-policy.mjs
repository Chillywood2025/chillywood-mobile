#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

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

const forbidMatch = (label, content, pattern, description) => {
  if (pattern.test(content)) failures.push(`${label} contains forbidden ${description}`);
};

const forbidPositiveSentence = (label, content, pattern, description) => {
  const sentences = content
    .split(/(?<=[.\n])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const allowed = /\b(?:no|not|did not|do not|without|unless explicitly owner-approved|not approved|not falsely|not run|blocked|missing|required|must not|was not)\b/i;
  const hit = sentences.find((sentence) => pattern.test(sentence) && !allowed.test(sentence));
  if (hit) failures.push(`${label} contains forbidden ${description}: ${hit}`);
};

const doc = read("docs/release/ONE_ATTACHED_DEVICE_FULL_APP_AUTOMATION_PROOF.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

[
  "One attached device full app automation proof: Closed / Partial / Blocked",
  "Verdict for this lane: Partial",
  "No sideload was used",
  "No APK install was used as tester proof",
  "No uninstall/reinstall/clear-data happened",
  "No Play production submission happened",
  "No provider dashboard mutation happened",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
  "Current First Owner was not touched",
  "Missing roles are not called passed",
  "Service-role bootstrap was not used as proof of role/permission authority",
  "Two-device proof still required",
  "Blocked: missing seeded proof credential",
].forEach((needle) => requireText("one attached device proof doc", doc, needle));

forbidPositiveSentence("one attached device proof doc", doc, /sideload (?:was|used|recommended|proves|proof)/i, "sideload tester proof");
forbidPositiveSentence("one attached device proof doc", doc, /APK (?:install|sideload) (?:was|used|proves|proof)/i, "APK install tester proof");
forbidPositiveSentence("one attached device proof doc", doc, /uninstall|reinstall|clear-data|clear data|cache wipe|device reset/i, "destructive device action");
forbidPositiveSentence("one attached device proof doc", doc, /Play production submission happened|submitted? to Play production|promoted? to production/i, "Play production submission");
forbidPositiveSentence("one attached device proof doc", doc, /provider mutation happened|mutated provider|provider dashboards? mutated/i, "provider mutation");
forbidPositiveSentence("one attached device proof doc", doc, /provider refunds? (?:are|were|became) executable|provider refunds? executed/i, "provider refund execution");
forbidPositiveSentence("one attached device proof doc", doc, /current First Owner (?:was|is) touched|modified current First Owner|changed current First Owner/i, "current First Owner mutation");
forbidPositiveSentence("one attached device proof doc", doc, /service-role .*proof of role\/permission authority|service-role .*authority proof/i, "service-role authority proof");
forbidPositiveSentence("one attached device proof doc", doc, /two-device .*fully closed|two-device .*closed on one device/i, "false two-device closeout");
forbidPositiveSentence("one attached device proof doc", doc, /missing .*passed|blocked .*passed/i, "missing role pass claim");
forbidPositiveSentence("one attached device proof doc", doc, /dead visible controls? (?:accepted|allowed)/i, "dead visible control acceptance");

forbidMatch("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "liveMoneyEnabled activation");
forbidMatch("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbidMatch("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/, "cashout activation");
forbidMatch("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");

forbidMatch("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbidMatch("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbidMatch("money feature defaults", moneyFlags, /merch_enabled:\s*["']on["']/, "merch on state");

if (failures.length) {
  console.error("One attached device full app policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("One attached device full app policy guard passed.");
console.log("- no sideload, destructive device action, production submission, provider mutation, money activation, First Owner mutation, false role pass, or false two-device closeout was introduced.");
