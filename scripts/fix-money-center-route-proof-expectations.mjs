#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const path = "scripts/proof-creator-monetization-route-button-wiring.mjs";
let source = readFileSync(path, "utf8");
const stale = '  ["Cashout readiness Money Center button", "money-center-cashout-readiness-button"],\n';
if (!source.includes(stale)) throw new Error("stale duplicate cashout proof expectation not found");
source = source.replace(stale, "");
writeFileSync(path, source);
console.log("Money Center route proof now requires only the canonical payout readiness CTA.");
