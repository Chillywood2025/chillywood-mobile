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
  requesting_agency?: string;
  case_number?: string | null;
  status?: string;
  created_at?: string;
};

export type OwnerControlCanaryResult = {
  key: string;
  label: string;
  status: "pass" | "fail" | "unknown";
  message: string;
  metadata?: Record<string, unknown>;
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
  emergencyOwnerToolLock?: Record<string, unknown>;
  forceLogoutAllOwnerSessions?: Record<string, unknown>;
  ownerCliChecklist?: string[];
  ownerSessions?: Record<string, unknown>;
  proofGrantCount?: number | null;
  proofRoleCount?: number | null;
  realLiveOpsFlags?: Record<string, unknown>;
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

export async function createLegalRequest(input: Record<string, unknown>) {
  return requestOwnerControls("legal_request_create", input);
}

export async function updateLegalRequest(input: Record<string, unknown>) {
  return requestOwnerControls("legal_request_update", input);
}

export async function readOwnerSecurityStatus() {
  const payload = await requestOwnerControls("security_status");
  return {
    safetyDashboard: toObject(payload.safetyDashboard) as OwnerControlSafetyDashboard,
    security: toObject(payload.security) as OwnerControlSecurityStatus,
  };
}

export async function runOwnerControlCanary() {
  const payload = await requestOwnerControls("canary_run");
  return toObject(payload.run) as OwnerControlCanaryRun;
}

export async function listOwnerControlCanaries() {
  const payload = await requestOwnerControls("canary_list");
  return toArray(payload.runs) as OwnerControlCanaryRun[];
}
