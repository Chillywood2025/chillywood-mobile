import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { supabase } from "./supabase";

export type OwnerControlPermissionTemplate = {
  key: string;
  label: string;
  permissions: string[];
};

export type OwnerSecurityNetworkProof = {
  asnOrIsp?: string | null;
  captureStatus?: string | null;
  cityApprox?: string | null;
  contextIdShort?: string | null;
  country?: string | null;
  createdAt?: string | null;
  deviceHashShort?: string | null;
  ipHashShort?: string | null;
  maskedIp?: string | null;
  networkProofError?: string | null;
  networkProofSource?: string | null;
  networkProofTimestamp?: string | null;
  networkProofVerified?: boolean | null;
  networkProofVersion?: string | null;
  proofSource?: string | null;
  region?: string | null;
  requestId?: string | null;
  sessionIdHashShort?: string | null;
  source?: string | null;
  trustedHeaderSource?: string | null;
  userAgentHashShort?: string | null;
};

export type OwnerControlAuditRow = {
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  actorUserId: string | null;
  breakGlassActive: boolean;
  dryRun: boolean;
  id: string;
  metadata: Record<string, unknown>;
  occurredAt: string | null;
  permissionKey: string | null;
  reason: string | null;
  securityContext?: OwnerSecurityNetworkProof | null;
  securityContextId?: string | null;
  securityContextIdShort?: string | null;
  securityContextStatus?: string | null;
  source: string;
  summary: string;
  targetId: string | null;
  targetType: string;
};

export type OwnerControlBreakGlassSession = Record<string, unknown> & {
  id?: string;
  status?: string;
  reason?: string;
  expires_at?: string | null;
};

export type FirstOwnerAuthorityStatus = Record<string, unknown> & {
  activeOwnerCount?: number;
  actorIsFirstOwner?: boolean;
  actorIsOwner?: boolean;
  breakGlassFirstOwnerOnly?: boolean;
  controlsEnabled?: boolean;
  firstOwnerMarkerExists?: boolean;
  status?: "enabled" | "blocked_pending_first_owner_seed" | string;
};

export type FirstOwnerRow = {
  emailMasked?: string | null;
  grantedAt?: string | null;
  id?: string | null;
  isActive?: boolean;
  revokedAt?: string | null;
  status?: string | null;
  userIdShort?: string | null;
};

export type FirstOwnerStepDownChallenge = Record<string, unknown> & {
  challengeId?: string;
  expiresAt?: string;
  passcodeSalt?: string;
  successorOwnerMembershipId?: string;
  targetOwnerMembershipId?: string;
  typedConfirmationRequired?: string;
};

export type OwnerControlLegalRequest = Record<string, unknown> & {
  id?: string;
  request_type?: string | null;
  requesting_agency?: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  case_number?: string | null;
  request_reason?: string | null;
  target_user_id?: string | null;
  target_content_id?: string | null;
  target_thread_id?: string | null;
  target_room_id?: string | null;
  target_report_id?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  status?: string;
  due_at?: string | null;
  notes?: string | null;
  reviewed_summary?: string | null;
  exported_summary?: string | null;
  legal_hold_status?: string | null;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
};

export type OwnerControlLegalRequestEvent = Record<string, unknown> & {
  id?: string;
  legal_request_id?: string;
  event_type?: string;
  actor_email?: string | null;
  actor_role?: string | null;
  message?: string | null;
  reason?: string | null;
  created_at?: string;
};

export type OwnerControlHistoryPage = { nextCursor: string | null; hasMore: boolean };
export type OwnerControlLegalHistoryKind = "events" | "evidenceRequests" | "holds";
export type OwnerControlLegalRequestDetail = {
  events: OwnerControlLegalRequestEvent[];
  evidenceRequests: Record<string, unknown>[];
  holds: Record<string, unknown>[];
  request: OwnerControlLegalRequest | null;
  historyPages: Record<OwnerControlLegalHistoryKind, OwnerControlHistoryPage | null>;
};

export type OwnerControlCanaryResult = {
  actor?: string | null;
  actual?: string | null;
  cleanupStatus?: string | null;
  details?: Record<string, unknown>;
  expected?: string | null;
  key: string;
  label: string;
  metadata?: Record<string, unknown>;
  message: string;
  section?: string | null;
  status: "pass" | "fail" | "manual_required" | "unknown";
  testedAt?: string | null;
  testedSurface?: string | null;
};

export type OwnerControlCanaryRun = Record<string, unknown> & {
  id?: string;
  created_at?: string;
  results?: OwnerControlCanaryResult[];
  status?: string;
  summary?: Record<string, unknown>;
};

export type OwnerControlSecurityStatus = {
  activeBreakGlassCount?: number | null;
  activeTemporaryGrantsCount?: number | null;
  auditEvents?: OwnerSecurityAuditEvent[];
  checklist?: OwnerSecurityChecklistItem[];
  currentDevice?: OwnerSecurityDevice | null;
  devices?: OwnerSecurityDevice[];
  emergencyOwnerToolLock?: Record<string, unknown>;
  forceLogoutAllOwnerSessions?: Record<string, unknown>;
  liveOpsFlags?: OwnerSecurityLiveOpsFlag[];
  overview?: OwnerSecurityOverview;
  ownerCliChecklist?: string[];
  ownerSessions?: Record<string, unknown>;
  proofGrantCount?: number | null;
  proofRoleCount?: number | null;
  realLiveOpsFlags?: Record<string, unknown>;
  sourceStates?: Record<string, OwnerSecuritySourceState>;
  temporaryGrants?: OwnerTemporaryGrant[];
  warningChecklistCount?: number | null;
};

export type OwnerSecurityOverview = {
  activeTemporaryGrantsCount?: number | null;
  currentDeviceStatus?: string | null;
  emergencyActionsStatus?: string | null;
  lastSecurityRefreshAt?: string | null;
  openSecurityAlertsCount?: number | null;
  ownerAccessStatus?: string | null;
  recentHighRiskActionsCount?: number | null;
  securityBackendStatus?: string | null;
};

export type OwnerSecurityDevice = {
  appVersion?: string | null;
  buildVersion?: string | null;
  createdAt?: string | null;
  deviceHashShort?: string | null;
  deviceLabel?: string | null;
  id?: string | null;
  isCurrentDevice?: boolean;
  lastSeenAt?: string | null;
  networkProof?: OwnerSecurityNetworkProof | null;
  platform?: string | null;
  proofSource?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
  revokedReason?: string | null;
  trustedAt?: string | null;
  trustedBy?: string | null;
  trustStatus?: string | null;
};

export type OwnerTemporaryGrant = {
  createdAt?: string | null;
  createdBy?: string | null;
  expiresAt?: string | null;
  grantType?: string | null;
  id?: string | null;
  isProofGrant?: boolean;
  proofSource?: string | null;
  reason?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
  state?: string | null;
  targetEmail?: string | null;
  targetUserId?: string | null;
};

export type OwnerSecurityAuditEvent = {
  actor?: string | null;
  actorRole?: string | null;
  createdAt?: string | null;
  eventType?: string | null;
  id?: string | null;
  metadata?: Record<string, unknown>;
  reason?: string | null;
  severity?: "low" | "medium" | "high" | "critical" | string;
  source?: string | null;
  summary?: string | null;
  target?: string | null;
  targetType?: string | null;
};

export type OwnerSecurityLiveOpsFlag = {
  details?: Record<string, unknown>;
  key?: string | null;
  lastCheckedAt?: string | null;
  meaning?: string | null;
  recommendedAction?: string | null;
  status?: "healthy" | "warning" | "urgent" | "manual" | string;
  title?: string | null;
};

export type OwnerSecurityChecklistItem = {
  actionLabel?: string | null;
  key?: string | null;
  lastCheckedAt?: string | null;
  proofSource?: string | null;
  status?: "passed" | "warning" | "failed" | "manual" | "not_connected" | string;
  title?: string | null;
  whatItMeans?: string | null;
};

export type OwnerSecuritySourceState = {
  checkedAt?: string | null;
  error?: string | null;
  message?: string | null;
  proofSource?: string | null;
  rowCount?: number | null;
  status?: "connected" | "empty" | "partial" | "not_connected" | "malformed" | string;
};

export type OwnerControlSafetyDashboard = {
  activeLegalHolds?: number | null;
  openReports?: number | null;
  repeatedReportTargets?: Record<string, unknown>;
  unresolvedLegalRequests?: number | null;
};

const toObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const toArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)) as Record<string, unknown>[] : [];

const isReceiptRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)
  && (!Object.hasOwn(value, "error") || (value as Record<string, unknown>).error == null)
  && (!Object.hasOwn(value, "ok") || (value as Record<string, unknown>).ok === true)
  && (!Object.hasOwn(value, "success") || (value as Record<string, unknown>).success === true);

const hasReceiptId = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isReceiptCount = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const isReceiptDate = (value: unknown) => hasReceiptId(value) && Number.isFinite(Date.parse(value));
const matchesReceiptId = (value: unknown, expected: unknown) =>
  hasReceiptId(value) && hasReceiptId(expected) && value === expected.trim();

const ownerControlOutcomeUnverified = () => Object.assign(
  new Error("The backend did not verify this action's outcome. Refresh the affected data before deciding whether to retry."),
  { code: "owner_control_outcome_unverified" },
);

const LEGAL_RECEIPT_STATUSES = new Set([
  "received", "needs_more_info", "under_review", "preserved_legal_hold",
  "evidence_prepared", "exported", "closed", "rejected_no_action",
]);

const normalizedLegalReceiptStatus = (value: unknown) => {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  const aliases: Record<string, string> = { open: "received", reviewing: "under_review", fulfilled: "exported", rejected: "rejected_no_action" };
  const normalized = aliases[status] ?? status;
  return LEGAL_RECEIPT_STATUSES.has(normalized) ? normalized : null;
};

// A successful transport is not evidence that a mutation succeeded. These contracts
// follow each endpoint's actual receipt, including endpoints without a top-level ok.
const hasOwnerControlMutationReceipt = (action: string, value: unknown, input: Record<string, unknown>): boolean => {
  if (!isReceiptRecord(value)) return false;
  switch (action) {
    case "first_owner_grant_owner":
    case "first_owner_revoke_owner": {
      const result = value.result;
      return isReceiptRecord(result) && result.ok === true && hasReceiptId(result.membershipId)
        && (result.targetUserId === undefined || hasReceiptId(result.targetUserId))
        && result.role === "owner" && result.status === (action === "first_owner_grant_owner" ? "active" : "revoked");
    }
    case "first_owner_complete_step_down": {
      const result = value.result;
      return isReceiptRecord(result) && result.ok === true && hasReceiptId(result.newFirstOwnerMarkerId)
        && matchesReceiptId(result.successorMembershipId, input.successorOwnerMembershipId)
        && result.previousOwnerStatus === "revoked";
    }
    case "first_owner_start_step_down": {
      const challenge = value.challenge;
      return isReceiptRecord(challenge) && challenge.ok === true && hasReceiptId(challenge.challengeId)
        && isReceiptDate(challenge.expiresAt) && hasReceiptId(challenge.passcodeSalt)
        && hasReceiptId(challenge.successorOwnerMembershipId) && hasReceiptId(challenge.targetOwnerMembershipId)
        && challenge.successorOwnerMembershipId !== challenge.targetOwnerMembershipId
        && challenge.typedConfirmationRequired === "STEP DOWN FIRST OWNER"
        && typeof value.passcode === "string" && /^\d{6}$/.test(value.passcode)
        && value.passcodePlaintextStored === false;
    }
    case "template_apply": {
      const template = value.template;
      if (value.ok !== true || !isReceiptRecord(template) || !hasReceiptId(template.key)
        || template.key !== String(input.templateKey ?? "").trim().toLowerCase()
        || !Array.isArray(template.permissions) || !template.permissions.length
        || !template.permissions.every(hasReceiptId) || new Set(template.permissions).size !== template.permissions.length
        || !Array.isArray(value.permissions) || value.permissions.length !== template.permissions.length) return false;
      const permissions = value.permissions;
      const expectedPermissions = template.permissions;
      return permissions.every((row) => isReceiptRecord(row) && hasReceiptId(row.id)
        && hasReceiptId(row.target_user_id) && row.status === "active"
        && hasReceiptId(row.permission_key) && expectedPermissions.includes(row.permission_key))
        && new Set(permissions.map((row) => row.permission_key)).size === permissions.length
        && new Set(permissions.map((row) => row.target_user_id)).size === 1;
    }
    case "template_revoke":
      return value.ok === true && Array.isArray(value.revoked)
        && value.revoked.every((row) => isReceiptRecord(row) && hasReceiptId(row.id)
          && hasReceiptId(row.target_user_id) && hasReceiptId(row.permission_key) && row.status === "revoked");
    case "break_glass_activate":
    case "break_glass_end": {
      const session = value.session;
      return value.ok === true && isReceiptRecord(session) && hasReceiptId(session.id)
        && session.status === (action === "break_glass_activate" ? "active" : "ended")
        && (action !== "break_glass_activate" || isReceiptDate(session.expires_at))
        && (!input.sessionId || matchesReceiptId(session.id, input.sessionId));
    }
    case "legal_request_create":
    case "legal_request_update": {
      const request = value.request;
      const expectedStatus = normalizedLegalReceiptStatus(input.status);
      return value.ok === true && isReceiptRecord(request) && hasReceiptId(request.id)
        && typeof request.status === "string" && LEGAL_RECEIPT_STATUSES.has(request.status)
        && (!expectedStatus || request.status === expectedStatus)
        && (action !== "legal_request_create" || expectedStatus !== null || request.status === "received")
        && (action !== "legal_request_update" || matchesReceiptId(request.id, input.id ?? input.requestId ?? input.request_id));
    }
    case "trust_current_owner_device":
    case "revoke_owner_device": {
      const device = value.device;
      return value.ok === true && isReceiptRecord(device) && hasReceiptId(device.id)
        && (action === "trust_current_owner_device"
          ? device.trustStatus === "trusted" && isReceiptDate(device.trustedAt) && device.revokedAt == null
          : device.trustStatus === "revoked" && isReceiptDate(device.revokedAt) && matchesReceiptId(device.id, input.deviceId));
    }
    case "revoke_temporary_owner_grant": {
      const grant = value.grant;
      return value.ok === true && isReceiptRecord(grant) && matchesReceiptId(grant.id, input.grantId)
        && grant.state === "revoked" && isReceiptDate(grant.revokedAt);
    }
    case "revoke_all_temporary_owner_grants":
      return value.ok === true && isReceiptCount(value.revokedCount);
    case "canary_run": {
      const run = value.run;
      const summary = value.summary;
      if (!isReceiptRecord(run) || !hasReceiptId(run.id) || !isReceiptRecord(summary)
        || ![summary.passCount, summary.failCount, summary.manualRequiredCount].every(isReceiptCount)
        || !Array.isArray(run.results) || !run.results.length) return false;
      const keys = new Set<string>();
      let passCount = 0;
      let failCount = 0;
      let manualRequiredCount = 0;
      for (const row of run.results) {
        if (!isReceiptRecord(row) || !hasReceiptId(row.key) || !hasReceiptId(row.label) || !hasReceiptId(row.message)
          || !["pass", "fail", "manual_required", "unknown"].includes(row.status as string)
          || keys.has(row.key.trim())) return false;
        keys.add(row.key.trim());
        if (row.status === "pass") passCount += 1;
        else if (row.status === "fail") failCount += 1;
        else manualRequiredCount += 1;
      }
      // The UI also reads aliases in run.summary. Check those against the same
      // individual evidence so a contradictory embedded summary cannot look green.
      const matchesSummary = (candidate: unknown) => isReceiptRecord(candidate)
        && candidate.passCount === passCount && candidate.failCount === failCount
        && candidate.manualRequiredCount === manualRequiredCount
        && Object.entries({ pass: passCount, passed: passCount, fail: failCount, failed: failCount,
          manualRequired: manualRequiredCount, manual_required: manualRequiredCount,
          unknown: manualRequiredCount, unknownCount: manualRequiredCount,
        }).every(([key, count]) => candidate[key] === undefined || candidate[key] === count);
      const expectedStatus = failCount > 0 ? "failed" : manualRequiredCount > 0 ? "partial" : "completed";
      return run.status === expectedStatus && matchesSummary(summary)
        && (run.summary === undefined || matchesSummary(run.summary));
    }
    default:
      return false;
  }
};

const OWNER_CONTROL_MUTATIONS = new Set([
  "first_owner_grant_owner", "first_owner_revoke_owner", "first_owner_start_step_down", "first_owner_complete_step_down",
  "template_apply", "template_revoke", "break_glass_activate", "break_glass_end",
  "legal_request_create", "legal_request_update", "trust_current_owner_device", "revoke_owner_device",
  "revoke_temporary_owner_grant", "revoke_all_temporary_owner_grants", "canary_run",
]);

async function requestOwnerControls(action: string, body: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("admin-owner-controls", {
    body: { ...body, action },
  });
  if (error) {
    // Preserve the backend's unverified-outcome code through FunctionsHttpError.
    // Reading the error response never retries the mutation.
    const context = error.context;
    if (OWNER_CONTROL_MUTATIONS.has(action) && context && typeof context.clone === "function") {
      let payload: unknown;
      try { payload = await context.clone().json(); } catch { /* Keep the original invocation error. */ }
      if (payload && typeof payload === "object" && "error" in payload && payload.error === "owner_control_outcome_unverified") {
        throw ownerControlOutcomeUnverified();
      }
    }
    throw error;
  }
  if (OWNER_CONTROL_MUTATIONS.has(action) && !hasOwnerControlMutationReceipt(action, data, body)) {
    throw ownerControlOutcomeUnverified();
  }
  return toObject(data);
}

export function getOwnerSecurityDeviceContext() {
  const expoConfig = Constants.expoConfig as { version?: string | null } | null;
  const appVersion = Application.nativeApplicationVersion ?? expoConfig?.version ?? null;
  const buildVersion = Application.nativeBuildVersion ?? null;
  const platform = Platform.OS;
  const deviceName = Device.deviceName ?? null;
  const modelName = Device.modelName ?? Device.modelId ?? null;
  const osName = Device.osName ?? platform;
  const osVersion = Device.osVersion ?? null;
  const deviceLabel = [deviceName, modelName, osName].filter(Boolean).join(" / ") || `${platform} device`;
  return {
    appVersion,
    buildVersion,
    deviceLabel,
    deviceName,
    modelName,
    osName,
    osVersion,
    platform,
  };
}

export async function listOwnerControlAudit(input: Record<string, unknown> = {}) {
  const payload = await requestOwnerControls("audit_list", input);
  const page = readHistoryPageReceipt(payload);
  if (!Array.isArray(payload.rows) || !["complete", "more_history"].includes(String(payload.completeness))
    || (payload.completeness === "complete") !== !page.hasMore) throw new Error("Audit history completeness is unavailable. Refresh after the backend is updated.");
  return {
    rows: toArray(payload.rows) as OwnerControlAuditRow[],
    summary: toObject(payload.summary),
    ...page,
    completeness: payload.completeness as "complete" | "more_history",
  };
}

export async function listPermissionTemplates() {
  const payload = await requestOwnerControls("template_list");
  return toArray(payload.templates) as OwnerControlPermissionTemplate[];
}

export async function applyPermissionTemplate(input: {
  duration?: string | null;
  reason?: string | null;
  targetEmail: string;
  templateKey: string;
}) {
  return requestOwnerControls("template_apply", input);
}

export async function revokePermissionTemplate(input: {
  reason?: string | null;
  targetEmail: string;
  templateKey: string;
}) {
  return requestOwnerControls("template_revoke", input);
}

export async function readFirstOwnerAuthorityStatus() {
  const payload = await requestOwnerControls("first_owner_status");
  return {
    owners: toArray(payload.owners) as FirstOwnerRow[],
    status: toObject(payload.status) as FirstOwnerAuthorityStatus,
  };
}

export async function firstOwnerGrantOwner(input: { reason: string; targetEmail: string }) {
  return requestOwnerControls("first_owner_grant_owner", input);
}

export async function firstOwnerRevokeOwner(input: { reason: string; targetEmail: string }) {
  return requestOwnerControls("first_owner_revoke_owner", input);
}

export async function firstOwnerStartStepDown(input: {
  password: string;
  reason: string;
  successorEmail: string;
}) {
  const payload = await requestOwnerControls("first_owner_start_step_down", input);
  return {
    challenge: toObject(payload.challenge) as FirstOwnerStepDownChallenge,
    passcode: typeof payload.passcode === "string" ? payload.passcode : "",
    passcodePlaintextStored: payload.passcodePlaintextStored === true,
  };
}

export async function firstOwnerCompleteStepDown(input: {
  challengeId: string;
  passcode: string;
  passcodeSalt: string;
  reason: string;
  successorOwnerMembershipId: string;
  targetOwnerMembershipId: string;
  typedConfirmation: string;
}) {
  return requestOwnerControls("first_owner_complete_step_down", input);
}

export async function readBreakGlassStatus() {
  const payload = await requestOwnerControls("break_glass_status");
  return {
    activeSessionId: typeof payload.activeSessionId === "string" ? payload.activeSessionId : null,
    sessions: toArray(payload.sessions) as OwnerControlBreakGlassSession[],
  };
}

export async function activateBreakGlass(input: {
  caseId?: string | null;
  duration?: string | null;
  reason: string;
  reportId?: string | null;
}) {
  return requestOwnerControls("break_glass_activate", input);
}

export async function endBreakGlass(input: { reason?: string | null; sessionId?: string | null } = {}) {
  return requestOwnerControls("break_glass_end", input);
}

const readHistoryPageReceipt = (value: Record<string, unknown>): OwnerControlHistoryPage => {
  if (value.error != null || value.ok === false || value.success === false || typeof value.hasMore !== "boolean" || (value.hasMore
    ? typeof value.nextCursor !== "string" || !value.nextCursor.trim()
    : value.nextCursor !== null)) throw new Error("History pagination is unavailable. Refresh after the backend is updated.");
  return { hasMore: value.hasMore, nextCursor: value.nextCursor as string | null };
};

export async function listLegalRequestsPage(input: Record<string, unknown> = {}) {
  const payload = await requestOwnerControls("legal_request_list", input);
  if (!Array.isArray(payload.requests)) throw new Error("Legal request history is unavailable.");
  return { items: payload.requests as OwnerControlLegalRequest[], ...readHistoryPageReceipt(payload) };
}

export async function listLegalRequests(input: Record<string, unknown> = {}) {
  return (await listLegalRequestsPage(input)).items;
}

export async function readLegalRequestDetail(input: { id: string; historyKind?: OwnerControlLegalHistoryKind; cursor?: string | null; limit?: number }) {
  const payload = await requestOwnerControls("legal_request_detail", input);
  if (payload.error != null || payload.ok === false || payload.success === false
    || toObject(payload.request).id !== input.id) throw new Error("Legal request detail did not match the selected request.");
  const pages = toObject(payload.historyPages);
  const historyPages = Object.fromEntries((["events", "evidenceRequests", "holds"] as const).map((kind) => {
    if (input.historyKind && input.historyKind !== kind) return [kind, null];
    if (!Array.isArray(payload[kind])) throw new Error("Legal request detail history is unavailable.");
    return [kind, readHistoryPageReceipt(toObject(pages[kind]))];
  })) as OwnerControlLegalRequestDetail["historyPages"];
  return {
    events: toArray(payload.events) as OwnerControlLegalRequestEvent[],
    evidenceRequests: toArray(payload.evidenceRequests),
    holds: toArray(payload.holds),
    request: toObject(payload.request) as OwnerControlLegalRequest,
    historyPages,
  } satisfies OwnerControlLegalRequestDetail;
}

export async function createLegalRequest(input: Record<string, unknown>) {
  return requestOwnerControls("legal_request_create", input);
}

export async function updateLegalRequest(input: Record<string, unknown>) {
  return requestOwnerControls("legal_request_update", input);
}

export async function readOwnerSecurityStatus() {
  const payload = await requestOwnerControls("security_status", {
    deviceContext: getOwnerSecurityDeviceContext(),
  });
  return {
    safetyDashboard: toObject(payload.safetyDashboard) as OwnerControlSafetyDashboard,
    security: toObject(payload.security) as OwnerControlSecurityStatus,
  };
}

export async function trustCurrentOwnerDevice() {
  return requestOwnerControls("trust_current_owner_device", {
    deviceContext: getOwnerSecurityDeviceContext(),
  });
}

export async function revokeOwnerDevice(input: {
  confirmation: string;
  deviceId: string;
  reason: string;
}) {
  return requestOwnerControls("revoke_owner_device", {
    confirmation: input.confirmation,
    deviceContext: getOwnerSecurityDeviceContext(),
    deviceId: input.deviceId,
    reason: input.reason,
  });
}

export async function revokeTemporaryOwnerGrant(input: {
  confirmation: string;
  grantId: string;
  reason: string;
}) {
  return requestOwnerControls("revoke_temporary_owner_grant", {
    confirmation: input.confirmation,
    deviceContext: getOwnerSecurityDeviceContext(),
    grantId: input.grantId,
    reason: input.reason,
  });
}

export async function revokeAllTemporaryOwnerGrants(input: {
  confirmation: string;
  reason: string;
}) {
  return requestOwnerControls("revoke_all_temporary_owner_grants", {
    confirmation: input.confirmation,
    deviceContext: getOwnerSecurityDeviceContext(),
    reason: input.reason,
  });
}

export async function listOwnerSecurityAuditEvents(filter = "all") {
  const payload = await requestOwnerControls("list_security_audit_events", { filter });
  return toArray(payload.events) as OwnerSecurityAuditEvent[];
}

export async function runOwnerSecurityChecklist() {
  const payload = await requestOwnerControls("run_owner_security_checklist");
  return toArray(payload.checklist) as OwnerSecurityChecklistItem[];
}

export async function runOwnerControlCanary() {
  const payload = await requestOwnerControls("canary_run");
  return toObject(payload.run) as OwnerControlCanaryRun;
}

export async function listOwnerControlCanaries() {
  const payload = await requestOwnerControls("canary_list");
  return toArray(payload.runs) as OwnerControlCanaryRun[];
}
