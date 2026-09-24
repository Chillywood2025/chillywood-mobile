#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createResumableDeliveryReceipt, reconcileExactArtifactDeliveryState } from "./release-control-plane-lib.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((entry, index, all) => entry.startsWith("--")
  ? [entry.slice(2), all[index + 1]?.startsWith("--") ? true : all[index + 1]]
  : null).filter(Boolean));
const allowed = new Set(["snapshot", "receipt"]);
if (Object.keys(args).some((key) => !allowed.has(key)) || typeof args.snapshot !== "string") {
  process.stderr.write("usage: node scripts/ios-delivery-control.mjs --snapshot <readback.json> [--receipt <output.json>]\n");
  process.exit(1);
}

const snapshotPath = path.resolve(args.snapshot);
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
const result = reconcileExactArtifactDeliveryState(snapshot);
const receipt = createResumableDeliveryReceipt(snapshot, result);
if (args.receipt) fs.writeFileSync(path.resolve(args.receipt), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ ...result, receipt })}\n`);
process.exitCode = result.ok ? 0 : 1;
