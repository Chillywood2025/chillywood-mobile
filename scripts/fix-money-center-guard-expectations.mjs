#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const path = "scripts/guard-money-center-policy.mjs";
let source = readFileSync(path, "utf8");

const removals = [
  'assertIncludes(channelSettings, "Creator setup mode", "creator setup mode banner");\n',
  'assertIncludes(channelSettings, "Creator monetization setup is usable in sandbox/not-payable mode.", "creator setup usable copy");\n',
  'assertIncludes(channelSettings, "Pending balance", "overview pending balance");\n',
  'assertIncludes(channelSettings, "This month", "overview monthly earnings");\n',
  'assertIncludes(channelSettings, "Lifetime earnings", "overview lifetime earnings");\n',
  'assertIncludes(channelSettings, "Pending payout", "overview pending payout");\n',
  'assertIncludes(channelSettings, "Set up payouts before you can receive creator earnings.", "payout setup warning");\n',
  'assertIncludes(channelSettings, "Creator earnings are temporarily disabled.", "earnings disabled warning");\n',
];
for (const line of removals) {
  if (!source.includes(line)) throw new Error(`stale guard assertion not found: ${line.trim()}`);
  source = source.replace(line, "");
}

const anchor = 'assertIncludes(channelSettings, "Available balance", "overview available balance");\n';
if (!source.includes(anchor)) throw new Error("overview available balance anchor missing");
const replacement = `${anchor}assertIncludes(channelSettings, "Transactions", "canonical overview transactions summary");\nassertIncludes(channelSettings, "Payout readiness", "canonical overview payout-readiness summary");\nassertIncludes(channelSettings, "Sandbox/test mode. No real charges, payouts, cashout, or withdrawals.", "single Money Center sandbox safety summary");\n`;
source = source.replace(anchor, replacement);

writeFileSync(path, source);
console.log("Money Center guard expectations aligned with canonical UI.");
