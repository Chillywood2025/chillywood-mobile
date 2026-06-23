import { supabase } from "./supabase";

export const CREATOR_REPLAY_LIBRARY_ITEMS_TABLE = "creator_replay_library_items";

export type CreatorReplaySourceType = "live_stage" | "watch_party_live";
export type CreatorReplayVisibility = "draft" | "circle" | "public";
export type CreatorReplaySaveStatus =
  | "recording_not_started"
  | "recording_active"
  | "recording_stopping"
  | "requested"
  | "processing_replay"
  | "ready"
  | "failed"
  | "deleted";

export type CreatorReplayLibraryItem = {
  id: string;
  ownerUserId: string;
  sourceType: CreatorReplaySourceType;
  sourceRoomId: string | null;
  partyId: string | null;
  broadcastSessionId: string | null;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  visibility: CreatorReplayVisibility;
  rightsStatus: string;
  saveStatus: CreatorReplaySaveStatus;
  playbackRecordId: string | null;
  moderationStatus: string;
  moneyStatus: "free" | "paid" | "paid_unavailable";
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveReplayAction = "request_save_replay" | "end_without_saving";

export type SaveReplayResult = {
  ended: boolean;
  error?: string;
  fullRoomTokenForSpectators: false;
  liveKitPublishAuthorityGranted: false;
  message?: string;
  playbackRecordBacked?: boolean;
  rawHlsUrlReturned: false;
  replayCreated: boolean;
  replayItemId?: string;
  saveStatus?: CreatorReplaySaveStatus;
  visibility?: CreatorReplayVisibility;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeSourceType = (value: unknown): CreatorReplaySourceType => (
  normalizeText(value) === "live_stage" ? "live_stage" : "watch_party_live"
);

const normalizeVisibility = (value: unknown): CreatorReplayVisibility => {
  const normalized = normalizeText(value);
  if (normalized === "public") return "public";
  if (normalized === "circle") return "circle";
  return "draft";
};

const normalizeSaveStatus = (value: unknown): CreatorReplaySaveStatus => {
  const normalized = normalizeText(value);
  if (
    normalized === "recording_not_started"
    || normalized === "recording_active"
    || normalized === "recording_stopping"
    || normalized === "processing_replay"
    || normalized === "ready"
    || normalized === "failed"
    || normalized === "deleted"
  ) return normalized;
  return "requested";
};

const normalizeMoneyStatus = (value: unknown): CreatorReplayLibraryItem["moneyStatus"] => {
  const normalized = normalizeText(value);
  if (normalized === "paid") return "paid";
  if (normalized === "paid_unavailable") return "paid_unavailable";
  return "free";
};

const parseReplayItem = (row: Record<string, unknown>): CreatorReplayLibraryItem => ({
  id: normalizeText(row.id),
  ownerUserId: normalizeText(row.owner_user_id),
  sourceType: normalizeSourceType(row.source_type),
  sourceRoomId: normalizeText(row.source_room_id) || null,
  partyId: normalizeText(row.party_id) || null,
  broadcastSessionId: normalizeText(row.broadcast_session_id) || null,
  title: normalizeText(row.title) || "Saved Replay",
  description: normalizeText(row.description) || null,
  thumbnailUrl: normalizeText(row.thumbnail_url) || null,
  durationSeconds: Number.isFinite(Number(row.duration_seconds)) ? Number(row.duration_seconds) : null,
  visibility: normalizeVisibility(row.visibility),
  rightsStatus: normalizeText(row.rights_status) || "unknown_block_replay",
  saveStatus: normalizeSaveStatus(row.save_status),
  playbackRecordId: normalizeText(row.playback_record_id) || null,
  moderationStatus: normalizeText(row.moderation_status) || "clean",
  moneyStatus: normalizeMoneyStatus(row.money_status),
  errorCode: normalizeText(row.error_code) || null,
  createdAt: normalizeText(row.created_at),
  updatedAt: normalizeText(row.updated_at),
});

export const formatCreatorReplayStatusLabel = (status: CreatorReplaySaveStatus) => {
  if (status === "ready") return "Ready";
  if (status === "failed") return "Failed";
  if (status === "deleted") return "Deleted";
  if (status === "recording_not_started") return "Not recorded";
  if (status === "recording_active") return "Recording";
  if (status === "recording_stopping") return "Stopping";
  if (status === "processing_replay") return "Processing";
  return "Requested";
};

export const formatCreatorReplayVisibilityLabel = (visibility: CreatorReplayVisibility) => {
  if (visibility === "public") return "Public";
  if (visibility === "circle") return "Chi'lly Circle";
  return "Draft";
};

export const formatCreatorReplaySourceLabel = (sourceType: CreatorReplaySourceType) => (
  sourceType === "live_stage" ? "Replay from Live Stage" : "Replay from Watch-Party Live"
);

export async function requestSaveReplay(input: {
  action: SaveReplayAction;
  partyId: string;
  sourceType: CreatorReplaySourceType;
  title?: string | null;
  description?: string | null;
}): Promise<SaveReplayResult> {
  const { data, error } = await supabase.functions.invoke<SaveReplayResult>("request-save-replay", {
    body: {
      action: input.action,
      partyId: input.partyId,
      sourceType: input.sourceType,
      title: input.title,
      description: input.description,
    },
  });

  if (error) {
    throw new Error(error.message || "Unable to request Save Replay.");
  }
  if (!data) {
    throw new Error("Save Replay returned no result.");
  }
  if (data.error) {
    const message = data.message || data.error;
    throw new Error(message);
  }
  return data;
}

export async function readCreatorReplayLibraryItems(ownerUserId: string): Promise<CreatorReplayLibraryItem[]> {
  const ownerId = normalizeText(ownerUserId);
  if (!ownerId) return [];

  const { data, error } = await (supabase as any)
    .from(CREATOR_REPLAY_LIBRARY_ITEMS_TABLE)
    .select("*")
    .eq("owner_user_id", ownerId)
    .neq("save_status", "deleted")
    .order("created_at", { ascending: false });

  if (error || !Array.isArray(data)) return [];
  return data
    .map((row) => parseReplayItem(row as Record<string, unknown>))
    .filter((item) => item.id && item.ownerUserId === ownerId);
}

export async function updateCreatorReplayLibraryItem(
  replayId: string,
  updates: { visibility?: CreatorReplayVisibility; saveStatus?: CreatorReplaySaveStatus },
): Promise<void> {
  const replayItemId = normalizeText(replayId);
  if (!replayItemId) throw new Error("Replay id is required.");
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.visibility) payload.visibility = updates.visibility;
  if (updates.saveStatus) payload.save_status = updates.saveStatus;

  const { error } = await (supabase as any)
    .from(CREATOR_REPLAY_LIBRARY_ITEMS_TABLE)
    .update(payload)
    .eq("id", replayItemId);
  if (error) throw new Error(error.message || "Unable to update replay.");
}
