import { supabase } from "./supabase";

type JsonRecord = Record<string, unknown>;

export type AdminUserReadModelSummary = {
  totalUsers: number | null;
  filteredUsers: number | null;
  activeUsers: number | null;
  unconfirmedUsers: number | null;
  bannedUsers: number | null;
  deletedUsers: number | null;
  anonymousUsers: number | null;
  privateProfiles: number | null;
  premiumActiveUsers: number | null;
  openTargetedReports: number | null;
  activeStaffRoles: number | null;
  activeBlocks: number | null;
  accountDeletionRequests: number | null;
};

export type AdminUserReadModelCounts = {
  reportsMade: number | null;
  reportsTargetingUser: number | null;
  openReportsTargetingUser: number | null;
  blocksCreated: number | null;
  blocksReceived: number | null;
  profilePosts: number | null;
  publicProfilePosts: number | null;
  creatorVideos: number | null;
  publicCreatorVideos: number | null;
  accountDeletionRequests: number | null;
};

export type AdminUserPremiumStatus = {
  status: string | null;
  source: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  updatedAt: string | null;
};

export type AdminUserStaffRole = {
  role: string;
  status: string;
  grantedAt: string | null;
  revokedAt: string | null;
};

export type AdminUserReadModelItem = {
  userId: string;
  email: string | null;
  identityLabel: string;
  username: string | null;
  displayName: string | null;
  authStatus: string;
  profileVisibility: string;
  profileRole: string | null;
  profileAvatarMediaStatus: string;
  profileBackgroundMediaStatus: string;
  profileMediaUpdatedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  bannedUntil: string | null;
  deletedAt: string | null;
  premium: AdminUserPremiumStatus | null;
  staffRoles: AdminUserStaffRole[];
  counts: AdminUserReadModelCounts;
};

export type AdminUsersReadModel = {
  connected: boolean;
  generatedAt: string;
  summary: AdminUserReadModelSummary;
  items: AdminUserReadModelItem[];
};

export type AdminUsageDetailSummary = {
  filteredRows: number | null;
  internalRows: number | null;
  providerRows: number | null;
  reconciliationRows: number | null;
  roomRows: number | null;
  mediaRows: number | null;
  latestAt: string | null;
};

export type AdminUsageDetailRow = {
  rowGroup: string;
  rowKind: string;
  rowId: string;
  occurredAt: string | null;
  primaryLabel: string;
  secondaryLabel: string | null;
  metricKey: string | null;
  quantity: number | null;
  unit: string | null;
  userId: string | null;
  roomId: string | null;
  mediaId: string | null;
  status: string | null;
  source: string | null;
};

export type AdminUsageDetailReadModel = {
  connected: boolean;
  generatedAt: string;
  section: string;
  summary: AdminUsageDetailSummary;
  items: AdminUsageDetailRow[];
};

export type AdminSystemHistorySummary = {
  filteredRows: number | null;
  adminAuditRows: number | null;
  liveOpsRows: number | null;
  securityRows: number | null;
  liveKitRows: number | null;
  mediaSecurityRows: number | null;
  legalRows: number | null;
  spectatorRows: number | null;
  latestAt: string | null;
};

export type AdminSystemHistoryRow = {
  source: string;
  rowId: string;
  occurredAt: string | null;
  eventType: string;
  category: string | null;
  status: string | null;
  severity: string | null;
  actorRole: string | null;
  actorUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  roomId: string | null;
  resultLabel: string | null;
  metadataFieldCount: number;
};

export type AdminSystemHistoryReadModel = {
  connected: boolean;
  generatedAt: string;
  source: string;
  summary: AdminSystemHistorySummary;
  items: AdminSystemHistoryRow[];
};

const adminReadModelRpc = supabase as unknown as {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

const nowIso = () => new Date().toISOString();

const asRecord = (value: unknown): JsonRecord => (
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}
);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const asInteger = (value: unknown): number | null => {
  const parsed = asNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
};

const emptyUserSummary = (): AdminUserReadModelSummary => ({
  totalUsers: null,
  filteredUsers: null,
  activeUsers: null,
  unconfirmedUsers: null,
  bannedUsers: null,
  deletedUsers: null,
  anonymousUsers: null,
  privateProfiles: null,
  premiumActiveUsers: null,
  openTargetedReports: null,
  activeStaffRoles: null,
  activeBlocks: null,
  accountDeletionRequests: null,
});

const emptyUserCounts = (): AdminUserReadModelCounts => ({
  reportsMade: null,
  reportsTargetingUser: null,
  openReportsTargetingUser: null,
  blocksCreated: null,
  blocksReceived: null,
  profilePosts: null,
  publicProfilePosts: null,
  creatorVideos: null,
  publicCreatorVideos: null,
  accountDeletionRequests: null,
});

const emptyUsageSummary = (): AdminUsageDetailSummary => ({
  filteredRows: null,
  internalRows: null,
  providerRows: null,
  reconciliationRows: null,
  roomRows: null,
  mediaRows: null,
  latestAt: null,
});

const emptySystemHistorySummary = (): AdminSystemHistorySummary => ({
  filteredRows: null,
  adminAuditRows: null,
  liveOpsRows: null,
  securityRows: null,
  liveKitRows: null,
  mediaSecurityRows: null,
  legalRows: null,
  spectatorRows: null,
  latestAt: null,
});

export const createEmptyAdminUsersReadModel = (): AdminUsersReadModel => ({
  connected: false,
  generatedAt: nowIso(),
  summary: emptyUserSummary(),
  items: [],
});

export const createEmptyAdminUsageDetailReadModel = (section = "all"): AdminUsageDetailReadModel => ({
  connected: false,
  generatedAt: nowIso(),
  section,
  summary: emptyUsageSummary(),
  items: [],
});

export const createEmptyAdminSystemHistoryReadModel = (source = "all"): AdminSystemHistoryReadModel => ({
  connected: false,
  generatedAt: nowIso(),
  source,
  summary: emptySystemHistorySummary(),
  items: [],
});

const normalizeUserPremium = (value: unknown): AdminUserPremiumStatus | null => {
  const row = asRecord(value);
  const status = asString(row.status);
  if (!status) return null;
  return {
    status,
    source: asString(row.source),
    startsAt: asString(row.startsAt),
    expiresAt: asString(row.expiresAt),
    revokedAt: asString(row.revokedAt),
    updatedAt: asString(row.updatedAt),
  };
};

const normalizeStaffRole = (value: unknown): AdminUserStaffRole | null => {
  const row = asRecord(value);
  const role = asString(row.role);
  if (!role) return null;
  return {
    role,
    status: asString(row.status) ?? "unknown",
    grantedAt: asString(row.grantedAt),
    revokedAt: asString(row.revokedAt),
  };
};

const normalizeUserCounts = (value: unknown): AdminUserReadModelCounts => {
  const row = asRecord(value);
  return {
    reportsMade: asInteger(row.reportsMade),
    reportsTargetingUser: asInteger(row.reportsTargetingUser),
    openReportsTargetingUser: asInteger(row.openReportsTargetingUser),
    blocksCreated: asInteger(row.blocksCreated),
    blocksReceived: asInteger(row.blocksReceived),
    profilePosts: asInteger(row.profilePosts),
    publicProfilePosts: asInteger(row.publicProfilePosts),
    creatorVideos: asInteger(row.creatorVideos),
    publicCreatorVideos: asInteger(row.publicCreatorVideos),
    accountDeletionRequests: asInteger(row.accountDeletionRequests),
  };
};

const normalizeUserItem = (value: unknown): AdminUserReadModelItem | null => {
  const row = asRecord(value);
  const userId = asString(row.userId);
  if (!userId) return null;

  return {
    userId,
    email: asString(row.email),
    identityLabel: asString(row.identityLabel) ?? `User ${userId.slice(0, 8)}`,
    username: asString(row.username),
    displayName: asString(row.displayName),
    authStatus: asString(row.authStatus) ?? "unknown",
    profileVisibility: asString(row.profileVisibility) ?? "public",
    profileRole: asString(row.profileRole),
    profileAvatarMediaStatus: asString(row.profileAvatarMediaStatus) ?? "active",
    profileBackgroundMediaStatus: asString(row.profileBackgroundMediaStatus) ?? "active",
    profileMediaUpdatedAt: asString(row.profileMediaUpdatedAt),
    createdAt: asString(row.createdAt),
    updatedAt: asString(row.updatedAt),
    lastSignInAt: asString(row.lastSignInAt),
    emailConfirmedAt: asString(row.emailConfirmedAt),
    bannedUntil: asString(row.bannedUntil),
    deletedAt: asString(row.deletedAt),
    premium: normalizeUserPremium(row.premium),
    staffRoles: asArray(row.staffRoles).map(normalizeStaffRole).filter((entry): entry is AdminUserStaffRole => !!entry),
    counts: normalizeUserCounts(row.counts),
  };
};

const normalizeUserSummary = (value: unknown): AdminUserReadModelSummary => {
  const row = asRecord(value);
  return {
    totalUsers: asInteger(row.totalUsers),
    filteredUsers: asInteger(row.filteredUsers),
    activeUsers: asInteger(row.activeUsers),
    unconfirmedUsers: asInteger(row.unconfirmedUsers),
    bannedUsers: asInteger(row.bannedUsers),
    deletedUsers: asInteger(row.deletedUsers),
    anonymousUsers: asInteger(row.anonymousUsers),
    privateProfiles: asInteger(row.privateProfiles),
    premiumActiveUsers: asInteger(row.premiumActiveUsers),
    openTargetedReports: asInteger(row.openTargetedReports),
    activeStaffRoles: asInteger(row.activeStaffRoles),
    activeBlocks: asInteger(row.activeBlocks),
    accountDeletionRequests: asInteger(row.accountDeletionRequests),
  };
};

const normalizeUsageSummary = (value: unknown): AdminUsageDetailSummary => {
  const row = asRecord(value);
  return {
    filteredRows: asInteger(row.filteredRows),
    internalRows: asInteger(row.internalRows),
    providerRows: asInteger(row.providerRows),
    reconciliationRows: asInteger(row.reconciliationRows),
    roomRows: asInteger(row.roomRows),
    mediaRows: asInteger(row.mediaRows),
    latestAt: asString(row.latestAt),
  };
};

const normalizeUsageRow = (value: unknown): AdminUsageDetailRow | null => {
  const row = asRecord(value);
  const rowId = asString(row.rowId);
  const rowKind = asString(row.rowKind);
  if (!rowId || !rowKind) return null;
  return {
    rowGroup: asString(row.rowGroup) ?? "unknown",
    rowKind,
    rowId,
    occurredAt: asString(row.occurredAt),
    primaryLabel: asString(row.primaryLabel) ?? rowKind,
    secondaryLabel: asString(row.secondaryLabel),
    metricKey: asString(row.metricKey),
    quantity: asNumber(row.quantity),
    unit: asString(row.unit),
    userId: asString(row.userId),
    roomId: asString(row.roomId),
    mediaId: asString(row.mediaId),
    status: asString(row.status),
    source: asString(row.source),
  };
};

const normalizeSystemHistorySummary = (value: unknown): AdminSystemHistorySummary => {
  const row = asRecord(value);
  return {
    filteredRows: asInteger(row.filteredRows),
    adminAuditRows: asInteger(row.adminAuditRows),
    liveOpsRows: asInteger(row.liveOpsRows),
    securityRows: asInteger(row.securityRows),
    liveKitRows: asInteger(row.liveKitRows),
    mediaSecurityRows: asInteger(row.mediaSecurityRows),
    legalRows: asInteger(row.legalRows),
    spectatorRows: asInteger(row.spectatorRows),
    latestAt: asString(row.latestAt),
  };
};

const normalizeSystemHistoryRow = (value: unknown): AdminSystemHistoryRow | null => {
  const row = asRecord(value);
  const rowId = asString(row.rowId);
  const eventType = asString(row.eventType);
  if (!rowId || !eventType) return null;
  return {
    source: asString(row.source) ?? "unknown",
    rowId,
    occurredAt: asString(row.occurredAt),
    eventType,
    category: asString(row.category),
    status: asString(row.status),
    severity: asString(row.severity),
    actorRole: asString(row.actorRole),
    actorUserId: asString(row.actorUserId),
    targetType: asString(row.targetType),
    targetId: asString(row.targetId),
    roomId: asString(row.roomId),
    resultLabel: asString(row.resultLabel),
    metadataFieldCount: asInteger(row.metadataFieldCount) ?? 0,
  };
};

export async function readAdminUsersReadModel(options?: {
  query?: string;
  limit?: number;
}): Promise<AdminUsersReadModel> {
  try {
    const { data, error } = await adminReadModelRpc.rpc("get_admin_users_read_model", {
      p_query: options?.query ?? null,
      p_limit: options?.limit ?? 50,
    });
    if (error) throw error;
    const payload = asRecord(data);
    return {
      connected: payload.connected === true,
      generatedAt: asString(payload.generatedAt) ?? nowIso(),
      summary: normalizeUserSummary(payload.summary),
      items: asArray(payload.items).map(normalizeUserItem).filter((entry): entry is AdminUserReadModelItem => !!entry),
    };
  } catch {
    return createEmptyAdminUsersReadModel();
  }
}

export async function readAdminUsageDetailReadModel(options?: {
  section?: string;
  limit?: number;
}): Promise<AdminUsageDetailReadModel> {
  const section = options?.section ?? "all";
  try {
    const { data, error } = await adminReadModelRpc.rpc("get_admin_usage_detail_read_model", {
      p_section: section,
      p_limit: options?.limit ?? 50,
    });
    if (error) throw error;
    const payload = asRecord(data);
    return {
      connected: payload.connected === true,
      generatedAt: asString(payload.generatedAt) ?? nowIso(),
      section: asString(payload.section) ?? section,
      summary: normalizeUsageSummary(payload.summary),
      items: asArray(payload.items).map(normalizeUsageRow).filter((entry): entry is AdminUsageDetailRow => !!entry),
    };
  } catch {
    return createEmptyAdminUsageDetailReadModel(section);
  }
}

export async function readAdminSystemHistoryReadModel(options?: {
  source?: string;
  limit?: number;
}): Promise<AdminSystemHistoryReadModel> {
  const source = options?.source ?? "all";
  try {
    const { data, error } = await adminReadModelRpc.rpc("get_admin_system_history_read_model", {
      p_source: source,
      p_limit: options?.limit ?? 50,
    });
    if (error) throw error;
    const payload = asRecord(data);
    return {
      connected: payload.connected === true,
      generatedAt: asString(payload.generatedAt) ?? nowIso(),
      source: asString(payload.source) ?? source,
      summary: normalizeSystemHistorySummary(payload.summary),
      items: asArray(payload.items)
        .map(normalizeSystemHistoryRow)
        .filter((entry): entry is AdminSystemHistoryRow => !!entry),
    };
  } catch {
    return createEmptyAdminSystemHistoryReadModel(source);
  }
}
