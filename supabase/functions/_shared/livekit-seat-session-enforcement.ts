import { readLiveKitParticipantSessionGeneration } from "./livekit-session-generation.ts";
import {
  parseWatchPartyLiveKitAuthorityDecision,
  type WatchPartyLiveKitAuthority,
} from "./watch-party-livekit-authority.ts";

type JsonObject = Record<string, unknown>;

type LiveKitParticipantLike = {
  identity?: unknown;
  metadata?: unknown;
  permission?: unknown;
  tracks?: unknown;
};

type LiveKitRoomLike = {
  name?: unknown;
};

type LiveKitRoomServiceLike = {
  listParticipants(roomName: string): Promise<LiveKitParticipantLike[]>;
  listRooms(): Promise<LiveKitRoomLike[]>;
  removeParticipant(
    roomName: string,
    participantIdentity: string,
  ): Promise<unknown>;
};

export type PaidSeatSessionAudit = {
  enforcementCause:
    | "authority_denied"
    | "authority_lookup_failed"
    | "authority_malformed";
  outcome:
    | "authority_lookup_failed"
    | "authority_malformed"
    | "participant_removal_failed"
    | "participant_removed";
  participantIdentity: string;
  retryOnNextMonitor: boolean;
  roomName: string;
};

type SeatSessionEnforcementInput = {
  audit(event: PaidSeatSessionAudit): Promise<unknown>;
  readRoomAuthorityScope(
    roomName: string,
  ): Promise<"other" | "watch_party">;
  readViewerAuthority(
    roomName: string,
    participantIdentity: string,
    sessionGeneration: string,
  ): Promise<unknown>;
  readPublishAuthorityEvidence(roomName: string): Promise<unknown>;
  roomService: LiveKitRoomServiceLike;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WATCH_PARTY_ASSIGNMENT_TYPES = new Set([
  "live_stage",
  "live_watch_party",
  "party_room",
  "watch_party_live",
]);
const OTHER_ASSIGNMENT_TYPES = new Set(["chat_call", "other", "proof"]);

const toText = (value: unknown) => String(value ?? "").trim();

export const resolveRoomAuthorityScopeFromEvidence = (input: {
  assignmentTypes: unknown[];
  communicationRoomExists: boolean;
  watchPartyRoomExists: boolean;
}): "other" | "watch_party" | null => {
  const assignmentTypes = Array.from(new Set(
    input.assignmentTypes.map((value) => toText(value).toLowerCase()).filter(
      Boolean,
    ),
  ));
  if (
    assignmentTypes.length > 1 ||
    assignmentTypes.some((value) => (
      !WATCH_PARTY_ASSIGNMENT_TYPES.has(value) &&
      !OTHER_ASSIGNMENT_TYPES.has(value)
    ))
  ) return null;

  const assignmentType = assignmentTypes[0] ?? null;
  if (assignmentType === "proof" || assignmentType === "other") return "other";
  if (input.watchPartyRoomExists === input.communicationRoomExists) return null;
  return input.watchPartyRoomExists ? "watch_party" : "other";
};

const isRecord = (value: unknown): value is JsonObject => (
  !!value && typeof value === "object" && !Array.isArray(value)
);

const WATCH_PARTY_MEMBERSHIP_ACTIVE_WINDOW_MS = 45_000;
const LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS = 4;
const ACTIVE_MEMBERSHIP_STATES = new Set(["active", "reconnecting"]);

const membershipIsFresh = (row: JsonObject, nowMillis: number) => {
  const lastSeenMillis = Date.parse(toText(row.last_seen_at));
  return ACTIVE_MEMBERSHIP_STATES.has(toText(row.membership_state).toLowerCase())
    && Number.isFinite(lastSeenMillis)
    && nowMillis - lastSeenMillis <= WATCH_PARTY_MEMBERSHIP_ACTIVE_WINDOW_MS;
};

const membershipHasSpeakerSeat = (row: JsonObject) => (
  toText(row.role).toLowerCase() === "host"
  || ["host", "speaker"].includes(toText(row.stage_role).toLowerCase())
  || row.can_speak === true
);

const membershipSeatMillis = (row: JsonObject) => {
  for (const value of [row.updated_at, row.joined_at, row.last_seen_at]) {
    const millis = Date.parse(toText(value));
    if (Number.isFinite(millis)) return millis;
  }
  return Number.MAX_SAFE_INTEGER;
};

export const resolveWatchPartyMembershipAuthority = (
  evidence: unknown,
  participantIdentity: string,
  authority: WatchPartyLiveKitAuthority,
  nowMillis = Date.now(),
): boolean | null => {
  if (!isRecord(evidence) || typeof evidence.hostUserId !== "string"
    || !UUID_PATTERN.test(evidence.hostUserId) || typeof evidence.roomActive !== "boolean"
    || !Array.isArray(evidence.memberships) || !evidence.memberships.every(isRecord)) return null;
  if (!evidence.roomActive) return false;
  if (authority.expiresAt !== null && !(Date.parse(authority.expiresAt) > nowMillis)) return false;
  if (participantIdentity === evidence.hostUserId) return authority.hostAuthority;
  const membership = evidence.memberships.find((row) => row.user_id === participantIdentity);
  return !authority.hostAuthority && !!membership && membershipIsFresh(membership, nowMillis);
};

// Keep the same reserved-host, freshness, and deterministic seat ordering as
// token issuance. A viewer grant alone cannot keep an old publisher connected.
export const resolveWatchPartyPublishAuthority = (
  evidence: unknown,
  participantIdentity: string,
  authority: WatchPartyLiveKitAuthority,
  nowMillis = Date.now(),
): boolean | null => {
  if (
    !isRecord(evidence)
    || typeof evidence.hostUserId !== "string"
    || !UUID_PATTERN.test(evidence.hostUserId)
    || typeof evidence.roomActive !== "boolean"
    || !Array.isArray(evidence.memberships)
    || !evidence.memberships.every(isRecord)
  ) return null;
  if (!evidence.roomActive) return false;
  // Membership reads can outlast a short-lived viewer proof. Recheck its
  // deadline before retaining provider publish authority.
  if (authority.expiresAt !== null) {
    const expiresAtMillis = Date.parse(authority.expiresAt);
    if (!Number.isFinite(expiresAtMillis) || expiresAtMillis <= nowMillis) return false;
  }

  const hostUserId = evidence.hostUserId;
  const memberships = evidence.memberships as JsonObject[];
  const membership = memberships.find((row) => row.user_id === participantIdentity);
  if (participantIdentity === hostUserId) {
    // Match token issuance: the exact authoritative host can publish before a
    // membership heartbeat, and its local self-mute does not revoke that grant.
    return authority.hostAuthority;
  }
  if (
    authority.hostAuthority
    || (authority.paidSeatRequired && !authority.speakerEligible)
    || !membership
    || !membershipIsFresh(membership, nowMillis)
    || !membershipHasSpeakerSeat(membership)
    || membership.is_muted !== false
    || membership.host_muted !== false
    || membership.self_muted !== false
  ) return false;

  const speakerMemberships = memberships.filter((row) => (
    UUID_PATTERN.test(toText(row.user_id))
    && row.user_id !== hostUserId
    && membershipIsFresh(row, nowMillis)
    && membershipHasSpeakerSeat(row)
  )).sort((a, b) => (
    membershipSeatMillis(a) - membershipSeatMillis(b)
    || toText(a.user_id).localeCompare(toText(b.user_id))
  ));
  const speakerSeatIds = new Set([hostUserId]);
  for (const row of speakerMemberships) {
    if (speakerSeatIds.size >= LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS) break;
    speakerSeatIds.add(toText(row.user_id));
  }
  return speakerSeatIds.has(participantIdentity);
};

const participantIsPublishing = (participant: LiveKitParticipantLike) => (
  Array.isArray(participant.tracks) && participant.tracks.length > 0
);

const participantHasPublishAuthority = (participant: LiveKitParticipantLike) => (
  participantIsPublishing(participant)
  || (isRecord(participant.permission) && participant.permission.canPublish === true)
);

const safeAudit = async (
  audit: SeatSessionEnforcementInput["audit"],
  event: PaidSeatSessionAudit,
) => {
  try {
    await audit(event);
  } catch {
    // Enforcement must remain available if the best-effort audit insert fails.
  }
};

export const countLiveKitStateWithPaidSeatEnforcement = async (
  input: SeatSessionEnforcementInput,
) => {
  const rooms = await input.roomService.listRooms();
  let currentParticipants = 0;
  let currentPublishers = 0;

  for (const room of rooms) {
    const roomName = toText(room.name);
    if (!roomName) continue;

    let enforceWatchPartyAuthority = true;
    let roomScopeLookupFailed = false;
    try {
      const roomAuthorityScope = await input.readRoomAuthorityScope(roomName);
      if (roomAuthorityScope === "other") {
        enforceWatchPartyAuthority = false;
      } else if (roomAuthorityScope !== "watch_party") {
        roomScopeLookupFailed = true;
      }
    } catch {
      roomScopeLookupFailed = true;
    }

    const participants = await input.roomService.listParticipants(roomName);
    // One consistent membership read per room/pass, including listener removal.
    // A rejected read stays rejected for this pass; the next monitor retries.
    let roomEvidence: Promise<unknown> | undefined;
    const readRoomEvidence = () => roomEvidence ??= Promise.resolve().then(
      () => input.readPublishAuthorityEvidence(roomName),
    );
    for (const participant of participants) {
      const participantIdentity = toText(participant.identity);
      let removed = false;

      if (
        UUID_PATTERN.test(participantIdentity) &&
        enforceWatchPartyAuthority
      ) {
        let enforcementCause: PaidSeatSessionAudit["enforcementCause"] | null =
          roomScopeLookupFailed ? "authority_lookup_failed" : null;
        if (!enforcementCause) {
          const sessionGeneration = readLiveKitParticipantSessionGeneration(
            participant.metadata,
            { participantIdentity, roomName },
          );
          if (!sessionGeneration) {
            enforcementCause = "authority_malformed";
          } else {
            try {
              const rawAuthority = await input.readViewerAuthority(
                roomName,
                participantIdentity,
                sessionGeneration,
              );
              const authority = parseWatchPartyLiveKitAuthorityDecision(rawAuthority);
              if (!authority || (authority.allowed && authority.reason === "verified_reserved_room_seat"
                && authority.partyId !== roomName)) {
                enforcementCause = "authority_malformed";
              } else if (!authority.allowed) {
                enforcementCause = "authority_denied";
              } else {
                const evidence = await readRoomEvidence();
                const canRemain = resolveWatchPartyMembershipAuthority(evidence, participantIdentity, authority);
                if (canRemain === null) enforcementCause = "authority_malformed";
                else if (!canRemain) enforcementCause = "authority_denied";
                else if (participantHasPublishAuthority(participant)) {
                  const canPublish = resolveWatchPartyPublishAuthority(evidence, participantIdentity, authority);
                  if (canPublish === null) enforcementCause = "authority_malformed";
                  else if (!canPublish) enforcementCause = "authority_denied";
                }
              }
            } catch {
              enforcementCause = "authority_lookup_failed";
            }
          }
        }

        if (enforcementCause) {
          let removalFailed = false;
          try {
            await input.roomService.removeParticipant(
              roomName,
              participantIdentity,
            );
            removed = true;
          } catch {
            removalFailed = true;
          }

          if (enforcementCause !== "authority_denied") {
            await safeAudit(input.audit, {
              enforcementCause,
              outcome: enforcementCause,
              participantIdentity,
              retryOnNextMonitor: removalFailed,
              roomName,
            });
          }
          await safeAudit(input.audit, {
            enforcementCause,
            outcome: removalFailed
              ? "participant_removal_failed"
              : "participant_removed",
            participantIdentity,
            retryOnNextMonitor: removalFailed,
            roomName,
          });
        }
      }

      if (removed) continue;
      currentParticipants += 1;
      if (participantIsPublishing(participant)) currentPublishers += 1;
    }
  }

  return {
    currentParticipants,
    currentPublishers,
    currentRooms: rooms.length,
  };
};
