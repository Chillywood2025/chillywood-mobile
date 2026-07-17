import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  classifyIosInstalledQaReadiness,
  IOS_QA_RELEASE_EXPECTATION,
  sanitizeAutonomousReadback,
} from "../_shared/ios-autonomous-operator-policy.mjs";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

const SYSTEM_ID = "installed_product_qa_operator";
const TOKEN_HEADER = "x-installed-qa-operator-token";

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${TOKEN_HEADER}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
} as const;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
} as const;

const PROOF_SOURCES = [
  "testflight_internal",
  "physical_ios",
  "ios_simulator",
  "eas_internal_ios",
  "app_store_internal",
  "play_installed",
  "browserstack",
  "firebase_test_lab_uploaded_artifact",
  "local_fixture",
  "manual_codex_proof",
] as const;
const DISCOVERED_BY = ["autonomous_operator", "codex_manual", "device_lab"] as const;
const RESULTS = [
  "pass", "partial", "blocked", "failed", "human_review", "two_device_required",
  "source_ready", "provider_ready", "provider_readback_blocked", "internal_build_ready", "physical_proof_required", "second_device_required",
] as const;
const BLOCKER_CLASSIFICATIONS = [
  "source_bug",
  "stale_proof_expectation",
  "missing_testid_or_marker",
  "account_fixture_not_ready",
  "premium_provider_state_missing",
  "device_unavailable",
  "second_device_required",
  "route_contract_mismatch",
  "auth_session_mismatch",
  "expected_denial_copy_missing",
  "installed_ota_stale",
  "manual_codex_only_gap",
  "unknown_requires_review",
  "ios_testflight_build_unavailable",
  "ios_runtime_mismatch",
  "ios_channel_mismatch",
  "ios_source_commit_mismatch",
  "ios_provider_readback_blocked",
  "ios_physical_proof_required",
  "ios_second_device_required",
  "ios_native_capability_missing",
  "ios_universal_link_proof_pending",
  "ios_push_proof_pending",
  "ios_voip_proof_pending",
  "ios_storekit_proof_pending",
] as const;

const SECRET_PATTERN = /(secret|token|password|credential|authorization|service[_-]?role|participant[_-]?token|signed[_-]?url|api[_-]?key|private[_-]?key|db[_-]?url|database[_-]?url|webhook[_-]?secret|reporter|private[_-]?evidence|tax|bank)/i;
const LONG_SECRET_PATTERN = /[A-Za-z0-9._~+/=-]{48,}/;
const HIGH_RISK_MUTATION_PATTERN = /(manual[_\s-]?premium|grant\s+premium|entitlement\s+(edit|insert|grant)|service[_\s-]?role|auth\/rls|owner[_\s-]?role|ban\s+user|suspend\s+user|restrict\s+user|delete\s+content|move\s+money|payout|cashout|provider\s+product|publish\s+ota|rollback\s+ota|adb\s+install|sideload|clear\s+app\s+data)/i;

const toText = (value: unknown) => String(value ?? "").trim();
const normalizePlatform = (value: unknown) => ["shared", "ios", "android", "web", "unknown"].includes(toText(value).toLowerCase())
  ? toText(value).toLowerCase()
  : "unknown";
const isOneOf = <T extends readonly string[]>(value: unknown, values: T): value is T[number] => (
  (values as readonly string[]).includes(toText(value))
);

const jsonResponse = (status: number, payload: JsonObject) => new Response(JSON.stringify(payload), {
  headers: JSON_HEADERS,
  status,
});

const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`${key}_missing`);
  return value;
};

const createAdminClient = (): SupabaseClientLike => createClient(
  readRequiredEnv("SUPABASE_URL"),
  readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const constantTimeEqual = (left: string, right: string) => {
  const leftText = String(left ?? "");
  const rightText = String(right ?? "");
  const maxLength = Math.max(leftText.length, rightText.length);
  let diff = leftText.length ^ rightText.length;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftText.charCodeAt(index) || 0) ^ (rightText.charCodeAt(index) || 0);
  }
  return diff === 0;
};

const authenticate = async (request: Request) => {
  const expectedHash = toText(Deno.env.get("INSTALLED_QA_OPERATOR_TOKEN_SHA256"));
  const token = toText(request.headers.get(TOKEN_HEADER));
  if (!expectedHash || !token) return false;
  return constantTimeEqual(await sha256Hex(token), expectedHash);
};

const containsSecretLikeValue = (value: unknown): boolean => {
  if (typeof value === "string") return SECRET_PATTERN.test(value) || LONG_SECRET_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(containsSecretLikeValue);
  if (value && typeof value === "object") {
    return Object.entries(value as JsonObject).some(([key, entry]) => SECRET_PATTERN.test(key) || containsSecretLikeValue(entry));
  }
  return false;
};

const sanitize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? value.replace(LONG_SECRET_PATTERN, "[redacted]").slice(0, 4000) : value;
  }
  return Object.fromEntries(
    Object.entries(value as JsonObject)
      .filter(([key, entry]) => !SECRET_PATTERN.test(key) && !containsSecretLikeValue(entry))
      .slice(0, 64)
      .map(([key, entry]) => [key, sanitize(entry)]),
  );
};

const assertSafePayload = (payload: JsonObject) => {
  if (containsSecretLikeValue(payload)) throw new Error("installed_qa_secret_payload_blocked");
  const requestedActionText = [
    payload.command_text,
    payload.commandText,
    payload.proposed_action,
    payload.proposedAction,
    payload.action_id,
    payload.actionId,
  ].map(toText).join(" ");
  if (
    HIGH_RISK_MUTATION_PATTERN.test(requestedActionText)
    && !/\b(no|not|never|without|forbidden|blocked|deny|denied)\b/i.test(requestedActionText)
  ) {
    throw new Error("installed_qa_high_risk_mutation_blocked");
  }
  if (payload.fake_proof === true || payload.fakeProof === true) throw new Error("installed_qa_fake_proof_blocked");
  if (payload.money_moved === true || payload.moneyMoved === true) throw new Error("installed_qa_money_movement_blocked");
  if (payload.user_rights_changed === true || payload.userRightsChanged === true) throw new Error("installed_qa_user_rights_change_blocked");
};

const baseRow = (payload: JsonObject) => ({
  system_id: SYSTEM_ID,
  platform: payload.platform === "ios" || payload.platform === "android" || payload.platform === "web" || payload.platform === "shared" ? payload.platform : "unknown",
  source: isOneOf(payload.source, PROOF_SOURCES) ? payload.source : "manual_codex_proof",
  update_id: payload.update_id ?? payload.updateId ?? null,
  runtime_version: payload.runtime_version ?? payload.runtimeVersion ?? null,
  channel: payload.channel ?? null,
  app_version: payload.app_version ?? payload.appVersion ?? null,
  native_build: payload.native_build ?? payload.nativeBuild ?? null,
  bundle_identifier: payload.bundle_identifier ?? payload.bundleIdentifier ?? null,
  distribution_source: payload.distribution_source ?? payload.distributionSource ?? null,
  data_source: payload.data_source ?? payload.dataSource ?? null,
  readback_complete: payload.readback_complete === true || payload.readbackComplete === true,
  account_role: payload.account_role ?? payload.accountRole ?? null,
  result: isOneOf(payload.result, RESULTS) ? payload.result : "blocked",
  blocker_classification: isOneOf(payload.blocker_classification ?? payload.blockerClassification, BLOCKER_CLASSIFICATIONS)
    ? payload.blocker_classification ?? payload.blockerClassification
    : "unknown_requires_review",
  discovered_by: isOneOf(payload.discovered_by ?? payload.discoveredBy, DISCOVERED_BY)
    ? payload.discovered_by ?? payload.discoveredBy
    : "autonomous_operator",
  high_risk_executed: false,
  money_moved: false,
  user_rights_changed: false,
  fake_proof: false,
  secrets_logged: false,
  private_evidence_stored: false,
  metadata: sanitize(payload.metadata ?? payload) as JsonObject,
});

const insertEvent = async (client: SupabaseClientLike, actionId: string, result: string, payload: JsonObject) => {
  const row = {
    system_id: SYSTEM_ID,
    platform: payload.platform === "ios" || payload.platform === "android" || payload.platform === "web" || payload.platform === "shared" ? payload.platform : "unknown",
    source: isOneOf(payload.source, PROOF_SOURCES) ? payload.source : "manual_codex_proof",
    action_id: actionId,
    result,
    update_id: payload.update_id ?? payload.updateId ?? null,
    runtime_version: payload.runtime_version ?? payload.runtimeVersion ?? null,
    channel: payload.channel ?? null,
    app_version: payload.app_version ?? payload.appVersion ?? null,
    native_build: payload.native_build ?? payload.nativeBuild ?? null,
    bundle_identifier: payload.bundle_identifier ?? payload.bundleIdentifier ?? null,
    distribution_source: payload.distribution_source ?? payload.distributionSource ?? null,
    data_source: payload.data_source ?? payload.dataSource ?? null,
    readback_complete: payload.readback_complete === true || payload.readbackComplete === true,
    account_role: payload.account_role ?? payload.accountRole ?? null,
    blocker_classification: isOneOf(payload.blocker_classification ?? payload.blockerClassification, BLOCKER_CLASSIFICATIONS)
      ? payload.blocker_classification ?? payload.blockerClassification
      : null,
    discovered_by: isOneOf(payload.discovered_by ?? payload.discoveredBy, DISCOVERED_BY)
      ? payload.discovered_by ?? payload.discoveredBy
      : "autonomous_operator",
    high_risk_executed: false,
    money_moved: false,
    user_rights_changed: false,
    fake_proof: false,
    secrets_logged: false,
    private_evidence_stored: false,
    metadata: sanitize(payload) as JsonObject,
  };
  const { error } = await client.from("installed_qa_operator_events").insert(row);
  if (error) throw error;
};

const recordTraversalRun = async (client: SupabaseClientLike, payload: JsonObject) => {
  const { account_role: _accountRole, ...base } = baseRow(payload);
  const row = {
    ...base,
    run_label: toText(payload.run_label ?? payload.runLabel ?? "installed_product_qa_watch_once"),
    installed_package: payload.installed_package ?? payload.installedPackage ?? null,
    installer_package: payload.installer_package ?? payload.installerPackage ?? null,
    native_version: payload.native_version ?? payload.nativeVersion ?? null,
    native_build: payload.native_build ?? payload.nativeBuild ?? null,
    device_count: Number(payload.device_count ?? payload.deviceCount ?? 0),
    pass_count: Number(payload.pass_count ?? payload.passCount ?? 0),
    human_review_count: Number(payload.human_review_count ?? payload.humanReviewCount ?? 0),
    blocked_count: Number(payload.blocked_count ?? payload.blockedCount ?? 0),
    two_device_required_count: Number(payload.two_device_required_count ?? payload.twoDeviceRequiredCount ?? 0),
    failure_count: Number(payload.failure_count ?? payload.failureCount ?? 0),
  };
  const { error } = await client.from("installed_traversal_runs").insert(row);
  if (error) throw error;
  await insertEvent(client, "record_traversal_run", "traversal_run_recorded", payload);
};

const recordRouteFinding = async (client: SupabaseClientLike, payload: JsonObject) => {
  const row = {
    ...baseRow(payload),
    route_path: toText(payload.route_path ?? payload.routePath),
    expected_marker: payload.expected_marker ?? payload.expectedMarker ?? null,
    actual_marker: payload.actual_marker ?? payload.actualMarker ?? null,
    expected_behavior: payload.expected_behavior ?? payload.expectedBehavior ?? null,
    actual_behavior: payload.actual_behavior ?? payload.actualBehavior ?? null,
    finding_status: "open",
    next_safe_action: toText(payload.next_safe_action ?? payload.nextSafeAction ?? "Create safe source/proof/testID owner command; do not fake installed proof."),
  };
  if (!row.route_path) throw new Error("route_path_required");
  const { error } = await client.from("route_behavior_findings").insert(row);
  if (error) throw error;
  await insertEvent(client, "record_route_finding", "route_finding_recorded", payload);
};

const recordRoleFinding = async (client: SupabaseClientLike, payload: JsonObject) => {
  const row = {
    ...baseRow(payload),
    route_path: payload.route_path ?? payload.routePath ?? null,
    account_role: toText(payload.account_role ?? payload.accountRole),
    expected_behavior: toText(payload.expected_behavior ?? payload.expectedBehavior),
    actual_behavior: toText(payload.actual_behavior ?? payload.actualBehavior),
    finding_status: "open",
    next_safe_action: toText(payload.next_safe_action ?? payload.nextSafeAction ?? "Classify role/account blocker; do not mutate user rights."),
  };
  if (!row.account_role || !row.expected_behavior || !row.actual_behavior) throw new Error("role_behavior_fields_required");
  const { error } = await client.from("role_behavior_findings").insert(row);
  if (error) throw error;
  await insertEvent(client, "record_role_finding", "role_finding_recorded", payload);
};

const recordAccountFixtureHealth = async (client: SupabaseClientLike, payload: JsonObject) => {
  const row = {
    ...baseRow(payload),
    account_label: toText(payload.account_label ?? payload.accountLabel),
    account_role: toText(payload.account_role ?? payload.accountRole),
    expected_state: toText(payload.expected_state ?? payload.expectedState),
    actual_state: toText(payload.actual_state ?? payload.actualState),
    provider_backed: Boolean(payload.provider_backed ?? payload.providerBacked ?? false),
    finding_status: "open",
    next_safe_action: toText(payload.next_safe_action ?? payload.nextSafeAction ?? "Repair fixture only through approved provider-backed/test fixture path."),
  };
  if (!row.account_label || !row.account_role || !row.expected_state || !row.actual_state) throw new Error("account_fixture_fields_required");
  const { error } = await client.from("account_fixture_health_findings").insert(row);
  if (error) throw error;
  await insertEvent(client, "record_account_fixture_health", "account_fixture_finding_recorded", payload);
};

const recordDeviceAvailability = async (client: SupabaseClientLike, payload: JsonObject) => {
  const row = {
    ...baseRow(payload),
    device_requirement: toText(payload.device_requirement ?? payload.deviceRequirement),
    available_device_count: Number(payload.available_device_count ?? payload.availableDeviceCount ?? 0),
    required_device_count: Number(payload.required_device_count ?? payload.requiredDeviceCount ?? 1),
    play_installed_device_available: Boolean(payload.play_installed_device_available ?? payload.playInstalledDeviceAvailable ?? false),
    device_lab_configured: Boolean(payload.device_lab_configured ?? payload.deviceLabConfigured ?? false),
    testflight_internal_build_available: Boolean(payload.testflight_internal_build_available ?? payload.testflightInternalBuildAvailable ?? false),
    signed_ios_build_available: Boolean(payload.signed_ios_build_available ?? payload.signedIosBuildAvailable ?? false),
    ios_physical_device_count: Number(payload.ios_physical_device_count ?? payload.iosPhysicalDeviceCount ?? 0),
    ios_second_device_available: Boolean(payload.ios_second_device_available ?? payload.iosSecondDeviceAvailable ?? false),
    ios_simulator_available: Boolean(payload.ios_simulator_available ?? payload.iosSimulatorAvailable ?? false),
    physical_proof_available: Boolean(payload.physical_proof_available ?? payload.physicalProofAvailable ?? false),
    universal_link_proof_available: Boolean(payload.universal_link_proof_available ?? payload.universalLinkProofAvailable ?? false),
    apns_proof_available: Boolean(payload.apns_proof_available ?? payload.apnsProofAvailable ?? false),
    voip_proof_available: Boolean(payload.voip_proof_available ?? payload.voipProofAvailable ?? false),
    storekit_proof_available: Boolean(payload.storekit_proof_available ?? payload.storekitProofAvailable ?? false),
    finding_status: "open",
    next_safe_action: toText(payload.next_safe_action ?? payload.nextSafeAction ?? "Keep installed realtime proof pending until device/device-lab readiness exists."),
  };
  if (!row.device_requirement) throw new Error("device_requirement_required");
  const { error } = await client.from("device_availability_findings").insert(row);
  if (error) throw error;
  await insertEvent(client, "record_device_availability", "device_availability_finding_recorded", payload);
};

const recordManualCodexGap = async (client: SupabaseClientLike, payload: JsonObject) => {
  const row = {
    ...baseRow({ ...payload, result: payload.result ?? "human_review" }),
    flag_type: toText(payload.flag_type ?? payload.flagType ?? "manual_codex_only_gap"),
    severity: toText(payload.severity ?? "review"),
    target_type: payload.target_type ?? payload.targetType ?? null,
    target_id: payload.target_id ?? payload.targetId ?? null,
    review_status: "open",
    next_safe_action: toText(payload.next_safe_action ?? payload.nextSafeAction ?? "Run proactive installed QA watch_once/device-lab proof; do not wait for manual Codex prompt."),
  };
  const { error } = await client.from("qa_required_review_flags").insert(row);
  if (error) throw error;
  await insertEvent(client, "record_manual_codex_gap", "manual_codex_gap_recorded", payload);
};

const updateLearningState = async (client: SupabaseClientLike, findingKey: string, payload: JsonObject) => {
  const { error } = await client.from("qa_operator_learning_state").upsert({
    system_id: SYSTEM_ID,
    finding_key: findingKey,
    occurrence_count: Number(payload.occurrence_count ?? payload.occurrenceCount ?? 1),
    last_blocker_classification: toText(payload.blocker_classification ?? payload.blockerClassification ?? "unknown_requires_review"),
    last_result: toText(payload.result ?? "blocked"),
    confidence: Number(payload.confidence ?? 0.6),
    last_recommended_action: toText(payload.next_safe_action ?? payload.nextSafeAction ?? "review installed QA blocker"),
    high_risk_executed: false,
    money_moved: false,
    user_rights_changed: false,
    fake_proof: false,
    secrets_logged: false,
    private_evidence_stored: false,
    metadata: sanitize(payload) as JsonObject,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "system_id,finding_key" });
  if (error) throw error;
};

const createOwnerCommand = async (client: SupabaseClientLike, payload: JsonObject) => {
  const commandText = toText(payload.command_text ?? payload.commandText ?? "Installed Product QA finding requires safe source/proof/testID follow-up.");
  const namesHighRiskScope = HIGH_RISK_MUTATION_PATTERN.test(commandText);
  const marksHighRiskAsForbidden = /\b(no|not|never|without|forbidden|blocked|deny|denied)\b/i.test(commandText);
  if (!commandText || (namesHighRiskScope && !marksHighRiskAsForbidden) || containsSecretLikeValue(commandText)) {
    throw new Error("installed_qa_owner_command_payload_blocked");
  }
  const insertPayload = {
    command_text: commandText,
    normalized_intent: "installed_product_qa",
    platform: normalizePlatform(payload.platform),
    target_systems: [SYSTEM_ID],
    approval_level: 2,
    status: "planned",
    allowed_scope: ["safe source/proof/testID fix proposal", "QA finding tracking"],
    forbidden_scope: ["manual Premium grant", "auth/RLS mutation", "owner role mutation", "money movement", "provider mutation", "user enforcement", "fake installed proof"],
    preflight_plan: ["verify installed QA finding", "verify current route/source contract", "verify no high-risk mutation"],
    execution_plan: [],
    rollback_plan: ["supersede command; keep QA finding open until proof passes"],
    proof_plan: ["run proof:installed-product-qa-operator", "run guard:installed-product-qa-operator"],
    validation_plan: ["typecheck", "route contracts", "targeted installed proof when device/account exists"],
    external_confirmation_required: false,
    external_confirmation_status: "not_required",
    result_summary: "Safe owner command request created by installed_product_qa_operator; high-risk execution not performed.",
    metadata: sanitize(payload.metadata ?? payload) as JsonObject,
  };
  const { data, error } = await client
    .from("owner_command_requests")
    .insert(insertPayload)
    .select("id,status,target_systems,approval_level")
    .single();
  if (error) throw error;
  await client.from("owner_command_events").insert({
    command_id: data.id,
    event_type: "planned",
    actor_type: SYSTEM_ID,
    actor_id: null,
    status: "planned",
    event_summary: "Installed Product QA Operator created safe owner-command follow-up.",
    metadata: { source: SYSTEM_ID, highRiskExecuted: false },
  });
  await insertEvent(client, "create_owner_command", "owner_command_created", { ...payload, owner_command_request_id: data.id });
  return data;
};

const createApprovalRequest = async (client: SupabaseClientLike, payload: JsonObject) => {
  const approvalLevel = Number(payload.approval_level ?? payload.approvalLevel ?? 3) === 4 ? 4 : 3;
  const actionId = toText(payload.action_id ?? payload.actionId ?? "installed_qa_high_risk_fix_request");
  const insertPayload = {
    system_id: SYSTEM_ID,
    action_id: actionId,
    platform: normalizePlatform(payload.platform),
    requested_by_actor_type: SYSTEM_ID,
    requested_by_actor_id: null,
    approval_level: approvalLevel,
    status: "pending",
    title: toText(payload.title ?? "Installed Product QA high-risk fix requires approval"),
    reason: toText(payload.reason ?? "Installed QA found a blocker whose fix may touch a Level 3/4 boundary."),
    risk_summary: toText(payload.risk_summary ?? "High-risk action remains blocked until owner/super-admin approval and target operator preflight."),
    proposed_action: toText(payload.proposed_action ?? actionId),
    allowed_write_scope: ["approval request only", "owner command blocker/proof rows"],
    forbidden_scope: ["manual Premium grant", "auth/RLS mutation", "money movement", "provider mutation", "user enforcement", "release mutation without approval"],
    rollback_plan: "Deny/supersede approval request; app/provider/accounts remain unchanged.",
    kill_switch_plan: "Emergency stop blocks execution; target operator must be active.",
    proof_plan: "Run installed QA proof/guard and target operator proof before execution.",
    validation_plan: "Fresh preflight, exact scope match, owner/super-admin approval, and external confirmation where required.",
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    metadata: sanitize(payload.metadata ?? payload) as JsonObject,
  };
  const { data, error } = await client
    .from("autonomous_approval_requests")
    .insert(insertPayload)
    .select("id,status,system_id,action_id,approval_level,expires_at")
    .single();
  if (error) throw error;
  await client.from("autonomous_approval_request_events").insert({
    request_id: data.id,
    platform: normalizePlatform(payload.platform),
    event_type: "created",
    actor_type: SYSTEM_ID,
    actor_id: null,
    event_summary: "Installed Product QA Operator requested owner approval for high-risk fix.",
    metadata: { created_by: SYSTEM_ID },
  });
  await insertEvent(client, "create_approval_request", "approval_request_created", { ...payload, approval_request_id: data.id });
  return data;
};

const runWatchOnce = async (client: SupabaseClientLike, payload: JsonObject) => {
  const { data: releaseSnapshot, error: releaseError } = await client
    .from("release_health_snapshots")
    .select("platform,app_version,native_build,bundle_identifier,runtime_version,channel,update_id,distribution_source,readback_complete,metadata,created_at")
    .eq("platform", "ios")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (releaseError) throw releaseError;
  const { data: attestation, error: attestationError } = await client
    .from("release_binary_attestations")
    .select("attestation_status,verified_at,source_commit,binary_sha256,app_store_connect_build_id")
    .eq("platform", "ios")
    .eq("binary_sha256", IOS_QA_RELEASE_EXPECTATION.binarySha256)
    .limit(1)
    .maybeSingle();
  if (attestationError) throw attestationError;
  const releaseMetadata = releaseSnapshot?.metadata && typeof releaseSnapshot.metadata === "object" ? releaseSnapshot.metadata as JsonObject : {};
  const observedReleaseMetadata = releaseMetadata.observedIdentity && typeof releaseMetadata.observedIdentity === "object" ? releaseMetadata.observedIdentity as JsonObject : {};
  const providerReadbackComplete = releaseSnapshot?.readback_complete === true && attestation?.attestation_status === "verified";
  const release = {
    internalBuildAvailable: providerReadbackComplete
      && releaseSnapshot?.distribution_source === "testflight_internal"
      && releaseSnapshot?.native_build === IOS_QA_RELEASE_EXPECTATION.nativeBuild,
    appVersion: providerReadbackComplete ? releaseSnapshot?.app_version : null,
    nativeBuild: providerReadbackComplete ? releaseSnapshot?.native_build : null,
    bundleIdentifier: providerReadbackComplete ? releaseSnapshot?.bundle_identifier : null,
    runtimeVersion: providerReadbackComplete ? releaseSnapshot?.runtime_version : null,
    channel: providerReadbackComplete ? releaseSnapshot?.channel : null,
    updateId: providerReadbackComplete ? releaseSnapshot?.update_id : null,
    distributionSource: providerReadbackComplete ? releaseSnapshot?.distribution_source : null,
    sourceCommit: providerReadbackComplete ? observedReleaseMetadata.sourceCommit ?? attestation?.source_commit ?? null : null,
    externalGroupCount: providerReadbackComplete ? releaseMetadata.externalGroupCount : null,
    publicSubmissionPresent: providerReadbackComplete ? releaseMetadata.publicSubmissionPresent : null,
  };
  const classification = classifyIosInstalledQaReadiness({
    providerReadbackComplete,
    release,
    clientCapabilities: IOS_QA_RELEASE_EXPECTATION.clientCapabilities,
    physicalEvidenceAvailable: false,
    availablePhysicalDeviceCount: 0,
  });
  const source = release.internalBuildAvailable ? "testflight_internal" : attestation?.binary_sha256 ? "local_fixture" : "manual_codex_proof";
  const discoveredBy = "autonomous_operator";
  const base = {
    platform: "ios",
    source,
    discovered_by: discoveredBy,
    update_id: release.updateId ?? null,
    runtime_version: release.runtimeVersion ?? null,
    channel: release.channel ?? null,
    app_version: release.appVersion ?? null,
    native_build: release.nativeBuild ?? null,
    bundle_identifier: release.bundleIdentifier ?? null,
    distribution_source: release.distributionSource ?? null,
    data_source: "latest_release_operator_snapshot+compiled_ios_qa_contract",
    readback_complete: providerReadbackComplete,
    metadata: {
      watchOnce: true,
      scheduler: payload.scheduler ?? "manual_cli",
      operatorId: payload.operator_id ?? SYSTEM_ID,
      source,
      discoveredBy,
      releaseSnapshotCreatedAt: releaseSnapshot?.created_at ?? null,
      binaryAttestationVerified: attestation?.attestation_status === "verified",
      clientCapabilities: IOS_QA_RELEASE_EXPECTATION.clientCapabilities,
      physicalProofClaimed: false,
      blockers: classification.blockers,
    },
  };
  await recordTraversalRun(client, {
    ...base,
    run_label: "ios_installed_product_qa_readiness_watch_once",
    result: classification.readinessState,
    blocked_count: classification.blockers.length,
    two_device_required_count: classification.blockers.includes("ios_second_device_required") ? 1 : 0,
    device_count: 0,
    blocker_classification: classification.blockers[0] ?? "ios_physical_proof_required",
  });
  await recordDeviceAvailability(client, {
    ...base,
    device_requirement: "Signed iOS physical proof and two-device realtime proof",
    available_device_count: 0,
    required_device_count: 2,
    play_installed_device_available: false,
    device_lab_configured: false,
    testflight_internal_build_available: release.internalBuildAvailable,
    signed_ios_build_available: Boolean(attestation?.binary_sha256) && attestation?.attestation_status !== "revoked",
    ios_physical_device_count: 0,
    ios_second_device_available: false,
    ios_simulator_available: false,
    physical_proof_available: false,
    universal_link_proof_available: false,
    apns_proof_available: false,
    voip_proof_available: false,
    storekit_proof_available: false,
    result: "second_device_required",
    blocker_classification: "ios_second_device_required",
    next_safe_action: "Keep APNs, PushKit, CallKit, StoreKit, camera, and two-device LiveKit as physical proof requirements; do not synthesize a pass.",
  });
  const activeFindingKeys: string[] = [];
  for (const blocker of classification.blockers) {
    const { data: findingKey, error } = await client.rpc("record_autonomous_finding", {
      p_system_id: SYSTEM_ID, p_platform: "ios", p_finding_type: blocker,
      p_target_surface: "ios_build_readiness", p_provider: "app_store_connect+eas",
      p_severity: blocker.includes("mismatch") || blocker.includes("unavailable") ? "warning" : "review",
      p_metadata: { readback_complete: providerReadbackComplete, physical_proof_claimed: false },
    });
    if (error) throw error;
    if (typeof findingKey === "string") activeFindingKeys.push(findingKey);
  }
  const { error: resolveError } = await client.rpc("resolve_autonomous_findings", { p_system_id: SYSTEM_ID, p_platform: "ios", p_active_finding_keys: activeFindingKeys });
  if (resolveError) throw resolveError;
  await insertEvent(client, "watch_once", "installed_qa_gaps_recorded", {
    ...base,
    blocker_classification: classification.blockers[0] ?? "ios_physical_proof_required",
  });
  return {
    readbackComplete: providerReadbackComplete,
    platform: "ios",
    source: "latest_release_operator_snapshot+compiled_ios_qa_contract",
    dataWindow: { start: releaseSnapshot?.created_at ?? null, end: new Date().toISOString() },
    readinessState: classification.readinessState,
    blockers: sanitizeAutonomousReadback(classification.blockers),
    sourceReady: classification.sourceReady,
    fakePhysicalProof: false,
    moneyMoved: false,
    userRightsChanged: false,
    highRiskExecuted: false,
  };
};

const runAndroidWatchOnce = async (client: SupabaseClientLike, payload: JsonObject) => {
  const { data: release, error } = await client.from("release_health_snapshots")
    .select("app_version,native_build,bundle_identifier,runtime_version,channel,update_id,distribution_source,readback_complete,created_at")
    .eq("platform", "android").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  const complete = release?.readback_complete === true;
  const base = {
    platform: "android", source: "play_installed", discovered_by: "autonomous_operator",
    update_id: complete ? release?.update_id ?? null : null,
    runtime_version: complete ? release?.runtime_version ?? null : null,
    channel: complete ? release?.channel ?? null : null,
    app_version: complete ? release?.app_version ?? null : null,
    native_build: complete ? release?.native_build ?? null : null,
    bundle_identifier: complete ? release?.bundle_identifier ?? null : null,
    distribution_source: complete ? release?.distribution_source ?? null : null,
    data_source: "android_release_snapshot+independent_firebase_test_lab_state", readback_complete: complete,
    metadata: { firebaseTestLabRequiredForIos: false, scheduler: payload.scheduler ?? "manual_cli", physicalProofClaimed: false },
  };
  await insertEvent(client, "watch_once", complete ? "android_provider_readiness_recorded" : "android_provider_readback_blocked", base);
  const activeKeys: string[] = [];
  if (!complete) {
    const { data, error: findingError } = await client.rpc("record_autonomous_finding", {
      p_system_id: SYSTEM_ID, p_platform: "android", p_finding_type: "android_provider_readback_blocked",
      p_target_surface: "android_installed_readiness", p_provider: "eas+google_play",
      p_severity: "review", p_metadata: { readback_complete: false, firebase_test_lab_independent: true },
    });
    if (findingError) throw findingError;
    if (typeof data === "string") activeKeys.push(data);
  } else {
    const { error: resolveError } = await client.rpc("resolve_autonomous_findings", { p_system_id: SYSTEM_ID, p_platform: "android", p_active_finding_keys: activeKeys });
    if (resolveError) throw resolveError;
  }
  return { readbackComplete: complete, platform: "android", source: "android_release_snapshot+independent_firebase_test_lab_state", dataWindow: { start: release?.created_at ?? null, end: new Date().toISOString() }, readinessState: complete ? "provider_ready" : "provider_readback_blocked", blockers: complete ? [] : ["android_provider_readback_blocked"], fakePhysicalProof: false, moneyMoved: false, userRightsChanged: false, highRiskExecuted: false };
};

const readReport = async (client: SupabaseClientLike) => {
  const selectLatest = async (table: string) => {
    const { data, error } = await client.from(table).select("*").eq("system_id", SYSTEM_ID).order("created_at", { ascending: false }).limit(5);
    if (error) throw error;
    return sanitize(data ?? []);
  };
  return {
    latestEvents: await selectLatest("installed_qa_operator_events"),
    latestRouteFindings: await selectLatest("route_behavior_findings"),
    latestRoleFindings: await selectLatest("role_behavior_findings"),
    latestAccountFindings: await selectLatest("account_fixture_health_findings"),
    latestDeviceFindings: await selectLatest("device_availability_findings"),
    latestReviewFlags: await selectLatest("qa_required_review_flags"),
  };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS, status: 204 });
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  if (!(await authenticate(request))) return jsonResponse(401, { error: "installed_qa_operator_token_required" });

  let payload: JsonObject;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const action = toText(payload.action || "health_snapshot");
  const allowedActions = [
    "health_snapshot",
    "record_traversal_run",
    "record_route_finding",
    "record_role_finding",
    "record_account_fixture_health",
    "record_device_availability",
    "record_manual_codex_gap",
    "create_owner_command",
    "create_approval_request",
    "watch_once",
    "status",
    "report",
  ];
  if (!allowedActions.includes(action)) {
    return jsonResponse(422, { error: "unsupported_action", action, approvalRequired: true, moneyMoved: false, userRightsChanged: false });
  }

  try {
    assertSafePayload(payload);
    const client = createAdminClient();

    let details: JsonObject = {};
    if (action === "report") {
      details = await readReport(client) as JsonObject;
    } else if (action === "record_traversal_run") {
      await recordTraversalRun(client, payload);
    } else if (action === "record_route_finding") {
      await recordRouteFinding(client, payload);
    } else if (action === "record_role_finding") {
      await recordRoleFinding(client, payload);
    } else if (action === "record_account_fixture_health") {
      await recordAccountFixtureHealth(client, payload);
    } else if (action === "record_device_availability") {
      await recordDeviceAvailability(client, payload);
    } else if (action === "record_manual_codex_gap") {
      await recordManualCodexGap(client, payload);
    } else if (action === "create_owner_command") {
      details = { ownerCommand: await createOwnerCommand(client, payload) };
    } else if (action === "create_approval_request") {
      details = { approvalRequest: await createApprovalRequest(client, payload) };
    } else if (action === "watch_once") {
      details = payload.platform === "android"
        ? await runAndroidWatchOnce(client, payload) as JsonObject
        : await runWatchOnce(client, payload) as JsonObject;
    } else {
      await insertEvent(client, action, action === "status" ? "status_recorded" : "health_snapshot_recorded", payload);
    }

    return jsonResponse(200, {
      ok: true,
      systemId: SYSTEM_ID,
      action,
      result: action === "watch_once" ? "installed_qa_gaps_recorded" : action === "report" ? "report_read" : "safe_write_recorded",
      ...details,
      highRiskExecuted: false,
      moneyMoved: false,
      userRightsChanged: false,
      fakeProof: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return jsonResponse(500, {
      error: "installed_qa_operator_action_failed",
      message,
      systemId: SYSTEM_ID,
      highRiskExecuted: false,
      moneyMoved: false,
      userRightsChanged: false,
      fakeProof: false,
    });
  }
});
