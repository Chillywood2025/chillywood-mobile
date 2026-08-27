#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const path = "scripts/apply-money-center-ui-closure.mjs";
let source = readFileSync(path, "utf8");
const oldAnchor = 'const proofNegativeAnchor = `  ["Money Center no timed manager focus retries", "focusActiveMoneyManagerPanel"],\\n];`;';
const newAnchor = 'const proofNegativeAnchor = `  ["Money Center no timed manager focus retries", "focusActiveMoneyManagerPanel"],\\n].forEach(([name, needle]) => add(name, excludes(channelSettings, needle), needle));`;';
const oldReplacementEnd = '  ["Money Center no duplicate cashout readiness CTA", "money-center-cashout-readiness-button"],\\n];`;';
const newReplacementEnd = '  ["Money Center no duplicate cashout readiness CTA", "money-center-cashout-readiness-button"],\\n].forEach(([name, needle]) => add(name, excludes(channelSettings, needle), needle));`;';
if (!source.includes(oldAnchor)) throw new Error("old proofNegativeAnchor declaration not found");
if (!source.includes(oldReplacementEnd)) throw new Error("old proofNegativeReplacement ending not found");
source = source.replace(oldAnchor, newAnchor).replace(oldReplacementEnd, newReplacementEnd);
writeFileSync(path, source);
console.log("Transformer proof anchor corrected.");
