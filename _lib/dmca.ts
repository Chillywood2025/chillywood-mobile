import { supabase } from "./supabase";

export const DMCA_CASE_STATUSES = [
  "received",
  "needs_more_info",
  "under_review",
  "rejected",
  "rejected_no_action",
  "content_disabled",
  "uploader_notified",
  "counter_notice_received",
  "waiting_rightsholder_response",
  "eligible_for_restore",
  "restored",
  "court_action_notice_received",
  "repeat_infringer_review",
  "closed",
  "preserved_evidence",
] as const;

export const DMCA_CONTENT_TYPES = [
  "profile_post",
  "creator_video",
  "profile_post_comment",
  "creator_video_comment",
  "social_attachment",
  "comment",
  "reply",
  "attachment",
  "channel",
  "live_room",
  "other",
] as const;

export const DMCA_CONTENT_ACTIONS = [
  "disabled",
  "hidden",
  "restored",
  "rejected_no_action",
  "preserved_evidence",
] as const;

export const DMCA_EVIDENCE_BUCKET = "dmca-evidence";
export const DMCA_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DMCA_ATTACHMENT_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
] as const;

export const DMCA_NOTIFICATION_TEMPLATES = [
  {
    key: "reporter_receipt",
    label: "Receipt confirmation to reporter",
    purpose: "Confirm Chi'llywood received the copyright notice and provide the case number.",
  },
  {
    key: "incomplete_notice",
    label: "Incomplete notice request",
    purpose: "Ask the reporter for missing notice fields before treating the report as complete.",
  },
  {
    key: "notice_rejected",
    label: "Notice rejected",
    purpose: "Tell the reporter the notice was rejected, with a short non-legal support explanation.",
  },
  {
    key: "uploader_notice",
    label: "Content disabled uploader notice",
    purpose: "Notify the uploader that content was disabled because of a copyright notice.",
  },
  {
    key: "counter_notice_received",
    label: "Counter-notice received",
    purpose: "Confirm receipt of an uploader counter-notice or admin-recorded counter-dispute.",
  },
  {
    key: "counter_notice_forwarded",
    label: "Counter-notice forwarded to claimant",
    purpose: "Record forwarding and the 10-14 business-day response window.",
  },
  {
    key: "restore_eligible",
    label: "Restore eligible",
    purpose: "Record that no court action notice has been received and content may be reviewed for restore.",
  },
  {
    key: "content_restored",
    label: "Content restored",
    purpose: "Notify affected parties that disabled content was restored after review.",
  },
  {
    key: "repeat_infringer_warning",
    label: "Repeat-infringer warning",
    purpose: "Warn a user or channel that active copyright strikes have triggered review.",
  },
] as const;

export type DmcaCaseStatus = typeof DMCA_CASE_STATUSES[number];
export type DmcaContentType = typeof DMCA_CONTENT_TYPES[number];
export type DmcaContentAction = typeof DMCA_CONTENT_ACTIONS[number];

export type DmcaCase = {
  id: string;
  caseNumber: string;
  status: DmcaCaseStatus;
  reportType: string;
  reporterUserId: string | null;
  reporterName: string;
  reporterCompany: string | null;
  reporterEmail: string;
  reporterPhone: string | null;
  reporterAddress: string | null;
  reporterIsOwner: boolean;
  authorizedAgentName: string | null;
  copyrightOwnerName: string | null;
  copyrightedWorkDescription: string;
  copyrightedWorkUrls: unknown[];
  infringingMaterialDescription: string | null;
  contentType: DmcaContentType;
  contentId: string | null;
  contentUrl: string | null;
  uploaderUserId: string | null;
  uploaderChannelId: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  receivedAt: string;
  closedAt: string | null;
  assignedAdminId: string | null;
  adminNotes: string | null;
  publicSafeSummary: string | null;
  activeStrikeCount: number;
  isTestCase: boolean;
  lastAction: string | null;
  lastActionAt: string | null;
};

export type DmcaCounterNotice = {
  id: string;
  dmcaCaseId: string;
  submitterUserId: string | null;
  submitterName: string;
  submitterEmail: string;
  submitterPhone: string | null;
  submitterAddress: string | null;
  removedMaterialDescription: string;
  removedMaterialUrlOrLocation: string;
  receivedAt: string;
  forwardedToClaimantAt: string | null;
  responseDeadlineStartAt: string | null;
  restoreNotBeforeAt: string | null;
  restoreNotAfterAt: string | null;
  courtActionNoticeReceivedAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type DmcaContentActionRecord = {
  id: string;
  dmcaCaseId: string;
  contentType: string;
  contentId: string;
  action: string;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  actorAdminId: string;
  reason: string;
  createdAt: string;
};

export type DmcaStrike = {
  id: string;
  userId: string;
  channelId: string | null;
  dmcaCaseId: string;
  contentType: string;
  contentId: string;
  strikeStatus: "active" | "removed" | "disputed" | "resolved" | "expired" | string;
  severity: "standard" | "severe";
  reason: string;
  createdAt: string;
  removedAt: string | null;
  removedReason: string | null;
};

export type DmcaAuditLogEntry = {
  id: string;
  dmcaCaseId: string | null;
  eventType: string;
  actorUserId: string | null;
  actorRole: "reporter" | "uploader" | "admin" | "system";
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type DmcaAttachment = {
  id: string;
  dmcaCaseId: string;
  counterNoticeId: string | null;
  source: "public_notice" | "uploader_counter_notice" | "admin_manual" | string;
  submittedByUserId: string | null;
  submittedByRole: "reporter" | "uploader" | "admin" | string;
  bucketId: string;
  objectPath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: "pending_manual_review" | "not_configured" | "clean" | "quarantined" | "rejected" | string;
  scanProvider: string;
  scanNotes: string | null;
  retentionStatus: string;
  preservedForEvidence: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DmcaCaseDetail = {
  case: DmcaCase;
  attachments: DmcaAttachment[];
  counterNotices: DmcaCounterNotice[];
  contentActions: DmcaContentActionRecord[];
  contentState: DmcaContentState | null;
  strikes: DmcaStrike[];
  auditLog: DmcaAuditLogEntry[];
};

export type SubmitDmcaNoticeInput = {
  reporterName: string;
  reporterCompany?: string;
  reporterEmail: string;
  reporterPhone?: string;
  reporterAddress?: string;
  reporterIsOwner: boolean;
  authorizedAgentName?: string;
  copyrightOwnerName?: string;
  copyrightedWorkDescription: string;
  copyrightedWorkUrls?: string[];
  infringingMaterialDescription?: string;
  contentType: DmcaContentType;
  contentId?: string;
  contentUrl?: string;
  goodFaithStatement: boolean;
  accuracyPenaltyPerjuryStatement: boolean;
  electronicSignature: string;
};

export type SubmitDmcaNoticeResult = {
  id: string;
  caseNumber: string;
  status: DmcaCaseStatus;
  attachmentToken: string | null;
};

export type AdminDmcaCreateCaseInput = SubmitDmcaNoticeInput & {
  source: "admin_manual" | "admin_created" | "support_email_manual" | "manual_email" | "public_form" | "in_app_report";
};

export type DmcaContentState = {
  found: boolean;
  publicAvailability: string;
  reason: string | null;
  missingBackendPiece: string | null;
  backend: string | null;
  contentType: string | null;
  contentId: string | null;
  ownerUserId: string | null;
  visibility: string | null;
  moderationStatus: string | null;
  moderationReason: string | null;
  moderatedAt: string | null;
  deletedAt: string | null;
};

export type DmcaCaseSummary = {
  total: number;
  open: number;
  priority: number;
  repeatInfringerReview: number;
  byStatus: Record<DmcaCaseStatus, number>;
};

export type DmcaCounterNoticeCase = {
  id: string;
  caseNumber: string;
  status: DmcaCaseStatus;
  contentType: DmcaContentType;
  contentId: string | null;
  contentUrl: string | null;
  publicSafeSummary: string | null;
  receivedAt: string;
  existingCounterNoticeCount: number;
};

type DmcaRpcClient = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

const dmcaClient = supabase as unknown as DmcaRpcClient;

const toText = (value: unknown) => String(value ?? "").trim();
const toLowerText = (value: unknown) => toText(value).toLowerCase();

const toStringArray = (value: unknown): string[] => (
  Array.isArray(value) ? value.map((entry) => toText(entry)).filter(Boolean) : []
);

const toDateText = (value: unknown) => toText(value);

const normalizeStatus = (value: unknown): DmcaCaseStatus => {
  const normalized = toLowerText(value);
  return DMCA_CASE_STATUSES.includes(normalized as DmcaCaseStatus) ? normalized as DmcaCaseStatus : "received";
};
const isUuidText = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const normalizeDmcaContentType = (value: unknown): DmcaContentType => {
  const normalized = toLowerText(value);
  return DMCA_CONTENT_TYPES.includes(normalized as DmcaContentType) ? normalized as DmcaContentType : "other";
};

const parseJsonObject = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
);

const parseDmcaCase = (row: any, activeStrikeCount = 0): DmcaCase => ({
  id: toText(row.id),
  caseNumber: toText(row.case_number),
  status: normalizeStatus(row.status),
  reportType: toText(row.report_type) || "dmca_notice",
  reporterUserId: toText(row.reporter_user_id) || null,
  reporterName: toText(row.reporter_name),
  reporterCompany: toText(row.reporter_company) || null,
  reporterEmail: toText(row.reporter_email),
  reporterPhone: toText(row.reporter_phone) || null,
  reporterAddress: toText(row.reporter_address) || null,
  reporterIsOwner: row.reporter_is_owner !== false,
  authorizedAgentName: toText(row.authorized_agent_name) || null,
  copyrightOwnerName: toText(row.copyright_owner_name) || null,
  copyrightedWorkDescription: toText(row.copyrighted_work_description),
  copyrightedWorkUrls: toStringArray(row.copyrighted_work_urls),
  infringingMaterialDescription: toText(row.allegedly_infringing_material_description) || null,
  contentType: normalizeDmcaContentType(row.allegedly_infringing_content_type),
  contentId: toText(row.allegedly_infringing_content_id) || null,
  contentUrl: toText(row.allegedly_infringing_url) || null,
  uploaderUserId: toText(row.uploader_user_id) || null,
  uploaderChannelId: toText(row.uploader_channel_id) || null,
  source: toText(row.source) || "public_form",
  createdAt: toDateText(row.created_at),
  updatedAt: toDateText(row.updated_at),
  receivedAt: toDateText(row.received_at),
  closedAt: toText(row.closed_at) || null,
  assignedAdminId: toText(row.assigned_admin_id) || null,
  adminNotes: toText(row.admin_notes) || null,
  publicSafeSummary: toText(row.public_safe_summary) || null,
  activeStrikeCount,
  isTestCase: row.is_test_case === true,
  lastAction: toText(row.last_action) || null,
  lastActionAt: toDateText(row.last_action_at) || null,
});

const parseCounterNotice = (row: any): DmcaCounterNotice => ({
  id: toText(row.id),
  dmcaCaseId: toText(row.dmca_case_id),
  submitterUserId: toText(row.submitter_user_id) || null,
  submitterName: toText(row.submitter_name),
  submitterEmail: toText(row.submitter_email),
  submitterPhone: toText(row.submitter_phone) || null,
  submitterAddress: toText(row.submitter_address) || null,
  removedMaterialDescription: toText(row.removed_material_description),
  removedMaterialUrlOrLocation: toText(row.removed_material_url_or_location),
  receivedAt: toDateText(row.received_at),
  forwardedToClaimantAt: toText(row.forwarded_to_claimant_at) || null,
  responseDeadlineStartAt: toText(row.response_deadline_start_at) || null,
  restoreNotBeforeAt: toText(row.restore_not_before_at) || null,
  restoreNotAfterAt: toText(row.restore_not_after_at) || null,
  courtActionNoticeReceivedAt: toText(row.court_action_notice_received_at) || null,
  status: toText(row.status),
  createdAt: toDateText(row.created_at),
  updatedAt: toDateText(row.updated_at),
});

const parseContentAction = (row: any): DmcaContentActionRecord => ({
  id: toText(row.id),
  dmcaCaseId: toText(row.dmca_case_id),
  contentType: toText(row.content_type),
  contentId: toText(row.content_id),
  action: toText(row.action),
  previousState: parseJsonObject(row.previous_state),
  newState: parseJsonObject(row.new_state),
  actorAdminId: toText(row.actor_admin_id),
  reason: toText(row.reason),
  createdAt: toDateText(row.created_at),
});

const parseStrike = (row: any): DmcaStrike => ({
  id: toText(row.id),
  userId: toText(row.user_id),
  channelId: toText(row.channel_id) || null,
  dmcaCaseId: toText(row.dmca_case_id),
  contentType: toText(row.content_type),
  contentId: toText(row.content_id),
  strikeStatus: toText(row.strike_status),
  severity: toLowerText(row.severity) === "severe" ? "severe" : "standard",
  reason: toText(row.reason),
  createdAt: toDateText(row.created_at),
  removedAt: toText(row.removed_at) || null,
  removedReason: toText(row.removed_reason) || null,
});

const parseAudit = (row: any): DmcaAuditLogEntry => ({
  id: toText(row.id),
  dmcaCaseId: toText(row.dmca_case_id) || null,
  eventType: toText(row.event_type),
  actorUserId: toText(row.actor_user_id) || null,
  actorRole: ["reporter", "uploader", "admin", "system"].includes(toLowerText(row.actor_role))
    ? toLowerText(row.actor_role) as DmcaAuditLogEntry["actorRole"]
    : "system",
  reason: toText(row.reason) || null,
  metadata: parseJsonObject(row.metadata),
  createdAt: toDateText(row.created_at),
});

const parseAttachment = (row: any): DmcaAttachment => ({
  id: toText(row.id),
  dmcaCaseId: toText(row.dmca_case_id),
  counterNoticeId: toText(row.counter_notice_id) || null,
  source: toText(row.source) || "public_notice",
  submittedByUserId: toText(row.submitted_by_user_id) || null,
  submittedByRole: toText(row.submitted_by_role) || "reporter",
  bucketId: toText(row.bucket_id) || DMCA_EVIDENCE_BUCKET,
  objectPath: toText(row.object_path),
  originalFilename: toText(row.original_filename),
  mimeType: toText(row.mime_type),
  sizeBytes: Number(row.size_bytes ?? 0),
  scanStatus: toText(row.scan_status) || "pending_manual_review",
  scanProvider: toText(row.scan_provider) || "manual_review_required",
  scanNotes: toText(row.scan_notes) || null,
  retentionStatus: toText(row.retention_status) || "active_legal_hold",
  preservedForEvidence: row.preserved_for_evidence !== false,
  createdAt: toDateText(row.created_at),
  updatedAt: toDateText(row.updated_at),
});

const parseContentState = (value: unknown): DmcaContentState | null => {
  const row = parseJsonObject(value);
  if (!row) return null;
  return {
    found: row.found === true,
    publicAvailability: toText(row.publicAvailability ?? row.public_availability) || "unknown",
    reason: toText(row.reason) || null,
    missingBackendPiece: toText(row.missingBackendPiece ?? row.missing_backend_piece) || null,
    backend: toText(row.backend) || null,
    contentType: toText(row.contentType ?? row.content_type) || null,
    contentId: toText(row.contentId ?? row.content_id) || null,
    ownerUserId: toText(row.ownerUserId ?? row.owner_user_id) || null,
    visibility: toText(row.visibility) || null,
    moderationStatus: toText(row.moderationStatus ?? row.moderation_status) || null,
    moderationReason: toText(row.moderationReason ?? row.moderation_reason) || null,
    moderatedAt: toText(row.moderatedAt ?? row.moderated_at) || null,
    deletedAt: toText(row.deletedAt ?? row.deleted_at) || null,
  };
};

const assertText = (value: string | undefined, message: string) => {
  if (!toText(value)) throw new Error(message);
};

export function validateDmcaNoticeInput(input: SubmitDmcaNoticeInput) {
  assertText(input.reporterName, "Reporter name is required.");
  assertText(input.reporterEmail, "Reporter email is required.");
  if (!toText(input.reporterEmail).includes("@")) throw new Error("Enter a valid reporter email.");
  assertText(input.copyrightOwnerName, "Copyright owner name is required.");
  assertText(input.copyrightedWorkDescription, "Describe the copyrighted work.");
  assertText(input.infringingMaterialDescription, "Describe the allegedly infringing material.");
  if (!toText(input.contentId) && !toText(input.contentUrl)) {
    throw new Error("Provide the allegedly infringing content URL or content id.");
  }
  if (!input.goodFaithStatement) throw new Error("Confirm the good-faith belief statement.");
  if (!input.accuracyPenaltyPerjuryStatement) {
    throw new Error("Confirm the accuracy and authorization statement.");
  }
  assertText(input.electronicSignature, "Electronic signature is required.");
}

export async function submitDmcaNotice(input: SubmitDmcaNoticeInput) {
  validateDmcaNoticeInput(input);

  const { data, error } = await dmcaClient.rpc("submit_dmca_notice", {
    p_payload: {
      reporterName: toText(input.reporterName),
      reporterCompany: toText(input.reporterCompany) || null,
      reporterEmail: toText(input.reporterEmail),
      reporterPhone: toText(input.reporterPhone) || null,
      reporterAddress: toText(input.reporterAddress) || null,
      reporterIsOwner: input.reporterIsOwner,
      authorizedAgentName: toText(input.authorizedAgentName) || null,
      copyrightOwnerName: toText(input.copyrightOwnerName) || null,
      copyrightedWorkDescription: toText(input.copyrightedWorkDescription),
      copyrightedWorkUrls: input.copyrightedWorkUrls ?? [],
      infringingMaterialDescription: toText(input.infringingMaterialDescription) || null,
      contentType: normalizeDmcaContentType(input.contentType),
      contentId: toText(input.contentId) || null,
      contentUrl: toText(input.contentUrl) || null,
      goodFaithStatement: input.goodFaithStatement,
      accuracyPenaltyPerjuryStatement: input.accuracyPenaltyPerjuryStatement,
      electronicSignature: toText(input.electronicSignature),
    },
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    id: toText(row?.id),
    caseNumber: toText(row?.case_number),
    status: normalizeStatus(row?.status),
    attachmentToken: toText(row?.attachment_token) || null,
  } satisfies SubmitDmcaNoticeResult;
}

export async function adminDmcaCreateCase(input: AdminDmcaCreateCaseInput) {
  validateDmcaNoticeInput(input);

  const { data, error } = await dmcaClient.rpc("admin_dmca_create_case", {
    p_payload: {
      claimantName: toText(input.reporterName),
      claimantCompany: toText(input.reporterCompany) || null,
      claimantEmail: toText(input.reporterEmail),
      reporterPhone: toText(input.reporterPhone) || null,
      reporterAddress: toText(input.reporterAddress) || null,
      reporterIsOwner: input.reporterIsOwner,
      authorizedAgentName: toText(input.authorizedAgentName) || null,
      copyrightOwnerName: toText(input.copyrightOwnerName),
      copyrightedWorkDescription: toText(input.copyrightedWorkDescription),
      copyrightedWorkUrls: input.copyrightedWorkUrls ?? [],
      infringingMaterialDescription: toText(input.infringingMaterialDescription),
      contentType: normalizeDmcaContentType(input.contentType),
      contentId: toText(input.contentId) || null,
      contentUrl: toText(input.contentUrl) || null,
      goodFaithStatement: input.goodFaithStatement,
      accuracyPenaltyPerjuryStatement: input.accuracyPenaltyPerjuryStatement,
      authorityStatement: input.accuracyPenaltyPerjuryStatement,
      electronicSignature: toText(input.electronicSignature),
    },
    p_source: input.source,
  });
  if (error) throw error;
  return parseDmcaCase(data);
}

export async function readAdminDmcaCases(options?: {
  includeTestCases?: boolean;
  limit?: number;
  search?: string;
  status?: DmcaCaseStatus | "all";
}): Promise<DmcaCase[]> {
  const limit = Math.max(1, Math.min(200, Math.floor(Number(options?.limit ?? 20))));
  let query = dmcaClient
    .from("dmca_cases")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }
  if (options?.includeTestCases !== true && !__DEV__) {
    query = query.eq("is_test_case", false);
  }

  const search = toText(options?.search);
  if (search) {
    const escapedSearch = search.replaceAll("%", "\\%").replaceAll("_", "\\_").replaceAll(",", " ");
    const pattern = `%${escapedSearch}%`;
    const clauses = [
      `case_number.ilike.${pattern}`,
      `allegedly_infringing_content_id.ilike.${pattern}`,
      `allegedly_infringing_url.ilike.${pattern}`,
      `reporter_email.ilike.${pattern}`,
      `uploader_user_id.ilike.${pattern}`,
      `status.ilike.${pattern}`,
    ];
    if (isUuidText(search)) clauses.push(`id.eq.${search}`);
    query = query.or(clauses.join(","));
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const caseIds = rows.map((row: any) => toText(row.id)).filter(Boolean);
  const uploaderIds = Array.from(new Set(rows.map((row: any) => toText(row.uploader_user_id)).filter(Boolean)));
  const activeStrikeCounts = new Map<string, number>();
  const latestActions = new Map<string, { eventType: string; createdAt: string }>();
  if (uploaderIds.length) {
    const { data: strikes } = await dmcaClient
      .from("dmca_strikes")
      .select("user_id")
      .in("user_id", uploaderIds)
      .eq("strike_status", "active")
      .limit(500);
    (strikes ?? []).forEach((strike: any) => {
      const userId = toText(strike.user_id);
      if (!userId) return;
      activeStrikeCounts.set(userId, (activeStrikeCounts.get(userId) ?? 0) + 1);
    });
  }
  if (caseIds.length) {
    const { data: auditRows } = await dmcaClient
      .from("dmca_audit_log")
      .select("dmca_case_id,event_type,created_at")
      .in("dmca_case_id", caseIds)
      .order("created_at", { ascending: false })
      .limit(500);
    (auditRows ?? []).forEach((entry: any) => {
      const caseId = toText(entry.dmca_case_id);
      if (!caseId || latestActions.has(caseId)) return;
      latestActions.set(caseId, {
        createdAt: toDateText(entry.created_at),
        eventType: toText(entry.event_type),
      });
    });
  }

  return rows.map((row: any) => {
    const action = latestActions.get(toText(row.id));
    return parseDmcaCase({
      ...row,
      last_action: action?.eventType ?? null,
      last_action_at: action?.createdAt ?? null,
    }, activeStrikeCounts.get(toText(row.uploader_user_id)) ?? 0);
  });
}

export async function readAdminDmcaCaseSummary(): Promise<DmcaCaseSummary> {
  const cases = await readAdminDmcaCases({ limit: 200, status: "all" });
  const byStatus = Object.fromEntries(DMCA_CASE_STATUSES.map((status) => [status, 0])) as Record<DmcaCaseStatus, number>;
  for (const dmcaCase of cases) {
    byStatus[dmcaCase.status] = (byStatus[dmcaCase.status] ?? 0) + 1;
  }
  const openStatuses: DmcaCaseStatus[] = [
    "received",
    "needs_more_info",
    "under_review",
    "content_disabled",
    "counter_notice_received",
    "waiting_rightsholder_response",
    "eligible_for_restore",
    "repeat_infringer_review",
    "preserved_evidence",
  ];
  const priorityStatuses: DmcaCaseStatus[] = [
    "received",
    "needs_more_info",
    "counter_notice_received",
    "eligible_for_restore",
    "repeat_infringer_review",
  ];

  return {
    total: cases.length,
    open: cases.filter((dmcaCase) => openStatuses.includes(dmcaCase.status)).length,
    priority: cases.filter((dmcaCase) => priorityStatuses.includes(dmcaCase.status) || dmcaCase.activeStrikeCount >= 3).length,
    repeatInfringerReview: byStatus.repeat_infringer_review ?? 0,
    byStatus,
  };
}

export async function readAdminDmcaCaseDetail(caseId: string): Promise<DmcaCaseDetail> {
  const normalizedCaseId = toText(caseId);
  if (!normalizedCaseId) throw new Error("Missing DMCA case id.");

  const [caseResult, attachmentsResult, countersResult, actionsResult, strikesResult, auditResult] = await Promise.all([
    dmcaClient.from("dmca_cases").select("*").eq("id", normalizedCaseId).single(),
    dmcaClient.from("dmca_attachments").select("*").eq("dmca_case_id", normalizedCaseId).order("created_at", { ascending: false }),
    dmcaClient.from("dmca_counter_notices").select("*").eq("dmca_case_id", normalizedCaseId).order("created_at", { ascending: false }),
    dmcaClient.from("dmca_content_actions").select("*").eq("dmca_case_id", normalizedCaseId).order("created_at", { ascending: false }),
    dmcaClient.from("dmca_strikes").select("*").eq("dmca_case_id", normalizedCaseId).order("created_at", { ascending: false }),
    dmcaClient.from("dmca_audit_log").select("*").eq("dmca_case_id", normalizedCaseId).order("created_at", { ascending: false }),
  ]);

  if (caseResult.error) throw caseResult.error;
  if (attachmentsResult.error) throw attachmentsResult.error;
  if (countersResult.error) throw countersResult.error;
  if (actionsResult.error) throw actionsResult.error;
  if (strikesResult.error) throw strikesResult.error;
  if (auditResult.error) throw auditResult.error;

  const caseRow = caseResult.data;
  const strikes = (strikesResult.data ?? []).map(parseStrike);
  const activeStrikeCount = strikes.filter((strike: DmcaStrike) => (
    strike.userId === toText(caseRow.uploader_user_id) && strike.strikeStatus === "active"
  )).length;

  const parsedCase = parseDmcaCase(caseRow, activeStrikeCount);
  let contentState: DmcaContentState | null = null;
  if (parsedCase.contentId) {
    const { data: contentStateData } = await dmcaClient.rpc("admin_dmca_get_content_state", {
      p_content_id: parsedCase.contentId,
      p_content_type: parsedCase.contentType,
    });
    contentState = parseContentState(contentStateData);
  }

  return {
    case: parsedCase,
    attachments: (attachmentsResult.data ?? []).map(parseAttachment),
    counterNotices: (countersResult.data ?? []).map(parseCounterNotice),
    contentActions: (actionsResult.data ?? []).map(parseContentAction),
    contentState,
    strikes,
    auditLog: (auditResult.data ?? []).map(parseAudit),
  };
}

export function getDmcaNoticeCompleteness(dmcaCase: DmcaCase) {
  const missing = [
    !dmcaCase.reporterName ? "reporter name" : null,
    !dmcaCase.reporterEmail ? "reporter email" : null,
    !dmcaCase.copyrightedWorkDescription ? "copyrighted work description" : null,
    !dmcaCase.contentId && !dmcaCase.contentUrl ? "content location" : null,
  ].filter(Boolean) as string[];

  return {
    complete: missing.length === 0,
    missing,
  };
}

export async function adminDmcaSetCaseStatus(input: {
  caseId: string;
  status: DmcaCaseStatus;
  reason: string;
  adminNotes?: string;
}) {
  const { data, error } = await dmcaClient.rpc("admin_dmca_set_case_status", {
    p_case_id: input.caseId,
    p_status: input.status,
    p_reason: input.reason,
    p_admin_notes: input.adminNotes ?? null,
  });
  if (error) throw error;
  return parseDmcaCase(data);
}

export async function adminDmcaRecordContentAction(input: {
  caseId: string;
  contentType: DmcaContentType;
  contentId: string;
  action: DmcaContentAction;
  reason: string;
}) {
  const { data, error } = await dmcaClient.rpc("admin_dmca_record_content_action", {
    p_case_id: input.caseId,
    p_content_type: input.contentType,
    p_content_id: input.contentId,
    p_action: input.action,
    p_reason: input.reason,
  });
  if (error) throw error;
  return parseContentAction(data);
}

export async function adminDmcaAddStrike(input: {
  caseId: string;
  userId: string;
  channelId?: string | null;
  contentType: DmcaContentType;
  contentId: string;
  severity: "standard" | "severe";
  reason: string;
}) {
  const { data, error } = await dmcaClient.rpc("admin_dmca_add_strike", {
    p_case_id: input.caseId,
    p_user_id: input.userId,
    p_channel_id: input.channelId ?? null,
    p_content_type: input.contentType,
    p_content_id: input.contentId,
    p_severity: input.severity,
    p_reason: input.reason,
  });
  if (error) throw error;
  return parseStrike(data);
}

export async function adminDmcaRemoveStrike(input: { strikeId: string; reason: string }) {
  const { data, error } = await dmcaClient.rpc("admin_dmca_remove_strike", {
    p_strike_id: input.strikeId,
    p_removed_reason: input.reason,
  });
  if (error) throw error;
  return parseStrike(data);
}

export async function adminDmcaUpdateStrikeStatus(input: {
  strikeId: string;
  status: "active" | "removed" | "disputed" | "resolved";
  reason: string;
}) {
  const { data, error } = await dmcaClient.rpc("admin_dmca_update_strike_status", {
    p_reason: input.reason,
    p_status: input.status,
    p_strike_id: input.strikeId,
  });
  if (error) throw error;
  return parseStrike(data);
}

export async function adminDmcaRecordCounterNotice(input: {
  caseId: string;
  submitterUserId?: string;
  submitterName: string;
  submitterEmail: string;
  submitterPhone?: string;
  submitterAddress?: string;
  removedMaterialDescription: string;
  removedMaterialUrlOrLocation: string;
  goodFaithMistakeStatement: boolean;
  jurisdictionConsentStatement: boolean;
  serviceAcceptanceStatement: boolean;
  electronicSignature: string;
  forwardedToClaimant: boolean;
}) {
  const { data, error } = await dmcaClient.rpc("admin_dmca_record_counter_notice", {
    p_case_id: input.caseId,
    p_payload: {
      submitterUserId: toText(input.submitterUserId) || null,
      submitterName: toText(input.submitterName),
      submitterEmail: toText(input.submitterEmail),
      submitterPhone: toText(input.submitterPhone) || null,
      submitterAddress: toText(input.submitterAddress) || null,
      removedMaterialDescription: toText(input.removedMaterialDescription),
      removedMaterialUrlOrLocation: toText(input.removedMaterialUrlOrLocation),
      goodFaithMistakeStatement: input.goodFaithMistakeStatement,
      jurisdictionConsentStatement: input.jurisdictionConsentStatement,
      serviceAcceptanceStatement: input.serviceAcceptanceStatement,
      electronicSignature: toText(input.electronicSignature),
    },
    p_forwarded_to_claimant: input.forwardedToClaimant,
  });
  if (error) throw error;
  return parseCounterNotice(data);
}

export async function adminDmcaForwardCounterNotice(input: { counterNoticeId: string; reason: string }) {
  const { data, error } = await dmcaClient.rpc("admin_dmca_forward_counter_notice", {
    p_counter_notice_id: input.counterNoticeId,
    p_reason: input.reason,
  });
  if (error) throw error;
  return parseCounterNotice(data);
}

export async function adminDmcaRecordCourtAction(input: { counterNoticeId: string; reason: string }) {
  const { data, error } = await dmcaClient.rpc("admin_dmca_record_court_action", {
    p_counter_notice_id: input.counterNoticeId,
    p_reason: input.reason,
  });
  if (error) throw error;
  return parseCounterNotice(data);
}

export async function adminDmcaMarkRestoreEligible(input: {
  caseId: string;
  counterNoticeId: string;
  reason: string;
}) {
  const { data, error } = await dmcaClient.rpc("admin_dmca_mark_restore_eligible", {
    p_case_id: input.caseId,
    p_counter_notice_id: input.counterNoticeId,
    p_reason: input.reason,
  });
  if (error) throw error;
  return parseDmcaCase(data);
}

const normalizeAttachmentMimeType = (value: unknown) => toLowerText(value) || "application/octet-stream";

const sanitizeAttachmentFilename = (fileName: string) => {
  const normalized = toText(fileName)
    .replace(/[\\/]+/g, "-")
    .replace(/[^A-Za-z0-9._ -]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.slice(0, 96) || "dmca-evidence.txt";
};

const buildAttachmentObjectName = (fileName: string) => {
  const safeName = sanitizeAttachmentFilename(fileName);
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${suffix}-${safeName}`;
};

export function validateDmcaAttachmentFile(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const mimeType = normalizeAttachmentMimeType(input.mimeType);
  if (!DMCA_ATTACHMENT_ALLOWED_MIME_TYPES.includes(mimeType as typeof DMCA_ATTACHMENT_ALLOWED_MIME_TYPES[number])) {
    throw new Error("DMCA attachments must be PNG, JPEG, WebP, PDF, or plain text.");
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new Error("DMCA attachment size could not be read.");
  }
  if (input.sizeBytes > DMCA_ATTACHMENT_MAX_BYTES) {
    throw new Error("DMCA attachments must be 10 MB or smaller.");
  }
  if (!toText(input.fileName)) throw new Error("DMCA attachment filename is required.");
}

export function buildDmcaPublicAttachmentObjectPath(input: {
  attachmentToken: string;
  caseId: string;
  fileName: string;
}) {
  const caseId = toText(input.caseId);
  const attachmentToken = toText(input.attachmentToken);
  if (!caseId) throw new Error("DMCA case id is required before uploading evidence.");
  if (!attachmentToken) throw new Error("DMCA attachment upload token is missing.");
  return `public-intake/${caseId}/${attachmentToken}/${buildAttachmentObjectName(input.fileName)}`;
}

export function buildDmcaCounterNoticeAttachmentObjectPath(input: {
  caseId: string;
  counterNoticeId: string;
  fileName: string;
  uploaderUserId: string;
}) {
  const caseId = toText(input.caseId);
  const counterNoticeId = toText(input.counterNoticeId);
  const uploaderUserId = toText(input.uploaderUserId);
  if (!caseId || !counterNoticeId || !uploaderUserId) {
    throw new Error("DMCA counter-notice attachment path requires case, counter-notice, and uploader ids.");
  }
  return `uploader-counter-notice/${caseId}/${uploaderUserId}/${counterNoticeId}/${buildAttachmentObjectName(input.fileName)}`;
}

export async function uploadDmcaAttachmentObject(input: {
  fileData: unknown;
  mimeType: string;
  objectPath: string;
}) {
  const { error } = await supabase.storage
    .from(DMCA_EVIDENCE_BUCKET)
    .upload(input.objectPath, input.fileData as any, {
      contentType: normalizeAttachmentMimeType(input.mimeType),
      upsert: false,
    });
  if (error) throw error;
}

export async function submitDmcaAttachmentMetadata(input: {
  attachmentToken?: string | null;
  caseId: string;
  counterNoticeId?: string | null;
  fileName: string;
  mimeType: string;
  objectPath: string;
  sizeBytes: number;
  source: "public_notice" | "uploader_counter_notice" | "admin_manual";
}) {
  validateDmcaAttachmentFile({
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });

  const { data, error } = await dmcaClient.rpc("submit_dmca_attachment_metadata", {
    p_payload: {
      attachmentToken: toText(input.attachmentToken) || null,
      caseId: toText(input.caseId),
      counterNoticeId: toText(input.counterNoticeId) || null,
      fileName: sanitizeAttachmentFilename(input.fileName),
      mimeType: normalizeAttachmentMimeType(input.mimeType),
      objectPath: toText(input.objectPath),
      sizeBytes: Math.trunc(input.sizeBytes),
      source: input.source,
    },
  });
  if (error) throw error;
  return parseAttachment(data);
}

export async function uploadDmcaPublicNoticeAttachment(input: {
  attachmentToken: string;
  caseId: string;
  fileData: unknown;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}) {
  validateDmcaAttachmentFile(input);
  const objectPath = buildDmcaPublicAttachmentObjectPath({
    attachmentToken: input.attachmentToken,
    caseId: input.caseId,
    fileName: input.fileName,
  });
  await uploadDmcaAttachmentObject({
    fileData: input.fileData,
    mimeType: input.mimeType,
    objectPath,
  });
  return submitDmcaAttachmentMetadata({
    attachmentToken: input.attachmentToken,
    caseId: input.caseId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    objectPath,
    sizeBytes: input.sizeBytes,
    source: "public_notice",
  });
}

export async function uploadDmcaCounterNoticeAttachment(input: {
  caseId: string;
  counterNoticeId: string;
  fileData: unknown;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploaderUserId: string;
}) {
  validateDmcaAttachmentFile(input);
  const objectPath = buildDmcaCounterNoticeAttachmentObjectPath({
    caseId: input.caseId,
    counterNoticeId: input.counterNoticeId,
    fileName: input.fileName,
    uploaderUserId: input.uploaderUserId,
  });
  await uploadDmcaAttachmentObject({
    fileData: input.fileData,
    mimeType: input.mimeType,
    objectPath,
  });
  return submitDmcaAttachmentMetadata({
    caseId: input.caseId,
    counterNoticeId: input.counterNoticeId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    objectPath,
    sizeBytes: input.sizeBytes,
    source: "uploader_counter_notice",
  });
}

const parseCounterNoticeCase = (row: any): DmcaCounterNoticeCase => ({
  id: toText(row.id),
  caseNumber: toText(row.case_number),
  status: normalizeStatus(row.status),
  contentType: normalizeDmcaContentType(row.content_type),
  contentId: toText(row.content_id) || null,
  contentUrl: toText(row.content_url) || null,
  publicSafeSummary: toText(row.public_safe_summary) || null,
  receivedAt: toDateText(row.received_at),
  existingCounterNoticeCount: Number(row.existing_counter_notice_count ?? 0),
});

export async function readMyDmcaCounterNoticeCase(caseId: string) {
  const normalizedCaseId = toText(caseId);
  if (!normalizedCaseId) throw new Error("Enter the DMCA case id from your uploader notice.");

  const { data, error } = await dmcaClient.rpc("read_my_dmca_counter_notice_case", {
    p_case_id: normalizedCaseId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return parseCounterNoticeCase(row);
}

export async function submitUploaderDmcaCounterNotice(input: {
  caseId: string;
  submitterName: string;
  submitterEmail: string;
  submitterPhone?: string;
  submitterAddress?: string;
  removedMaterialDescription: string;
  removedMaterialUrlOrLocation: string;
  goodFaithMistakeStatement: boolean;
  jurisdictionConsentStatement: boolean;
  serviceAcceptanceStatement: boolean;
  electronicSignature: string;
}) {
  assertText(input.caseId, "DMCA case id is required.");
  assertText(input.submitterName, "Submitter legal name is required.");
  assertText(input.submitterEmail, "Submitter email is required.");
  if (!toText(input.submitterEmail).includes("@")) throw new Error("Enter a valid submitter email.");
  assertText(input.removedMaterialDescription, "Counter-notice statement is required.");
  assertText(input.removedMaterialUrlOrLocation, "Content id, URL, or removed location is required.");
  if (!input.goodFaithMistakeStatement) throw new Error("Confirm the good-faith mistake statement.");
  if (!input.jurisdictionConsentStatement) throw new Error("Confirm the jurisdiction consent statement.");
  if (!input.serviceAcceptanceStatement) throw new Error("Confirm service acceptance.");
  assertText(input.electronicSignature, "Electronic signature is required.");

  const { data, error } = await dmcaClient.rpc("submit_dmca_counter_notice", {
    p_case_id: toText(input.caseId),
    p_payload: {
      electronicSignature: toText(input.electronicSignature),
      goodFaithMistakeStatement: input.goodFaithMistakeStatement,
      jurisdictionConsentStatement: input.jurisdictionConsentStatement,
      removedMaterialDescription: toText(input.removedMaterialDescription),
      removedMaterialUrlOrLocation: toText(input.removedMaterialUrlOrLocation),
      serviceAcceptanceStatement: input.serviceAcceptanceStatement,
      submitterAddress: toText(input.submitterAddress) || null,
      submitterEmail: toText(input.submitterEmail),
      submitterName: toText(input.submitterName),
      submitterPhone: toText(input.submitterPhone) || null,
    },
  });
  if (error) throw error;
  return parseCounterNotice(data);
}
