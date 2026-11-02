import { createClient } from "@supabase/supabase-js";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";
import { getCurrentAccountSessionAuthoritySnapshot, subscribeToAccountSessionAuthority } from "./accountSessionAuthority";
import { adminPageLimit, parseAdminCursor, parseAdminCursorPage } from "./adminCursorPagination";
import {
  createAccountBoundMutationOperationKey,
  AccountBoundSupabaseMutationError,
  assertAccountBoundSupabaseMutationSubjectCurrent,
  captureAccountBoundSupabaseMutationSubject,
  invokeAccountBoundSupabaseMutationRpc,
  isAccountBoundSupabaseMutationOutcomeAmbiguous,
  runCurrentAccountBoundSupabaseMutationRpc,
  type AccountBoundSupabaseMutationSubject,
} from "./accountBoundSupabaseMutation";

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
    purpose: "Warn a user or Platform that active copyright strikes have triggered review.",
  },
] as const;

export type DmcaCaseStatus = typeof DMCA_CASE_STATUSES[number];
export type DmcaContentType = typeof DMCA_CONTENT_TYPES[number];
export type DmcaContentAction = typeof DMCA_CONTENT_ACTIONS[number];

export const createDmcaStrikeOperationKey = () =>
  createAccountBoundMutationOperationKey("dmca-strike");

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
  scanStatus:
    | "pending_manual_review"
    | "pending_scan"
    | "scanning"
    | "scan_failed"
    | "manual_review"
    | "not_configured"
    | "clean"
    | "malware_detected"
    | "quarantined"
    | "rejected"
    | string;
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
  historiesComplete: boolean;
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

export type DmcaAttachmentMutationSubject = AccountBoundSupabaseMutationSubject | {
  accessToken: string;
  authority: null;
  guestGeneration: number;
  guestUserId: string | null;
};
export type DmcaAttachmentMutationOptions = {
  mutationSubject?: DmcaAttachmentMutationSubject;
  isCurrent?: () => boolean;
};

let guestGeneration = 0;
let observingGuestAuthority = false;
function observeDmcaGuestAuthority() {
  if (observingGuestAuthority) return;
  observingGuestAuthority = true;
  // One app-lifetime observer, not one listener per selected file. A login /
  // logout round trip must not revive an earlier signed-out picker or submit.
  supabase.auth.onAuthStateChange((event) => {
    if (event !== "INITIAL_SESSION") guestGeneration += 1;
  });
  subscribeToAccountSessionAuthority(() => { guestGeneration += 1; });
}

export async function captureDmcaAttachmentMutationSubject(): Promise<DmcaAttachmentMutationSubject> {
  observeDmcaGuestAuthority();
  if (getCurrentAccountSessionAuthoritySnapshot()) return captureAccountBoundSupabaseMutationSubject();
  const generation = guestGeneration;
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;
  // Legal public intake remains available without signing in, including an
  // anonymous Auth session. An unpublished registered login is not a guest.
  if (error || (session && (!session.user.is_anonymous || !session.access_token))) {
    throw new AccountBoundSupabaseMutationError();
  }
  const subject: DmcaAttachmentMutationSubject = {
    authority: null,
    accessToken: session?.access_token || SUPABASE_ANON_KEY,
    guestGeneration: generation,
    guestUserId: session?.user.id ?? null,
  };
  assertDmcaAttachmentMutationCurrent(subject);
  return subject;
}

function assertDmcaAttachmentMutationCurrent(subject: DmcaAttachmentMutationSubject, isCurrent?: () => boolean) {
  if (subject.authority) assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  else if (subject.guestGeneration !== guestGeneration || getCurrentAccountSessionAuthoritySnapshot()) {
    throw new AccountBoundSupabaseMutationError();
  }
  if (isCurrent && !isCurrent()) throw new AccountBoundSupabaseMutationError();
}

function dmcaAttachmentMutationClient(subject: DmcaAttachmentMutationSubject, isCurrent?: () => boolean) {
  assertDmcaAttachmentMutationCurrent(subject, isCurrent);
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${subject.accessToken}` } },
  });
}

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
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

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
  scanStatus: toText(row.scan_status) || "pending_scan",
  scanProvider: toText(row.scan_provider) || "clamav",
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

export async function submitDmcaNotice(input: SubmitDmcaNoticeInput, options: DmcaAttachmentMutationOptions = {}) {
  validateDmcaNoticeInput(input);
  const subject = options.mutationSubject ?? await captureDmcaAttachmentMutationSubject();
  const client = dmcaAttachmentMutationClient(subject, options.isCurrent);
  const { data, error } = await client.rpc("submit_dmca_notice", {
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

  assertDmcaAttachmentMutationCurrent(subject, options.isCurrent);
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

  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<unknown>("admin_dmca_create_case", {
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

export type DmcaCasesPageOptions = {
  includeTestCases?: boolean;
  limit?: number;
  search?: string;
  status?: DmcaCaseStatus | "all";
  cursor?: string | null;
};

export async function readAdminDmcaCasesPage(options?: DmcaCasesPageOptions): Promise<{
  items: DmcaCase[]; nextCursor: string | null; hasMore: boolean;
}> {
  const limit = adminPageLimit(options?.limit, 50);
  const status = options?.status ?? "all";
  const search = toText(options?.search).toLowerCase();
  const includeTestCases = options?.includeTestCases === true || __DEV__;
  const scope = { source: "dmca", status, search, includeTestCases };
  parseAdminCursor(options?.cursor, scope);
  const { data, error } = await dmcaClient.rpc("list_admin_dmca_cases_page", {
    p_status: status, p_search: search, p_limit: limit,
    p_cursor: options?.cursor ?? null, p_include_test_cases: includeTestCases,
  });
  if (error) throw error;
  const page = parseAdminCursorPage(data, scope, limit, options?.cursor);
  return { ...page, items: page.items.map((row) => parseDmcaCase(row, exactDmcaCount(row.active_strike_count))) };
}

/** Compatibility wrapper for existing callers that intentionally want one page. */
export async function readAdminDmcaCases(options?: DmcaCasesPageOptions): Promise<DmcaCase[]> {
  return (await readAdminDmcaCasesPage({ ...options, limit: options?.limit ?? 20 })).items;
}

const exactDmcaCount = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("DMCA counts are unavailable. Refresh to retry.");
  }
  return value;
};

export async function readAdminDmcaCaseSummary(options?: { includeTestCases?: boolean }): Promise<DmcaCaseSummary> {
  const { data, error } = await dmcaClient.rpc("get_admin_dmca_case_summary", {
    p_include_test_cases: options?.includeTestCases === true || __DEV__,
  });
  if (error) throw error;
  if (!parseJsonObject(data) || !parseJsonObject(data.byStatus)) throw new Error("DMCA summary is unavailable.");
  const byStatus = Object.fromEntries(DMCA_CASE_STATUSES.map((status) => [status, exactDmcaCount(data.byStatus[status])])) as Record<DmcaCaseStatus, number>;
  const total = exactDmcaCount(data.total);
  if (Object.values(byStatus).reduce((sum, count) => sum + count, 0) !== total) throw new Error("DMCA summary is inconsistent.");
  return {
    total, open: exactDmcaCount(data.open), priority: exactDmcaCount(data.priority),
    repeatInfringerReview: exactDmcaCount(data.repeatInfringerReview),
    byStatus,
  };
}

// Exact remaining counts prevent a lower PostgREST max_rows setting from looking
// like end-of-history. Every relation remains under its existing RLS policy.
async function readCompleteDmcaHistory(table: string, caseId: string): Promise<any[]> {
  const rows: any[] = [];
  const seen = new Set<string>();
  let last: { id: string; created_at: string } | null = null;
  while (true) {
    let query = dmcaClient.from(table).select("*", { count: "exact" })
      .eq("dmca_case_id", caseId).order("created_at", { ascending: false })
      .order("id", { ascending: false }).limit(200);
    if (last) query = query.or(`created_at.lt.${last.created_at},and(created_at.eq.${last.created_at},id.lt.${last.id})`);
    const { data, count, error } = await query;
    if (error) throw error;
    const remaining = exactDmcaCount(count);
    if (!Array.isArray(data) || data.length > remaining || (!data.length && remaining)) {
      throw new Error("DMCA history is incomplete. Refresh to retry.");
    }
    for (const row of data) {
      if (!isUuidText(toText(row.id)) || seen.has(row.id)
        || !/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$/.test(toText(row.created_at))
        || !Number.isFinite(Date.parse(row.created_at))) throw new Error("DMCA history pagination did not advance.");
      seen.add(row.id); rows.push(row);
    }
    if (data.length === remaining) return rows;
    last = data.at(-1);
  }
}

export async function readAdminDmcaCaseDetail(caseId: string): Promise<DmcaCaseDetail> {
  const normalizedCaseId = toText(caseId);
  if (!normalizedCaseId) throw new Error("Missing DMCA case id.");

  const [caseResult, attachments, counters, actions, strikeRows, auditRows] = await Promise.all([
    dmcaClient.from("dmca_cases").select("*").eq("id", normalizedCaseId).single(),
    ...["dmca_attachments", "dmca_counter_notices", "dmca_content_actions", "dmca_strikes", "dmca_audit_log"]
      .map((table) => readCompleteDmcaHistory(table, normalizedCaseId)),
  ]);

  if (caseResult.error) throw caseResult.error;
  const caseRow = caseResult.data;
  const strikes = strikeRows.map(parseStrike);
  let activeStrikeCount = 0;
  if (caseRow.uploader_user_id) {
    const countResult = await dmcaClient.from("dmca_strikes").select("id", { head: true, count: "exact" })
      .eq("user_id", caseRow.uploader_user_id).eq("strike_status", "active");
    if (countResult.error) throw countResult.error;
    activeStrikeCount = exactDmcaCount(countResult.count);
  }

  const parsedCase = parseDmcaCase(caseRow, activeStrikeCount);
  let contentState: DmcaContentState | null = null;
  if (parsedCase.contentId) {
    const { data: contentStateData, error: contentError } = await dmcaClient.rpc("admin_dmca_get_content_state", {
      p_content_id: parsedCase.contentId,
      p_content_type: parsedCase.contentType,
    });
    if (contentError) throw contentError;
    contentState = parseContentState(contentStateData);
  }

  return {
    case: parsedCase,
    attachments: attachments.map(parseAttachment),
    counterNotices: counters.map(parseCounterNotice),
    contentActions: actions.map(parseContentAction),
    contentState,
    strikes,
    auditLog: auditRows.map(parseAudit),
    historiesComplete: true,
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
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<unknown>("admin_dmca_set_case_status", {
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
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<unknown>("admin_dmca_record_content_action", {
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
  operationKey: string;
  severity: "standard" | "severe";
  reason: string;
}) {
  const operationKey = String(input.operationKey ?? "").trim().toLowerCase();
  if (!/^dmca-strike:[0-9a-f]{32}$/u.test(operationKey)) {
    throw new Error("A valid copyright strike request is required.");
  }
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<unknown>("admin_dmca_add_strike", {
    p_case_id: input.caseId,
    p_user_id: input.userId,
    p_channel_id: input.channelId ?? null,
    p_content_type: input.contentType,
    p_content_id: input.contentId,
    p_operation_key: operationKey,
    p_severity: input.severity,
    p_reason: input.reason,
  });
  if (error) {
    if (isAccountBoundSupabaseMutationOutcomeAmbiguous(error)) {
      throw new Error("The copyright strike is still being verified. Retrying the same action is safe.");
    }
    throw error;
  }
  return parseStrike(data);
}

export async function adminDmcaRemoveStrike(input: { strikeId: string; reason: string }) {
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<unknown>("admin_dmca_remove_strike", {
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
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<unknown>("admin_dmca_update_strike_status", {
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
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<unknown>("admin_dmca_record_counter_notice", {
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
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<unknown>("admin_dmca_forward_counter_notice", {
    p_counter_notice_id: input.counterNoticeId,
    p_reason: input.reason,
  });
  if (error) throw error;
  return parseCounterNotice(data);
}

export async function adminDmcaRecordCourtAction(input: { counterNoticeId: string; reason: string }) {
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<unknown>("admin_dmca_record_court_action", {
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
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<unknown>("admin_dmca_mark_restore_eligible", {
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
} & DmcaAttachmentMutationOptions) {
  const subject = input.mutationSubject ?? await captureDmcaAttachmentMutationSubject();
  const client = dmcaAttachmentMutationClient(subject, input.isCurrent);
  const { error } = await client.storage
    .from(DMCA_EVIDENCE_BUCKET)
    .upload(input.objectPath, input.fileData as any, {
      contentType: normalizeAttachmentMimeType(input.mimeType),
      upsert: false,
    });
  assertDmcaAttachmentMutationCurrent(subject, input.isCurrent);
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
} & DmcaAttachmentMutationOptions) {
  validateDmcaAttachmentFile({
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });

  const subject = input.mutationSubject ?? await captureDmcaAttachmentMutationSubject();
  const client = dmcaAttachmentMutationClient(subject, input.isCurrent);
  const { data, error } = await client.rpc("submit_dmca_attachment_metadata", {
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
  assertDmcaAttachmentMutationCurrent(subject, input.isCurrent);
  if (error) throw error;
  const attachment = parseAttachment(data);
  const expectedUserId = subject.authority ? subject.authority.userId : subject.guestUserId;
  if (attachment.dmcaCaseId !== toText(input.caseId) || attachment.objectPath !== toText(input.objectPath)
    || attachment.counterNoticeId !== (toText(input.counterNoticeId) || null)
    || attachment.submittedByUserId !== expectedUserId || attachment.source !== input.source) {
    throw new Error("Unable to confirm this evidence attachment. Refresh the case before retrying.");
  }
  return attachment;
}

export async function uploadDmcaPublicNoticeAttachment(input: {
  attachmentToken: string;
  caseId: string;
  fileData: unknown;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
} & DmcaAttachmentMutationOptions) {
  validateDmcaAttachmentFile(input);
  const subject = input.mutationSubject ?? await captureDmcaAttachmentMutationSubject();
  assertDmcaAttachmentMutationCurrent(subject, input.isCurrent);
  const objectPath = buildDmcaPublicAttachmentObjectPath({
    attachmentToken: input.attachmentToken,
    caseId: input.caseId,
    fileName: input.fileName,
  });
  await uploadDmcaAttachmentObject({
    mutationSubject: subject,
    isCurrent: input.isCurrent,
    fileData: input.fileData,
    mimeType: input.mimeType,
    objectPath,
  });
  return submitDmcaAttachmentMetadata({
    mutationSubject: subject,
    isCurrent: input.isCurrent,
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
} & DmcaAttachmentMutationOptions) {
  validateDmcaAttachmentFile(input);
  const subject = input.mutationSubject ?? await captureDmcaAttachmentMutationSubject();
  assertDmcaAttachmentMutationCurrent(subject, input.isCurrent);
  if (!subject.authority || subject.authority.userId !== toText(input.uploaderUserId)) {
    throw new AccountBoundSupabaseMutationError();
  }
  const objectPath = buildDmcaCounterNoticeAttachmentObjectPath({
    caseId: input.caseId,
    counterNoticeId: input.counterNoticeId,
    fileName: input.fileName,
    uploaderUserId: input.uploaderUserId,
  });
  await uploadDmcaAttachmentObject({
    mutationSubject: subject,
    isCurrent: input.isCurrent,
    fileData: input.fileData,
    mimeType: input.mimeType,
    objectPath,
  });
  return submitDmcaAttachmentMetadata({
    mutationSubject: subject,
    isCurrent: input.isCurrent,
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
}, options: DmcaAttachmentMutationOptions = {}) {
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

  const subject = options.mutationSubject ?? await captureDmcaAttachmentMutationSubject();
  assertDmcaAttachmentMutationCurrent(subject, options.isCurrent);
  if (!subject.authority) throw new AccountBoundSupabaseMutationError();
  const { data, error } = await invokeAccountBoundSupabaseMutationRpc<unknown>(subject, "submit_dmca_counter_notice", {
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
  assertDmcaAttachmentMutationCurrent(subject, options.isCurrent);
  if (error) throw error;
  const counterNotice = parseCounterNotice(data);
  if (counterNotice.dmcaCaseId !== toText(input.caseId) || counterNotice.submitterUserId !== subject.authority.userId) {
    throw new Error("Unable to confirm this counter-notice. Refresh the case before retrying.");
  }
  return counterNotice;
}
