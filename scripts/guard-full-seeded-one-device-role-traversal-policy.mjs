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

const forbid = (label, content, pattern, description) => {
  if (pattern.test(content)) failures.push(`${label} contains forbidden ${description}`);
};

const forbidPositiveSentence = (label, content, pattern, description) => {
  const allowed = /\b(?:no|not|did not|do not|must not|without|against|blocked|missing|required|two-device required|not claimed|not used|not run|unless explicitly owner-approved|manual\/external|OFF)\b/i;
  const hit = content
    .split(/(?<=[.\n])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .find((sentence) => pattern.test(sentence) && !allowed.test(sentence));
  if (hit) failures.push(`${label} contains forbidden ${description}: ${hit}`);
};

const doc = read("docs/release/FULL_SEEDED_ONE_DEVICE_ROLE_TRAVERSAL_RERUN.md");
const packageJson = read("package.json");
const runner = read("scripts/local-run-full-seeded-one-device-role-traversal-rerun.mjs");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

[
  "Full seeded one-device role traversal rerun: Closed / Partial / Blocked",
  "No service-role was used in this rerun",
  "No accounts were created or recreated in this rerun",
  "No sideload was used",
  "No APK install was used as tester proof",
  "No uninstall/reinstall/clear-data happened",
  "Current First Owner was not touched",
  "Missing roles are not called passed",
  "Two-device proof still required",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
  "No provider dashboard mutation happened",
  "No Play production submission happened",
  "The harness now blocks that path by default",
].forEach((needle) => requireText("full seeded one-device rerun doc", doc, needle));

[
  "proof:full-seeded-one-device-role-traversal-rerun",
  "guard:full-seeded-one-device-role-traversal-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

requireText("local rerun runner", runner, "FULL_SEEDED_ALLOW_MAESTRO_SECRET_ARGS");
requireText("local rerun runner", runner, "installed login input blocked: no owner-approved non-secret credential input path");

forbidPositiveSentence("full seeded one-device rerun doc", doc, /service-role (?:was|used|bootstrap|created|repaired|authority)/i, "service-role use or authority proof claim");
forbidPositiveSentence("full seeded one-device rerun doc", doc, /accounts? (?:were|was) (?:created|recreated)|created accounts?|recreated accounts?/i, "account creation/recreation claim");
forbidPositiveSentence("full seeded one-device rerun doc", doc, /sideload (?:was|used|recommended|proves|proof)/i, "sideload tester proof");
forbidPositiveSentence("full seeded one-device rerun doc", doc, /APK (?:install|sideload) (?:was|used|proves|proof)/i, "APK install tester proof");
forbidPositiveSentence("full seeded one-device rerun doc", doc, /uninstall|reinstall|clear-data|clear data|cache wipe|device reset/i, "destructive device action");
forbidPositiveSentence("full seeded one-device rerun doc", doc, /Play production submission happened|submitted? to Play production|promoted? to production/i, "Play production submission");
forbidPositiveSentence("full seeded one-device rerun doc", doc, /provider mutation happened|mutated provider|provider dashboards? mutated/i, "provider mutation");
forbidPositiveSentence("full seeded one-device rerun doc", doc, /provider refunds? (?:are|were|became) executable|provider refunds? executed/i, "provider refund execution");
forbidPositiveSentence("full seeded one-device rerun doc", doc, /current First Owner (?:was|is) touched|modified current First Owner|changed current First Owner/i, "current First Owner mutation");
forbidPositiveSentence("full seeded one-device rerun doc", doc, /two-device .*fully closed|two-device .*closed on one device|simultaneous .*closed/i, "false two-device closeout");
forbidPositiveSentence("full seeded one-device rerun doc", doc, /missing .*passed|blocked .*passed/i, "missing role pass claim");
forbidPositiveSentence("full seeded one-device rerun doc", doc, /dead visible controls? (?:accepted|allowed)/i, "dead visible control acceptance");

forbid("full seeded one-device rerun doc", doc, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "service-role key value");
forbid("full seeded one-device rerun doc", doc, /(PASSWORD|PASSCODE)\s*=\s*['"]?[^<\s][^\s]{8,}/i, "password value");
forbid("full seeded one-device rerun doc", doc, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
forbid("full seeded one-device rerun doc", doc, /https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/i, "signed URL");
forbid("full seeded one-device rerun doc", doc, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IP");

forbid("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "liveMoneyEnabled activation");
forbid("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbid("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/, "cashout activation");
forbid("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbid("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbid("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbid("money feature defaults", moneyFlags, /merch_enabled:\s*["']on["']/, "merch on state");

if (failures.length) {
  console.error("Full seeded one-device role traversal policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Full seeded one-device role traversal policy guard passed.");
console.log("- no service-role use, account bootstrap, sideload, destructive device action, production submission, provider mutation, money activation, First Owner mutation, false role pass, or false two-device closeout was introduced.");
