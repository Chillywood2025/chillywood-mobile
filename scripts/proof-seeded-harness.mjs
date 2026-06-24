#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

const requiredLabels = [
  "proof_host_001",
  "proof_creator_001",
  "proof_free_viewer_001",
  "proof_premium_viewer_001",
  "proof_blocked_001",
  "proof_circle_member_001",
  "proof_circle_non_member_001",
  "proof_call_caller_001",
  "proof_call_recipient_001",
  "proof_busy_call_user_001",
  "proof_paid_video_buyer_001",
  "proof_ticket_buyer_001",
  "proof_event_pass_buyer_001",
  "proof_subscriber_001",
  "proof_vip_001",
  "proof_deleted_pending_001",
  "proof_admin_operator_001",
];

const envFiles = [
  ".env.browserstack-monetization.local",
  ".env.local",
  ".env.final-qa-proof.local",
];

const labelEnvKeys = {
  proof_host_001: ["CHILLYWOOD_E2E_OWNER_EMAIL", "CHILLYWOOD_E2E_OWNER_USER_ID", "CHILLYWOOD_E2E_OWNER_PASSWORD"],
  proof_creator_001: ["CHILLYWOOD_E2E_CREATOR_ID", "CHILLYWOOD_E2E_OWNER_EMAIL", "CHILLYWOOD_E2E_OWNER_PASSWORD"],
  proof_free_viewer_001: ["CHILLYWOOD_E2E_VIEWER_EMAIL", "CHILLYWOOD_E2E_VIEWER_USER_ID", "CHILLYWOOD_E2E_VIEWER_PASSWORD"],
  proof_premium_viewer_001: ["CHILLYWOOD_E2E_VIEWER_08_EMAIL", "CHILLYWOOD_E2E_VIEWER_08_USER_ID", "CHILLYWOOD_E2E_VIEWER_08_PASSWORD"],
  proof_blocked_001: ["CHILLYWOOD_E2E_BLOCKED_EMAIL", "CHILLYWOOD_E2E_BLOCKED_USER_ID"],
  proof_circle_member_001: ["CHILLYWOOD_E2E_CIRCLE_MEMBER_EMAIL", "CHILLYWOOD_E2E_CIRCLE_MEMBER_USER_ID"],
  proof_circle_non_member_001: ["CHILLYWOOD_E2E_PUBLIC_VIEWER_EMAIL", "CHILLYWOOD_E2E_PUBLIC_VIEWER_USER_ID"],
  proof_call_caller_001: ["CHILLYWOOD_E2E_VIEWER_02_EMAIL", "CHILLYWOOD_E2E_VIEWER_02_USER_ID", "CHILLYWOOD_E2E_VIEWER_02_PASSWORD"],
  proof_call_recipient_001: ["CHILLYWOOD_E2E_VIEWER_03_EMAIL", "CHILLYWOOD_E2E_VIEWER_03_USER_ID", "CHILLYWOOD_E2E_VIEWER_03_PASSWORD"],
  proof_busy_call_user_001: ["CHILLYWOOD_E2E_VIEWER_04_EMAIL", "CHILLYWOOD_E2E_VIEWER_04_USER_ID", "CHILLYWOOD_E2E_VIEWER_04_PASSWORD"],
  proof_paid_video_buyer_001: ["CHILLYWOOD_E2E_VIEWER_05_EMAIL", "CHILLYWOOD_E2E_VIEWER_05_USER_ID", "CHILLYWOOD_E2E_VIEWER_05_PASSWORD"],
  proof_ticket_buyer_001: ["CHILLYWOOD_E2E_VIEWER_06_EMAIL", "CHILLYWOOD_E2E_VIEWER_06_USER_ID", "CHILLYWOOD_E2E_VIEWER_06_PASSWORD"],
  proof_event_pass_buyer_001: ["CHILLYWOOD_E2E_VIEWER_07_EMAIL", "CHILLYWOOD_E2E_VIEWER_07_USER_ID", "CHILLYWOOD_E2E_VIEWER_07_PASSWORD"],
  proof_subscriber_001: ["CHILLYWOOD_E2E_SUBSCRIBER_EMAIL", "CHILLYWOOD_E2E_SUBSCRIBER_USER_ID"],
  proof_vip_001: ["CHILLYWOOD_E2E_VIP_EMAIL", "CHILLYWOOD_E2E_VIP_USER_ID"],
};

function readText(path) {
  if (!existsSync(path)) {
    return "";
  }
  return readFileSync(path, "utf8");
}

function collectEnvKeys() {
  const keys = new Set();

  for (const file of envFiles) {
    const text = readText(file);
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
      if (match) {
        keys.add(match[1]);
      }
    }
  }

  return keys;
}

const doc = readText("docs/SEEDED_PROOF_HARNESS.md");
const nextTask = readText("NEXT_TASK.md");
const envKeys = collectEnvKeys();
const failures = [];

if (!doc) {
  failures.push("docs/SEEDED_PROOF_HARNESS.md is missing");
}

if (!nextTask.includes("Sequential Production Proof Waves — Android First")) {
  failures.push("NEXT_TASK.md is missing the sequential proof waves section");
}

if (!nextTask.includes("Wave 0 status:")) {
  failures.push("NEXT_TASK.md is missing Wave 0 status");
}

for (const label of requiredLabels) {
  if (!doc.includes(label)) {
    failures.push(`missing seeded proof label in harness doc: ${label}`);
  }
}

for (const phrase of [
  "Do not commit credentials",
  "Temporary grants",
  "Cleanup Process",
  "What Was Actually Created In Wave 0",
  "Later Wave Consumption Rules",
]) {
  if (!doc.includes(phrase)) {
    failures.push(`missing required harness section or rule: ${phrase}`);
  }
}

const localEnvKeyPresence = {};
for (const [label, keys] of Object.entries(labelEnvKeys)) {
  localEnvKeyPresence[label] = Object.fromEntries(keys.map((key) => [key, envKeys.has(key)]));
}

const result = {
  status: failures.length === 0 ? "passed" : "failed",
  proofRunId: "wave0-seeded-proof-harness-20260624",
  mutationPerformed: false,
  secretsPrinted: false,
  localEnvValuesPrinted: false,
  localEnvKeyPresence,
  failures,
};

console.log(JSON.stringify(result, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
