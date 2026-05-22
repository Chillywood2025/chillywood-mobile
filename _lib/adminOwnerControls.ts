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

export type OwnerControlLegalRequestDetail = {
  events: OwnerControlLegalRequestEvent[];
  evidenceRequests: Record<string, unknown>[];
  holds: Record<string, unknown>[];
  request: OwnerControlLegalRequest | null;
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
  temporaryGrants?: OwnerTemporaryGrant[];
  warningChecklistCount?: number | null;
};

export type OwnerSecurityOverview = {
  activeTemporaryGrantsCount?: number | null;
  currentDeviceStatus?: string | null;
  lastSecurityRefreshAt?: string | null;
  openSecurityAlertsCount?: number | null;
  ownerAccessStatus?: string | null;
  recentHighRiskActionsCount?: number | null;
};

export type OwnerSecurityDevice = {
  appVersion?: string | null;
  buildVersion?: string | null;
  createdAt?: string | null;
  deviceLabel?: string | null;
  id?: string | null;
  isCurrentDevice?: boolean;
  lastSeenAt?: string | null;
  platform?: string | null;
  revokedAt?: string | null;
  trustedAt?: string | null;
  trustStatus?: string | null;
};

export type OwnerTemporaryGrant = {
  createdAt?: string | null;
  createdBy?: string | null;
  expiresAt?: string | null;
  grantType?: string | null;
  id?: string | null;
  isProofGrant?: boolean;
  reason?: string | null;
  revokedAt?: string | null;
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
  status?: "passed" | "warning" | "failed" | "manual" | string;
  title?: string | null;
  whatItMeans?: string | null;
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

async function requestOwnerControls(action: string, body: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("admin-owner-controls", {
    body: { ...body, action },
  });
  if (error) throw error;
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
  return {
    rows: toArray(payload.rows) as OwnerControlAuditRow[],
    summary: toObject(payload.summary),
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

export async function listLegalRequests(input: Record<string, unknown> = {}) {
  const payload = await requestOwnerControls("legal_request_list", input);
  return toArray(payload.requests) as OwnerControlLegalRequest[];
}

export async function readLegalRequestDetail(input: { id: string }) {
  const payload = await requestOwnerControls("legal_request_detail", input);
  return {
    events: toArray(payload.events) as OwnerControlLegalRequestEvent[],
    evidenceRequests: toArray(payload.evidenceRequests),
    holds: toArray(payload.holds),
    request: toObject(payload.request) as OwnerControlLegalRequest,
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

export async function revokeOwnerDevice(deviceId: string) {
  return requestOwnerControls("revoke_owner_device", { deviceId });
}

export async function revokeTemporaryOwnerGrant(grantId: string) {
  return requestOwnerControls("revoke_temporary_owner_grant", { grantId });
}

export async function revokeAllTemporaryOwnerGrants(confirmation: string) {
  return requestOwnerControls("revoke_all_temporary_owner_grants", { confirmation });
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
