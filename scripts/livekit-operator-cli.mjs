#!/usr/bin/env node
const command = process.argv[2] || "status";

const ACTION_BY_COMMAND = {
  "learning-report": "recovery_report",
  plan: "plan_recovery",
  probe: "token_surface_probe",
  report: "recovery_report",
  "run-safe-recovery": "execute_safe_recovery",
  "surface-health": "health_snapshot",
  status: "health_snapshot",
};

const redact = (value) => String(value ?? "").replace(/[A-Za-z0-9._~+/=-]{32,}/g, "[redacted]");
const functionUrl = process.env.LIVEKIT_OPERATOR_FUNCTION_URL || "";
const operatorToken = process.env.LIVEKIT_OPERATOR_TOKEN || "";
const action = ACTION_BY_COMMAND[command];

if (!action) {
  console.error(`Unsupported livekit-operator command: ${command}`);
  process.exit(1);
}

if (!functionUrl || !operatorToken) {
  console.log(JSON.stringify({
    command,
    configured: false,
    missing: [
      !functionUrl ? "LIVEKIT_OPERATOR_FUNCTION_URL" : null,
      !operatorToken ? "LIVEKIT_OPERATOR_TOKEN" : null,
    ].filter(Boolean),
    status: "not_configured_fail_closed",
  }, null, 2));
  process.exit(0);
}

const response = await fetch(functionUrl, {
  body: JSON.stringify({ action }),
  headers: {
    "Content-Type": "application/json",
    "x-livekit-operator-token": operatorToken,
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
