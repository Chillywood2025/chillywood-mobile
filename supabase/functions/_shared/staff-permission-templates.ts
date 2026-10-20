import { normalizeExactSubjectId, readExactTargetStaffSubject } from "./exact-subject-authority.ts";

// Kept in lockstep with the server-side catalog by the PostgreSQL regression.
// The database selects its own keys; this catalog is never mutation authority.
export const PERMISSION_TEMPLATES: Record<string, { label: string; permissions: string[] }> = {
  creator_support: { label: "Creator Support", permissions: ["creator_support", "support_inbox", "user_lookup", "admin.support.view", "admin.user.view"] },
  evidence_exporter: { label: "Evidence Exporter", permissions: ["evidence_preview", "evidence_export", "legal_request_intake"] },
  dmca_reviewer: { label: "DMCA Reviewer", permissions: ["dmca_review", "copyright_review", "legal_review", "admin.dmca.view", "admin.dmca.manage"] },
  legal_operator: { label: "Legal Admin Workflow", permissions: ["legal_ops", "legal_request_intake", "evidence_preview", "evidence_export", "legal_hold", "legal_review", "admin.chat_evidence.view"] },
  legal_reviewer: { label: "Legal Reviewer", permissions: ["legal_review", "evidence_preview", "dmca_review", "copyright_review", "legal_request_intake", "admin.dmca.view"] },
  live_ops_operator: { label: "Live Ops Admin Workflow", permissions: ["live_ops", "admin.room.moderate", "admin.live.force_end"] },
  moderator: { label: "Moderator", permissions: ["reports_review", "content_moderation", "admin.content.hide", "admin.content.restore", "admin.comment.moderate"] },
  moderator_support: { label: "Moderator Support Workflow", permissions: ["support_inbox", "creator_support", "billing_support_read", "admin.support.view", "admin.support.manage", "admin.payment_status.view", "admin.refund_status.record", "admin.user.view"] },
  senior_moderator: { label: "Senior Moderator", permissions: ["reports_review", "content_moderation", "user_lookup", "admin.user.search", "admin.content.hide", "admin.content.restore", "admin.content.remove", "admin.comment.moderate", "admin.room.moderate"] },
  support_agent: { label: "Support Workflow", permissions: ["support_inbox", "user_lookup", "admin.support.view", "admin.user.search", "admin.user.view"] },
};

export const permissionTemplateTargetRoles = (templateKey: string): string[] =>
  ["moderator", "moderator_support", "senior_moderator"].includes(templateKey)
    ? ["operator", "moderator"]
    : ["operator"];

const outcomeUnverified = () => Object.assign(new Error(
  "The backend did not verify this action's outcome. Refresh the affected data before deciding whether to retry.",
), { code: "owner_control_outcome_unverified" });

export const readPermissionTemplateTarget = async (
  adminClient: Parameters<typeof readExactTargetStaffSubject>[0],
  email: string,
  templateKey: string,
) => {
  if (!Object.hasOwn(PERMISSION_TEMPLATES, templateKey)) return null;
  const candidates = await Promise.all(permissionTemplateTargetRoles(templateKey).map(
    (role) => readExactTargetStaffSubject(adminClient, email, role),
  ));
  const subjects = candidates.filter((subject) => subject !== null);
  if (new Set(subjects.map((subject) => subject.userId)).size !== 1) return null;
  return subjects[0] ?? null;
};

export const mutatePermissionTemplate = async (
  actorClient: { rpc: (name: string, parameters: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  input: {
    operation: "apply" | "revoke";
    targetEmail: string;
    targetUserId: string;
    templateKey: string;
    reason: string;
    expiresAt?: string | null;
    securityContextId?: string | null;
  },
): Promise<Record<string, unknown>> => {
  // One actor-authenticated RPC owns the mutation and every required receipt.
  // Never retry a transport error here: the commit outcome could be unknown.
  let result: { data: unknown; error: unknown };
  try {
    result = await actorClient.rpc("admin_mutate_staff_permission_template", {
      p_operation: input.operation,
      p_target_email: input.targetEmail,
      p_target_user_id: input.targetUserId,
      p_template_key: input.templateKey,
      p_reason: input.reason,
      p_expires_at: input.expiresAt ?? null,
      p_security_context_id: input.securityContextId ?? null,
    });
  } catch {
    throw outcomeUnverified();
  }
  if (result.error) {
    // A PostgreSQL error is an authoritative transaction rollback. A network
    // failure does not establish whether the transaction reached commit.
    if (typeof result.error !== "object" || !("code" in result.error) ||
      !/^[0-9A-Z]{5}$/.test(String(result.error.code)) ||
      /^(08|57)|^40003$/.test(String(result.error.code))) throw outcomeUnverified();
    const message = typeof result.error === "object" && result.error !== null && "message" in result.error
      ? String(result.error.message) : String(result.error);
    throw new Error(`Template ${input.operation} failed: ${message}`);
  }
  const isObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value);
  const receipt = result.data;
  const template = PERMISSION_TEMPLATES[input.templateKey];
  const rows = isObject(receipt) ? receipt[input.operation === "apply" ? "permissions" : "revoked"] : null;
  const seen = new Set<string>();
  const validRows = template && Array.isArray(rows) && rows.every((row) => {
    if (!isObject(row) || !normalizeExactSubjectId(row.id) || row.target_user_id !== input.targetUserId ||
      typeof row.permission_key !== "string" || !template.permissions.includes(row.permission_key) ||
      seen.has(row.permission_key) || row.status !== (input.operation === "apply" ? "active" : "revoked")) return false;
    seen.add(row.permission_key);
    return input.operation !== "apply" || (input.expiresAt
      ? typeof row.expires_at === "string" && Date.parse(row.expires_at) === Date.parse(input.expiresAt)
      : row.expires_at === null);
  });
  const validTemplate = input.operation !== "apply" || (isObject(receipt) && isObject(receipt.template) &&
    receipt.template.key === input.templateKey && receipt.template.label === template?.label &&
    JSON.stringify(receipt.template.permissions) === JSON.stringify(template?.permissions) &&
    seen.size === template?.permissions.length);
  if (!isObject(receipt) || receipt.ok !== true || receipt.error ||
    ("success" in receipt && receipt.success !== true) || !validRows || !validTemplate) {
    throw outcomeUnverified();
  }
  return receipt;
};
