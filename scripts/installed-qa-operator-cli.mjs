#!/usr/bin/env node
import process from "node:process";

const functionName = "installed-product-qa-operator";
const systemId = "installed_product_qa_operator";
const tokenEnv = "INSTALLED_QA_OPERATOR_TOKEN";
const urlEnv = "INSTALLED_QA_OPERATOR_FUNCTION_URL";
const tokenHeader = "x-installed-qa-operator-token";

const commandMap = {
  "watch-once": "watch_once",
  status: "status",
  report: "report",
  "record-finding": "record_manual_codex_gap",
  "device-readiness": "record_device_availability",
  "account-fixtures": "record_account_fixture_health",
};

const secretKeyPattern = /(secret|token|password|credential|authorization|api[_-]?key|service[_-]?role|private[_-]?key|signed[_-]?url|db[_-]?url|database[_-]?url|reporter|private[_-]?evidence|tax|bank)/i;

const redact = (value) => {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && value.length > 96) return `${value.slice(0, 16)}...[redacted:${value.length}]`;
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    secretKeyPattern.test(key) ? "[redacted]" : redact(entry),
  ]));
};

const boolEnv = (key, fallback = false) => {
  const value = String(process.env[key] ?? "").trim().toLowerCase();
  if (!value) return fallback;
  return value === "1" || value === "true" || value === "yes";
};

const intEnv = (key, fallback = 0) => {
  const value = Number.parseInt(String(process.env[key] ?? ""), 10);
  return Number.isFinite(value) ? value : fallback;
};

const commandKey = process.argv[2] || "status";
const action = commandMap[commandKey] ?? commandKey;
const token = process.env[tokenEnv];
const explicitUrl = process.env[urlEnv];
const functionsUrl = process.env.SUPABASE_FUNCTIONS_URL;
const url = explicitUrl || (functionsUrl ? `${functionsUrl.replace(/\/$/, "")}/${functionName}` : "");

if (!token || !url) {
  console.log(JSON.stringify({
    ok: false,
    failClosed: true,
    systemId,
    action,
    missing: [
      ...(token ? [] : [tokenEnv]),
      ...(url ? [] : [urlEnv, "SUPABASE_FUNCTIONS_URL"]),
    ],
    highRiskExecuted: false,
    moneyMoved: false,
    userRightsChanged: false,
    fakeProof: false,
  }, null, 2));
  process.exit(1);
}

const basePayload = {
  action,
  source: process.env.INSTALLED_QA_SOURCE || "manual_codex_proof",
  discovered_by: process.env.INSTALLED_QA_DISCOVERED_BY || "autonomous_operator",
  scheduler: process.env.INSTALLED_QA_SCHEDULER || "manual_cli",
  operator_id: systemId,
  update_id: process.env.INSTALLED_QA_UPDATE_ID || undefined,
  runtime_version: process.env.INSTALLED_QA_RUNTIME_VERSION || undefined,
  channel: process.env.INSTALLED_QA_CHANNEL || "production",
  metadata: {
    invokedBy: "installed-qa-operator-cli",
    commandKey,
  },
};

const commandPayloads = {
  "record-finding": {
    flag_type: process.env.INSTALLED_QA_FLAG_TYPE || "manual_codex_only_gap",
    target_type: process.env.INSTALLED_QA_TARGET_TYPE || "installed_proof_blocker",
    target_id: process.env.INSTALLED_QA_TARGET_ID || "manual_codex_gap",
    account_role: process.env.INSTALLED_QA_ACCOUNT_ROLE || undefined,
    blocker_classification: process.env.INSTALLED_QA_BLOCKER_CLASSIFICATION || "manual_codex_only_gap",
    result: process.env.INSTALLED_QA_RESULT || "human_review",
    next_safe_action: process.env.INSTALLED_QA_NEXT_SAFE_ACTION || "Run proactive installed QA proof; do not fake closure.",
  },
  "device-readiness": {
    device_requirement: process.env.INSTALLED_QA_DEVICE_REQUIREMENT || "Play-installed device/device-lab readiness",
    available_device_count: intEnv("INSTALLED_QA_AVAILABLE_DEVICE_COUNT", 0),
    required_device_count: intEnv("INSTALLED_QA_REQUIRED_DEVICE_COUNT", 1),
    play_installed_device_available: boolEnv("INSTALLED_QA_PLAY_INSTALLED_DEVICE_AVAILABLE"),
    device_lab_configured: boolEnv("INSTALLED_QA_DEVICE_LAB_CONFIGURED"),
    blocker_classification: process.env.INSTALLED_QA_BLOCKER_CLASSIFICATION || "device_unavailable",
    result: process.env.INSTALLED_QA_RESULT || "blocked",
    next_safe_action: process.env.INSTALLED_QA_NEXT_SAFE_ACTION || "Keep installed proof pending until device readiness exists.",
  },
  "account-fixtures": {
    account_label: process.env.INSTALLED_QA_ACCOUNT_LABEL || "proof_account",
    account_role: process.env.INSTALLED_QA_ACCOUNT_ROLE || "unknown",
    expected_state: process.env.INSTALLED_QA_EXPECTED_STATE || "fixture state matches label",
    actual_state: process.env.INSTALLED_QA_ACTUAL_STATE || "unknown",
    provider_backed: boolEnv("INSTALLED_QA_PROVIDER_BACKED"),
    blocker_classification: process.env.INSTALLED_QA_BLOCKER_CLASSIFICATION || "account_fixture_not_ready",
    result: process.env.INSTALLED_QA_RESULT || "blocked",
    next_safe_action: process.env.INSTALLED_QA_NEXT_SAFE_ACTION || "Repair fixture only through approved path; do not fake state.",
  },
};

const payload = {
  ...basePayload,
  ...(commandPayloads[commandKey] ?? {}),
};

const response = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    [tokenHeader]: token,
  },
  body: JSON.stringify(payload),
});

let body;
try {
  body = await response.json();
} catch {
  body = { text: await response.text() };
}

console.log(JSON.stringify(redact({
  ok: response.ok,
  status: response.status,
  systemId,
  action,
  response: body,
}), null, 2));

if (!response.ok) process.exit(1);
