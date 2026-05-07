import type { Tables } from "../supabase/database.types";
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

export type PlatformUsageMetricKey = "bandwidth_bytes" | "participant_minutes" | "storage_bytes";

export type CreatorVideoUploadUsageResult = {
  status: string;
  videoId: string | null;
  usageEventRecorded: boolean;
  storageEventRecorded: boolean;
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
  providerUsageReconciliationCount: number | null;
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

const ACTIVE_PREMIUM_ENTITLEMENT_STATUSES = ["active", "trialing", "grace_period"] as const;
const MAX_METADATA_ROWS = 1000;
const MS_PER_MINUTE = 60 * 1000;

const startOfTodayIso = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString();
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

const readTableCount = async (table: string) => (
  readCount(
    adminUsageFoundationClient
      .from(table)
      .select("id", { count: "exact", head: true }),
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

export async function readAdminUsageReadModel(): Promise<AdminUsageReadModel> {
  const startOfToday = startOfTodayIso();

  const [
    premiumActiveCount,
    activeLiveRoomCount,
    activeWatchPartyCount,
    uploadsTodayCount,
    storageMetadataEstimate,
    participantMinuteEstimate,
    bandwidthMetering,
    usageFoundationCounts,
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
          .eq("room_type", "live"),
      ),
    ),
    safeRead(() =>
      readCount(
        supabase
          .from("watch_party_rooms")
          .select("party_id", { count: "exact", head: true })
          .eq("is_active", true)
          .eq("room_type", "title"),
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
    providerUsageReconciliationCount: usageFoundationCounts?.providerUsageReconciliationCount ?? null,
    generatedAt: new Date().toISOString(),
  };
}
