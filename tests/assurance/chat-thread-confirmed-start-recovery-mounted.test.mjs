import assert from "node:assert/strict";
import test from "node:test";
import * as mediaPolicy from "../../_lib/communicationCallMediaPolicy.mjs";
import { loadStubbed } from "../customer-experience-adversarial-helpers.mjs";
import { createDurableChatThreadFixture, mountFullChatThread } from "./helpers/chat-thread-full-mounted-harness.mjs";

// Actual chat helper + mounted screen/adapter/hook. Only database, dispatch,
// and native SDK boundaries are controlled. These local checks do not establish
// physical device delivery, CallKit presentation, or two-device media status.
const deliveryCopy = loadStubbed("_lib/chillyChatCallDeliveryCopy.ts");
const LOCAL = "10000000-0000-4000-8000-000000000001";
const REMOTE = "10000000-0000-4000-8000-000000000002";
const deferred = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
};

function createStartBoundary({ readback = "error", beginFailure, afterDispatch } = {}) {
  const userFacingErrors = loadStubbed("_lib/userFacingErrors.ts");
  const store = createDurableChatThreadFixture({ userIds: [LOCAL, REMOTE] });
  // Model lost Realtime delivery. A read retry must recover independently of
  // any idealized store notification that would mask the original defect.
  store.notify = () => {};
  const counts = { create: 0, begin: 0, dispatch: 0, threadReads: 0, inviteReads: 0, cleanup: 0 };
  const requests = { begin: [], confirmedBegins: [], dispatch: [], reads: [], cleanup: [] };
  const readActions = [];
  const inviteActions = [];
  const state = { readback, beginFailure, runtime: null, authorityOverride: undefined };
  const authority = () => state.authorityOverride !== undefined ? state.authorityOverride : ({ state: "ACTIVE", restoreOnly: false,
    userId: state.runtime?.userId ?? LOCAL, accountId: state.runtime?.userId ?? LOCAL,
    sessionGeneration: state.runtime?.sessionGeneration ?? "session-1" });
  const threadRow = () => {
    const active = store.invite && ["ringing", "accepted"].includes(store.invite.status);
    return { id: store.threadId, participant_pair_key: store.userIds.join("::"), created_by: LOCAL,
      active_communication_room_id: active ? store.invite.communicationRoomId : null,
      active_call_type: active ? store.invite.callType : null,
      members: store.userIds.map(user_id => ({ thread_id: store.threadId, user_id, display_name: user_id })) };
  };
  const inviteRow = () => store.invite ? { id: store.invite.id, thread_id: store.invite.threadId,
    communication_room_id: store.invite.communicationRoomId, status: store.invite.status,
    expires_at: store.invite.expiresAt } : null;
  const realBeginApi = loadStubbed("_lib/chillyChatCalls.ts", {
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: authority,
      readCurrentAccountSessionAuthority: async () => authority(),
      sameAccountSessionAuthority: (a,b) => !!a && !!b && a.userId===b.userId
        && a.accountId===b.accountId && a.sessionGeneration===b.sessionGeneration
        && a.state===b.state && a.restoreOnly===b.restoreOnly },
    "./accountBoundSupabaseMutation": {
      AccountBoundSupabaseMutationError: class extends Error {},
      isAccountBoundSupabaseMutationOutcomeAmbiguous: () => false,
      runCurrentAccountBoundSupabaseMutationRpc: async (name, input, actorUserId) => {
        assert.equal(name, "start_chilly_chat_call");
        assert.equal(input.p_capture_policy, "best_effort");
        if (state.beginFailure === "rate_limited") return { data: null, error: { message: "rate_limited" } };
        if (state.beginFailure) return { data: null, error: null };
        const invite = store.start(actorUserId, input.p_thread_id, input.p_call_type);
        assert.equal(input.p_communication_room_id, invite.communicationRoomId);
        const data = { created: true, role: "caller", invite: {
          ...inviteRow(), caller_user_id: invite.callerUserId, callee_user_id: invite.calleeUserId,
          call_type: invite.callType, chat_call_media_provider: invite.mediaProvider,
          created_at: new Date().toISOString(),
        } };
        requests.confirmedBegins.push({ authority: authority(), input: { ...input },
          actorUserId, invite: { ...invite }, response: data });
        return { data, error: null };
      },
    },
  });
  const api = loadStubbed(process.env.CHILLY_CHAT_START_HELPER_TEST_SOURCE ?? "_lib/chat.ts", {
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: authority,
      sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId
        && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration
        && a.state === b.state && a.restoreOnly === b.restoreOnly },
    "./watchParty": { getWritablePartyUserId: async () => authority().userId },
    "./accountBoundSupabaseMutation": {
      captureAccountBoundSupabaseMutationSubject: async () => ({ accessToken: "fixture-token", authority: authority() }),
      invokeAccountBoundSupabaseMutationRpc: async (subject, functionName, args) => {
        counts.cleanup += 1;
        requests.cleanup.push({ functionName, args, authority: subject.authority });
        return { data: { cleared: false, reason: "fixture_cleanup_not_authorized" }, error: null };
      },
    },
    "./supabase": { supabase: { from: table => {
      const filters = {};
      const query = { select: () => query, eq: (key, value) => { filters[key] = value; return query; },
        in: () => query, order: () => query, limit: () => query, returns: () => query,
        maybeSingle: async () => {
          assert.equal(table, "chat_thread_activity", "only actual RLS-derived thread reads use this boundary");
          counts.threadReads += 1;
          requests.reads.push({ ...filters });
          const row = threadRow();
          const action = readActions.shift();
          if (action) return action(row);
          if (counts.threadReads === 2 && state.readback === "throw") throw Error("controlled post-commit transport exception");
          if (counts.threadReads === 2 && state.readback) return { data: null,
            error: state.readback === "error" ? { message: "controlled post-commit read failure" } : null };
          return { data: filters.id === store.threadId ? row : null, error: null };
        },
        then: resolve => Promise.resolve({ data: table === "user_profiles" ? []
          : table === "chat_call_invites" ? [inviteRow()].filter(Boolean) : [], error: null }).then(resolve),
      };
      return query;
    } } },
    "./communication": {
      prepareChatCallRoomCandidate: async () => { counts.create += 1; return { roomId: `FIXTURE-ROOM-${store.serial + 1}`, capturePolicy: "best_effort" }; },
      endCommunicationRoom: async (...args) => {
        counts.cleanup += 1;
        requests.cleanup.push({ functionName: "endCommunicationRoom", args });
      },
      getCommunicationRoomSnapshot: async roomId => ({ room: { status: store.rooms.get(roomId)?.status ?? "ended" } }),
      isCommunicationRoomActive: room => room.status === "active",
      formatCommunicationRoomCode: value => String(value ?? "").trim(),
    },
    "./chillyChatCalls": {
      CHAT_CALL_INVITES_TABLE: "chat_call_invites",
      beginChillyChatCall: async input => {
        counts.begin += 1;
        requests.begin.push(input);
        return realBeginApi.beginChillyChatCall(input);
      },
      dispatchChillyChatCallPush: async input => {
        counts.dispatch += 1;
        requests.dispatch.push(input);
        await afterDispatch?.(store);
        return { status: "sent", pushSent: true, notificationCreated: true };
      },
      readLatestChillyChatCallInviteForRoom: async roomId => store.invite?.communicationRoomId === roomId ? { ...store.invite } : null,
      readChillyChatCallInvite: async id => {
        counts.inviteReads += 1;
        const action = inviteActions.shift();
        if (action) return action(id);
        return store.invite?.id === id ? { ...store.invite } : null;
      },
    },
    "./communicationCallMediaPolicy.mjs": mediaPolicy,
    "./logger": { reportRuntimeError: () => {} },
    "./userFacingErrors": userFacingErrors,
  });
  return { api, counts, requests, readActions, inviteActions, state, store, threadRow, userFacingErrors };
}

async function mountStartBoundary(options = {}) {
  const boundary = createStartBoundary(options);
  const h = await mountFullChatThread({ durableThread: boundary.store, deliveryCopy, userId: LOCAL, remoteUserId: REMOTE,
    userFacingErrors: boundary.userFacingErrors,
    chatApi: {
      readChatCallStartRecovery: boundary.api.readChatCallStartRecovery,
    } });
  boundary.state.runtime = h.runtime;
  h.runtime.startCall = (...args) => boundary.api.startChatThreadCall(...args);
  return { ...h, ...boundary };
}

function expectNoMediaOrUnrequestedWrites(h) {
  assert.equal(h.runtime.media.localStreams.length, 0, "read uncertainty cannot start capture");
  assert.equal(h.runtime.media.joinCalls.length, 0, "read uncertainty cannot admit media");
  assert.equal(h.counts.cleanup, 0, "confirmed committed room must not be auto-ended");
  assert.equal(h.runtime.transitions.length, 0, "reconciliation must not invent a terminal transition");
  assert.equal(h.runtime.clears.length, 0, "read recovery is not implicit call cancellation");
  assert.equal(h.runtime.hostEnds, 0);
}

function expectPending(h) {
  const snapshot = h.runtime.snapshot;
  assert.doesNotMatch(snapshot.displayedCallDeliveryStatus ?? "", /not started|not sent|invite failed/i,
    "successful begin and dispatch cannot become a never-started/never-sent claim");
  assert.ok(snapshot.pendingCallStartRecovery, "confirmed begin retains a read-recovery receipt");
  const receipt = snapshot.pendingCallStartRecovery.receipt;
  const original = h.requests.confirmedBegins.at(-1);
  assert.ok(original, "receipt authority must come from an actual confirmed begin boundary");
  assert.deepEqual(receipt.authority, original.authority, "receipt preserves the original account/session subject");
  assert.equal(receipt.authority.userId, original.actorUserId);
  assert.equal(receipt.threadId, original.input.p_thread_id);
  assert.equal(receipt.requestRoomId, original.input.p_communication_room_id);
  assert.equal(receipt.role, original.response.role);
  for (const key of ["id", "threadId", "communicationRoomId", "callerUserId", "calleeUserId", "callType"]) {
    assert.equal(receipt.invite[key], original.invite[key], `receipt preserves original invite ${key}`);
  }
  assert.equal(receipt.invite.callType, original.input.p_call_type);
  assert.equal(receipt.invite.id, h.store.invite.id);
  assert.equal(receipt.delivery.status, "sent");
  assert.equal(receipt.delivery.pushSent, true);
  assert.equal(receipt.delivery.notificationCreated, true);
  assert.match(snapshot.displayedCallDeliveryStatus, /Call alert sent/);
  assert.match(snapshot.displayedCallDeliveryStatus, /current call state is unavailable/i);
  assert.equal(snapshot.callBusy, true, "uncertain readback must retain the Start barrier");
  assert.equal(snapshot.presentation.voiceCallDisabled, true);
  assert.equal(snapshot.presentation.videoCallDisabled, true);
  assert.equal(snapshot.activeCallInvite, null, "cached receipt is not current invite authority");
  assert.equal(snapshot.outgoingCallInvite, null);
  assert.equal(snapshot.callPanelOpen, false);
  expectNoMediaOrUnrequestedWrites(h);
}

for (const readback of ["error", "null", "throw"]) {
  for (const mode of ["voice", "video"]) {
    test(`actual helper + mounted ${mode} Start preserves confirmed dispatch after ${readback} readback`, async () => {
      const h = await mountStartBoundary({ readback });
      try {
        const retainedStart = h.runtime.snapshot.handleStartCall;
        await h.run(() => retainedStart(mode));
        assert.equal(h.store.invite.status, "ringing");
        assert.deepEqual(h.counts, { create: 1, begin: 1, dispatch: 1, threadReads: 2, inviteReads: 0, cleanup: 0 });
        assert.deepEqual(h.requests.dispatch, [{ action: "incoming", inviteId: h.store.invite.id }]);
        expectPending(h);
        const before = { ...h.counts };
        await h.run(async () => {
          await h.runtime.snapshot.handleStartCall(mode);
          await retainedStart(mode);
          await h.runtime.snapshot.handleJoinOrCloseCall();
        });
        assert.deepEqual(h.counts, before, "fresh/stale Start and Open Call cannot replay begin or dispatch");
        expectPending(h);
      } finally { await h.unmount(); }
    });
  }
}

test("Start rejects invalid authority with the direct public error before any read or write", async () => {
  const valid = { state: "ACTIVE", restoreOnly: false, userId: LOCAL, accountId: LOCAL, sessionGeneration: "session-1" };
  for (const authority of [null, { ...valid, state: "LOCKED" }, { ...valid, restoreOnly: true }, { ...valid, accountId: REMOTE }]) {
    const h = createStartBoundary();
    h.state.authorityOverride = authority;
    await assert.rejects(h.api.startChatThreadCall(h.store.threadId, "video"), error => {
      assert.ok(error instanceof h.userFacingErrors.UserFacingError);
      assert.equal(error.code, "chat_action");
      assert.equal(h.userFacingErrors.getUserFacingErrorMessage(error, "fallback"), error.message);
      assert.match(error.message, /account changed/i);
      assert.equal(error.receipt, undefined, "invalid authority cannot become a recovery result");
      return true;
    });
    assert.deepEqual(h.counts, { create: 0, begin: 0, dispatch: 0, threadReads: 0, inviteReads: 0, cleanup: 0 });
  }
});

test("confirmed Start returns only typed recovery state, never the internal readback error", async () => {
  for (const readback of ["error", "null", "throw"]) {
    const h = createStartBoundary({ readback });
    const result = await h.api.startChatThreadCall(h.store.threadId, "video");
    assert.equal(result.disposition, "readback_pending");
    assert.deepEqual(Object.keys(result).sort(), ["disposition", "receipt"],
      "pending result must carry domain state, not a raw error or customer-copy object");
    assert.deepEqual(Object.keys(result.receipt).sort(), ["authority", "delivery", "invite", "requestRoomId", "role", "threadId"]);
    assert.deepEqual(result.receipt.authority, h.requests.confirmedBegins[0].authority);
    assert.equal(result.receipt.threadId, h.store.threadId);
    assert.equal(result.receipt.invite.id, h.store.invite.id);
    assert.equal(result.receipt.delivery.status, "sent");
    assert.doesNotMatch(JSON.stringify(result), /controlled post-commit|readbackError|stack|UserFacingError/);
    assert.deepEqual(h.counts, { create: 1, begin: 1, dispatch: 1, threadReads: 2, inviteReads: 0, cleanup: 0 });
  }
});

test("mounted recovery button performs only fresh reads and never opens media from its cached receipt", async () => {
  const h = await mountStartBoundary();
  try {
    await h.run(() => h.runtime.snapshot.handleStartCall("video"));
    expectPending(h);
    assert.equal(h.runtime.snapshot.recoveryControl.disabled, false);
    await h.run(() => h.runtime.snapshot.recoveryControl.onPress());
    assert.equal(h.runtime.snapshot.pendingCallStartRecovery, null);
    assert.equal(h.runtime.snapshot.callStartRecoveryBusy, false);
    assert.equal(h.runtime.snapshot.callBusy, false);
    assert.equal(h.runtime.snapshot.thread.activeCommunicationRoomId, h.store.invite.communicationRoomId);
    assert.equal(h.runtime.snapshot.presentation.voiceCallDisabled, true, "fresh active room still blocks a second Start");
    assert.equal(h.runtime.snapshot.presentation.videoCallDisabled, true);
    assert.match(h.runtime.snapshot.displayedCallDeliveryStatus, /Call state refreshed.*Open Call/);
    assert.equal(h.runtime.snapshot.activeCallInvite, null);
    assert.equal(h.runtime.snapshot.outgoingCallInvite, null);
    assert.equal(h.runtime.snapshot.callPanelOpen, false);
    assert.deepEqual(h.counts, { create: 1, begin: 1, dispatch: 1, threadReads: 3, inviteReads: 1, cleanup: 0 });
    expectNoMediaOrUnrequestedWrites(h);
  } finally { await h.unmount(); }
});

test("persistent read failures and incoherent rows preserve the confirmed receipt and remain read-only retryable", async () => {
  const h = await mountStartBoundary();
  try {
    await h.run(() => h.runtime.snapshot.handleStartCall("voice"));
    const receipt = h.runtime.snapshot.pendingCallStartRecovery.receipt;
    for (const action of [
      async () => { throw Error("controlled recovery transport failure"); },
      async () => ({ data: null, error: null }),
      async row => ({ data: { ...row, active_communication_room_id: null, active_call_type: null }, error: null }),
    ]) {
      h.readActions.push(action);
      await h.run(() => h.runtime.snapshot.handleRecoverCallStart());
      expectPending(h);
      assert.equal(h.runtime.snapshot.pendingCallStartRecovery.receipt, receipt);
      assert.ok(h.runtime.snapshot.pendingCallStartRecovery.error);
      assert.doesNotMatch(h.runtime.snapshot.pendingCallStartRecovery.error, /controlled recovery transport failure/,
        "recovery error copy must not expose the internal provider failure");
      assert.equal(h.runtime.snapshot.callStartRecoveryBusy, false);
      assert.equal(h.runtime.snapshot.recoveryControl.disabled, false);
      assert.deepEqual([h.counts.create, h.counts.begin, h.counts.dispatch], [1, 1, 1]);
    }
    h.inviteActions.push(async () => ({ ...h.store.invite, callType: "video" }));
    await h.run(() => h.runtime.snapshot.handleRecoverCallStart());
    expectPending(h);
    assert.ok(h.runtime.snapshot.pendingCallStartRecovery.error, "same id with a different call type is not the owned receipt");
    await h.run(() => h.runtime.snapshot.handleRecoverCallStart());
    assert.equal(h.runtime.snapshot.pendingCallStartRecovery, null);
    expectNoMediaOrUnrequestedWrites(h);
  } finally { await h.unmount(); }
});

test("read recovery is single-flight even through retained callbacks", async () => {
  const h = await mountStartBoundary();
  const gate = deferred();
  let recovery;
  try {
    await h.run(() => h.runtime.snapshot.handleStartCall("video"));
    h.readActions.push(async row => { await gate.promise; return { data: row, error: null }; });
    const retainedRecovery = h.runtime.snapshot.handleRecoverCallStart;
    let duplicateBeforeCommit;
    await h.run(() => {
      recovery = retainedRecovery();
      duplicateBeforeCommit = retainedRecovery();
    });
    await duplicateBeforeCommit;
    assert.equal(h.counts.threadReads, 3, "duplicate refreshes cannot issue another read while one is pending");
    assert.equal(h.runtime.snapshot.callStartRecoveryBusy, true);
    assert.equal(h.runtime.snapshot.recoveryControl.disabled, true);
    await h.run(async () => { await retainedRecovery(); await h.runtime.snapshot.handleRecoverCallStart(); });
    assert.equal(h.counts.threadReads, 3, "duplicate refreshes cannot issue another read while one is pending");
    gate.resolve();
    await h.run(() => recovery);
    assert.equal(h.runtime.snapshot.pendingCallStartRecovery, null);
    assert.equal(h.counts.inviteReads, 1);
    expectNoMediaOrUnrequestedWrites(h);
  } finally { gate.resolve(); await h.unmount(); }
});

test("fresh accepted recovery preserves room ownership without acquiring media from its receipt", async () => {
  const h = await mountStartBoundary();
  try {
    await h.run(() => h.runtime.snapshot.handleStartCall("video"));
    h.store.transition(REMOTE, h.store.invite, "accepted");
    await h.run(() => h.runtime.snapshot.handleRecoverCallStart());
    assert.equal(h.runtime.snapshot.pendingCallStartRecovery, null);
    assert.equal(h.runtime.snapshot.thread.activeCommunicationRoomId, h.store.invite.communicationRoomId);
    assert.equal(h.runtime.snapshot.callBusy, false);
    assert.equal(h.runtime.snapshot.activeCallInvite, null);
    assert.equal(h.runtime.snapshot.callPanelOpen, false);
    assert.equal(h.runtime.snapshot.presentation.videoCallDisabled, true);
    expectNoMediaOrUnrequestedWrites(h);
  } finally { await h.unmount(); }
});

test("recovery bypasses ordinary thread auto-cleanup even for a server-expired ringing row", async () => {
  const h = await mountStartBoundary();
  try {
    await h.run(() => h.runtime.snapshot.handleStartCall("video"));
    h.store.invite = { ...h.store.invite, expiresAt: new Date(Date.now() - 1_000).toISOString() };
    await h.run(() => h.runtime.snapshot.handleRecoverCallStart());
    assert.equal(h.runtime.snapshot.pendingCallStartRecovery, null);
    assert.equal(h.store.invite.status, "ringing", "read recovery cannot manufacture an expiry write");
    assert.equal(h.runtime.snapshot.activeCallInvite, null);
    assert.equal(h.runtime.snapshot.callPanelOpen, false);
    expectNoMediaOrUnrequestedWrites(h);
  } finally { await h.unmount(); }
});

test("original successful Start readback can request stale accepted-room cleanup while receipt recovery never does", async () => {
  const afterDispatch = store => {
    store.transition(REMOTE, store.invite, "accepted");
    store.rooms.get(store.invite.communicationRoomId).status = "ended";
  };
  const normal = createStartBoundary({ readback: null, afterDispatch });
  const result = await normal.api.startChatThreadCall(normal.store.threadId, "video");
  assert.equal(result.disposition, "ready");
  assert.equal(result.invite.status, "ringing", "begin's original receipt predates the acceptance");
  assert.equal(normal.store.invite.status, "accepted");
  assert.equal(normal.store.rooms.get(result.roomId).status, "ended");
  assert.deepEqual(normal.counts, { create: 1, begin: 1, dispatch: 1, threadReads: 2, inviteReads: 0, cleanup: 1 });
  assert.equal(normal.requests.cleanup.length, 1);
  assert.equal(normal.requests.cleanup[0].functionName, "clear_stale_chilly_chat_thread_call",
    "the original default post-begin read retains its existing cleanup policy");
  assert.deepEqual(normal.requests.cleanup[0].args, {
    p_thread_id: normal.store.threadId, p_expected_room_id: result.roomId,
  });
  assert.equal(normal.requests.cleanup[0].authority.userId, LOCAL);
  assert.equal(result.thread.activeCommunicationRoomId, result.roomId,
    "an unauthorized cleanup result cannot clear the returned thread link");

  const recovery = createStartBoundary({ afterDispatch });
  const pending = await recovery.api.startChatThreadCall(recovery.store.threadId, "video");
  assert.equal(pending.disposition, "readback_pending");
  const { receipt } = pending;
  assert.deepEqual(recovery.counts, { create: 1, begin: 1, dispatch: 1, threadReads: 2, inviteReads: 0, cleanup: 0 });
  const latest = await recovery.api.readChatCallStartRecovery(receipt);
  assert.equal(latest.invite.status, "accepted");
  assert.equal(latest.thread.activeCommunicationRoomId, receipt.requestRoomId);
  assert.equal(recovery.store.rooms.get(receipt.requestRoomId).status, "ended");
  assert.deepEqual(recovery.counts, { create: 1, begin: 1, dispatch: 1, threadReads: 3, inviteReads: 1, cleanup: 0 },
    "explicit receipt recovery bypasses the default readback cleanup policy");
  assert.deepEqual(recovery.requests.cleanup, []);
});

test("terminal recovery preserves a same-room successor link and explicit Open Call revalidates before media", async () => {
  const h = await mountStartBoundary();
  const gate = deferred();
  let opening;
  try {
    await h.run(() => h.runtime.snapshot.handleStartCall("video"));
    const receipt = h.runtime.snapshot.pendingCallStartRecovery.receipt;
    const terminal = h.store.transition(LOCAL, h.store.invite, "canceled");
    // Model the terminal trigger's exception: a different accepted invite owns
    // the same room, so the server preserves the thread's raw active-room link.
    const successor = { ...terminal, id: "same-room-successor", status: "accepted" };
    h.store.invite = successor;
    h.store.rooms.get(successor.communicationRoomId).status = "active";
    h.inviteActions.push(async id => {
      assert.equal(id, terminal.id, "recovery reads the exact original invite, not the successor");
      return { ...terminal };
    });
    await h.run(() => h.runtime.snapshot.handleRecoverCallStart());
    assert.equal(receipt.invite.status, "ringing");
    assert.equal(h.runtime.snapshot.pendingCallStartRecovery, null,
      "a terminal exact invite with a retained room link can finish read recovery");
    assert.equal(h.runtime.snapshot.callBusy, false);
    assert.equal(h.runtime.snapshot.thread.activeCommunicationRoomId, successor.communicationRoomId);
    assert.equal(h.runtime.snapshot.thread.activeCallType, successor.callType);
    assert.equal(h.runtime.snapshot.presentation.voiceCallDisabled, true);
    assert.equal(h.runtime.snapshot.presentation.videoCallDisabled, true);
    assert.equal(h.runtime.snapshot.displayedCallDeliveryStatus,
      "The requested call has ended. A call entry remains. Open Call to check its current state.");
    assert.equal(h.runtime.snapshot.activeCallInvite, null);
    assert.equal(h.runtime.snapshot.outgoingCallInvite, null);
    assert.equal(h.runtime.snapshot.incomingCallInvite, null);
    assert.equal(h.runtime.snapshot.callPanelOpen, false);
    assert.deepEqual(h.counts, { create: 1, begin: 1, dispatch: 1, threadReads: 3, inviteReads: 1, cleanup: 0 });
    expectNoMediaOrUnrequestedWrites(h);

    const lookups = [];
    h.runtime.readLatestInvite = async roomId => {
      lookups.push(roomId);
      await gate.promise;
      return { ...h.store.invite };
    };
    await h.run(() => { opening = h.runtime.snapshot.handleJoinOrCloseCall(); });
    assert.deepEqual(lookups, [successor.communicationRoomId], "Open Call must revalidate the retained room");
    assert.equal(h.runtime.snapshot.activeCallInvite, null);
    assert.equal(h.runtime.snapshot.callPanelOpen, false, "held invite read cannot open the call panel");
    expectNoMediaOrUnrequestedWrites(h);
    gate.resolve();
    await h.run(() => opening);
    assert.equal(h.runtime.snapshot.activeCallInvite.id, successor.id,
      "only the freshly revalidated successor invite can own the opened call");
    assert.notEqual(h.runtime.snapshot.activeCallInvite.id, receipt.invite.id);
    assert.equal(h.runtime.snapshot.activeCallInvite.status, "accepted");
    assert.equal(h.runtime.snapshot.callPanelOpen, true);
    assert.equal(h.runtime.media.localStreams.length, 1);
    assert.equal(h.runtime.media.joinCalls.length, 1);
    assert.deepEqual(h.counts, { create: 1, begin: 1, dispatch: 1, threadReads: 3, inviteReads: 1, cleanup: 0 });
    assert.deepEqual(h.runtime.transitions, []);
    assert.deepEqual(h.runtime.clears, []);
  } finally { gate.resolve(); await h.unmount(); }
});

test("fresh terminal recovery releases Start without cleanup, cached ringing, or media", async () => {
  const h = await mountStartBoundary();
  try {
    await h.run(() => h.runtime.snapshot.handleStartCall("video"));
    const receipt = h.runtime.snapshot.pendingCallStartRecovery.receipt;
    h.store.transition(LOCAL, h.store.invite, "canceled");
    await h.run(() => h.runtime.snapshot.handleRecoverCallStart());
    assert.equal(receipt.invite.status, "ringing", "original receipt is deliberately stale");
    assert.equal(h.runtime.snapshot.pendingCallStartRecovery, null);
    assert.equal(h.runtime.snapshot.activeCallRoomId, "");
    assert.equal(h.runtime.snapshot.callBusy, false);
    assert.equal(h.runtime.snapshot.presentation.voiceCallDisabled, false);
    assert.equal(h.runtime.snapshot.presentation.videoCallDisabled, false);
    assert.match(h.runtime.snapshot.displayedCallDeliveryStatus, /has ended/);
    expectNoMediaOrUnrequestedWrites(h);
  } finally { await h.unmount(); }
});

for (const state of ["ringing", "accepted", "terminal same-room successor", "terminal newer-room successor", "terminal no-link"]) {
  for (const beforeCommit of [true, false]) {
    test(`recovery retires pre-recovery Start callbacks for ${state} ${beforeCommit ? "before" : "after"} projection commit`, async () => {
      const h = await mountStartBoundary();
      try {
        const retainedStart = h.runtime.snapshot.handleStartCall;
        await h.run(() => retainedStart("video"));
        expectPending(h);
        if (state === "accepted") h.store.transition(REMOTE, h.store.invite, "accepted");
        if (state.startsWith("terminal")) {
          const terminal = h.store.transition(LOCAL, h.store.invite, "canceled");
          if (state === "terminal same-room successor") {
            h.store.invite = { ...terminal, id: "same-room-successor", status: "accepted" };
            h.store.rooms.get(terminal.communicationRoomId).status = "active";
          } else if (state === "terminal newer-room successor") {
            const successor = h.store.start(REMOTE, h.store.threadId, "voice");
            h.store.transition(LOCAL, successor, "accepted");
          }
          h.inviteActions.push(async id => {
            assert.equal(id, terminal.id);
            return { ...terminal };
          });
        }
        let afterRecovery;
        const recover = async () => {
          await h.runtime.snapshot.handleRecoverCallStart();
          afterRecovery = { ...h.counts };
        };
        if (beforeCommit) {
          await h.run(async () => {
            await recover();
            assert.ok(h.runtime.snapshot.pendingCallStartRecovery,
              "the retained callback runs before the recovered projection commits");
            await retainedStart("video");
          });
        } else {
          await h.run(recover);
          assert.equal(h.runtime.snapshot.callPanelOpen, false);
          expectNoMediaOrUnrequestedWrites(h);
          await h.run(() => retainedStart("video"));
        }
        assert.deepEqual(h.counts, afterRecovery,
          "retired Start cannot read, replay setup, or reopen recovered media");
        assert.equal(h.runtime.snapshot.pendingCallStartRecovery, null);
        assert.equal(h.runtime.snapshot.callBusy, false);
        assert.equal(h.runtime.snapshot.callPanelOpen, false);
        assert.equal(h.runtime.snapshot.activeCallInvite, null);
        assert.equal(h.runtime.snapshot.outgoingCallInvite, null);
        expectNoMediaOrUnrequestedWrites(h);
        if (state === "terminal no-link") {
          assert.equal(h.runtime.snapshot.presentation.voiceCallDisabled, false);
          assert.equal(h.runtime.snapshot.presentation.videoCallDisabled, false);
          // Only a fresh callback committed with the reconciled idle thread may
          // carry the user's deliberate next Start, not an old queued press.
          h.state.readback = null;
          await h.run(() => h.runtime.snapshot.handleStartCall("voice"));
          assert.deepEqual([h.counts.create, h.counts.begin, h.counts.dispatch], [2, 2, 2]);
          assert.equal(h.runtime.snapshot.outgoingCallInvite.callType, "voice");
          assert.equal(h.runtime.snapshot.outgoingCallInvite.status, "ringing");
        } else {
          assert.equal(h.runtime.snapshot.thread.activeCommunicationRoomId, h.store.invite.communicationRoomId);
          assert.equal(h.runtime.snapshot.presentation.voiceCallDisabled, true);
          assert.equal(h.runtime.snapshot.presentation.videoCallDisabled, true);
          await h.run(() => h.runtime.snapshot.handleStartCall("voice"));
          assert.deepEqual(h.counts, afterRecovery, "fresh Start also respects the retained active-room link");
          expectNoMediaOrUnrequestedWrites(h);
        }
      } finally { await h.unmount(); }
    });
  }
}

test("retained recovery callbacks cannot read or release a successor pending Start", async () => {
  const h = await mountStartBoundary();
  try {
    await h.run(() => h.runtime.snapshot.handleStartCall("video"));
    const oldRecovery = h.runtime.snapshot.handleRecoverCallStart;
    const oldButton = h.runtime.snapshot.recoveryControl.onPress;
    const oldReceipt = h.runtime.snapshot.pendingCallStartRecovery.receipt;
    h.store.transition(LOCAL, h.store.invite, "canceled");
    await h.run(() => oldRecovery());
    assert.equal(h.runtime.snapshot.pendingCallStartRecovery, null);
    h.readActions.push(async row => ({ data: row, error: null }),
      async () => ({ data: null, error: { message: "second committed call readback failed" } }));
    await h.run(() => h.runtime.snapshot.handleStartCall("voice"));
    expectPending(h);
    const successor = h.runtime.snapshot.pendingCallStartRecovery;
    assert.notEqual(successor.receipt.invite.id, oldReceipt.invite.id);
    const countsBefore = { ...h.counts };
    await h.run(async () => { await oldRecovery(); oldButton(); });
    assert.deepEqual(h.counts, countsBefore, "an old button cannot accidentally recover a newer Start");
    assert.equal(h.runtime.snapshot.pendingCallStartRecovery, successor);
    assert.equal(h.runtime.snapshot.callBusy, true);
    await h.run(() => h.runtime.snapshot.handleRecoverCallStart());
    assert.equal(h.runtime.snapshot.pendingCallStartRecovery, null);
    assert.deepEqual([h.counts.create, h.counts.begin, h.counts.dispatch], [2, 2, 2]);
    expectNoMediaOrUnrequestedWrites(h);
  } finally { await h.unmount(); }
});

const visibleProjection = h => {
  const snapshot = h.runtime.snapshot;
  return { thread: snapshot.thread, activeCallRoomId: snapshot.activeCallRoomId,
    activeCallInvite: snapshot.activeCallInvite, incomingCallInvite: snapshot.incomingCallInvite,
    callBusy: snapshot.callBusy, callPanelOpen: snapshot.callPanelOpen,
    pending: snapshot.pendingCallStartRecovery, delivery: snapshot.displayedCallDeliveryStatus,
    error: snapshot.error };
};

async function holdRecovery(h) {
  const gate = deferred();
  const oldInvite = { ...h.store.invite };
  h.readActions.push(async row => { await gate.promise; return { data: row, error: null }; });
  // Model independently delayed but mutually coherent old server read results.
  // The screen must fence them even when the helper cannot know a later event.
  h.inviteActions.push(async () => oldInvite);
  let pending;
  await h.run(() => { pending = h.runtime.snapshot.handleRecoverCallStart(); });
  assert.equal(h.runtime.snapshot.callStartRecoveryBusy, true);
  return { gate, pending };
}

for (const [replacement, patch] of [
  ["owner", { userId: REMOTE, remoteUserId: LOCAL }],
  ["session", { sessionGeneration: "session-2" }],
  ["route", { threadId: "replacement-thread" }],
]) {
  test(`late recovery cannot project into a replacement ${replacement}`, async () => {
    const h = await mountStartBoundary();
    let held;
    try {
      await h.run(() => h.runtime.snapshot.handleStartCall("video"));
      held = await holdRecovery(h);
      await h.rerender(patch);
      assert.equal(h.runtime.snapshot.pendingCallStartRecovery, null);
      assert.equal(h.runtime.snapshot.callStartRecoveryBusy, false);
      const before = visibleProjection(h);
      held.gate.resolve();
      await h.run(() => held.pending);
      assert.deepEqual(visibleProjection(h), before, "old success/error must not alter the replacement owner's UI");
      assert.deepEqual([h.counts.create, h.counts.begin, h.counts.dispatch], [1, 1, 1]);
      expectNoMediaOrUnrequestedWrites(h);
    } finally { held?.gate.resolve(); await h.unmount(); }
  });
}

test("remote End fences an in-flight recovery, then a fresh terminal read safely releases Start", async () => {
  const h = await mountStartBoundary();
  let held;
  try {
    await h.run(() => h.runtime.snapshot.handleStartCall("video"));
    held = await holdRecovery(h);
    h.store.transition(LOCAL, h.store.invite, "canceled");
    // Deliver a real thread notification after the prior deliberately lost one.
    await h.run(() => { for (const listener of h.runtime.threadSubscriptions) listener(); });
    assert.equal(h.runtime.snapshot.activeCallRoomId, "");
    const before = visibleProjection(h);
    held.gate.resolve();
    await h.run(() => held.pending);
    assert.deepEqual(visibleProjection(h), before, "a late ringing snapshot cannot undo authoritative End");
    assert.ok(h.runtime.snapshot.pendingCallStartRecovery, "an invalidated read cannot release its Start barrier");
    assert.equal(h.runtime.snapshot.callStartRecoveryBusy, false);
    await h.run(() => h.runtime.snapshot.handleRecoverCallStart());
    assert.equal(h.runtime.snapshot.pendingCallStartRecovery, null);
    assert.equal(h.runtime.snapshot.callBusy, false);
    assert.equal(h.runtime.snapshot.activeCallRoomId, "");
    assert.match(h.runtime.snapshot.displayedCallDeliveryStatus, /has ended/);
    expectNoMediaOrUnrequestedWrites(h);
  } finally { held?.gate.resolve(); await h.unmount(); }
});

for (const endReplacement of [false, true]) {
  test(`newer call ${endReplacement ? "and actual End" : "projection"} owns the screen over late recovery`, async () => {
    const h = await mountStartBoundary();
    let held;
    try {
      await h.run(() => h.runtime.snapshot.handleStartCall("video"));
      held = await holdRecovery(h);
      const originalId = h.store.invite.id;
      h.store.transition(LOCAL, h.store.invite, "canceled");
      const replacement = h.store.start(REMOTE, "thread", "voice");
      await h.run(() => { for (const listener of h.runtime.threadSubscriptions) listener(); });
      assert.notEqual(replacement.id, originalId);
      assert.equal(h.runtime.snapshot.incomingCallInvite.id, replacement.id);
      assert.equal(h.runtime.snapshot.pendingCallStartRecovery, null);
      assert.equal(h.runtime.snapshot.callBusy, false);
      if (endReplacement) {
        await h.run(() => h.runtime.snapshot.handleAcceptIncomingCall());
        assert.equal(h.store.invite.status, "accepted");
        assert.equal(h.runtime.snapshot.callPanelOpen, true);
        await h.run(() => h.runtime.snapshot.handleJoinOrCloseCall());
        assert.equal(h.store.invite.status, "ended");
        assert.equal(h.runtime.snapshot.callPanelOpen, false);
        assert.equal(h.runtime.snapshot.activeCallRoomId, "");
        assert.deepEqual(h.runtime.transitions.map(({ status }) => status), ["accepted", "ended"]);
      }
      const before = visibleProjection(h);
      const countsBefore = { ...h.counts };
      const mediaBefore = { streams: h.runtime.media.localStreams.length,
        joins: h.runtime.media.joinCalls.length, transitions: h.runtime.transitions.length,
        clears: h.runtime.clears.length, leaves: h.runtime.leaves.length };
      held.gate.resolve();
      await h.run(() => held.pending);
      assert.deepEqual(visibleProjection(h), before, "a stale receipt cannot overwrite newer call or terminal state");
      assert.deepEqual(h.counts, { ...countsBefore, inviteReads: countsBefore.inviteReads + 1 });
      assert.deepEqual({ streams: h.runtime.media.localStreams.length,
        joins: h.runtime.media.joinCalls.length, transitions: h.runtime.transitions.length,
        clears: h.runtime.clears.length, leaves: h.runtime.leaves.length }, mediaBefore,
      "late recovery cannot create duplicate capture, membership, or cancellation");
      assert.deepEqual([h.counts.create, h.counts.begin, h.counts.dispatch], [1, 1, 1]);
      if (!endReplacement) expectNoMediaOrUnrequestedWrites(h);
    } finally { held?.gate.resolve(); await h.unmount(); }
  });
}

test("successful explicit retry clears the old throttle error even when realtime is lost", async () => {
  const h = await mountStartBoundary({ beginFailure: "rate_limited" });
  try {
    h.store.notify = () => {};
    await h.run(() => h.runtime.snapshot.handleStartCall("video"));
    assert.match(h.runtime.snapshot.error, /Too many attempts/);
    h.state.beginFailure = null;
    h.state.readback = null;
    await h.run(() => h.runtime.snapshot.handleStartCall("video"));
    assert.equal(h.runtime.snapshot.error, null);
    assert.equal(h.counts.dispatch, 1);
    assert.equal(h.store.invite.status, "ringing");
    assert.doesNotMatch(h.runtime.snapshot.displayedCallDeliveryStatus ?? "", /Too many attempts/);
  } finally { await h.unmount(); }
});

for (const beginFailure of ["controlled unknown begin response", "rate_limited"]) {
  test(`${beginFailure} never gains a confirmed-start receipt and remains retryable`, async () => {
    const h = await mountStartBoundary({ beginFailure });
    try {
      await h.run(() => h.runtime.snapshot.handleStartCall("video"));
      assert.equal(h.store.invite, null);
      assert.equal(h.runtime.snapshot.pendingCallStartRecovery, null);
      assert.equal(h.runtime.snapshot.callBusy, false);
      assert.equal(h.runtime.snapshot.presentation.voiceCallDisabled, false);
      assert.equal(h.runtime.snapshot.presentation.videoCallDisabled, false);
      assert.equal(h.runtime.snapshot.callPanelOpen, false);
      assert.equal(h.runtime.media.localStreams.length, 0);
      assert.equal(h.runtime.media.joinCalls.length, 0);
      assert.equal(h.counts.dispatch, 0);
      assert.doesNotMatch(h.runtime.snapshot.displayedCallDeliveryStatus ?? "", /Call alert sent/);
      assert.match(h.runtime.snapshot.error, beginFailure === "rate_limited"
        ? /Too many attempts\. Wait a few minutes, then try again\./ : /Unable to confirm whether this Chi'lly Chat call was started/,
      "unknown begin must not assert that the invite was never saved");
      if (beginFailure !== "rate_limited") {
        assert.match(h.runtime.snapshot.displayedCallDeliveryStatus, /Unable to confirm call setup/,
          "unknown begin delivery copy must preserve uncertainty");
        assert.doesNotMatch(h.runtime.snapshot.displayedCallDeliveryStatus, /not started|not sent|invite failed/i);
      } else {
        assert.equal(h.runtime.snapshot.displayedCallDeliveryStatus, h.runtime.snapshot.error,
          "definitive rejection must not show a conflicting uncertain-setup banner");
        assert.doesNotMatch(h.runtime.snapshot.displayedCallDeliveryStatus, /confirm|refresh/i);
      }
      const before = { ...h.counts };
      await h.run(() => h.runtime.snapshot.handleRecoverCallStart());
      assert.deepEqual(h.counts, before, "unknown/rejected begin cannot enter confirmed recovery");
      h.state.readback = null;
      await h.run(() => h.runtime.snapshot.handleStartCall("video"));
      assert.equal(h.counts.begin, 2, "the next explicit Start is not stranded behind a false receipt");
      assert.equal(h.counts.dispatch, 0);
    } finally { await h.unmount(); }
  });
}
