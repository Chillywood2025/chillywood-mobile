#!/usr/bin/env node
import process from "node:process";

const configs = {
  notification: {
    systemId: "notification_delivery_operator",
    functionName: "notification-operator",
    tokenEnv: "NOTIFICATION_OPERATOR_TOKEN",
    urlEnv: "NOTIFICATION_OPERATOR_FUNCTION_URL",
    header: "x-notification-operator-token",
  },
  release: {
    systemId: "release_ota_operator",
    functionName: "release-operator",
    tokenEnv: "RELEASE_OPERATOR_TOKEN",
    urlEnv: "RELEASE_OPERATOR_FUNCTION_URL",
    header: "x-release-operator-token",
  },
  security: {
    systemId: "security_owner_operator",
    functionName: "security-owner-operator",
    tokenEnv: "SECURITY_OWNER_OPERATOR_TOKEN",
    urlEnv: "SECURITY_OWNER_OPERATOR_FUNCTION_URL",
    header: "x-security-owner-operator-token",
  },
  moderation: {
    systemId: "moderation_safety_operator",
    functionName: "moderation-safety-operator",
    tokenEnv: "MODERATION_SAFETY_OPERATOR_TOKEN",
    urlEnv: "MODERATION_SAFETY_OPERATOR_FUNCTION_URL",
    header: "x-moderation-safety-operator-token",
  },
  observability: {
    systemId: "observability_runtime_operator",
    functionName: "observability-operator",
    tokenEnv: "OBSERVABILITY_OPERATOR_TOKEN",
    urlEnv: "OBSERVABILITY_OPERATOR_FUNCTION_URL",
    header: "x-observability-operator-token",
  },
  platformRecovery: {
    systemId: "platform_recovery_operator",
    functionName: "platform-recovery-operator",
    tokenEnv: "PLATFORM_RECOVERY_OPERATOR_TOKEN",
    urlEnv: "PLATFORM_RECOVERY_OPERATOR_FUNCTION_URL",
    header: "x-platform-recovery-operator-token",
  },
  privacyCompliance: {
    systemId: "privacy_compliance_operator",
    functionName: "privacy-compliance-operator",
    tokenEnv: "PRIVACY_COMPLIANCE_OPERATOR_TOKEN",
    urlEnv: "PRIVACY_COMPLIANCE_OPERATOR_FUNCTION_URL",
    header: "x-privacy-compliance-operator-token",
  },
  supportSuccess: {
    systemId: "support_success_operator",
    functionName: "support-success-operator",
    tokenEnv: "SUPPORT_SUCCESS_OPERATOR_TOKEN",
    urlEnv: "SUPPORT_SUCCESS_OPERATOR_FUNCTION_URL",
    header: "x-support-success-operator-token",
  },
  searchRanking: {
    systemId: "search_ranking_integrity_operator",
    functionName: "search-ranking-integrity-operator",
    tokenEnv: "SEARCH_RANKING_INTEGRITY_OPERATOR_TOKEN",
    urlEnv: "SEARCH_RANKING_INTEGRITY_OPERATOR_FUNCTION_URL",
    header: "x-search-ranking-integrity-operator-token",
  },
};

const commandMap = {
  "watch-once": "watch_once",
  status: "status",
  report: "report",
};

const redact = (value) => {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && value.length > 96) return `${value.slice(0, 16)}...[redacted:${value.length}]`;
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    /secret|token|password|credential|authorization|api[_-]?key|service[_-]?role|private[_-]?key|signed[_-]?url/i.test(key) ? "[redacted]" : redact(entry),
  ]));
};

const [systemKey, commandKey = "status"] = process.argv.slice(2);
const config = configs[systemKey];
if (!config) {
  console.log(JSON.stringify({ ok: false, error: "unknown_operator", known: Object.keys(configs) }, null, 2));
  process.exitCode = 1;
  process.exit();
}

const action = commandMap[commandKey] ?? commandKey;
const token = process.env[config.tokenEnv];
const explicitUrl = process.env[config.urlEnv];
const functionsUrl = process.env.SUPABASE_FUNCTIONS_URL;
const url = explicitUrl || (functionsUrl ? `${functionsUrl.replace(/\/$/, "")}/${config.functionName}` : "");

if (!token || !url) {
  console.log(JSON.stringify({
    ok: false,
    failClosed: true,
    systemId: config.systemId,
    action,
    missing: [
      ...(token ? [] : [config.tokenEnv]),
      ...(url ? [] : [config.urlEnv, "SUPABASE_FUNCTIONS_URL"]),
    ],
    moneyMoved: false,
    userRightsChanged: false,
  }, null, 2));
  process.exitCode = 1;
  process.exit();
}

const response = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    [config.header]: token,
  },
  body: JSON.stringify({
    action,
    environment_mode: process.env.OPERATOR_ENVIRONMENT_MODE || "production",
    scheduler: process.env.OPERATOR_SCHEDULER || "manual_cli",
    operator_id: process.env.OPERATOR_ID || config.systemId,
    source: process.env.OPERATOR_SOURCE || `manual_cli:${config.systemId}`,
  }),
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
  systemId: config.systemId,
  action,
  response: body,
}), null, 2));

if (!response.ok) process.exitCode = 1;
