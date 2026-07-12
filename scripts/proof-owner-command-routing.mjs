#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const helper = read("_lib/ownerCommandOperator.ts");
const fn = read("supabase/functions/owner-command-operator/index.ts");
const failures = [];
const fail = (message) => failures.push(message);
const includes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing: ${needle}`);
};

const routingCases = [
  ["media_automation", ["media", "r2", "transcode"]],
  ["livekit_operator", ["livekit", "watch party", "heartbeat"]],
  ["money_flow_control", ["revenuecat", "stripe", "ledger"]],
  ["notification_delivery_operator", ["notification", "push", "device token"]],
  ["release_ota_operator", ["ota", "updateid", "rollback"]],
  ["security_owner_operator", ["owner", "rls", "rachi"]],
  ["moderation_safety_operator", ["moderation", "ban", "report"]],
  ["observability_runtime_operator", ["crash", "analytics", "performance"]],
];

for (const [systemId, keywords] of routingCases) {
  includes(helper, `${systemId}: [`, `${systemId} helper routing`);
  includes(fn, `${systemId}: [`, `${systemId} function routing`);
  for (const keyword of keywords) {
    includes(helper, `"${keyword}"`, `${systemId} helper keyword`);
    includes(fn, `"${keyword}"`, `${systemId} function keyword`);
  }
}

for (const expected of [
  '"multi_system"',
  "targetSystems",
  "executionPlan",
  "stepIndex",
  "targetSystem",
  "owner_command_report",
  "owner_command_scoped_safe_write",
  "owner_command_approval_required",
]) includes(helper, expected, "routing plan helper");

for (const expected of [
  "const systems = mapSystems(command)",
  "const executionPlan = systems.map",
  "target_system: toText(step.targetSystem)",
  "step_index: Number(step.stepIndex",
]) includes(fn, expected, "routing function persistence");

if (failures.length) {
  console.error("proof:owner-command-routing failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("proof:owner-command-routing passed");
