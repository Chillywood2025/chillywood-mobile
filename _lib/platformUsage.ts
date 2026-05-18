import type { Tables } from "../supabase/database.types";
import { ROOM_ACTIVITY_ACTIVE_WINDOW_MS } from "./performancePolicy";
import { supabase } from "./supabase";

export const PLATFORM_USAGE_METERING_EVENTS_TABLE = "platform_usage_metering_events";
export const PLATFORM_USAGE_DAILY_ROLLUPS_TABLE = "platform_usage_daily_rollups";
export const USAGE_METER_EVENTS_TABLE = "usage_meter_events";
export const USAGE_DAILY_SUMMARIES_TABLE = "usage_daily_summaries";
export const USAGE_MONTHLY_SUMMARIES_TABLE = "usage_monthly_summaries";
export const PROVIDER_ACCOUNTS_TABLE = "provider_accounts";
export const PROVIDER_USAGE_IMPORTS_TABLE = "provider_usage_imports";
export const PROVIDER_USAGE_DAILY_TABLE = "provider_usage_daily";
export const PROVIDER_BILLING_SNAPSHOTS_TABLE = "provider_billing_snapshots";
export const PROVIDER_USAGE_RECONCILIATION_TABLE = "provider_usage_reconciliation";
export const RECORD_CREATOR_VIDEO_UPLOAD_USAGE_RPC = "record_creator_video_upload_usage";
export const ROLLUP_CREATOR_VIDEO_UPLOAD_USAGE_DAILY_RPC = "rollup_creator_video_upload_usage_daily";

export type PlatformUsageMetricKey = "bandwidth_bytes" | "participant_minutes" | "storage_bytes";
export type ProviderUsageKey =
  | "cloudflare_r2"
  | "hetzner_object_storage"
  | "hetzner_server"
  | "ovh_object_storage"
  | "ovh_server";
export type ProviderUsageImportConnectionStatus = "connected" | "not_connected" | "failed" | "partial";

export type AdminProviderUsageImportStatus = {
  provider: ProviderUsageKey;
  label: string;
  status: ProviderUsageImportConnectionStatus;
  latestImportStatus: string | null;
  latestImportAt: string | null;
  latestImportRecords: number | null;
  usageRowsCount: number | null;
  last7DaysRowsCount: number | null;
  storageBytesLast7Days: number | null;
  requestCountLast7Days: number | null;
  providerMetricCountLast7Days: number | null;
};

export type CreatorVideoUploadUsageResult = {
  status: string;
  videoId: string | null;
  usageEventRecorded: boolean;
  storageEventRecorded: boolean;
};

export type CreatorVideoUploadDailyRollupResult = {
  status: string;
  usageDate: string | null;
  rolledUp: boolean;
  uploadSummaryRowsUpserted: number;
  storageSummaryRowsUpserted: number;
};

export type AdminUsageReadModel = {
  premiumActiveCount: number | null;
  activeLiveRoomCount: number | null;
  activeWatchPartyCount: number | null;
  uploadsTodayCount: number | null;
  storageMetadataEstimateBytes: number | null;
  storageMetadataRowsRead: number | null;
  participantMinutesEstimate: number | null;
  participantMembershipRowsRead: number | null;
  bandwidthMeteringBytes: number | null;
  bandwidthMeteringRowsRead: number | null;
  internalUsageSchemaConnected: boolean;
  usageMeterEventsCount: number | null;
  usageDailySummariesCount: number | null;
  usageMonthlySummariesCount: number | null;
  providerUsageSchemaConnected: boolean;
  providerAccountsCount: number | null;
  providerUsageImportsCount: number | null;
  providerUsageDailyCount: number | null;
  providerBillingSnapshotsCount: number | null;
  providerBillingSnapshotImportedCount: number | null;
  providerUsageReconciliationCount: number | null;
  providerUsageReconciliationPendingCount: number | null;
  providerUsageReconciliationMatchedCount: number | null;
  providerUsageReconciliationVarianceCount: number | null;
  latestProviderUsageReconciliationStatus: string | null;
  latestProviderUsageReconciliationAt: string | null;
  providerImportStatuses: AdminProviderUsageImportStatus[];
  providerImportedStorageBytes: number | null;
  providerImportedRequestCount: number | null;
  providerImportedNetworkMetricCount: number | null;
  generatedAt: string;
};

type CountQueryResult = {
  count: number | null;
  error: unknown;
};

type VideoStorageRow = Pick<Tables<"videos">, "file_size_bytes">;
type SocialAttachmentStorageRow = Pick<Tables<"social_attachments">, "size_bytes">;
type WatchPartyMembershipUsageRow = Pick<
  Tables<"watch_party_room_memberships">,
  "joined_at" | "left_at" | "last_seen_at" | "membership_state"
>;
type CommunicationMembershipUsageRow = Pick<
  Tables<"communication_room_memberships">,
  "joined_at" | "left_at" | "last_seen_at" | "membership_state"
>;
type BandwidthUsageEventRow = {
  quantity?: number | string | null;
};
type ProviderUsageDailyReadRow = Pick<Tables<"provider_usage_daily">, "metric_key" | "quantity" | "unit" | "usage_date">;
type ProviderUsageImportReadRow = Pick<
  Tables<"provider_usage_imports">,
  "status" | "created_at" | "records_imported" | "error_message"
>;
type ProviderUsageReconciliationReadRow = Pick<Tables<"provider_usage_reconciliation">, "status" | "updated_at" | "created_at">;

const ACTIVE_PREMIUM_ENTITLEMENT_STATUSES = ["active", "trialing", "grace_period"] as const;
const MAX_METADATA_ROWS = 1000;
const MS_PER_MINUTE = 60 * 1000;
const PROVIDER_USAGE_IMPORT_STATUS_DEFAULTS: Array<{ provider: ProviderUsageKey; label: string }> = [
  { provider: "cloudflare_r2", label: "Cloudflare R2" },
  { provider: "hetzner_object_storage", label: "Hetzner Object Storage" },
  { provider: "hetzner_server", label: "Hetzner Servers" },
  { provider: "ovh_object_storage", label: "OVH Object Storage" },
  { provider: "ovh_server", label: "OVH Servers" },
];
const ACTIVE_PROVIDER_IMPORT_KEYS = new Set<ProviderUsageKey>([
  "cloudflare_r2",
  "hetzner_object_storage",
  "hetzner_server",
]);

const startOfTodayIso = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString();
};

const startOfLast7DaysIsoDate = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  return start.toISOString().slice(0, 10);
};

const toPositiveNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const toUsageText = (value: unknown) => String(value ?? "").trim();

const toTimestamp = (value: unknown) => {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeCreatorVideoUploadUsageResult = (value: unknown, fallbackVideoId: string): CreatorVideoUploadUsageResult => {
  const result = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    status: toUsageText(result.status) || "unknown",
    videoId: toUsageText(result.video_id) || fallbackVideoId || null,
    usageEventRecorded: result.usage_event_recorded === true,
    storageEventRecorded: result.storage_event_recorded === true,
  };
};

const normalizeCreatorVideoUploadDailyRollupResult = (value: unknown): CreatorVideoUploadDailyRollupResult => {
  const result = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    status: toUsageText(result.status) || "unknown",
    usageDate: toUsageText(result.usage_date) || null,
    rolledUp: result.rolled_up === true,
    uploadSummaryRowsUpserted: Math.trunc(toPositiveNumber(result.upload_summary_rows_upserted)),
    storageSummaryRowsUpserted: Math.trunc(toPositiveNumber(result.storage_summary_rows_upserted)),
  };
};

const safeRead = async <T>(loader: () => Promise<T>): Promise<T | null> => {
  try {
    return await loader();
  } catch {
    return null;
  }
};

const readCount = async (query: PromiseLike<CountQueryResult>) => {
  const { count, error } = await query;
  if (error) throw error;
  return Number(count ?? 0);
};

const adminUsageFoundationClient = supabase as unknown as {
  from: (table: string) => any;
};

const usageRpcClient = supabase as unknown as {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

const readTableCount = async (table: string) => (
  readCount(
    adminUsageFoundationClient
      .from(table)
      .select("id", { count: "exact", head: true }),
  )
);

const readTableCountWhereEq = async (table: string, column: string, value: string | number | boolean) => (
  readCount(
    adminUsageFoundationClient
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(column, value),
  )
);

const sumRows = <T>(rows: T[] | null | undefined, pick: (row: T) => unknown) => (
  (rows ?? []).reduce((total, row) => total + toPositiveNumber(pick(row)), 0)
);

const calculateMembershipMinutes = (
  rows: Array<WatchPartyMembershipUsageRow | CommunicationMembershipUsageRow> | null | undefined,
  windowStartIso: string,
  now = new Date(),
) => {
  const windowStart = Date.parse(windowStartIso);
  const windowEnd = now.getTime();
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) return 0;

  return (rows ?? []).reduce((total, row) => {
    const joinedAt = toTimestamp(row.joined_at);
    const lastSeenAt = toTimestamp(row.last_seen_at);
    const leftAt = toTimestamp(row.left_at);
    if (!joinedAt) return total;

    const start = Math.max(joinedAt, windowStart);
    const endCandidate = leftAt ?? lastSeenAt ?? windowEnd;
    const end = Math.min(Math.max(endCandidate, start), windowEnd);
    if (end <= start) return total;
    return total + ((end - start) / MS_PER_MINUTE);
  }, 0);
};

async function readStorageMetadataEstimate() {
  const [
    { data: videoRows, error: videoError, count: videoCount },
    { data: attachmentRows, error: attachmentError, count: attachmentCount },
  ] = await Promise.all([
    supabase
      .from("videos")
      .select("file_size_bytes", { count: "exact" })
      .not("file_size_bytes", "is", null)
      .limit(MAX_METADATA_ROWS)
      .returns<VideoStorageRow[]>(),
    supabase
      .from("social_attachments")
      .select("size_bytes", { count: "exact" })
      .not("size_bytes", "is", null)
      .limit(MAX_METADATA_ROWS)
      .returns<SocialAttachmentStorageRow[]>(),
  ]);

  if (videoError || attachmentError) throw videoError ?? attachmentError;

  return {
    bytes: sumRows(videoRows, (row) => row.file_size_bytes) + sumRows(attachmentRows, (row) => row.size_bytes),
    rowsRead: Math.min(Number(videoCount ?? videoRows?.length ?? 0), videoRows?.length ?? 0)
      + Math.min(Number(attachmentCount ?? attachmentRows?.length ?? 0), attachmentRows?.length ?? 0),
  };
}

async function readParticipantMinuteEstimate(startIso: string) {
  const [
    { data: watchPartyRows, error: watchPartyError, count: watchPartyCount },
    { data: communicationRows, error: communicationError, count: communicationCount },
  ] = await Promise.all([
    supabase
      .from("watch_party_room_memberships")
      .select("joined_at,left_at,last_seen_at,membership_state", { count: "exact" })
      .gte("last_seen_at", startIso)
      .limit(MAX_METADATA_ROWS)
      .returns<WatchPartyMembershipUsageRow[]>(),
    supabase
      .from("communication_room_memberships")
      .select("joined_at,left_at,last_seen_at,membership_state", { count: "exact" })
      .gte("last_seen_at", startIso)
      .limit(MAX_METADATA_ROWS)
      .returns<CommunicationMembershipUsageRow[]>(),
  ]);

  if (watchPartyError || communicationError) throw watchPartyError ?? communicationError;

  return {
    minutes: calculateMembershipMinutes([...(watchPartyRows ?? []), ...(communicationRows ?? [])], startIso),
    rowsRead: Math.min(Number(watchPartyCount ?? watchPartyRows?.length ?? 0), watchPartyRows?.length ?? 0)
      + Math.min(Number(communicationCount ?? communicationRows?.length ?? 0), communicationRows?.length ?? 0),
  };
}

async function readBandwidthMeteringEvents(startIso: string) {
  const { data, error, count } = await adminUsageFoundationClient
    .from(PLATFORM_USAGE_METERING_EVENTS_TABLE)
    .select("quantity", { count: "exact" })
    .eq("metric_key", "bandwidth_bytes")
    .gte("occurred_at", startIso)
    .limit(MAX_METADATA_ROWS);

  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []) as BandwidthUsageEventRow[];
  return {
    bytes: sumRows(rows, (row) => row.quantity),
    rowsRead: Math.min(Number(count ?? rows.length), rows.length),
  };
}

async function readUsageFoundationCounts() {
  const [
    usageMeterEventsCount,
    usageDailySummariesCount,
    usageMonthlySummariesCount,
    providerAccountsCount,
    providerUsageImportsCount,
    providerUsageDailyCount,
    providerBillingSnapshotsCount,
    providerUsageReconciliationCount,
  ] = await Promise.all([
    safeRead(() => readTableCount(USAGE_METER_EVENTS_TABLE)),
    safeRead(() => readTableCount(USAGE_DAILY_SUMMARIES_TABLE)),
    safeRead(() => readTableCount(USAGE_MONTHLY_SUMMARIES_TABLE)),
    safeRead(() => readTableCount(PROVIDER_ACCOUNTS_TABLE)),
    safeRead(() => readTableCount(PROVIDER_USAGE_IMPORTS_TABLE)),
    safeRead(() => readTableCount(PROVIDER_USAGE_DAILY_TABLE)),
    safeRead(() => readTableCount(PROVIDER_BILLING_SNAPSHOTS_TABLE)),
    safeRead(() => readTableCount(PROVIDER_USAGE_RECONCILIATION_TABLE)),
  ]);

  return {
    usageMeterEventsCount,
    usageDailySummariesCount,
    usageMonthlySummariesCount,
    providerAccountsCount,
    providerUsageImportsCount,
    providerUsageDailyCount,
    providerBillingSnapshotsCount,
    providerUsageReconciliationCount,
  };
}

async function readProviderBillingReconciliationSummary() {
  const [
    providerBillingSnapshotImportedCount,
    providerUsageReconciliationPendingCount,
    providerUsageReconciliationMatchedCount,
    providerUsageReconciliationVarianceCount,
    latestReconciliationResult,
  ] = await Promise.all([
    safeRead(() => readTableCountWhereEq(PROVIDER_BILLING_SNAPSHOTS_TABLE, "status", "imported")),
    safeRead(() => readTableCountWhereEq(PROVIDER_USAGE_RECONCILIATION_TABLE, "status", "pending")),
    safeRead(() => readTableCountWhereEq(PROVIDER_USAGE_RECONCILIATION_TABLE, "status", "matched")),
    safeRead(() => readTableCountWhereEq(PROVIDER_USAGE_RECONCILIATION_TABLE, "status", "variance")),
    safeRead(async () => {
      const { data, error } = await adminUsageFoundationClient
        .from(PROVIDER_USAGE_RECONCILIATION_TABLE)
        .select("status,updated_at,created_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data ?? null) as ProviderUsageReconciliationReadRow | null;
    }),
  ]);

  return {
    providerBillingSnapshotImportedCount,
    providerUsageReconciliationPendingCount,
    providerUsageReconciliationMatchedCount,
    providerUsageReconciliationVarianceCount,
    latestProviderUsageReconciliationStatus: latestReconciliationResult?.status ?? null,
    latestProviderUsageReconciliationAt: latestReconciliationResult?.updated_at ?? latestReconciliationResult?.created_at ?? null,
  };
}

const emptyProviderImportStatus = (
  provider: ProviderUsageKey,
  label: string,
): AdminProviderUsageImportStatus => ({
  provider,
  label,
  status: "not_connected",
  latestImportStatus: null,
  latestImportAt: null,
  latestImportRecords: null,
  usageRowsCount: null,
  last7DaysRowsCount: null,
  storageBytesLast7Days: null,
  requestCountLast7Days: null,
  providerMetricCountLast7Days: null,
});

const resolveProviderImportConnectionStatus = (
  latestImportStatus: string | null,
  usageRowsCount: number | null,
): ProviderUsageImportConnectionStatus => {
  const hasRows = typeof usageRowsCount === "number" && usageRowsCount > 0;
  if (latestImportStatus === "failed") return hasRows ? "partial" : "failed";
  if (latestImportStatus === "completed" || hasRows) return "connected";
  return "not_connected";
};

async function readProviderUsageImportStatus(
  provider: ProviderUsageKey,
  label: string,
  last7DaysDate: string,
): Promise<AdminProviderUsageImportStatus> {
  if (!ACTIVE_PROVIDER_IMPORT_KEYS.has(provider)) {
    return emptyProviderImportStatus(provider, label);
  }

  const [
    latestImportResult,
    usageRowsCount,
    last7DaysRowsResult,
  ] = await Promise.all([
    adminUsageFoundationClient
      .from(PROVIDER_USAGE_IMPORTS_TABLE)
      .select("status,created_at,records_imported,error_message")
      .eq("provider", provider)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    readTableCountForProvider(PROVIDER_USAGE_DAILY_TABLE, provider),
    adminUsageFoundationClient
      .from(PROVIDER_USAGE_DAILY_TABLE)
      .select("metric_key,quantity,unit,usage_date", { count: "exact" })
      .eq("provider", provider)
      .gte("usage_date", last7DaysDate)
      .limit(MAX_METADATA_ROWS),
  ]);

  if (latestImportResult.error && latestImportResult.error.code !== "PGRST116") throw latestImportResult.error;
  if (last7DaysRowsResult.error) throw last7DaysRowsResult.error;

  const latestImport = (latestImportResult.data ?? null) as ProviderUsageImportReadRow | null;
  const last7DaysRows = (Array.isArray(last7DaysRowsResult.data) ? last7DaysRowsResult.data : []) as ProviderUsageDailyReadRow[];
  const storageBytesLast7Days = sumRows(last7DaysRows, (row) => (
    row.unit === "bytes" && [
      "storage_payload_bytes",
      "storage_metadata_bytes",
      "s3_inventory_storage_bytes",
    ].includes(row.metric_key)
      ? row.quantity
      : 0
  ));
  const requestCountLast7Days = sumRows(last7DaysRows, (row) => (
    row.unit === "request" && row.metric_key === "operation_requests" ? row.quantity : 0
  ));
  const providerMetricCountLast7Days = sumRows(last7DaysRows, (row) => (
    row.unit === "provider_metric" ? row.quantity : 0
  ));

  return {
    provider,
    label,
    status: resolveProviderImportConnectionStatus(latestImport?.status ?? null, usageRowsCount),
    latestImportStatus: latestImport?.status ?? null,
    latestImportAt: latestImport?.created_at ?? null,
    latestImportRecords: typeof latestImport?.records_imported === "number" ? latestImport.records_imported : null,
    usageRowsCount,
    last7DaysRowsCount: Number(last7DaysRowsResult.count ?? last7DaysRows.length),
    storageBytesLast7Days: storageBytesLast7Days > 0 ? storageBytesLast7Days : null,
    requestCountLast7Days: requestCountLast7Days > 0 ? requestCountLast7Days : null,
    providerMetricCountLast7Days: providerMetricCountLast7Days > 0 ? providerMetricCountLast7Days : null,
  };
}

async function readTableCountForProvider(table: string, provider: ProviderUsageKey) {
  return readCount(
    adminUsageFoundationClient
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("provider", provider),
  );
}

async function readProviderUsageImportStatuses(): Promise<AdminProviderUsageImportStatus[]> {
  const last7DaysDate = startOfLast7DaysIsoDate();
  return Promise.all(
    PROVIDER_USAGE_IMPORT_STATUS_DEFAULTS.map(async ({ provider, label }) => (
      await safeRead(() => readProviderUsageImportStatus(provider, label, last7DaysDate))
        ?? emptyProviderImportStatus(provider, label)
    )),
  );
}

export const formatUsageBytes = (bytes?: number | null) => {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "Not connected yet";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes)} B`;
};

export const formatUsageMinutes = (minutes?: number | null) => {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) return "Not connected yet";
  if (minutes >= 60) return `${(minutes / 60).toFixed(1)} participant-hours`;
  return `${Math.round(minutes)} participant-minutes`;
};

export async function recordCreatorVideoUploadUsage(videoId: string): Promise<CreatorVideoUploadUsageResult> {
  const targetVideoId = toUsageText(videoId);
  if (!targetVideoId) {
    return {
      status: "invalid_video_id",
      videoId: null,
      usageEventRecorded: false,
      storageEventRecorded: false,
    };
  }

  const { data, error } = await supabase.rpc(RECORD_CREATOR_VIDEO_UPLOAD_USAGE_RPC, {
    target_video_id: targetVideoId,
  });
  if (error) throw error;

  return normalizeCreatorVideoUploadUsageResult(data, targetVideoId);
}

export async function rollupCreatorVideoUploadUsageDaily(
  usageDate?: string | null,
): Promise<CreatorVideoUploadDailyRollupResult> {
  const normalizedDate = toUsageText(usageDate);
  const { data, error } = await usageRpcClient.rpc(ROLLUP_CREATOR_VIDEO_UPLOAD_USAGE_DAILY_RPC, {
    target_usage_date: normalizedDate || null,
  });
  if (error) throw error;

  return normalizeCreatorVideoUploadDailyRollupResult(data);
}

export async function readAdminUsageReadModel(): Promise<AdminUsageReadModel> {
  const startOfToday = startOfTodayIso();
  const activeRoomCutoffIso = new Date(Date.now() - ROOM_ACTIVITY_ACTIVE_WINDOW_MS).toISOString();

  const [
    premiumActiveCount,
    activeLiveRoomCount,
    activeWatchPartyCount,
    uploadsTodayCount,
    storageMetadataEstimate,
    participantMinuteEstimate,
    bandwidthMetering,
    usageFoundationCounts,
    providerImportStatuses,
    providerBillingReconciliationSummary,
  ] = await Promise.all([
    safeRead(() =>
      readCount(
        supabase
          .from("user_entitlements")
          .select("user_id", { count: "exact", head: true })
          .eq("entitlement_key", "premium")
          .in("status", [...ACTIVE_PREMIUM_ENTITLEMENT_STATUSES]),
      ),
    ),
    safeRead(() =>
      readCount(
        supabase
          .from("watch_party_rooms")
          .select("party_id", { count: "exact", head: true })
          .eq("is_active", true)
          .eq("room_type", "live")
          .gte("last_activity_at", activeRoomCutoffIso),
      ),
    ),
    safeRead(() =>
      readCount(
        supabase
          .from("watch_party_rooms")
          .select("party_id", { count: "exact", head: true })
          .eq("is_active", true)
          .eq("room_type", "title")
          .gte("last_activity_at", activeRoomCutoffIso),
      ),
    ),
    safeRead(() =>
      readCount(
        supabase
          .from("videos")
          .select("id", { count: "exact", head: true })
          .gte("created_at", startOfToday),
      ),
    ),
    safeRead(readStorageMetadataEstimate),
    safeRead(() => readParticipantMinuteEstimate(startOfToday)),
    safeRead(() => readBandwidthMeteringEvents(startOfToday)),
    safeRead(readUsageFoundationCounts),
    safeRead(readProviderUsageImportStatuses),
    safeRead(readProviderBillingReconciliationSummary),
  ]);

  const internalUsageCounts = [
    usageFoundationCounts?.usageMeterEventsCount,
    usageFoundationCounts?.usageDailySummariesCount,
    usageFoundationCounts?.usageMonthlySummariesCount,
  ];
  const providerUsageCounts = [
    usageFoundationCounts?.providerAccountsCount,
    usageFoundationCounts?.providerUsageImportsCount,
    usageFoundationCounts?.providerUsageDailyCount,
    usageFoundationCounts?.providerBillingSnapshotsCount,
    usageFoundationCounts?.providerUsageReconciliationCount,
  ];
  const providerStatuses = providerImportStatuses ?? PROVIDER_USAGE_IMPORT_STATUS_DEFAULTS.map(({ provider, label }) => (
    emptyProviderImportStatus(provider, label)
  ));
  const providerImportedStorageBytes = sumRows(providerStatuses, (status) => status.storageBytesLast7Days);
  const providerImportedRequestCount = sumRows(providerStatuses, (status) => status.requestCountLast7Days);
  const providerImportedNetworkMetricCount = sumRows(providerStatuses, (status) => status.providerMetricCountLast7Days);

  return {
    premiumActiveCount,
    activeLiveRoomCount,
    activeWatchPartyCount,
    uploadsTodayCount,
    storageMetadataEstimateBytes: storageMetadataEstimate?.bytes ?? null,
    storageMetadataRowsRead: storageMetadataEstimate?.rowsRead ?? null,
    participantMinutesEstimate: participantMinuteEstimate?.minutes ?? null,
    participantMembershipRowsRead: participantMinuteEstimate?.rowsRead ?? null,
    bandwidthMeteringBytes: bandwidthMetering && bandwidthMetering.rowsRead > 0 ? bandwidthMetering.bytes : null,
    bandwidthMeteringRowsRead: bandwidthMetering?.rowsRead ?? null,
    internalUsageSchemaConnected: internalUsageCounts.every((count) => typeof count === "number"),
    usageMeterEventsCount: usageFoundationCounts?.usageMeterEventsCount ?? null,
    usageDailySummariesCount: usageFoundationCounts?.usageDailySummariesCount ?? null,
    usageMonthlySummariesCount: usageFoundationCounts?.usageMonthlySummariesCount ?? null,
    providerUsageSchemaConnected: providerUsageCounts.every((count) => typeof count === "number"),
    providerAccountsCount: usageFoundationCounts?.providerAccountsCount ?? null,
    providerUsageImportsCount: usageFoundationCounts?.providerUsageImportsCount ?? null,
    providerUsageDailyCount: usageFoundationCounts?.providerUsageDailyCount ?? null,
    providerBillingSnapshotsCount: usageFoundationCounts?.providerBillingSnapshotsCount ?? null,
    providerBillingSnapshotImportedCount: providerBillingReconciliationSummary?.providerBillingSnapshotImportedCount ?? null,
    providerUsageReconciliationCount: usageFoundationCounts?.providerUsageReconciliationCount ?? null,
    providerUsageReconciliationPendingCount: providerBillingReconciliationSummary?.providerUsageReconciliationPendingCount ?? null,
    providerUsageReconciliationMatchedCount: providerBillingReconciliationSummary?.providerUsageReconciliationMatchedCount ?? null,
    providerUsageReconciliationVarianceCount: providerBillingReconciliationSummary?.providerUsageReconciliationVarianceCount ?? null,
    latestProviderUsageReconciliationStatus: providerBillingReconciliationSummary?.latestProviderUsageReconciliationStatus ?? null,
    latestProviderUsageReconciliationAt: providerBillingReconciliationSummary?.latestProviderUsageReconciliationAt ?? null,
    providerImportStatuses: providerStatuses,
    providerImportedStorageBytes: providerImportedStorageBytes > 0 ? providerImportedStorageBytes : null,
    providerImportedRequestCount: providerImportedRequestCount > 0 ? providerImportedRequestCount : null,
    providerImportedNetworkMetricCount: providerImportedNetworkMetricCount > 0 ? providerImportedNetworkMetricCount : null,
    generatedAt: new Date().toISOString(),
  };
}
