#!/usr/bin/env node

const command = process.argv[2] || "provider-health";

const ACTION_BY_COMMAND = {
  "access-status": "provider_access_status",
  "provider-access-probe": "provider_access_probe",
  "provider-dashboard-readback": "provider_dashboard_readback",
  "provider-health": "provider_webhook_health",
  "provider-repair-request": "provider_repair_request",
  "provider-test-plan": "provider_test_delivery_plan",
  "provider-test-run": "provider_test_delivery_run",
  report: "provider_webhook_reliability_report",
  "watch-once": "watch_once",
};

const action = ACTION_BY_COMMAND[command];
const redact = (value) => String(value ?? "").replace(/[A-Za-z0-9._~+/=-]{32,}/g, "[redacted]");

const explicitFunctionUrl = process.env.MONEY_OPERATOR_FUNCTION_URL || "";
const supabaseFunctionsUrl = process.env.SUPABASE_FUNCTIONS_URL || "";
const functionUrl = explicitFunctionUrl || (supabaseFunctionsUrl ? `${supabaseFunctionsUrl.replace(/\/$/, "")}/money-operator` : "");
const operatorToken = process.env.MONEY_OPERATOR_TOKEN || "";
const provider = process.env.MONEY_OPERATOR_PROVIDER || "";
const payloadJson = process.env.MONEY_OPERATOR_PAYLOAD_JSON || "";

if (!action) {
  console.error(`Unsupported money-operator command: ${command}`);
  process.exit(1);
}

if (!functionUrl || !operatorToken) {
  console.log(JSON.stringify({
    command,
    configured: false,
    missing: [
      !functionUrl ? "MONEY_OPERATOR_FUNCTION_URL or SUPABASE_FUNCTIONS_URL" : null,
      !operatorToken ? "MONEY_OPERATOR_TOKEN" : null,
    ].filter(Boolean),
    status: "not_configured_fail_closed",
    moneyMoved: false,
  }, null, 2));
  process.exit(0);
}

const response = await fetch(functionUrl, {
  body: JSON.stringify({
    action,
    environment_mode: process.env.MONEY_OPERATOR_ENVIRONMENT_MODE || "test",
    ...(provider ? { provider } : {}),
    ...(payloadJson ? JSON.parse(payloadJson) : {}),
  }),
  headers: {
    "Content-Type": "application/json",
    "x-money-operator-token": operatorToken,
  },
  method: "POST",
});
const payload = await response.json().catch(() => ({ error: "invalid_json_response" }));

console.log(redact(JSON.stringify({
  command,
  httpStatus: response.status,
  ok: response.ok,
  payload,
}, null, 2)));

if (!response.ok) process.exit(1);
