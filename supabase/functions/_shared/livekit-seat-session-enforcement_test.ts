import { assertEquals } from "jsr:@std/assert@1";
import {
  countLiveKitStateWithPaidSeatEnforcement,
  type PaidSeatSessionAudit,
  resolveRoomAuthorityScopeFromEvidence,
  resolveWatchPartyPublishAuthority,
} from "./livekit-seat-session-enforcement.ts";

const PAID_VIEWER = "11111111-1111-4111-8111-111111111111";
const OPEN_VIEWER = "22222222-2222-4222-8222-222222222222";
const SESSION_GENERATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HOST = "33333333-3333-4333-8333-333333333333";
const openAuthority = () => ({
  allowed: true as const,
  expiresAt: null,
  hostAuthority: false,
  paidSeatRequired: false,
  speakerEligible: true,
  reason: "non_seat_room_authority" as const,
});
const speakerMembership = (overrides: Record<string, unknown> = {}) => ({
  user_id: PAID_VIEWER,
  role: "member",
  stage_role: "speaker",
  can_speak: true,
  is_muted: false,
  host_muted: false,
  self_muted: false,
  membership_state: "active",
  joined_at: new Date(Date.now() - 10_000).toISOString(),
  updated_at: new Date(Date.now() - 5_000).toISOString(),
  last_seen_at: new Date().toISOString(),
  ...overrides,
});
const publishEvidence = (memberships = [speakerMembership()]) => ({
  hostUserId: HOST,
  memberships,
  roomActive: true,
});

const fixture = (options: {
  authority?: unknown;
  authorityError?: boolean;
  identity?: string;
  metadata?: unknown;
  permission?: unknown;
  publishAuthorityError?: boolean;
  publishEvidence?: unknown;
  removalError?: boolean;
  roomAuthorityScope?: "other" | "watch_party";
  roomAuthorityScopeError?: boolean;
  tracks?: unknown;
} = {}) => {
  const audits: PaidSeatSessionAudit[] = [];
  const removals: string[] = [];
  const observedSessionGenerations: string[] = [];
  const observedPublishRooms: string[] = [];
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
      readPublishAuthorityEvidence: async (roomName: string) => {
        observedPublishRooms.push(roomName);
        if (options.publishAuthorityError) throw new Error("memberships unavailable");
        return options.publishEvidence === undefined
          ? publishEvidence()
          : options.publishEvidence;
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
            permission: options.permission,
            tracks: options.tracks ?? [{ sid: "track" }],
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
    observedPublishRooms,
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
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      hostAuthority: false,
      paidSeatRequired: true,
      reason: "exact_paid_seat_viewer_authority",
    },
    permission: { canPublish: false },
    tracks: [],
  });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, []);
  assertEquals(test.audits, []);
  assertEquals(test.observedSessionGenerations, [SESSION_GENERATION]);
  assertEquals(counts.currentParticipants, 1);
  assertEquals(counts.currentPublishers, 0);
  assertEquals(test.observedPublishRooms, ["PARTY-ONE"]);
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

for (const [label, changedMembership] of [
  ["host mute", { host_muted: true }],
  ["self mute", { self_muted: true }],
  ["aggregate mute", { is_muted: true }],
  ["speaker downgrade", { stage_role: "listener", can_speak: false }],
  ["removed membership", { membership_state: "removed" }],
  ["left membership", { membership_state: "left" }],
  ["stale membership", { last_seen_at: new Date(Date.now() - 46_000).toISOString() }],
] as const) {
  Deno.test(`monitor removes stale provider publish permission after ${label} even with no tracks`, async () => {
    const test = fixture({
      authority: openAuthority(),
      permission: { canPublish: true },
      publishEvidence: publishEvidence([speakerMembership(changedMembership)]),
      tracks: [],
    });
    const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
    assertEquals(test.observedPublishRooms, ["PARTY-ONE"]);
    assertEquals(test.removals, [PAID_VIEWER]);
    assertEquals(test.audits[0]?.enforcementCause, "authority_denied");
    assertEquals(counts.currentParticipants, 0);
  });
}

Deno.test("existing tracks still require approval when provider permission says no publish", async () => {
  const test = fixture({
    authority: openAuthority(),
    permission: { canPublish: false },
    publishEvidence: publishEvidence([speakerMembership({ host_muted: true })]),
  });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, [PAID_VIEWER]);
  assertEquals(counts.currentPublishers, 0);
});

Deno.test("an active admitted listener does not need publishing approval", async () => {
  const test = fixture({
    authority: openAuthority(),
    permission: { canPublish: false },
    publishEvidence: publishEvidence([speakerMembership({ stage_role: "listener", can_speak: false, is_muted: true })]),
    tracks: [],
  });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.observedPublishRooms, ["PARTY-ONE"]);
  assertEquals(test.removals, []);
  assertEquals(counts.currentParticipants, 1);
});

Deno.test("a valid approved publisher with no tracks remains connected", async () => {
  const test = fixture({
    authority: openAuthority(),
    permission: { canPublish: true },
    tracks: [],
  });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.observedPublishRooms, ["PARTY-ONE"]);
  assertEquals(test.removals, []);
  assertEquals(counts.currentParticipants, 1);
  assertEquals(counts.currentPublishers, 0, "capacity metrics still count actual tracks");
});

Deno.test("viewer-only paid authority cannot retain publishing permission despite speaker membership", async () => {
  const test = fixture({
    authority: {
      allowed: true,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      hostAuthority: false,
      paidSeatRequired: true,
      speakerEligible: false,
      reason: "exact_live_access_viewer_authority",
    },
    permission: { canPublish: true },
    tracks: [],
  });
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, [PAID_VIEWER]);
  assertEquals(counts.currentParticipants, 0);
});

Deno.test("eligible paid speaker still needs current host approval", async () => {
  const authority = {
    allowed: true,
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
    hostAuthority: false,
    paidSeatRequired: true,
    speakerEligible: true,
    reason: "exact_live_seat_eligibility_authority",
  };
  for (const approved of [true, false]) {
    const test = fixture({
      authority,
      permission: { canPublish: true },
      publishEvidence: publishEvidence([speakerMembership({
        stage_role: approved ? "speaker" : "listener",
        can_speak: approved,
      })]),
      tracks: [],
    });
    await countLiveKitStateWithPaidSeatEnforcement(test.input);
    assertEquals(test.removals, approved ? [] : [PAID_VIEWER]);
  }
});

Deno.test("monitor applies the reserved host and deterministic four-seat speaker cap", async () => {
  const earlier = [4, 5, 6].map((value) => speakerMembership({
    user_id: `00000000-0000-4000-8000-00000000000${value}`,
    updated_at: new Date(Date.now() - 20_000).toISOString(),
  }));
  const test = fixture({
    authority: openAuthority(),
    publishEvidence: publishEvidence([...earlier, speakerMembership()]),
  });
  await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, [PAID_VIEWER]);
  assertEquals(resolveWatchPartyPublishAuthority(
    publishEvidence([...earlier.slice(0, 2), speakerMembership()]),
    PAID_VIEWER,
    openAuthority(),
  ), true);
});

Deno.test("speaker-cap ties use user ID and ignore stale memberships", () => {
  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  const memberships = [4, 5, 6].map((value) => speakerMembership({
    user_id: `00000000-0000-4000-8000-00000000000${value}`,
    updated_at: timestamp,
  }));
  memberships.push(speakerMembership({ updated_at: timestamp }));
  assertEquals(resolveWatchPartyPublishAuthority(
    publishEvidence(memberships.reverse()), PAID_VIEWER, openAuthority(), now,
  ), false);
  memberships[1].last_seen_at = new Date(now - 45_001).toISOString();
  assertEquals(resolveWatchPartyPublishAuthority(
    publishEvidence(memberships), PAID_VIEWER, openAuthority(), now,
  ), true);
});

Deno.test("only the exact authoritative room host bypasses speaker membership", async () => {
  const authority = {
    ...openAuthority(),
    hostAuthority: true,
    reason: "non_seat_room_host_authority",
  };
  const host = fixture({ authority, identity: HOST, publishEvidence: publishEvidence([]) });
  await countLiveKitStateWithPaidSeatEnforcement(host.input);
  assertEquals(host.removals, []);
  const nonhost = fixture({ authority });
  await countLiveKitStateWithPaidSeatEnforcement(nonhost.input);
  assertEquals(nonhost.removals, [PAID_VIEWER]);
});

Deno.test("a current host's local self-mute preserves its token-authorized publish grant", async () => {
  const test = fixture({
    authority: {
      ...openAuthority(),
      hostAuthority: true,
      reason: "non_seat_room_host_authority",
    },
    identity: HOST,
    permission: { canPublish: true },
    publishEvidence: publishEvidence([speakerMembership({ user_id: HOST, self_muted: true })]),
    tracks: [],
  });
  await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, []);
});

Deno.test("finite canonical title authority preserves admitted listeners and approved speakers", async () => {
  for (const canPublish of [false, true]) {
    const test = fixture({
      authority: {
        ...openAuthority(),
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        reason: "canonical_party_room_target_premium_authority",
      },
      permission: { canPublish },
      tracks: [],
    });
    const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
    assertEquals(test.removals, []);
    assertEquals(counts.currentParticipants, 1);
    assertEquals(test.observedPublishRooms, ["PARTY-ONE"]);
  }
});

Deno.test("expired finite canonical title authority removes even an admitted listener", async () => {
  const test = fixture({
    authority: {
      ...openAuthority(),
      expiresAt: new Date(Date.now() - 1).toISOString(),
      reason: "canonical_party_room_target_premium_authority",
    },
    permission: { canPublish: false },
    tracks: [],
  });
  await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, [PAID_VIEWER]);
  assertEquals(test.observedPublishRooms, []);
});

Deno.test("publishing cannot outlive a viewer proof that expires during the membership lookup", () => {
  const now = Date.now();
  assertEquals(resolveWatchPartyPublishAuthority(
    publishEvidence(),
    PAID_VIEWER,
    { ...openAuthority(), expiresAt: new Date(now).toISOString() },
    now,
  ), false);
});

Deno.test("publishing authority failures remove fail closed and retry on the next pass", async () => {
  for (const options of [
    { publishAuthorityError: true },
    { publishEvidence: null },
    { publishEvidence: { ...publishEvidence(), roomActive: false } },
    { publishEvidence: publishEvidence([]) },
  ]) {
    const test = fixture({ authority: openAuthority(), removalError: true, ...options });
    const first = await countLiveKitStateWithPaidSeatEnforcement(test.input);
    assertEquals(first.currentParticipants, 1);
    assertEquals(test.audits.at(-1)?.outcome, "participant_removal_failed");
    assertEquals(test.audits.at(-1)?.retryOnNextMonitor, true);
    test.input.roomService.removeParticipant = async (_room, identity) => {
      test.removals.push(identity);
    };
    const second = await countLiveKitStateWithPaidSeatEnforcement(test.input);
    assertEquals(second.currentParticipants, 0);
    assertEquals(test.removals, [PAID_VIEWER]);
    assertEquals(test.audits.at(-1)?.outcome, "participant_removed");
  }
});

Deno.test("signed metadata identity and room bindings still precede publishing authority", async () => {
  for (const metadata of [
    { app: "chillywood-mobile", roomName: "OTHER", userId: PAID_VIEWER, sessionGeneration: SESSION_GENERATION },
    { app: "chillywood-mobile", roomName: "PARTY-ONE", userId: HOST, sessionGeneration: SESSION_GENERATION },
  ]) {
    const test = fixture({ authority: openAuthority(), metadata: JSON.stringify(metadata) });
    await countLiveKitStateWithPaidSeatEnforcement(test.input);
    assertEquals(test.observedSessionGenerations, []);
    assertEquals(test.observedPublishRooms, []);
    assertEquals(test.removals, [PAID_VIEWER]);
  }
});

for (const membershipState of ["removed", "left"]) {
  Deno.test(`${membershipState} listener is removed despite valid viewer admission and retries failed removal`, async () => {
    const test = fixture({ authority: openAuthority(), permission: { canPublish: false }, tracks: [],
      removalError: true, publishEvidence: publishEvidence([speakerMembership({
        stage_role: "listener", can_speak: false, membership_state: membershipState,
      })]) });
    await countLiveKitStateWithPaidSeatEnforcement(test.input);
    assertEquals(test.audits.at(-1)?.outcome, "participant_removal_failed");
    assertEquals(test.audits.at(-1)?.retryOnNextMonitor, true);
    test.input.roomService.removeParticipant = async (_room, identity) => { test.removals.push(identity); };
    const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
    assertEquals(counts.currentParticipants, 0);
    assertEquals(test.removals, [PAID_VIEWER]);
  });
}

Deno.test("all listeners in one room share one current membership read per monitor pass", async () => {
  const test = fixture({ authority: openAuthority(), permission: { canPublish: false }, tracks: [],
    publishEvidence: publishEvidence([PAID_VIEWER, OPEN_VIEWER].map(user_id => speakerMembership({
      user_id, stage_role: "listener", can_speak: false,
    }))) });
  test.input.roomService.listParticipants = async () => [PAID_VIEWER, OPEN_VIEWER].map(identity => ({
    identity, tracks: [], permission: { canPublish: false },
    metadata: JSON.stringify({ app: "chillywood-mobile", roomName: "PARTY-ONE", userId: identity, sessionGeneration: SESSION_GENERATION }),
  }));
  const counts = await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(counts.currentParticipants, 2);
  assertEquals(test.observedPublishRooms, ["PARTY-ONE"]);
  assertEquals(test.removals, []);
});

Deno.test("membership lookup failure for listeners fails closed without inventing valid membership", async () => {
  const test = fixture({ authority: openAuthority(), permission: { canPublish: false }, tracks: [], publishAuthorityError: true });
  await countLiveKitStateWithPaidSeatEnforcement(test.input);
  assertEquals(test.removals, [PAID_VIEWER]);
});
