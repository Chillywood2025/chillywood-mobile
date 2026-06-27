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
  const allowed = /\b(?:no|not|did not|do not|must not|without|against|blocked|fail-closed|missing|required|two-device required|not claimed|not used|not run|unless explicitly owner-approved|manual\/external|OFF|never|redacted|ignored)\b/i;
  const hit = content
    .split(/(?<=[.\n])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .find((sentence) => pattern.test(sentence) && !allowed.test(sentence));
  if (hit) failures.push(`${label} contains forbidden ${description}: ${hit}`);
};

const bridgeDoc = read("docs/release/SEEDED_ACCOUNT_INSTALLED_LOGIN_BRIDGE.md");
const rerunDoc = read("docs/release/FULL_SEEDED_ONE_DEVICE_ROLE_TRAVERSAL_RERUN.md");
const oneDeviceDoc = read("docs/release/ONE_ATTACHED_DEVICE_FULL_APP_AUTOMATION_PROOF.md");
const runner = read("scripts/local-run-full-seeded-one-device-role-traversal-rerun.mjs");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

[
  "No passwords were printed or committed",
  "No service-role was used",
  "No accounts were created or recreated",
  "No auth bypass was added",
  "No RLS/account-status gate weakening happened",
  "No sideload, uninstall, reinstall, or clear-data happened",
  "Current First Owner was not touched",
  "liveMoneyEnabled remains OFF",
  "No provider mutation happened",
].forEach((needle) => requireText("seeded account installed login bridge doc", bridgeDoc, needle));

requireText("local rerun runner", runner, "MAESTRO_CHILLYWOOD_LOGIN_EMAIL");
requireText("local rerun runner", runner, "MAESTRO_CHILLYWOOD_LOGIN_PASSWORD");
forbid("local rerun runner", runner, /"--env"[\s\S]{0,250}(passwordKey|getEnv\(passwordKey\)|PASSWORD)/, "Maestro CLI password env argument");
forbid("local rerun runner", runner, /getEnv\(["']SUPABASE_SERVICE_ROLE_KEY["']\)|process\.env\.SUPABASE_SERVICE_ROLE_KEY/, "service-role credential read in installed login rerun runner");

[
  ["seeded account installed login bridge doc", bridgeDoc],
  ["full seeded one-device rerun doc", rerunDoc],
  ["one attached device proof doc", oneDeviceDoc],
].forEach(([label, content]) => {
  forbidPositiveSentence(label, content, /service-role (?:was|used|created|recreated|repaired|authority|bootstrap)/i, "service-role use or authority proof claim");
  forbidPositiveSentence(label, content, /accounts? (?:were|was) (?:created|recreated)|created accounts?|recreated accounts?/i, "account creation/recreation claim");
  forbidPositiveSentence(label, content, /auth bypass|bypass auth|skip auth/i, "auth bypass claim");
  forbidPositiveSentence(label, content, /RLS .*weaken|account-status .*weaken|weakened RLS|weakened account-status/i, "RLS/account-status weakening");
  forbidPositiveSentence(label, content, /sideload|APK install|uninstall|reinstall|clear-data|clear data|cache wipe|device reset/i, "sideload or destructive device action");
  forbidPositiveSentence(label, content, /Play production submission happened|submitted? to Play production|promoted? to production/i, "Play production submission");
  forbidPositiveSentence(label, content, /provider mutation happened|mutated provider|provider dashboards? mutated/i, "provider mutation");
  forbidPositiveSentence(label, content, /current First Owner (?:was|is) touched|modified current First Owner|changed current First Owner/i, "current First Owner mutation");
  forbidPositiveSentence(label, content, /provider refunds? (?:are|were|became) executable|provider refunds? executed/i, "provider refund execution");
  forbid(label, content, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "service-role key value");
  forbid(label, content, /(PASSWORD|PASSCODE)\s*=\s*['"]?[^<\s][^\s]{8,}/i, "password value");
  forbid(label, content, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
  forbid(label, content, /https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/i, "signed URL");
  forbid(label, content, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IP");
});

forbid("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "liveMoneyEnabled activation");
forbid("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbid("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/, "cashout activation");
forbid("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbid("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbid("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbid("money feature defaults", moneyFlags, /merch_enabled:\s*["']on["']/, "merch on state");

if (failures.length) {
  console.error("Seeded account installed login policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Seeded account installed login policy guard passed.");
console.log("- no credential leak, service-role use, account recreation, auth bypass, RLS/account-status weakening, destructive device action, production submission, provider mutation, money activation, or First Owner mutation was introduced.");
