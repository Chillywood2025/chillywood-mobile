#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { reconstructPhysicalAutomation } from "./release-control-plane-lib.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((entry, index, all) => entry.startsWith("--")
  ? [entry.slice(2), all[index + 1]?.startsWith("--") ? true : all[index + 1]]
  : null).filter(Boolean));
if (Object.keys(args).some((key) => key !== "snapshot") || typeof args.snapshot !== "string") {
  process.stderr.write("usage: node scripts/physical-automation-control.mjs --snapshot <non-secret-health.json>\n");
  process.exit(1);
}

const snapshot = JSON.parse(fs.readFileSync(path.resolve(args.snapshot), "utf8"));
const result = reconstructPhysicalAutomation(snapshot);
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.ok ? 0 : 1;
