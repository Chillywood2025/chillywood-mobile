import { supabase } from "./supabase";

// ─── Role & State Types ───────────────────────────────────────────────────────

export type WatchPartyRole = "host" | "viewer";

export type WatchPartyPlaybackState = "playing" | "paused" | "buffering";

export type WatchPartyState = {
  partyId: string;
  titleId: string;
  hostUserId: string;
  playbackPositionMillis: number;
  playbackState: WatchPartyPlaybackState;
  startedAt: string;
  updatedAt: string;
};

export type WatchPartyParticipant = {
  partyId: string;
  userId: string;
  role: WatchPartyRole;
  joinedAt: string;
  lastSeenAt: string;
};

export type WatchPartySyncEvent = {
  id: string;
  partyId: string;
  userId: string;
  kind: "seek" | "play" | "pause" | "join" | "leave" | "reaction";
  playbackPositionMillis: number;
  createdAt: string;
};

// Phase 2 – message shape (chat + reactions + system events)
export type WatchPartyMessage = {
  id: string;
  partyId: string;
  userId: string;
  /** "chat" for text, "reaction" for emoji, "system" for join/leave notices */
  kind: "chat" | "reaction" | "system";
  body: string;
  createdAt: string;
};

// Phase 2 – host action scaffold (mute reactions, kick, lock)
export type WatchPartyHostAction =
  | { type: "mute_reactions" }
  | { type: "lock_room" }
  | { type: "kick_participant"; userId: string };

export type WatchPartyRoomDraft = {
  titleId: string;
  hostUserId: string;
  playbackPositionMillis?: number;
  playbackState?: WatchPartyPlaybackState;
};

// ─── Table Constants ──────────────────────────────────────────────────────────

export const PARTY_ROOMS_TABLE = "watch_party_rooms";
export const PARTY_SYNC_TABLE = "watch_party_sync_events";
/** @deprecated kept for compatibility – use PARTY_ROOMS_TABLE */
export const WATCH_PARTY_TABLE = "watch_party_rooms";
export const WATCH_PARTY_PARTICIPANTS_TABLE = "watch_party_participants";
export const WATCH_PARTY_MESSAGES_TABLE = "watch_party_messages";
export const WATCH_PARTY_SYNC_TABLE = "watch_party_sync_events";

// ─── ID Helpers ───────────────────────────────────────────────────────────────

export const createPartyId = () => {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${stamp}${random}`.toUpperCase();
};

export const createWatchPartyDraft = (draft: WatchPartyRoomDraft): WatchPartyState => {
  const now = new Date().toISOString();
  return {
    partyId: createPartyId(),
    titleId: draft.titleId,
    hostUserId: draft.hostUserId,
    playbackPositionMillis: Math.max(0, Math.floor(draft.playbackPositionMillis ?? 0)),
    playbackState: draft.playbackState ?? "paused",
    startedAt: now,
    updatedAt: now,
  };
};

// ─── Row shape from watch_party_rooms ────────────────────────────────────────
// Exported so consumers (e.g. realtime handlers) can type payload.new directly
export type PartyRoomRow = {
  id?: string | null;
  host_user_id?: string | null;
  title_id?: string | null;
  playback_position_millis?: number | null;
  playback_state?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
};

function rowToState(row: PartyRoomRow): WatchPartyState | null {
  if (!row.id || !row.host_user_id || !row.title_id) return null;
  return {
    partyId: String(row.id),
    hostUserId: String(row.host_user_id),
    titleId: String(row.title_id),
    playbackPositionMillis: Math.max(0, Number(row.playback_position_millis ?? 0)),
    playbackState: (row.playback_state === "playing" ? "playing" : "paused") as WatchPartyPlaybackState,
    startedAt: String(row.started_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

/**
 * Parse a raw Postgres row (e.g. from a Realtime payload.new) into WatchPartyState.
 * Returns null if required fields are missing.
 */
export function parsePartyRoomPayload(row: PartyRoomRow): WatchPartyState | null {
  return rowToState(row);
}

// ─── Backend Operations ───────────────────────────────────────────────────────

/**
 * Create a new watch party room in the backend.
 * Returns the created WatchPartyState or null on failure.
 */
export async function createPartyRoom(
  titleId: string,
  hostUserId: string,
  positionMillis: number,
  state: "playing" | "paused",
): Promise<WatchPartyState | null> {
  try {
    const partyId = createPartyId();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from(PARTY_ROOMS_TABLE)
      .insert({
        id: partyId,
        host_user_id: hostUserId,
        title_id: titleId,
        playback_position_millis: Math.max(0, Math.floor(positionMillis)),
        playback_state: state,
        started_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error || !data) return null;
    return rowToState(data as PartyRoomRow);
  } catch {
    return null;
  }
}

/**
 * Fetch the current state of a party room.
 * Returns null if the room does not exist or request fails.
 */
export async function getPartyRoom(partyId: string): Promise<WatchPartyState | null> {
  try {
    const { data, error } = await supabase
      .from(PARTY_ROOMS_TABLE)
      .select("id,host_user_id,title_id,playback_position_millis,playback_state,started_at,updated_at")
      .eq("id", partyId)
      .maybeSingle();

    if (error || !data) return null;
    return rowToState(data as PartyRoomRow);
  } catch {
    return null;
  }
}

/**
 * Update the playback state of a room (host only — RLS enforces this on backend).
 */
export async function updateRoomPlayback(
  partyId: string,
  positionMillis: number,
  state: "playing" | "paused",
): Promise<void> {
  try {
    await supabase
      .from(PARTY_ROOMS_TABLE)
      .update({
        playback_position_millis: Math.max(0, Math.floor(positionMillis)),
        playback_state: state,
        updated_at: new Date().toISOString(),
      })
      .eq("id", partyId);
  } catch {
    // silent – local playback continues unaffected
  }
}

/**
 * Emit a sync event (play/pause/seek/join/leave).
 * These are append-only event logs — safe to call and ignore failures.
 */
export async function emitSyncEvent(
  partyId: string,
  userId: string,
  kind: WatchPartySyncEvent["kind"],
  positionMillis: number,
): Promise<void> {
  try {
    await supabase.from(PARTY_SYNC_TABLE).insert({
      room_id: partyId,
      user_id: userId,
      event_type: kind,
      playback_position_millis: Math.max(0, Math.floor(positionMillis)),
      created_at: new Date().toISOString(),
    });
  } catch {
    // optional telemetry — ignore failures
  }
}

// ─── Phase 2 Scaffolds ────────────────────────────────────────────────────────

/**
 * Send a chat or reaction message. Persists to watch_party_messages if the
 * table exists; fails silently otherwise (broadcast delivery is primary).
 */
export async function sendPartyMessage(
  partyId: string,
  userId: string,
  kind: WatchPartyMessage["kind"],
  body: string,
): Promise<void> {
  try {
    await supabase.from(WATCH_PARTY_MESSAGES_TABLE).insert({
      room_id: partyId,
      user_id: userId,
      kind,
      body,
      created_at: new Date().toISOString(),
    });
  } catch {
    // table may not exist yet — broadcast delivery is primary, this is optional
  }
}

/**
 * Fetch recent message history for a party room.
 * Returns an empty array if the table doesn't exist or on any error.
 */
export async function fetchPartyMessages(
  partyId: string,
  limit = 100,
): Promise<WatchPartyMessage[]> {
  try {
    const { data, error } = await supabase
      .from(WATCH_PARTY_MESSAGES_TABLE)
      .select("id,room_id,user_id,kind,body,created_at")
      .eq("room_id", partyId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error || !data) return [];

    return data.map((row: Record<string, unknown>) => ({
      id: String(row.id ?? ""),
      partyId: String(row.room_id ?? partyId),
      userId: String(row.user_id ?? ""),
      kind: (row.kind === "reaction" || row.kind === "system" ? row.kind : "chat") as WatchPartyMessage["kind"],
      body: String(row.body ?? ""),
      createdAt: String(row.created_at ?? new Date().toISOString()),
    }));
  } catch {
    return [];
  }
}

/**
 * Apply a host action (lock, mute, kick).
 * Broadcast-only for now — mutating room state requires explicit schema columns.
 */
export async function applyHostAction(
  _partyId: string,
  _action: WatchPartyHostAction,
): Promise<void> {
  // Delivered via Realtime broadcast in the room screen; no DB write needed yet.
}
