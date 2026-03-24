import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

// ─── Role & State Types ───────────────────────────────────────────────────────

export type WatchPartyRole = "host" | "viewer";

export type WatchPartyPlaybackState = "playing" | "paused" | "buffering";

export type WatchPartyRoomType = "live" | "title";

export type WatchPartyState = {
  partyId: string;
  roomCode: string;
  roomType: WatchPartyRoomType;
  titleId: string | null;
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
  roomType?: WatchPartyRoomType;
  titleId?: string | null;
  hostUserId: string;
  playbackPositionMillis?: number;
  playbackState?: WatchPartyPlaybackState;
};

export type WatchPartyCreateError = {
  code: string | null;
  message: string;
  details?: string | null;
  hint?: string | null;
  payload?: Record<string, unknown>;
};

export type WatchPartyCreateResult =
  | WatchPartyState
  | {
      error: WatchPartyCreateError;
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

const PARTY_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GUEST_USER_STORAGE_KEY = "watch_party_guest_user_id_v1";
const GUEST_AUTH_EMAIL_STORAGE_KEY = "watch_party_guest_auth_email_v1";
const GUEST_AUTH_PASSWORD_STORAGE_KEY = "watch_party_guest_auth_password_v1";
let cachedGuestUserId: string | null = null;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const createPartyIdentifier = (length = 6) => {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    const idx = Math.floor(Math.random() * PARTY_ID_CHARS.length);
    out += PARTY_ID_CHARS[idx];
  }
  return out;
};

const randomHex = (size: number) => {
  let out = "";
  const chars = "0123456789abcdef";
  for (let i = 0; i < size; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
};

const createGuestUuid = () => {
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${["8", "9", "a", "b"][Math.floor(Math.random() * 4)]}${randomHex(3)}-${randomHex(12)}`;
};

const createGuestAuthEmail = () => `watchparty-${randomHex(12)}@chillywood.local`;
const createGuestAuthPassword = () => `${randomHex(16)}A!7${randomHex(16)}`;

const looksLikeUuid = (value: string) => UUID_REGEX.test(value);

const isMissingPartyIdColumnError = (error: unknown) => {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  return /party_id/i.test(message) && /column/i.test(message);
};

const isMissingRoomTypeColumnError = (error: unknown) => {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  return /room_type/i.test(message) && /column/i.test(message);
};

const isConflictError = (error: unknown) => {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  return code === "23505";
};

const isForeignKeyError = (error: unknown) => {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  return code === "23503";
};

const toCreateError = (
  error: unknown,
  payload?: Record<string, unknown>,
  fallbackMessage = "Failed to create watch party room",
): WatchPartyCreateError => {
  const raw = (error ?? {}) as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  return {
    code: raw.code ? String(raw.code) : null,
    message: raw.message ? String(raw.message) : fallbackMessage,
    details: raw.details ? String(raw.details) : null,
    hint: raw.hint ? String(raw.hint) : null,
    payload,
  };
};

async function ensurePersistentGuestAuthUserId(): Promise<string | null> {
  try {
    let email = (await AsyncStorage.getItem(GUEST_AUTH_EMAIL_STORAGE_KEY))?.trim() || "";
    let password = (await AsyncStorage.getItem(GUEST_AUTH_PASSWORD_STORAGE_KEY))?.trim() || "";

    if (!email || !password) {
      email = createGuestAuthEmail();
      password = createGuestAuthPassword();
      await AsyncStorage.multiSet([
        [GUEST_AUTH_EMAIL_STORAGE_KEY, email],
        [GUEST_AUTH_PASSWORD_STORAGE_KEY, password],
      ]);
    }

    const signIn = await supabase.auth.signInWithPassword({ email, password });
    const signInUserId = String(signIn.data?.user?.id ?? signIn.data?.session?.user?.id ?? "").trim();
    if (signInUserId && looksLikeUuid(signInUserId)) return signInUserId;

    const signUp = await supabase.auth.signUp({ email, password });
    const signUpUserId = String(signUp.data?.user?.id ?? signUp.data?.session?.user?.id ?? "").trim();
    if (signUpUserId && looksLikeUuid(signUpUserId)) return signUpUserId;

    const retrySignIn = await supabase.auth.signInWithPassword({ email, password });
    const retrySignInUserId = String(retrySignIn.data?.user?.id ?? retrySignIn.data?.session?.user?.id ?? "").trim();
    if (retrySignInUserId && looksLikeUuid(retrySignInUserId)) return retrySignInUserId;
  } catch {
    // fall through
  }

  return null;
}

async function getAuthBackedUserId(): Promise<string | null> {
  try {
    const userResult = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const authUserId = String(userResult.data?.user?.id ?? "").trim();
    if (authUserId && looksLikeUuid(authUserId)) return authUserId;
  } catch {
    // fall through
  }

  try {
    const sessionResult = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    const sessionUserId = String(sessionResult.data?.session?.user?.id ?? "").trim();
    if (sessionUserId && looksLikeUuid(sessionUserId)) return sessionUserId;
  } catch {
    // fall through
  }

  try {
    const anonymous = await supabase.auth.signInAnonymously();
    const anonymousUserId = String(anonymous.data?.user?.id ?? "").trim();
    if (anonymousUserId && looksLikeUuid(anonymousUserId)) return anonymousUserId;

    const anonymousSessionUserId = String(anonymous.data?.session?.user?.id ?? "").trim();
    if (anonymousSessionUserId && looksLikeUuid(anonymousSessionUserId)) return anonymousSessionUserId;
  } catch {
    // anonymous auth may be disabled
  }

  const persistentGuestUserId = await ensurePersistentGuestAuthUserId();
  if (persistentGuestUserId) return persistentGuestUserId;

  return null;
}

export async function getSafePartyUserId(): Promise<string> {
  const authBackedId = await getAuthBackedUserId();
  if (authBackedId) return authBackedId;

  try {
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    const authUserId = data?.session?.user?.id;
    if (authUserId) return String(authUserId);
  } catch {
    // fall through to guest id
  }

  if (cachedGuestUserId) return cachedGuestUserId;

  try {
    const stored = await AsyncStorage.getItem(GUEST_USER_STORAGE_KEY);
    if (stored && stored.trim()) {
      const normalized = stored.trim();
      if (looksLikeUuid(normalized)) {
        cachedGuestUserId = normalized;
        return cachedGuestUserId;
      }

      const migrated = createGuestUuid();
      cachedGuestUserId = migrated;
      await AsyncStorage.setItem(GUEST_USER_STORAGE_KEY, migrated);
      return cachedGuestUserId;
    }
  } catch {
    // fall through to create
  }

  const generated = createGuestUuid();
  cachedGuestUserId = generated;
  try {
    await AsyncStorage.setItem(GUEST_USER_STORAGE_KEY, generated);
  } catch {
    // non-fatal
  }
  return generated;
}

export const createWatchPartyDraft = (draft: WatchPartyRoomDraft): WatchPartyState => {
  const now = new Date().toISOString();
  const partyId = createPartyId();
  const roomType: WatchPartyRoomType = draft.roomType ?? (draft.titleId ? "title" : "live");
  const titleId = roomType === "title" ? String(draft.titleId ?? "").trim() || null : null;
  return {
    partyId,
    roomCode: partyId,
    roomType,
    titleId,
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
  party_id?: string | null;
  room_type?: string | null;
  host_user_id?: string | null;
  title_id?: string | null;
  playback_position_millis?: number | null;
  playback_state?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
};

function rowToState(row: PartyRoomRow): WatchPartyState | null {
  const primaryId = String(row.party_id ?? "").trim();
  const hostUserId = String(row.host_user_id ?? "").trim();
  const titleIdRaw = String(row.title_id ?? "").trim();
  const roomTypeRaw = String(row.room_type ?? "").trim().toLowerCase();
  const roomType: WatchPartyRoomType = roomTypeRaw === "live" || roomTypeRaw === "title"
    ? (roomTypeRaw as WatchPartyRoomType)
    : titleIdRaw
      ? "title"
      : "live";

  if (!primaryId || !hostUserId) return null;
  if (roomType === "title" && !titleIdRaw) return null;

  return {
    partyId: primaryId,
    roomCode: primaryId,
    roomType,
    hostUserId,
    titleId: titleIdRaw || null,
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

async function resolvePartyTitleId(inputTitleId: string): Promise<string | null> {
  const raw = String(inputTitleId ?? "").trim();
  if (!raw) return null;

  try {
    const direct = await supabase.from("titles").select("id").eq("id", raw).maybeSingle();
    if (!direct.error && direct.data?.id) return String(direct.data.id);

    const fallbackAny = await supabase.from("titles").select("id").limit(1).maybeSingle();
    if (!fallbackAny.error && fallbackAny.data?.id) return String(fallbackAny.data.id);
  } catch {
    // fall through
  }

  return null;
}

async function resolvePartyHostUserId(inputHostUserId: string): Promise<string | null> {
  const raw = String(inputHostUserId ?? "").trim();
  const authBackedId = await getAuthBackedUserId();
  if (authBackedId) return authBackedId;

  if (raw && looksLikeUuid(raw)) return raw;
  return null;
}

// ─── Backend Operations ───────────────────────────────────────────────────────

/**
 * Create a new watch party room in the backend.
 * Returns the created WatchPartyState or null on failure.
 */
export async function createPartyRoom(
  titleId: string | null | undefined,
  hostUserId: string,
  positionMillis: number,
  state: "playing" | "paused",
  options?: { roomType?: WatchPartyRoomType },
): Promise<WatchPartyCreateResult> {
  const requestedTitleId = String(titleId ?? "").trim();
  const requestedRoomType: WatchPartyRoomType = options?.roomType ?? (requestedTitleId ? "title" : "live");
  const resolvedTitleId = requestedRoomType === "title" ? await resolvePartyTitleId(requestedTitleId) : null;
  const requestedHostUserId = String(hostUserId ?? "").trim();
  const resolvedHostUserId = await resolvePartyHostUserId(requestedHostUserId);
  const titleIdCandidates: (string | null)[] =
    requestedRoomType === "live"
      ? [null]
      : Array.from(new Set([resolvedTitleId, requestedTitleId].filter(Boolean) as string[]));
  const hostUserIdCandidates = Array.from(
    new Set([resolvedHostUserId].filter(Boolean) as string[]),
  );
  if (!hostUserIdCandidates.length) {
    const explicitError = toCreateError(
      { message: "Unable to resolve valid hostUserId for watch party room" },
      { requestedHostUserId, resolvedHostUserId, titleId: requestedTitleId },
    );
    console.log("WATCH PARTY: createPartyRoom error", explicitError);
    return { error: explicitError };
  }

  if (requestedRoomType === "title" && !titleIdCandidates.length) {
    const explicitError = toCreateError(
      { message: "Unable to resolve valid titleId for watch party room" },
      { requestedTitleId, resolvedTitleId },
    );
    console.log("WATCH PARTY: createPartyRoom error", explicitError);
    return { error: explicitError };
  }

  let lastError: WatchPartyCreateError | null = null;

  try {
    for (const safeTitleId of titleIdCandidates) {
      for (const safeHostUserId of hostUserIdCandidates) {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const generatedPartyId = createPartyIdentifier();
          const now = new Date().toISOString();
          const payload = {
            party_id: generatedPartyId,
            room_type: requestedRoomType,
            host_user_id: safeHostUserId,
            title_id: safeTitleId,
            playback_position_millis: Math.max(0, Math.floor(positionMillis)),
            playback_state: state,
            started_at: now,
            updated_at: now,
          };

          console.log("WATCH PARTY: final create payload", payload);

          const { data, error } = await supabase
            .from(PARTY_ROOMS_TABLE)
            .insert(payload)
            .select("party_id,room_type,host_user_id,title_id,playback_position_millis,playback_state,started_at,updated_at")
            .single();

          if (!error && data) return rowToState(data as PartyRoomRow);
          if (error) {
            lastError = toCreateError(error, payload);
            console.log("WATCH PARTY: createPartyRoom error", lastError);
          }

          if (error && isMissingRoomTypeColumnError(error)) {
            const legacyRoomTypePayload = {
              party_id: generatedPartyId,
              host_user_id: safeHostUserId,
              title_id: safeTitleId,
              playback_position_millis: Math.max(0, Math.floor(positionMillis)),
              playback_state: state,
              started_at: now,
              updated_at: now,
            };
            const legacyRoomTypeInsert = await supabase
              .from(PARTY_ROOMS_TABLE)
              .insert(legacyRoomTypePayload)
              .select("party_id,host_user_id,title_id,playback_position_millis,playback_state,started_at,updated_at")
              .single();

            if (!legacyRoomTypeInsert.error && legacyRoomTypeInsert.data) {
              return rowToState(legacyRoomTypeInsert.data as PartyRoomRow);
            }
            if (legacyRoomTypeInsert.error) {
              lastError = toCreateError(legacyRoomTypeInsert.error, legacyRoomTypePayload);
              console.log("WATCH PARTY: createPartyRoom error", lastError);
            }
          }

          if (error && isConflictError(error)) continue;
          if (error && isForeignKeyError(error)) break;
          if (error && isMissingPartyIdColumnError(error)) {
            for (let legacyAttempt = 0; legacyAttempt < 5; legacyAttempt += 1) {
              const legacyNow = new Date().toISOString();
              const legacyPayload = {
                party_id: generatedPartyId,
                room_type: requestedRoomType,
                host_user_id: safeHostUserId,
                title_id: safeTitleId,
                playback_position_millis: Math.max(0, Math.floor(positionMillis)),
                playback_state: state,
                started_at: legacyNow,
                updated_at: legacyNow,
              };

              console.log("WATCH PARTY: final create payload", legacyPayload);

              const legacy = await supabase
                .from(PARTY_ROOMS_TABLE)
                .insert(legacyPayload)
                .select("party_id,room_type,host_user_id,title_id,playback_position_millis,playback_state,started_at,updated_at")
                .single();

              if (!legacy.error && legacy.data) return rowToState(legacy.data as PartyRoomRow);
              if (legacy.error) {
                lastError = toCreateError(legacy.error, legacyPayload);
                console.log("WATCH PARTY: createPartyRoom error", lastError);
              }
              if (legacy.error && isMissingRoomTypeColumnError(legacy.error)) {
                const legacyRoomTypePayload = {
                  party_id: generatedPartyId,
                  host_user_id: safeHostUserId,
                  title_id: safeTitleId,
                  playback_position_millis: Math.max(0, Math.floor(positionMillis)),
                  playback_state: state,
                  started_at: legacyNow,
                  updated_at: legacyNow,
                };
                const legacyRoomTypeInsert = await supabase
                  .from(PARTY_ROOMS_TABLE)
                  .insert(legacyRoomTypePayload)
                  .select("party_id,host_user_id,title_id,playback_position_millis,playback_state,started_at,updated_at")
                  .single();

                if (!legacyRoomTypeInsert.error && legacyRoomTypeInsert.data) return rowToState(legacyRoomTypeInsert.data as PartyRoomRow);
                if (legacyRoomTypeInsert.error) {
                  lastError = toCreateError(legacyRoomTypeInsert.error, legacyRoomTypePayload);
                  console.log("WATCH PARTY: createPartyRoom error", lastError);
                }
              }
              if (legacy.error && isConflictError(legacy.error)) continue;
              if (legacy.error && isForeignKeyError(legacy.error)) break;
              break;
            }
            break;
          }
          break;
        }
      }
    }

    return {
      error:
        lastError ??
        toCreateError(
          { message: "Room creation failed without a Supabase error payload" },
          {
            requestedTitleId,
            resolvedTitleId,
            titleIdCandidates,
            requestedHostUserId,
            resolvedHostUserId,
            hostUserIdCandidates,
            state,
            positionMillis,
          },
        ),
    };
  } catch (error) {
    const explicitError = toCreateError(error, {
      requestedTitleId,
      resolvedTitleId,
      titleIdCandidates,
      requestedHostUserId,
      resolvedHostUserId,
      hostUserIdCandidates,
      state,
      positionMillis,
    });
    console.log("WATCH PARTY: createPartyRoom error", explicitError);
    return { error: explicitError };
  }
}

/**
 * Fetch the current state of a party room.
 * Returns null if the room does not exist or request fails.
 */
export async function getPartyRoom(partyId: string): Promise<WatchPartyState | null> {
  const lookupRaw = String(partyId ?? "").trim();
  const lookupPartyId = lookupRaw.toUpperCase();
  if (!lookupRaw) return null;

  try {
    const byPartyId = await supabase
      .from(PARTY_ROOMS_TABLE)
      .select("party_id,room_type,host_user_id,title_id,playback_position_millis,playback_state,started_at,updated_at")
      .eq("party_id", lookupPartyId)
      .maybeSingle();

    if (!byPartyId.error && byPartyId.data) return rowToState(byPartyId.data as PartyRoomRow);
    if (byPartyId.error && isMissingRoomTypeColumnError(byPartyId.error)) {
      const legacyByPartyId = await supabase
        .from(PARTY_ROOMS_TABLE)
        .select("party_id,host_user_id,title_id,playback_position_millis,playback_state,started_at,updated_at")
        .eq("party_id", lookupPartyId)
        .maybeSingle();
      if (!legacyByPartyId.error && legacyByPartyId.data) return rowToState(legacyByPartyId.data as PartyRoomRow);
    }
    if (byPartyId.error && !isMissingPartyIdColumnError(byPartyId.error)) return null;

    if (lookupPartyId !== lookupRaw) {
      const byRawPartyId = await supabase
        .from(PARTY_ROOMS_TABLE)
        .select("party_id,room_type,host_user_id,title_id,playback_position_millis,playback_state,started_at,updated_at")
        .eq("party_id", lookupRaw)
        .maybeSingle();

      if (!byRawPartyId.error && byRawPartyId.data) return rowToState(byRawPartyId.data as PartyRoomRow);
      if (byRawPartyId.error && isMissingRoomTypeColumnError(byRawPartyId.error)) {
        const legacyByRawPartyId = await supabase
          .from(PARTY_ROOMS_TABLE)
          .select("party_id,host_user_id,title_id,playback_position_millis,playback_state,started_at,updated_at")
          .eq("party_id", lookupRaw)
          .maybeSingle();
        if (!legacyByRawPartyId.error && legacyByRawPartyId.data) return rowToState(legacyByRawPartyId.data as PartyRoomRow);
      }
    }

    return null;
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
  const normalizedPartyId = String(partyId ?? "").trim().toUpperCase();
  if (!normalizedPartyId) return;

  try {
    await supabase
      .from(PARTY_ROOMS_TABLE)
      .update({
        playback_position_millis: Math.max(0, Math.floor(positionMillis)),
        playback_state: state,
        updated_at: new Date().toISOString(),
      })
      .eq("party_id", normalizedPartyId);
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
