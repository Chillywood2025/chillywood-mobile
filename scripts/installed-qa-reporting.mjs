const functionName = "installed-product-qa-operator";
const tokenEnv = "INSTALLED_QA_OPERATOR_TOKEN";
const urlEnv = "INSTALLED_QA_OPERATOR_FUNCTION_URL";
const tokenHeader = "x-installed-qa-operator-token";

const toText = (value) => String(value ?? "").trim();

const redactedResponse = (value) => {
  if (Array.isArray(value)) return value.map(redactedResponse);
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && value.length > 96) return `${value.slice(0, 16)}...[redacted:${value.length}]`;
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    /(secret|token|password|credential|authorization|service[_-]?role|private[_-]?key|api[_-]?key|signed[_-]?url|reporter|private[_-]?evidence|tax|bank)/i.test(key)
      ? "[redacted]"
      : redactedResponse(entry),
  ]));
};

const operatorEndpoint = () => {
  const explicitUrl = process.env[urlEnv];
  const functionsUrl = process.env.SUPABASE_FUNCTIONS_URL;
  return explicitUrl || (functionsUrl ? `${functionsUrl.replace(/\/$/, "")}/${functionName}` : "");
};

export const qaOperatorConfigured = () => Boolean(process.env[tokenEnv] && operatorEndpoint());

export const postInstalledQaFinding = async (payload) => {
  const token = process.env[tokenEnv];
  const url = operatorEndpoint();
  if (!token || !url) {
    const result = {
      reported: false,
      failClosed: true,
      missing: [
        ...(token ? [] : [tokenEnv]),
        ...(url ? [] : [urlEnv, "SUPABASE_FUNCTIONS_URL"]),
      ],
    };
    if (process.env.INSTALLED_QA_REPORT_REQUIRED === "true") {
      throw new Error(`installed_qa_reporting_required_missing_${result.missing.join("_")}`);
    }
    return result;
  }

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
  if (!response.ok) {
    const error = new Error(`installed_qa_operator_report_failed_${response.status}`);
    error.details = redactedResponse(body);
    throw error;
  }
  return { reported: true, status: response.status, response: redactedResponse(body) };
};

const rowToFinding = (row) => {
  const role = toText(row.role).toLowerCase();
  const label = toText(row.accountLabel);
  const route = toText(row.routeScreen);
  const actual = toText(row.actualOutcome);
  const expected = toText(row.expectedOutcome);
  const status = toText(row.status);

  if (status === "Two-device required" || /two-device|simultaneous participant/i.test(route + actual + expected)) {
    return {
      action: "record_device_availability",
      device_requirement: "two Play-installed devices or approved device lab",
      available_device_count: 1,
      required_device_count: 2,
      play_installed_device_available: true,
      device_lab_configured: false,
      blocker_classification: "second_device_required",
      result: "two_device_required",
      next_safe_action: "Keep realtime installed proof pending until two Play-installed devices or approved device lab exist.",
    };
  }

  if (role.includes("premium") && /not active|inactive|provider|premium/i.test(actual + expected)) {
    return {
      action: "record_account_fixture_health",
      account_label: label || "proof_premium_001",
      account_role: "premium",
      expected_state: "provider-backed Premium active",
      actual_state: actual || "Premium state mismatch",
      provider_backed: false,
      blocker_classification: "premium_provider_state_missing",
      result: "blocked",
      next_safe_action: "Use provider-backed active account, restore, or approved Google Play / RevenueCat sandbox renewal only.",
    };
  }

  if (role.includes("restricted") || /restricted|denied|suspended/i.test(expected + actual)) {
    return {
      action: "record_role_finding",
      route_path: route || "/chat",
      account_role: "restricted",
      expected_behavior: expected || "restricted/denied copy or blocked action",
      actual_behavior: actual || "expected denial missing",
      blocker_classification: "expected_denial_copy_missing",
      result: "blocked",
      next_safe_action: "Verify restricted fixture state; do not mutate account rights or fake denial proof.",
    };
  }

  if (/moderator/i.test(role + label) && /boundary|search|private evidence|human review|pending/i.test(actual + expected + status)) {
    return {
      action: "record_manual_codex_gap",
      flag_type: "moderator_boundary_pending",
      target_type: "role_boundary",
      target_id: `${label || "moderator"}:${route || "/admin"}`,
      account_role: "moderator",
      blocker_classification: "manual_codex_only_gap",
      result: "human_review",
      next_safe_action: "Run focused moderator boundary proof; keep private evidence and reporter identity absent by default.",
    };
  }

  if (route === "/creator-monetization-setup" || /creator-monetization-setup|compatibility|marker/i.test(route + actual + expected)) {
    return {
      action: "record_route_finding",
      route_path: "/creator-monetization-setup",
      account_role: "creator",
      expected_marker: "Platform Studio / Premium required compatibility marker",
      actual_marker: actual || "expected marker missing",
      expected_behavior: expected || "compatibility route reaches canonical monetization gate",
      actual_behavior: actual || "marker missing",
      blocker_classification: "missing_testid_or_marker",
      result: "blocked",
      next_safe_action: "Create safe source/proof/testID owner command if marker mismatch recurs.",
    };
  }

  if (route === "/chat" || /chat-inbox-screen|stayed on home|home/i.test(actual + expected)) {
    return {
      action: "record_route_finding",
      route_path: "/chat",
      account_role: role || "normal",
      expected_marker: "chat-inbox-screen",
      actual_marker: actual || "expected marker missing",
      expected_behavior: expected || "normal signed-in user lands on chat inbox",
      actual_behavior: actual || "route marker mismatch",
      blocker_classification: "route_contract_mismatch",
      result: "blocked",
      next_safe_action: "Create safe source/proof/testID owner command if route mismatch recurs.",
    };
  }

  return null;
};

export const reportInstalledQaFromTraversalSummary = async (input) => {
  const findings = [];
  for (const row of input.matrix ?? []) {
    const status = toText(row.status).toLowerCase();
    if (!["blocked", "fail", "failed", "human review", "two-device required"].includes(status)) continue;
    const finding = rowToFinding(row);
    if (finding) findings.push(finding);
  }

  const base = {
    source: "manual_codex_proof",
    discovered_by: "codex_manual",
    update_id: input.updateId,
    runtime_version: input.runtimeVersion,
    channel: input.channel || "production",
    metadata: {
      traversalSummary: input.summary,
      reportingIntegration: "installed-qa-reporting",
    },
  };

  const results = [];
  for (const finding of findings) {
    results.push(await postInstalledQaFinding({ ...base, ...finding }));
  }
  return {
    configured: qaOperatorConfigured(),
    attemptedFindings: findings.length,
    results,
  };
};
