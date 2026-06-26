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

const doc = read("docs/release/TESTER_DELIVERY_VISIBLE_SURFACE_ACTIVE_WIRING.md");
const visibleAudit = read("docs/release/EVERY_VISIBLE_SURFACE_ACTIVE_WIRING_AUDIT.md");
const packageJson = read("package.json");

[
  "Visible-surface active wiring tester delivery: Closed / Partial / Blocked",
  "Commit delivered: `7138dd2ad7e40d07e7865888076a622e82f4ac8f`",
  "Commit 7138dd2 was pushed to origin/main before delivery",
  "Delivery classification: EAS Update eligible",
  "Changed-File Delivery Analysis",
  "EAS Update Evidence",
  "Branch/channel: `production`",
  "Runtime version: `1.0.0`",
  "Update group ID: `d7aac53c-65bb-4bf7-ae69-04bfea248e0a`",
  "Android update ID: `019f0533-920e-7fca-8f45-74b1f538040a`",
  "Commit included: `7138dd2ad7e40d07e7865888076a622e82f4ac8f`",
  "Tester Instructions",
  "Sideload is not an approved tester delivery path",
  "Play internal/closed testing remains the approved tester path",
  "No APK sideload was used",
  "No app uninstall/reinstall/clear-data happened unless explicitly owner-approved",
  "No Play production submission happened",
  "No provider mutation happened",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
  "Premium annual remains provider-blocked",
  "Creator Channel Subscription remains provider-blocked",
  "Testers must verify visible controls in the installed tester build",
  "docs/release/EVERY_VISIBLE_SURFACE_ACTIVE_WIRING_AUDIT.md",
].forEach((needle) => requireText("visible-surface tester delivery doc", doc, needle));

[
  "Every visible surface active wiring audit: Closed / Partial / Blocked",
  "No visible clickable dead buttons are allowed",
].forEach((needle) => requireText("visible-surface active wiring audit", visibleAudit, needle));

[
  "proof:tester-delivery-visible-surface-active-wiring",
  "guard:tester-delivery-visible-surface-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

notes.push("Visible-surface tester delivery doc records commit 7138dd2, pushed-to-origin status, EAS Update classification, update evidence, tester instructions, and safety confirmation.");
notes.push("Delivery used EAS Update on production branch/runtime 1.0.0; no AAB was required and no sideload was used.");
notes.push("Visible-surface active wiring audit remains referenced.");

if (failures.length) {
  console.error("Visible-surface tester delivery proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Visible-surface tester delivery proof passed.");
notes.forEach((note) => console.log(`- ${note}`));
