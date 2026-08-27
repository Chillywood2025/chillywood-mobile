import { assertEquals } from "jsr:@std/assert@1";
import {
  countLiveKitStateWithPaidSeatEnforcement,
  type PaidSeatSessionAudit,
  resolveRoomAuthorityScopeFromEvidence,
} from "./livekit-seat-session-enforcement.ts";

const PAID_VIEWER = "11111111-1111-4111-8111-111111111111";
const OPEN_VIEWER = "22222222-2222-4222-8222-222222222222";
const SESSION_GENERATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const fixture = (options: {
  authority?: unknown;
  authorityError?: boolean;
  identity?: string;
  metadata?: unknown;
  removalError?: boolean;
  roomAuthorityScope?: "other" | "watch_party";
  roomAuthorityScopeError?: boolean;
} = {}) => {
  const audits: PaidSeatSessionAudit[] = [];
  const removals: string[] = [];
  const observedSessionGenerations: string[] = [];
  const identity = options.identity ?? PAID_VIEWER;
  return {
    audits,
    input: {
      audit: async (event: PaidSeatSessionAudit) => {
        audits.push(event);
      },
      readRoomAuthorityScope: async () => {
        if (options.roomAuthorityScopeError) {
          throw new Error("room scope unavailable");
        }
        return options.roomAuthorityScope ?? "watch_party";
      },
      readViewerAuthority: async (_roomName: string, _identity: string, sessionGeneration: string) => {
        observedSessionGenerations.push(sessionGeneration);
        if (options.authorityError) throw new Error("rpc unavailable");
        return options.authority ?? {
          allowed: false,
          expiresAt: null,
          hostAuthority: false,
          paidSeatRequired: true,
          reason: "exact_paid_seat_authority_required",
        };
      },
      roomService: {
        listParticipants:
          async () => [{
            identity,
            metadata: options.metadata ?? JSON.stringify({
              app: "chillywood-mobile",
              roomName: "PARTY-ONE",
              sessionGeneration: SESSION_GENERATION,
              userId: identity,
            }),
            tracks: [{ sid: "track" }],
          }],
        listRooms: async () => [{ name: "PARTY-ONE" }],
        removeParticipant: async (
          _roomName: string,
          participantIdentity: string,
        ) => {
          if (options.removalError) throw new Error("remove unavailable");
          removals.push(participantIdentity);
        },
      },
    },
    observedSessionGenerations,
    removals,
  };
};

Deno.test("paid Seat viewer without current exact authority is removed before capacity is counted", async () => {
  const test = fixture();
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, [PAID_VIEWER]);
  assertEquals(test.audits.map((event) => event.outcome), [
    "participant_removed",
  ]);
  assertEquals(counts, {
    currentParticipants: 0,
    currentPublishers: 0,
    currentRooms: 1,
  });
});

Deno.test("current paid Seat viewer remains counted", async () => {
  const test = fixture({
    authority: {
      allowed: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
      hostAuthority: false,
      paidSeatRequired: true,
      reason: "exact_paid_seat_viewer_authority",
    },
  });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, []);
  assertEquals(test.audits, []);
  assertEquals(test.observedSessionGenerations, [SESSION_GENERATION]);
  assertEquals(counts.currentParticipants, 1);
  assertEquals(counts.currentPublishers, 1);
});

Deno.test("authority lookup failure removes the participant fail closed", async () => {
  const test = fixture({ authorityError: true });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, [PAID_VIEWER]);
  assertEquals(test.audits.map((event) => event.outcome), [
    "authority_lookup_failed",
    "participant_removed",
  ]);
  assertEquals(test.audits.every((event) => !event.retryOnNextMonitor), true);
  assertEquals(counts.currentParticipants, 0);
});

Deno.test("malformed authority removes the participant fail closed", async () => {
  const test = fixture({
    authority: {
      allowed: "yes",
      expiresAt: null,
      hostAuthority: false,
      paidSeatRequired: true,
      reason: "exact_paid_seat_authority_required",
    },
  });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, [PAID_VIEWER]);
  assertEquals(test.audits.map((event) => event.outcome), [
    "authority_malformed",
    "participant_removed",
  ]);
  assertEquals(test.audits.every((event) => !event.retryOnNextMonitor), true);
  assertEquals(counts.currentParticipants, 0);
});

Deno.test("missing signed session metadata removes a watch-party participant before RPC authority", async () => {
  const test = fixture({ metadata: "{}" });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, [PAID_VIEWER]);
  assertEquals(test.observedSessionGenerations, []);
  assertEquals(test.audits.map((event) => event.outcome), [
    "authority_malformed",
    "participant_removed",
  ]);
  assertEquals(counts.currentParticipants, 0);
});

Deno.test("session rotation denial removes an already-connected paid Seat participant", async () => {
  const test = fixture({
    authority: {
      allowed: false,
      expiresAt: null,
      hostAuthority: false,
      paidSeatRequired: true,
      reason: "viewer_authority_invalid",
    },
  });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.observedSessionGenerations, [SESSION_GENERATION]);
  assertEquals(test.removals, [PAID_VIEWER]);
  assertEquals(test.audits.map((event) => event.outcome), [
    "participant_removed",
  ]);
  assertEquals(counts.currentParticipants, 0);
});

Deno.test("incomplete authority without an auditable reason removes the participant", async () => {
  const test = fixture({
    authority: {
      allowed: true,
      expiresAt: null,
      hostAuthority: false,
      paidSeatRequired: false,
    },
  });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, [PAID_VIEWER]);
  assertEquals(test.audits.map((event) => event.outcome), [
    "authority_malformed",
    "participant_removed",
  ]);
  assertEquals(counts.currentParticipants, 0);
});

Deno.test("expired paid authority removes an already-connected participant", async () => {
  const test = fixture({
    authority: {
      allowed: true,
      expiresAt: "2000-01-01T00:00:00.000Z",
      hostAuthority: false,
      paidSeatRequired: true,
      reason: "exact_paid_seat_viewer_authority",
    },
  });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, [PAID_VIEWER]);
  assertEquals(test.audits.map((event) => event.outcome), [
    "authority_malformed",
    "participant_removed",
  ]);
  assertEquals(counts.currentParticipants, 0);
});

Deno.test("LiveKit removal failure retains participant and records next-pass retry", async () => {
  const test = fixture({ removalError: true });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, []);
  assertEquals(test.audits[0]?.outcome, "participant_removal_failed");
  assertEquals(test.audits[0]?.enforcementCause, "authority_denied");
  assertEquals(test.audits[0]?.retryOnNextMonitor, true);
  assertEquals(counts.currentParticipants, 1);
});

Deno.test("authority outage retries only when fail-closed participant removal also fails", async () => {
  const test = fixture({ authorityError: true, removalError: true });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, []);
  assertEquals(test.audits.map((event) => event.outcome), [
    "authority_lookup_failed",
    "participant_removal_failed",
  ]);
  assertEquals(test.audits.every((event) => event.retryOnNextMonitor), true);
  assertEquals(counts.currentParticipants, 1);
});

Deno.test("non-UUID infrastructure identity is not interpreted as a paid Seat user", async () => {
  const test = fixture({ identity: "recorder-agent" });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, []);
  assertEquals(test.audits, []);
  assertEquals(counts.currentParticipants, 1);
});

Deno.test("every PostgreSQL UUID subject is enforced regardless of version or variant bits", async () => {
  const postgresUuid = "ffffffff-ffff-ffff-0fff-ffffffffffff";
  const test = fixture({ identity: postgresUuid });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.observedSessionGenerations, [SESSION_GENERATION]);
  assertEquals(test.removals, [postgresUuid]);
  assertEquals(counts.currentParticipants, 0);
});

Deno.test("a denied non-Seat or restricted room participant is removed", async () => {
  const test = fixture({
    authority: {
      allowed: false,
      expiresAt: null,
      hostAuthority: false,
      paidSeatRequired: false,
      reason: "viewer_authority_invalid",
    },
  });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, [PAID_VIEWER]);
  assertEquals(test.audits.map((event) => event.outcome), [
    "participant_removed",
  ]);
  assertEquals(counts.currentParticipants, 0);
});

Deno.test("an allowed non-Seat room participant remains connected", async () => {
  const test = fixture({
    authority: {
      allowed: true,
      expiresAt: null,
      hostAuthority: false,
      paidSeatRequired: false,
      reason: "non_seat_room_authority",
    },
  });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, []);
  assertEquals(test.audits, []);
  assertEquals(counts.currentParticipants, 1);
});

Deno.test("a communication or other classified LiveKit room is not subjected to the watch-party RPC", async () => {
  const test = fixture({
    authorityError: true,
    roomAuthorityScope: "other",
  });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, []);
  assertEquals(test.audits, []);
  assertEquals(counts.currentParticipants, 1);
  assertEquals(counts.currentPublishers, 1);
});

Deno.test("an unclassifiable UUID room participant is removed fail closed", async () => {
  const test = fixture({ roomAuthorityScopeError: true });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, [PAID_VIEWER]);
  assertEquals(test.audits.map((event) => event.outcome), [
    "authority_lookup_failed",
    "participant_removed",
  ]);
  assertEquals(counts.currentParticipants, 0);
});

Deno.test("live_stage assignment is Seat-enforced only when the exact source is a watch-party row", () => {
  assertEquals(resolveRoomAuthorityScopeFromEvidence({
    assignmentTypes: ["live_stage"],
    communicationRoomExists: false,
    watchPartyRoomExists: true,
  }), "watch_party");
  assertEquals(resolveRoomAuthorityScopeFromEvidence({
    assignmentTypes: ["live_stage"],
    communicationRoomExists: true,
    watchPartyRoomExists: false,
  }), "other");
  assertEquals(resolveRoomAuthorityScopeFromEvidence({
    assignmentTypes: ["live_stage"],
    communicationRoomExists: false,
    watchPartyRoomExists: false,
  }), null);
});

Deno.test("an active live_stage watch-party participant with current authority is preserved", async () => {
  const test = fixture({
    authority: {
      allowed: true,
      expiresAt: null,
      hostAuthority: false,
      paidSeatRequired: false,
      reason: "non_seat_room_authority",
    },
    roomAuthorityScope: "watch_party",
  });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, []);
  assertEquals(counts.currentParticipants, 1);
  assertEquals(counts.currentPublishers, 1);
});
