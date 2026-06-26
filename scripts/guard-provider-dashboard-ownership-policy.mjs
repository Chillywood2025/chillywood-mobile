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

const doc = read("docs/ops/PROVIDER_DASHBOARD_OWNERSHIP_ACCESS_GOVERNANCE.md");
const dashboardDoc = read("docs/DASHBOARD_SETUP_COMMAND_CENTER.md");
const staffDoc = read("docs/admin/STAFF_ACCESS_LIFECYCLE_ONBOARDING_OFFBOARDING_GOVERNANCE.md");
const emergencyDoc = read("docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md");
const publicDoc = read("docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const packageJson = read("package.json");

[
  "This lane did not mutate provider dashboards",
  "First Owner / Owner owns provider dashboard accountability",
  "Each provider has a primary owner and backup owner requirement",
  "Company-controlled email is required where available",
  "Personal accounts are avoided for production ownership",
  "Provider roles must be least-privilege",
  "MFA/2FA is required where supported",
  "Shared provider dashboard accounts are forbidden where individual access is supported",
  "Service accounts are not human staff accounts",
  "API keys and provider secrets must live in secret managers/provider dashboards/EAS/Supabase/GitHub secrets, not repo",
  "Provider webhooks must be protected with signature/shared-secret validation where supported",
  "Webhook secrets have a rotation plan",
  "Provider offboarding checklist exists",
  "Provider support tickets are tracked with sanitized references",
  "Provider decisions are mirrored into repo docs with sanitized facts",
  "Dashboard access proof remains owner-confirmation-required where repo cannot verify it",
  "Safe public non-money systems remain enabled",
  "live_money_enabled remains OFF",
  "Creator-money remains OFF",
  "Premium public purchase remains OFF",
  "Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF",
  "No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened",
].forEach((needle) => requireText("provider governance doc", doc, needle));

[
  "Provider dashboard ownership and access governance is documented in `docs/ops/PROVIDER_DASHBOARD_OWNERSHIP_ACCESS_GOVERNANCE.md`",
].forEach((needle) => {
  [
    ["dashboard setup command center", dashboardDoc],
    ["staff lifecycle governance", staffDoc],
    ["emergency controls governance", emergencyDoc],
  ].forEach(([label, content]) => requireText(label, content, needle));
});

[
  "Safe public non-money systems remain enabled",
  "live_money_enabled remains OFF",
].forEach((needle) => requireText("public switchboard", publicDoc, needle));

[
  "proof:provider-dashboard-ownership-access-governance",
  "guard:provider-dashboard-ownership-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

const docsToScan = [
  ["provider governance doc", doc],
  ["dashboard setup command center", dashboardDoc],
  ["staff lifecycle governance", staffDoc],
  ["emergency controls governance", emergencyDoc],
];

for (const [label, content] of docsToScan) {
  forbidMatch(label, content, /This lane (?:mutated|changed|added|removed|rotated|created|deleted) provider dashboards/i, "provider dashboard mutation claim");
  forbidMatch(label, content, /(?<!no )(?<!No )provider dashboard access (?:was|is) changed/i, "provider dashboard access changed claim");
  forbidMatch(label, content, /shared provider dashboard accounts (?:are|remain|may be|can be|should be) allowed/i, "shared provider dashboard account allowance");
  forbidMatch(label, content, /service accounts are human staff accounts/i, "service accounts as human staff");
  forbidMatch(label, content, /personal accounts (?:are|remain|may be|can be|should be) allowed for production ownership/i, "personal account production ownership allowance");
  forbidMatch(label, content, /MFA\/2FA (?:is|may be|can be|should be) optional/i, "optional MFA policy");
  forbidMatch(label, content, /provider roles (?:may be|can be|should be|are) broad/i, "broad provider role policy");
  forbidMatch(label, content, /(?:AIza[0-9A-Za-z_-]{20,}|sk_(?:live|test)_[0-9A-Za-z]{16,}|rk_(?:live|test)_[0-9A-Za-z]{16,}|-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----|\"private_key\"\\s*:|service_role_[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{10,})/, "credential-like material");
}

forbidMatch("provider governance doc", doc, /(?:printed|included|committed) provider access lists/i, "provider access list exposure");
forbidMatch("provider governance doc", doc, /(?:webhook secret|api key|recovery code|mfa code|service account json|database password|signing credential|keystore password)\s*[:=]\s*[`'"]?[A-Za-z0-9_./+=-]{8,}/i, "secret assignment");

forbidMatch("runtime feature flags", featureFlags, /premiumPurchaseEnabled:\s*true/, "Premium public purchase activation");
forbidMatch("runtime feature flags", featureFlags, /paidContentCheckoutEnabled:\s*true/, "paid content checkout activation");
forbidMatch("runtime feature flags", featureFlags, /tipsEnabled:\s*true/, "tips activation");
forbidMatch("runtime feature flags", featureFlags, /merchStoreEnabled:\s*true/, "merch activation");
forbidMatch("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/, "cash-out activation");
forbidMatch("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/, "payout activation");
forbidMatch("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/, "Stripe Connect production activation");
forbidMatch("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/, "live money activation");

forbidMatch("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/, "live_money_enabled on state");
forbidMatch("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/, "payouts on state");
forbidMatch("money feature defaults", moneyFlags, /paid_content_enabled:\s*["']on["']/, "paid content on state");
forbidMatch("money feature defaults", moneyFlags, /tips_enabled:\s*["']on["']/, "tips on state");
forbidMatch("money feature defaults", moneyFlags, /merch_enabled:\s*["']on["']/, "merch on state");

if (failures.length) {
  console.error("Provider dashboard ownership/access policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Provider dashboard ownership/access policy guard passed.");
console.log("- provider governance remains documentation/proof-only with no dashboard access mutation.");
console.log("- MFA, least-privilege, company-email, service-account separation, secret storage, webhook rotation, offboarding, support-ticket tracking, and provider-decision mirroring policies are present.");
console.log("- money/provider/payout systems remain off and no credential-like material was introduced in scanned governance docs.");
