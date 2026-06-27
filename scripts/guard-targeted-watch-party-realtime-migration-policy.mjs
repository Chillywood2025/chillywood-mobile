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
  const allowed = /\b(?:no|not|did not|do not|must not|without|only|targeted|left untouched|unrelated pending migrations existed|No|OFF|manual\/external)\b/i;
  const hit = content
    .split(/(?<=[.\n])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .find((sentence) => pattern.test(sentence) && !allowed.test(sentence));
  if (hit) failures.push(`${label} contains forbidden ${description}: ${hit}`);
};

const doc = read("docs/release/TARGETED_WATCH_PARTY_REALTIME_MIGRATION_APPLY.md");
const migration = read("supabase/migrations/20260627131501_watch_party_realtime_publication.sql");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

[
  "Only `supabase/migrations/20260627131501_watch_party_realtime_publication.sql` was applied",
  "No unrelated pending migrations were applied",
  "No broad `supabase db push` was run",
  "No provider mutation happened",
  "liveMoneyEnabled remains OFF",
].forEach((needle) => requireText("targeted migration apply doc", doc, needle));

forbidPositiveSentence("targeted migration apply doc", doc, /broad .*supabase db push.*run|supabase db push.*appl/i, "broad Supabase db push apply");
forbidPositiveSentence("targeted migration apply doc", doc, /unrelated pending migrations? .*applied|older unrelated .*applied/i, "unrelated migration apply");
forbidPositiveSentence("targeted migration apply doc", doc, /money.*tables?.*added|provider.*tables?.*added|payout.*tables?.*added/i, "money/provider/payout table publication change");
forbidPositiveSentence("targeted migration apply doc", doc, /RLS.*weaken|row level security.*disable|disable.*RLS/i, "RLS weakening");
forbidPositiveSentence("targeted migration apply doc", doc, /provider mutation happened|Google Play product|base-plan mutation|RevenueCat mapping change|Stripe mutation/i, "provider mutation");

forbid("targeted Watch-Party migration", migration, /\b(?:money_|payout|cashout|withdrawal|transfer|stripe|provider|revenuecat|purchase|refund|payable_balance|bank|tax)\b/i, "money/provider/payout table reference");
forbid("targeted Watch-Party migration", migration, /disable\s+row\s+level\s+security|drop\s+policy|drop\s+table|alter\s+table\s+.*\s+disable/i, "RLS weakening or destructive SQL");
forbid("targeted Watch-Party migration", migration, /postgres(?:ql)?:\/\/[^@\s]+@/i, "DB URL with credentials");
forbid("targeted migration apply doc", doc, /postgres(?:ql)?:\/\/[^@\s]+@/i, "DB URL with credentials");
forbid("targeted migration apply doc", doc, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "service-role key value");
forbid("targeted migration apply doc", doc, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
forbid("targeted migration apply doc", doc, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IP");

forbid("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "liveMoneyEnabled activation");
forbid("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbid("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/, "cashout activation");
forbid("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbid("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbid("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbid("money feature defaults", moneyFlags, /payable_balances_enabled:\s*["']on["']/, "payable balances on state");

if (failures.length) {
  console.error("targeted Watch-Party realtime migration policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("targeted Watch-Party realtime migration policy guard passed.");
console.log("- no broad db push, unrelated migration apply, RLS weakening, money/provider table publication change, provider mutation, money activation, or secret exposure was introduced.");
