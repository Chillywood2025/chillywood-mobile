import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const HOST_ID = "33333333-3333-4333-8333-333333333333";
const TICKET_ID = "44444444-4444-4444-8444-444444444444";
const OFFER_ID = "55555555-5555-4555-8555-555555555555";
const PARTY_ID = "ROOMA";

const compile = (path) => ts.transpileModule(readFileSync(path, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
}).outputText;

let inert;
inert = new Proxy(() => undefined, {
  get: (_target, key) => key === "then" ? undefined : inert,
  apply: () => undefined,
});

const exactTicket = (partyId = PARTY_ID) => ({
  allowed: true,
  reason: "ticket_confirmed",
  requiresPurchase: false,
  ticketId: TICKET_ID,
  priceCents: 99,
  currency: "usd",
  creatorId: HOST_ID,
  provider: "revenuecat_app_store",
  providerProductId: "com.chillywood.seatpass.tier1",
  providerProductKey: "watch_party_live_ticket_sandbox_099",
  offer: {
    id: OFFER_ID,
    partyId,
    creatorId: HOST_ID,
    hostId: HOST_ID,
    titleId: null,
    videoId: null,
    title: "Exact Seat Pass",
    description: null,
    priceCents: 99,
    currency: "usd",
    seatLimit: 10,
    seatsSold: 1,
    startsAt: null,
    endsAt: null,
    status: "sandbox",
    provider: "revenuecat_app_store",
    providerProductKey: "watch_party_live_ticket_sandbox_099",
    providerProductId: "com.chillywood.seatpass.tier1",
    createdAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-23T00:00:00.000Z",
  },
});

const exactFreeRoom = () => ({
  allowed: true,
  reason: "free_room",
  requiresPurchase: false,
  ticketId: null,
  priceCents: null,
  currency: null,
  creatorId: null,
  provider: null,
  providerProductId: null,
  providerProductKey: null,
  offer: null,
});

const roomRow = () => {
  const now = new Date().toISOString();
  return {
    party_id: PARTY_ID,
    room_type: "title",
    host_user_id: HOST_ID,
    title_id: "title-proof",
    source_type: "platform_title",
    source_id: "title-proof",
    playback_position_millis: 0,
    playback_state: "paused",
    join_policy: "open",
    reactions_policy: "enabled",
    content_access_rule: "party_pass",
    capture_policy: "best_effort",
    is_active: true,
    started_at: now,
    updated_at: now,
    last_activity_at: now,
  };
};

const roomState = () => {
  const row = roomRow();
  return {
    partyId: row.party_id,
    roomType: row.room_type,
    hostUserId: row.host_user_id,
    titleId: row.title_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    positionMillis: row.playback_position_millis,
    state: row.playback_state,
    joinPolicy: row.join_policy,
    reactionsPolicy: row.reactions_policy,
    contentAccessRule: row.content_access_rule,
    capturePolicy: row.capture_policy,
    isActive: row.is_active,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.last_activity_at,
  };
};

const membershipRow = (overrides = {}) => {
  const now = new Date().toISOString();
  return {
    party_id: PARTY_ID,
    user_id: USER_ID,
    role: "viewer",
    stage_role: "listener",
    can_speak: false,
    is_muted: false,
    membership_state: "active",
    camera_enabled: false,
    mic_enabled: false,
    display_name: null,
    avatar_url: null,
    camera_preview_url: null,
    joined_at: now,
    last_seen_at: now,
    left_at: null,
    updated_at: now,
    ...overrides,
  };
};

const createRuntime = (options = {}) => {
  let currentUserId = USER_ID;
  let userIdReads = Array.isArray(options.userIdReads) ? [...options.userIdReads] : null;
  let ticketAccess = options.ticketAccess ?? exactTicket();
  let premiumAllowed = options.premiumAllowed === true;
  let storedMembership = options.existingMembership ?? null;
  const ticketPartyIds = [];
  const membershipWrites = [];
  let premiumReads = 0;
  let roomAccessDecision = options.roomAccessDecision ?? {
    canJoin: false,
    reason: "premium_required",
    joinPolicy: "open",
    contentAccessRule: "premium",
    capturePolicy: "best_effort",
    requiresAuthIdentity: true,
    monetization: { status: "blocked" },
  };

  const auth = {
    getUser: async () => {
      const next = userIdReads?.length ? userIdReads.shift() : currentUserId;
      if (next instanceof Error) throw next;
      if (next !== undefined) currentUserId = next;
      return { data: { user: currentUserId ? { id: currentUserId } : null } };
    },
    getSession: async () => ({ data: { session: currentUserId ? { user: { id: currentUserId } } : null } }),
  };

  const rpc = async (fn, args = {}) => {
    if (fn !== "join_watch_party_room_session" && fn !== "heartbeat_watch_party_room_session") {
      return { data: null, error: new Error("unexpected_rpc") };
    }
    const partyId = String(args.p_party_id ?? "").trim().toUpperCase();
    if (partyId !== PARTY_ID) return { data: null, error: new Error("wrong_party") };

    const isHost = currentUserId === HOST_ID;
    const existingRemoved = storedMembership?.membership_state === "removed";
    const isLeaving = fn === "heartbeat_watch_party_room_session" && args.p_membership_state === "left";
    const state = existingRemoved ? "removed" : isLeaving ? "left" : "active";
    const hostRole = isHost && !existingRemoved;
    const next = membershipRow({
      user_id: currentUserId,
      role: hostRole ? "host" : "viewer",
      stage_role: hostRole ? "host" : "listener",
      can_speak: hostRole,
      membership_state: state,
      camera_enabled: hostRole ? args.p_camera_enabled === true : false,
      mic_enabled: hostRole ? args.p_mic_enabled === true : false,
      is_muted: hostRole ? args.p_self_muted === true : false,
      display_name: args.p_display_name ?? null,
      avatar_url: args.p_avatar_url ?? null,
      camera_preview_url: args.p_camera_preview_url ?? null,
      left_at: state === "active" ? null : storedMembership?.left_at ?? new Date().toISOString(),
    });
    storedMembership = next;
    membershipWrites.push(next);
    return { data: [next], error: null };
  };

  const from = (table) => {
    let operation = "select";
    let writePayload = null;
    const builder = {
      select: () => builder,
      eq: () => builder,
      returns: () => builder,
      upsert: (payload) => {
        operation = "upsert";
        writePayload = payload;
        membershipWrites.push(payload);
        return builder;
      },
      maybeSingle: async () => {
        if (table === "watch_party_rooms") return { data: roomRow(), error: null };
        if (table === "watch_party_room_memberships") return { data: storedMembership, error: null };
        return { data: null, error: null };
      },
      single: async () => {
        if (table !== "watch_party_room_memberships" || operation !== "upsert" || !writePayload) {
          return { data: null, error: new Error("unexpected_query") };
        }
        storedMembership = membershipRow(writePayload);
        return { data: storedMembership, error: null };
      },
    };
    return builder;
  };

  const roomRules = {
    buildRoomCapabilities: inert,
    deriveWatchPartyStageRole: ({ role, canSpeak, currentStageRole }) => (
      role === "host" ? "host" : currentStageRole === "speaker" || canSpeak ? "speaker" : "listener"
    ),
    evaluateRoomAccess: inert,
    normalizeCapturePolicy: (value) => value === "disabled" ? "disabled" : "best_effort",
    normalizeContentAccessRule: (value) => ["open", "party_pass", "premium"].includes(value) ? value : "open",
    normalizeJoinPolicy: (value) => value === "locked" ? "locked" : "open",
    normalizeReactionsPolicy: (value) => value === "disabled" ? "disabled" : "enabled",
    normalizeRoomMembershipState: (value) => ["active", "left", "removed"].includes(value) ? value : "active",
  };

  const mocks = {
    "@react-native-async-storage/async-storage": { default: inert },
    "./appConfig": { readAppConfig: inert, resolveRoomDefaultConfig: inert },
    "./logger": { debugLog: () => {}, reportRuntimeError: () => {} },
    "./monetization": {
      createEmptyMonetizationGateResolution: () => ({ status: "not_required" }),
      readCreatorPermissions: inert,
      sanitizeCreatorRoomAccessRule: inert,
    },
    "./paidWatchPartyTickets": {
      resolvePaidWatchPartyTicketAccess: async (partyId) => {
        ticketPartyIds.push(partyId);
        return ticketAccess;
      },
    },
    "./performancePolicy": {
      ROOM_ACTIVITY_ACTIVE_WINDOW_MS: 60_000,
      ROOM_HEARTBEAT_MS: 10_000,
      ROOM_MEMBERSHIP_ACTIVE_WINDOW_MS: 60_000,
    },
    "./premiumWatchPartyAccess": {
      requireLiveFirstPremium: async () => ({ allowed: false }),
      requireWatchPartyLivePremium: async () => {
        premiumReads += 1;
        return { allowed: premiumAllowed };
      },
    },
    "./roomRules": {
      ...roomRules,
      evaluateRoomAccess: async () => roomAccessDecision,
    },
    "./socialAttachments": { readSocialAttachmentsForSurfaces: inert },
    "./supabase": { supabase: { auth, from, rpc } },
    "./userData": { readUserProfile: inert },
  };

  const module = { exports: {} };
  new Function("exports", "module", "require", "__DEV__", compile("_lib/watchParty.ts"))(
    module.exports,
    module,
    (id) => Object.hasOwn(mocks, id) ? mocks[id] : inert,
    false,
  );
  return {
    api: module.exports,
    membershipWrites,
    ticketPartyIds,
    getPremiumReads: () => premiumReads,
    setPremiumAllowed: (value) => { premiumAllowed = value; },
    setTicketAccess: (value) => { ticketAccess = value; },
    setUserIdReads: (value) => { userIdReads = [...value]; },
    setRoomAccessDecision: (value) => { roomAccessDecision = value; },
  };
};

test("exact paid Seat Pass joins and touches only its room as viewer-only authority", async () => {
  const runtime = createRuntime();
  const requested = {
    partyId: PARTY_ID,
    userId: USER_ID,
    role: "host",
    stageRole: "speaker",
    canSpeak: true,
    cameraEnabled: true,
    micEnabled: true,
  };

  const joined = await runtime.api.joinPartyRoomSession(requested);
  const touched = await runtime.api.touchPartyRoomSession(requested);

  assert.equal(joined?.role, "viewer");
  assert.equal(joined?.stageRole, "listener");
  assert.equal(joined?.canSpeak, false);
  assert.equal(joined?.cameraEnabled, false);
  assert.equal(joined?.micEnabled, false);
  assert.equal(touched?.role, "viewer");
  assert.equal(touched?.stageRole, "listener");
  assert.equal(touched?.canSpeak, false);
  assert.equal(touched?.cameraEnabled, false);
  assert.equal(touched?.micEnabled, false);
  assert.deepEqual(runtime.ticketPartyIds, [PARTY_ID, PARTY_ID]);
  assert.equal(runtime.getPremiumReads(), 0);
  assert.equal(runtime.membershipWrites.length, 2);
  assert.equal(runtime.membershipWrites.every((row) => (
    row.party_id === PARTY_ID
    && row.user_id === USER_ID
    && row.role === "viewer"
    && row.stage_role === "listener"
    && row.can_speak === false
    && row.camera_enabled === false
    && row.mic_enabled === false
    && !("admin" in row)
    && !("payout" in row)
  )), true);
});

test("ticket admission fails closed on wrong room, malformed authority, host/admin reason, and auth replacement", async () => {
  const runtime = createRuntime();
  const exact = exactTicket();

  assert.equal(runtime.api.paidWatchPartyTicketAllowsExactRoomViewerAccess(exact, PARTY_ID), true);
  assert.equal(runtime.api.paidWatchPartyTicketAllowsExactRoomViewerAccess(exactTicket("OTHER"), PARTY_ID), false);
  assert.equal(runtime.api.paidWatchPartyTicketAllowsExactRoomViewerAccess({ ...exact, ticketId: "not-a-uuid" }, PARTY_ID), false);
  assert.equal(runtime.api.paidWatchPartyTicketAllowsExactRoomViewerAccess({ ...exact, reason: "host_or_admin", ticketId: null }, PARTY_ID), false);
  assert.equal(runtime.api.paidWatchPartyTicketAllowsExactRoomViewerAccess({ ...exact, creatorId: OTHER_USER_ID }, PARTY_ID), false);
  assert.equal(runtime.api.paidWatchPartyTicketAllowsExactRoomViewerAccess({ ...exact, provider: "revenuecat" }, PARTY_ID), false);
  assert.equal(runtime.api.paidWatchPartyTicketAllowsExactRoomViewerAccess({
    ...exact,
    offer: { ...exact.offer, status: "paused" },
  }, PARTY_ID), false);
  assert.equal(runtime.api.paidWatchPartyResolutionIsExactFreeRoom(exactFreeRoom()), true);
  assert.equal(runtime.api.paidWatchPartyResolutionIsExactFreeRoom({ ...exactFreeRoom(), reason: "access_check_failed" }), false);

  runtime.setTicketAccess({ ...exact, reason: "host_or_admin", ticketId: null });
  assert.equal(await runtime.api.joinPartyRoomSession({ partyId: PARTY_ID, userId: USER_ID }), null);
  assert.equal(runtime.membershipWrites.length, 0);

  runtime.setTicketAccess(exactTicket("OTHER"));
  assert.equal(await runtime.api.joinPartyRoomSession({ partyId: PARTY_ID, userId: USER_ID }), null);
  assert.equal(runtime.membershipWrites.length, 0);

  runtime.setTicketAccess(exact);
  runtime.setUserIdReads([USER_ID, OTHER_USER_ID]);
  assert.equal(await runtime.api.joinPartyRoomSession({ partyId: PARTY_ID, userId: USER_ID }), null);
  assert.equal(runtime.membershipWrites.length, 0);
});

test("touch re-reads server ticket authority and revoked access cannot retain membership authority", async () => {
  const runtime = createRuntime();
  const joined = await runtime.api.joinPartyRoomSession({ partyId: PARTY_ID, userId: USER_ID });
  assert.ok(joined);
  assert.equal(runtime.membershipWrites.length, 1);

  runtime.setTicketAccess({ ...exactTicket(), allowed: false, reason: "ticket_revoked", ticketId: null });
  const touched = await runtime.api.touchPartyRoomSession({ partyId: PARTY_ID, userId: USER_ID });
  assert.equal(touched, null);
  assert.equal(runtime.membershipWrites.length, 1);
  assert.deepEqual(runtime.ticketPartyIds, [PARTY_ID, PARTY_ID]);
});

test("ticket admission rejects cached session identity when the server user re-read fails", async () => {
  const runtime = createRuntime({ userIdReads: [new Error("auth_unavailable")] });
  const joined = await runtime.api.joinPartyRoomSession({ partyId: PARTY_ID, userId: USER_ID });

  assert.equal(joined, null);
  assert.deepEqual(runtime.ticketPartyIds, []);
  assert.equal(runtime.membershipWrites.length, 0);
});

test("exact ticket cannot reactivate a removed membership", async () => {
  const runtime = createRuntime({
    existingMembership: membershipRow({
      stage_role: "speaker",
      can_speak: true,
      camera_enabled: true,
      mic_enabled: true,
      membership_state: "removed",
      left_at: "2026-08-23T00:01:00.000Z",
    }),
  });

  const joined = await runtime.api.joinPartyRoomSession({
    partyId: PARTY_ID,
    userId: USER_ID,
    stageRole: "speaker",
    canSpeak: true,
    cameraEnabled: true,
    micEnabled: true,
  });
  assert.equal(joined?.membershipState, "removed");
  assert.equal(joined?.stageRole, "listener");
  assert.equal(joined?.canSpeak, false);
  assert.equal(joined?.cameraEnabled, false);
  assert.equal(joined?.micEnabled, false);
  assert.equal(runtime.membershipWrites[0].membership_state, "removed");
});

test("ordinary authoritative Premium admission remains unchanged only for an exact free room", async () => {
  const runtime = createRuntime({ premiumAllowed: true, ticketAccess: exactFreeRoom() });
  const joined = await runtime.api.joinPartyRoomSession({
    partyId: PARTY_ID,
    userId: USER_ID,
    stageRole: "speaker",
    canSpeak: true,
    cameraEnabled: true,
    micEnabled: true,
  });

  assert.equal(joined?.role, "viewer");
  assert.equal(joined?.stageRole, "listener");
  assert.equal(joined?.canSpeak, false);
  assert.equal(joined?.cameraEnabled, false);
  assert.equal(joined?.micEnabled, false);
  assert.deepEqual(runtime.ticketPartyIds, [PARTY_ID]);
  assert.equal(runtime.getPremiumReads(), 1);
});

test("Premium cannot bypass a paid offer without an exact Seat Pass", async () => {
  const runtime = createRuntime({
    premiumAllowed: true,
    ticketAccess: {
      ...exactTicket(),
      allowed: false,
      reason: "ticket_required",
      requiresPurchase: true,
      ticketId: null,
    },
  });
  const joined = await runtime.api.joinPartyRoomSession({ partyId: PARTY_ID, userId: USER_ID });

  assert.equal(joined, null);
  assert.equal(runtime.getPremiumReads(), 0);
  assert.deepEqual(runtime.ticketPartyIds, [PARTY_ID]);
  assert.equal(runtime.membershipWrites.length, 0);
});

test("exact room host authority remains distinct from Premium and Seat authority", async () => {
  const runtime = createRuntime({ userIdReads: [HOST_ID] });
  const joined = await runtime.api.joinPartyRoomSession({
    partyId: PARTY_ID,
    userId: HOST_ID,
    role: "host",
    stageRole: "host",
    canSpeak: true,
    cameraEnabled: true,
    micEnabled: true,
  });

  assert.equal(joined?.userId, HOST_ID);
  assert.equal(joined?.role, "host");
  assert.equal(joined?.stageRole, "host");
  assert.deepEqual(runtime.ticketPartyIds, []);
  assert.equal(runtime.getPremiumReads(), 0);
});

test("exact paid Seat Pass aligns room-access evaluation without granting global Premium", async () => {
  const runtime = createRuntime();
  const decision = await runtime.api.evaluatePartyRoomAccess({
    partyId: PARTY_ID,
    userId: USER_ID,
    room: roomState(),
    membership: membershipRow(),
  });

  assert.equal(decision.canJoin, true);
  assert.equal(decision.reason, "allowed");
  assert.deepEqual(decision.monetization, { status: "not_required" });
  assert.deepEqual(runtime.ticketPartyIds, [PARTY_ID]);
  assert.equal(runtime.getPremiumReads(), 0);
});

test("room-access evaluation preserves non-money denials before consulting Seat authority", async () => {
  for (const reason of ["identity_required", "removed", "room_locked"]) {
    const runtime = createRuntime({
      roomAccessDecision: {
        canJoin: false,
        reason,
        joinPolicy: reason === "room_locked" ? "locked" : "open",
        contentAccessRule: "premium",
        capturePolicy: "best_effort",
        requiresAuthIdentity: true,
        monetization: { status: "not_required" },
      },
    });
    const decision = await runtime.api.evaluatePartyRoomAccess({
      partyId: PARTY_ID,
      userId: USER_ID,
      room: roomState(),
      membership: membershipRow(),
    });
    assert.equal(decision.canJoin, false);
    assert.equal(decision.reason, reason);
    assert.deepEqual(runtime.ticketPartyIds, []);
  }
});

test("invalid Seat authority or unstable session becomes an exact party-pass denial", async () => {
  const invalidTicketRuntime = createRuntime({
    ticketAccess: { ...exactTicket(), allowed: false, reason: "ticket_revoked", ticketId: null },
  });
  const invalidTicketDecision = await invalidTicketRuntime.api.evaluatePartyRoomAccess({
    partyId: PARTY_ID,
    userId: USER_ID,
    room: roomState(),
    membership: membershipRow(),
  });
  assert.equal(invalidTicketDecision.canJoin, false);
  assert.equal(invalidTicketDecision.reason, "party_pass_required");
  assert.deepEqual(invalidTicketDecision.monetization, { status: "not_required" });

  const replacementRuntime = createRuntime({ userIdReads: [USER_ID, OTHER_USER_ID] });
  const replacementDecision = await replacementRuntime.api.evaluatePartyRoomAccess({
    partyId: PARTY_ID,
    userId: USER_ID,
    room: roomState(),
    membership: membershipRow(),
  });
  assert.equal(replacementDecision.canJoin, false);
  assert.equal(replacementDecision.reason, "party_pass_required");
  assert.deepEqual(replacementDecision.monetization, { status: "not_required" });
});

test("Premium-positive UI decision is downgraded when a paid offer lacks an exact Seat Pass", async () => {
  const premiumDecision = {
    canJoin: true,
    reason: "allowed",
    joinPolicy: "open",
    contentAccessRule: "premium",
    capturePolicy: "best_effort",
    requiresAuthIdentity: true,
    monetization: { status: "allowed" },
  };
  const runtime = createRuntime({
    roomAccessDecision: premiumDecision,
    ticketAccess: {
      ...exactTicket(),
      allowed: false,
      reason: "ticket_required",
      requiresPurchase: true,
      ticketId: null,
    },
  });
  const decision = await runtime.api.evaluatePartyRoomAccess({
    partyId: PARTY_ID,
    userId: USER_ID,
    room: roomState(),
    membership: membershipRow(),
  });

  assert.equal(decision.canJoin, false);
  assert.equal(decision.reason, "party_pass_required");
  assert.deepEqual(decision.monetization, { status: "not_required" });
  assert.deepEqual(runtime.ticketPartyIds, [PARTY_ID]);
});

test("already-authorized Premium evaluation remains unchanged after exact free-room resolution", async () => {
  const allowedDecision = {
    canJoin: true,
    reason: "allowed",
    joinPolicy: "open",
    contentAccessRule: "premium",
    capturePolicy: "best_effort",
    requiresAuthIdentity: true,
    monetization: { status: "allowed" },
  };
  const runtime = createRuntime({ roomAccessDecision: allowedDecision, ticketAccess: exactFreeRoom() });
  const decision = await runtime.api.evaluatePartyRoomAccess({
    partyId: PARTY_ID,
    userId: USER_ID,
    room: roomState(),
    membership: membershipRow(),
  });

  assert.deepEqual(decision, allowedDecision);
  assert.deepEqual(runtime.ticketPartyIds, [PARTY_ID]);
});
