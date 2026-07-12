#!/usr/bin/env node

const actionArg = String(process.argv[2] ?? "status").trim();
const commandText = process.argv.slice(3).join(" ").trim() || process.env.OWNER_COMMAND_TEXT || "report autonomous system health";

const actionMap = {
  classify: "classify_command",
  plan: "plan_command",
  "dry-run": "dry_run_command",
  "execute-approved": "execute_approved_command",
  status: "command_status",
  report: "command_report",
};

const action = actionMap[actionArg];
if (!action) {
  console.error(`Unsupported owner-command action: ${actionArg}`);
  process.exit(2);
}

const baseUrl = process.env.OWNER_COMMAND_FUNCTION_URL
  || (process.env.SUPABASE_FUNCTIONS_URL ? `${process.env.SUPABASE_FUNCTIONS_URL.replace(/\/$/, "")}/owner-command-operator` : "");

if (!baseUrl) {
  console.error("owner_command_function_url_required");
  process.exit(1);
}

const ownerJwt = process.env.OWNER_COMMAND_OWNER_JWT || process.env.SUPABASE_OWNER_JWT || "";
const operatorToken = process.env.OWNER_COMMAND_OPERATOR_TOKEN || "";
const needsOwnerJwt = ["classify_command", "plan_command", "dry_run_command"].includes(action);
const needsOwnerOrTrusted = ["execute_approved_command", "command_status", "command_report"].includes(action);

if (needsOwnerJwt && !ownerJwt) {
  console.error("owner_command_owner_jwt_required");
  process.exit(1);
}

if (needsOwnerOrTrusted && !ownerJwt && !operatorToken) {
  console.error("owner_command_owner_jwt_or_operator_token_required");
  process.exit(1);
}

const headers = { "content-type": "application/json" };
if (ownerJwt) headers.authorization = `Bearer ${ownerJwt}`;
if (operatorToken) headers["x-owner-command-operator-token"] = operatorToken;

const body = { action };
if (["classify_command", "plan_command", "dry_run_command"].includes(action)) body.command_text = commandText;
if (["execute_approved_command", "command_status"].includes(action) && process.env.OWNER_COMMAND_ID) {
  body.command_id = process.env.OWNER_COMMAND_ID;
}
if (action === "execute_approved_command" && process.env.OWNER_COMMAND_EXTERNAL_CONFIRMATION_STATUS) {
  body.external_confirmation_status = process.env.OWNER_COMMAND_EXTERNAL_CONFIRMATION_STATUS;
}

const redact = (value) => {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") {
    if (typeof value === "string") return value.replace(/[A-Za-z0-9._~+/=-]{32,}/g, "[redacted]");
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    /secret|token|password|authorization|service[_-]?role|api[_-]?key|private[_-]?key|db[_-]?url/i.test(key) ? key : key,
    /secret|token|password|authorization|service[_-]?role|api[_-]?key|private[_-]?key|db[_-]?url/i.test(key) ? "[redacted]" : redact(entry),
  ]));
};

try {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }
  console.log(JSON.stringify(redact({
    status: response.status,
    ok: response.ok,
    response: payload,
  }), null, 2));
  if (!response.ok) process.exit(1);
} catch (error) {
  console.error(error instanceof Error ? error.message : "owner_command_cli_failed");
  process.exit(1);
}
