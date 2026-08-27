import { readLiveKitParticipantSessionGeneration } from "./livekit-session-generation.ts";

type JsonObject = Record<string, unknown>;

type LiveKitParticipantLike = {
  identity?: unknown;
  metadata?: unknown;
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
  roomService: LiveKitRoomServiceLike;
};

type ViewerAuthority = {
  allowed: boolean;
  expiresAt: string | null;
  hostAuthority: boolean;
  paidSeatRequired: boolean;
  reason: string;
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

const parseViewerAuthority = (value: unknown): ViewerAuthority | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as JsonObject;
  if (
    typeof row.allowed !== "boolean" ||
    typeof row.hostAuthority !== "boolean" ||
    typeof row.paidSeatRequired !== "boolean" ||
    typeof row.reason !== "string" ||
    !row.reason.trim() ||
    !(
      row.expiresAt === null ||
      row.expiresAt === undefined ||
      (typeof row.expiresAt === "string" && row.expiresAt.trim())
    )
  ) return null;
  const expiresAt = typeof row.expiresAt === "string"
    ? row.expiresAt.trim()
    : null;
  if (
    row.allowed &&
    row.paidSeatRequired &&
    (
      expiresAt === null ||
      !Number.isFinite(Date.parse(expiresAt)) ||
      Date.parse(expiresAt) <= Date.now()
    )
  ) return null;
  return {
    allowed: row.allowed,
    expiresAt,
    hostAuthority: row.hostAuthority,
    paidSeatRequired: row.paidSeatRequired,
    reason: row.reason.trim(),
  };
};

const participantIsPublishing = (participant: LiveKitParticipantLike) => (
  Array.isArray(participant.tracks) && participant.tracks.length > 0
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
              const authority = parseViewerAuthority(rawAuthority);
              if (!authority) {
                enforcementCause = "authority_malformed";
              } else if (!authority.allowed) {
                enforcementCause = "authority_denied";
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
