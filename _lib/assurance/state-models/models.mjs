const copy = (value) => structuredClone(value);
const uniq = (values) => [...new Set(values)];
const terminalInvite = new Set(["declined", "cancelled", "timed_out", "ended"]);

function finishCall(state, status) {
  if (terminalInvite.has(state.inviteStatus)) return state;
  state.inviteStatus = status;
  state.roomStatus = "ended";
  state.callerMembership = "ended";
  state.calleeMembership = "ended";
  state.localMedia = false;
  state.remoteMedia = false;
  state.remoteParticipant = false;
  state.remoteSubscription = false;
  state.nativeCallState = status;
  state.timeoutWorker = "stopped";
  state.terminalHistory += 1;
  if (state.nativeAction) state.deniedNativeActions = uniq([...state.deniedNativeActions, state.nativeAction.id]);
  state.nativeAction = null;
  if (state.threadGeneration === state.callGeneration) {
    state.threadActiveRoom = null;
    state.threadGeneration = null;
  }
  return state;
}

const chatCall = {
  id: "chat-call",
  featureId: "chilly-chat-call-lifecycle",
  seed: 173501,
  initial: () => ({
    now: 0,
    inviteStatus: "idle",
    roomStatus: "none",
    threadActiveRoom: null,
    threadGeneration: null,
    roomId: null,
    callerMembership: "none",
    calleeMembership: "none",
    participants: [],
    mediaProvider: null,
    providerHistory: [],
    nativeAction: null,
    receivedNativeActions: [],
    consumedNativeActions: [],
    expiredNativeActions: [],
    deniedNativeActions: [],
    authenticationReady: false,
    reactReady: false,
    tokenStatus: "none",
    localMedia: false,
    remoteParticipant: false,
    remoteSubscription: false,
    remoteMedia: false,
    nativeCallState: "idle",
    terminalHistory: 0,
    timeoutWorker: "idle",
    callGeneration: 0,
    cleanupGeneration: 0
  }),
  commandArbitrary: (fc) => fc.oneof(
    fc.record({ type: fc.constant("invite"), generation: fc.integer({ min: 1, max: 4 }), provider: fc.constantFrom("livekit", "legacy") }),
    fc.record({ type: fc.constant("native_action"), actionId: fc.integer({ min: 1, max: 5 }), generation: fc.integer({ min: 1, max: 4 }), expiresAt: fc.integer({ min: 1, max: 8 }) }),
    fc.record({ type: fc.constant("cleanup"), generation: fc.integer({ min: 1, max: 4 }) }),
    fc.record({ type: fc.constant("membership_write"), generation: fc.integer({ min: 1, max: 4 }), role: fc.constantFrom("caller", "callee", "intruder") }),
    fc.record({ type: fc.constant("change_provider"), provider: fc.constantFrom("livekit", "legacy") }),
    fc.record({ type: fc.constant("tick"), amount: fc.integer({ min: 1, max: 3 }) }),
    fc.constantFrom(
      { type: "auth_ready" }, { type: "react_ready" }, { type: "consume_native" },
      { type: "accept" }, { type: "issue_token" }, { type: "connect_room" },
      { type: "publish_local" }, { type: "remote_participant" }, { type: "subscribe_remote" },
      { type: "first_media" }, { type: "timeout" }, { type: "cancel" }, { type: "decline" },
      { type: "end" }
    )
  ),
  apply(current, command, variant = "fixed") {
    const state = copy(current);
    switch (command.type) {
      case "invite":
        if ((state.inviteStatus === "idle" || terminalInvite.has(state.inviteStatus)) && command.generation > state.callGeneration) {
          state.callGeneration = command.generation;
          state.cleanupGeneration = command.generation;
          state.inviteStatus = "ringing";
          state.roomStatus = "active";
          state.roomId = `room-${command.generation}`;
          state.threadActiveRoom = state.roomId;
          state.threadGeneration = command.generation;
          state.callerMembership = "invited";
          state.calleeMembership = "invited";
          state.participants = [];
          state.mediaProvider = command.provider;
          state.providerHistory = [command.provider];
          state.tokenStatus = "none";
          state.localMedia = false;
          state.remoteMedia = false;
          state.remoteParticipant = false;
          state.remoteSubscription = false;
          state.nativeCallState = "ringing";
          state.terminalHistory = 0;
          state.timeoutWorker = "scheduled";
        }
        break;
      case "change_provider":
        if (variant === "provider-mutable" && state.mediaProvider) {
          state.mediaProvider = command.provider;
          state.providerHistory = uniq([...state.providerHistory, command.provider]);
        }
        break;
      case "auth_ready":
        state.authenticationReady = true;
        break;
      case "react_ready":
        state.reactReady = true;
        break;
      case "native_action": {
        const key = `action-${command.generation}-${command.actionId}`;
        state.receivedNativeActions = uniq([...state.receivedNativeActions, key]);
        if (command.generation !== state.callGeneration || terminalInvite.has(state.inviteStatus)) {
          state.deniedNativeActions = uniq([...state.deniedNativeActions, key]);
          break;
        }
        if (state.consumedNativeActions.includes(key) || state.expiredNativeActions.includes(key)) break;
        if (state.nativeAction?.id === key) break;
        if (variant === "native-action-lost" && !state.reactReady) break;
        if (command.expiresAt <= state.now) {
          state.expiredNativeActions = uniq([...state.expiredNativeActions, key]);
          break;
        }
        if (state.nativeAction && state.nativeAction.id !== key) {
          state.deniedNativeActions = uniq([...state.deniedNativeActions, key]);
          break;
        }
        state.nativeAction = { id: key, generation: command.generation, expiresAt: command.expiresAt };
        state.nativeCallState = "answer_pending";
        break;
      }
      case "consume_native":
        if (state.nativeAction?.generation === state.callGeneration && state.nativeAction.expiresAt > state.now && state.authenticationReady && state.reactReady) {
          const key = state.nativeAction.id;
          if (!state.consumedNativeActions.includes(key)) state.consumedNativeActions.push(key);
          state.nativeAction = null;
          state.nativeCallState = "action_consumed";
        }
        break;
      case "tick":
        state.now += command.amount;
        if (state.nativeAction && state.nativeAction.expiresAt <= state.now) {
          state.expiredNativeActions = uniq([...state.expiredNativeActions, state.nativeAction.id]);
          state.nativeAction = null;
        }
        break;
      case "accept":
        if (state.inviteStatus === "ringing" || (variant === "accept-timeout-nonatomic" && state.inviteStatus === "timed_out")) {
          state.inviteStatus = "accepted";
          if (variant !== "accept-timeout-nonatomic") state.roomStatus = "active";
          state.callerMembership = "active";
          state.calleeMembership = "active";
          state.participants = ["caller", "callee"];
          state.nativeCallState = "accepted";
          state.timeoutWorker = "stopped";
        }
        break;
      case "issue_token":
        if (state.inviteStatus === "accepted") state.tokenStatus = "valid";
        break;
      case "connect_room":
        if (state.inviteStatus === "accepted" && state.tokenStatus === "valid") state.roomStatus = "connected";
        break;
      case "publish_local":
        if (state.roomStatus === "connected") state.localMedia = true;
        break;
      case "remote_participant":
        if (state.roomStatus === "connected") state.remoteParticipant = true;
        break;
      case "subscribe_remote":
        if (state.remoteParticipant && state.localMedia) state.remoteSubscription = true;
        break;
      case "first_media":
        if (state.remoteSubscription && state.tokenStatus === "valid") state.remoteMedia = true;
        break;
      case "timeout":
        if (state.inviteStatus === "ringing") finishCall(state, "timed_out");
        break;
      case "cancel":
      case "decline":
        if (state.inviteStatus === "ringing") finishCall(state, command.type === "cancel" ? "cancelled" : "declined");
        break;
      case "end":
        if (state.inviteStatus === "accepted") finishCall(state, "ended");
        break;
      case "cleanup":
        if (variant === "stale-cleanup" || (command.generation === state.callGeneration && terminalInvite.has(state.inviteStatus))) {
          state.threadActiveRoom = null;
          state.threadGeneration = null;
        }
        break;
      case "membership_write":
        if (command.generation === state.callGeneration && (!terminalInvite.has(state.inviteStatus) || variant === "old-membership-reactivates")) {
          if (command.role === "caller") state.callerMembership = "active";
          if (command.role === "callee") state.calleeMembership = "active";
          if (command.role === "intruder" && variant === "extra-participant") state.participants = uniq([...state.participants, "intruder"]);
        }
        break;
      default:
        throw new Error(`UNKNOWN_CHAT_COMMAND:${command.type}`);
    }
    return state;
  },
  violations(state) {
    const failures = [];
    if (state.tokenStatus === "valid" && state.inviteStatus !== "accepted") failures.push("CHAT_TOKEN_REQUIRES_ACCEPTED");
    if ((state.localMedia || state.remoteMedia) && (state.inviteStatus !== "accepted" || state.tokenStatus !== "valid")) failures.push("CHAT_MEDIA_REQUIRES_ACCEPTED_TOKEN");
    if (terminalInvite.has(state.inviteStatus) && state.roomStatus !== "ended") failures.push("TERMINAL_ROOM_ORPHAN");
    if (terminalInvite.has(state.inviteStatus) && [state.callerMembership, state.calleeMembership].some((value) => ["active", "reconnecting"].includes(value))) failures.push("TERMINAL_ROOM_ORPHAN");
    if (terminalInvite.has(state.inviteStatus) && state.terminalHistory !== 1) failures.push("CHAT_TERMINAL_HISTORY_NOT_EXACT");
    if (!terminalInvite.has(state.inviteStatus) && state.inviteStatus !== "idle" && state.threadActiveRoom !== state.roomId) failures.push("STALE_CLEANUP_CLEARS_NEW_CALL");
    if (state.providerHistory.length > 1) failures.push("CHAT_PROVIDER_NOT_IMMUTABLE");
    if (state.inviteStatus === "accepted" && state.participants.join(",") !== "caller,callee") failures.push("CHAT_PARTICIPANT_SET_INVALID");
    if (state.consumedNativeActions.length !== uniq(state.consumedNativeActions).length) failures.push("CHAT_NATIVE_ACTION_CONSUMED_TWICE");
    if (state.consumedNativeActions.some((id) => state.expiredNativeActions.includes(id))) failures.push("CHAT_EXPIRED_ACTION_CONSUMED");
    if (state.inviteStatus === "accepted" && state.roomStatus === "ended") failures.push("ACCEPT_TIMEOUT_RACE");
    const retained = new Set([state.nativeAction?.id, ...state.consumedNativeActions, ...state.expiredNativeActions, ...state.deniedNativeActions].filter(Boolean));
    if (state.receivedNativeActions.some((id) => !retained.has(id))) failures.push("NATIVE_ACTION_LOST_BEFORE_REACT_CONTEXT");
    return uniq(failures);
  }
};

const revenueAuthorityRank = { cancel: 1, purchase: 2, renewal: 3, transfer: 4, expiration: 5, refund: 6, revocation: 7 };
const revenueCat = {
  id: "revenuecat",
  featureId: "revenuecat-premium",
  seed: 173502,
  initial: () => ({
    store: null,
    environment: null,
    appUser: null,
    entitlement: "inactive",
    lastEventId: null,
    lastEventType: null,
    eventTime: -1,
    maxAuthoritativeTime: -1,
    authoritativeOrder: null,
    product: null,
    owners: [],
    transferSource: null,
    transferTarget: null,
    expiration: null,
    refunded: false,
    cancelled: false,
    revoked: false,
    processedEventIds: [],
    duplicateCount: 0,
    outOfOrderCount: 0,
    providerBacked: false,
    productionAccess: false,
    transferOutcome: null,
    payableBalance: 0
  }),
  commandArbitrary: (fc) => fc.record({
    type: fc.constant("event"),
    eventId: fc.integer({ min: 1, max: 8 }).map((id) => `event-${id}`),
    eventType: fc.constantFrom("purchase", "renewal", "cancel", "expiration", "refund", "revocation", "transfer", "manual", "migration"),
    eventTime: fc.integer({ min: 0, max: 20 }),
    store: fc.constantFrom("apple", "google"),
    environment: fc.constantFrom("sandbox", "production"),
    authority: fc.constantFrom("provider", "manual", "test", "migration"),
    appUser: fc.constantFrom("user-a", "user-b"),
    target: fc.constantFrom("user-a", "user-b"),
    product: fc.constantFrom("premium.monthly", "premium.yearly"),
    expiresAt: fc.integer({ min: 0, max: 30 })
  }),
  apply(current, command, variant = "fixed") {
    const state = copy(current);
    const authoritative = command.authority === "provider" && !["manual", "migration"].includes(command.eventType);
    if (!authoritative) {
      if (state.maxAuthoritativeTime < 0) state.entitlement = "test_only";
      return state;
    }
    if (state.processedEventIds.includes(command.eventId)) {
      state.duplicateCount += 1;
      return state;
    }
    state.processedEventIds.push(command.eventId);
    const order = { time: command.eventTime, rank: revenueAuthorityRank[command.eventType] ?? 0, eventId: command.eventId };
    const prior = state.authoritativeOrder;
    const older = prior && (order.time < prior.time || (order.time === prior.time && (order.rank < prior.rank || (order.rank === prior.rank && order.eventId.localeCompare(prior.eventId) < 0))));
    if (older && variant !== "out-of-order-wins") {
      state.outOfOrderCount += 1;
      return state;
    }
    state.authoritativeOrder = order;
    state.maxAuthoritativeTime = Math.max(state.maxAuthoritativeTime, command.eventTime);
    state.lastEventId = command.eventId;
    state.lastEventType = command.eventType;
    state.eventTime = command.eventTime;
    state.store = command.store;
    state.environment = command.environment;
    state.product = command.product;
    state.expiration = command.expiresAt;
    if (command.eventType === "transfer") {
      state.transferSource = state.owners[0] ?? command.appUser;
      state.transferTarget = command.target;
      if (command.expiresAt <= command.eventTime) {
        state.transferOutcome = "expired_target_rejected";
        return state;
      }
      state.transferOutcome = "transferred";
      state.owners = variant === "double-owner-transfer"
        ? uniq([state.transferSource, command.target])
        : [command.target];
      state.appUser = command.target;
      state.entitlement = "active";
      state.cancelled = state.refunded = state.revoked = false;
    } else if (["purchase", "renewal"].includes(command.eventType)) {
      state.owners = [command.appUser];
      state.appUser = command.appUser;
      state.entitlement = "active";
      state.cancelled = false;
      state.refunded = false;
      state.revoked = false;
    } else if (command.eventType === "cancel") {
      state.cancelled = true;
      state.entitlement = "cancelled";
    } else if (["expiration", "refund", "revocation"].includes(command.eventType)) {
      state.entitlement = command.eventType === "expiration" ? "expired" : command.eventType === "refund" ? "refunded" : "revoked";
      state.refunded = command.eventType === "refund";
      state.revoked = command.eventType === "revocation";
    }
    state.providerBacked = state.environment === "production";
    state.productionAccess = state.providerBacked && state.entitlement === "active";
    return state;
  },
  violations(state) {
    const failures = [];
    if (state.owners.length > 1) failures.push("REVENUECAT_TRANSFER_TARGET_MISMATCH");
    if (state.eventTime < state.maxAuthoritativeTime) failures.push("REVENUECAT_OUT_OF_ORDER_EVENT");
    if (state.environment === "sandbox" && state.productionAccess) failures.push("REVENUECAT_SANDBOX_GRANTED_PRODUCTION");
    if (state.entitlement === "test_only" && state.providerBacked) failures.push("REVENUECAT_MANUAL_ACCEPTED_AS_PROVIDER");
    if ((state.refunded || state.revoked || state.entitlement === "expired") && state.productionAccess) failures.push("REVENUECAT_TERMINAL_ACCESS_RETAINED");
    if (state.payableBalance !== 0) failures.push("REVENUECAT_CREATED_PAYABLE_BALANCE");
    return uniq(failures);
  }
};

const compatible = (build, update) => Boolean(
  build && update
  && build.platform === update.platform
  && build.environment === update.environment
  && build.runtime === update.runtime
  && build.channel === update.channel
  && build.nativeDigest === update.nativeDigest
  && build.sourceCommit === update.sourceCommit
  && update.requiredCapabilities.every((entry) => build.providedCapabilities.includes(entry))
);

const otaBuild = {
  id: "ota-build",
  featureId: "eas-build-update-release",
  seed: 173503,
  initial: () => ({ build: null, currentUpdate: null, rollbackTarget: null, activationRejected: 0 }),
  commandArbitrary: (fc) => fc.oneof(
    fc.record({
      type: fc.constant("install_build"),
      platform: fc.constantFrom("android", "ios"),
      environment: fc.constantFrom("internal", "production"),
      runtime: fc.constantFrom("runtime-1", "runtime-2"),
      channel: fc.constantFrom("internal", "production"),
      nativeDigest: fc.constantFrom("native-a", "native-b"),
      sourceCommit: fc.constantFrom("source-a", "source-b"),
      embeddedSafe: fc.boolean(),
      providedCapabilities: fc.uniqueArray(fc.constantFrom("camera", "microphone", "callkit", "livekit"), { maxLength: 4 })
    }),
    fc.record({
      type: fc.constantFrom("activate_update", "set_rollback", "rollback"),
      platform: fc.constantFrom("android", "ios"),
      environment: fc.constantFrom("internal", "production"),
      runtime: fc.constantFrom("runtime-1", "runtime-2"),
      channel: fc.constantFrom("internal", "production"),
      nativeDigest: fc.constantFrom("native-a", "native-b"),
      sourceCommit: fc.constantFrom("", "source-a", "source-b"),
      requiredCapabilities: fc.uniqueArray(fc.constantFrom("camera", "microphone", "callkit", "livekit"), { maxLength: 4 })
    })
  ),
  apply(current, command, variant = "fixed") {
    const state = copy(current);
    if (command.type === "install_build") {
      if (command.embeddedSafe) {
        state.build = copy(command);
        state.currentUpdate = null;
        state.rollbackTarget = null;
      }
      return state;
    }
    const candidate = { ...command, type: "update" };
    if (command.type === "set_rollback") {
      if (compatible(state.build, candidate)) state.rollbackTarget = candidate;
      return state;
    }
    if (command.type === "activate_update") {
      if (compatible(state.build, candidate) || variant === "incompatible-update-allowed") state.currentUpdate = candidate;
      else state.activationRejected += 1;
      return state;
    }
    if (command.type === "rollback" && state.rollbackTarget && compatible(state.build, state.rollbackTarget)) {
      state.currentUpdate = state.rollbackTarget;
    }
    return state;
  },
  violations(state) {
    const failures = [];
    if (state.build && !state.build.embeddedSafe) failures.push("OTA_EMBEDDED_BUNDLE_UNSAFE");
    if (state.currentUpdate && !compatible(state.build, state.currentUpdate)) failures.push("OTA_NATIVE_CAPABILITY_MISMATCH");
    if (state.rollbackTarget && !compatible(state.build, state.rollbackTarget)) failures.push("OTA_ROLLBACK_INCOMPATIBLE");
    return failures;
  }
};

const notificationAction = {
  id: "notification-native-action",
  featureId: "notifications-fcm",
  seed: 173504,
  initial: () => ({
    now: 0,
    apnsAccepted: [],
    receivedPushes: [],
    completedPushes: [],
    callKitReported: [],
    deliveryProof: [],
    authenticationReady: false,
    reactReady: false,
    receivedActions: [],
    pendingActions: [],
    consumedActions: [],
    consumedActionKinds: {},
    expiredActions: [],
    retiredActions: [],
    serverAccepted: [],
    serverStatus: "ringing"
  }),
  commandArbitrary: (fc) => fc.oneof(
    fc.record({ type: fc.constantFrom("apns_accept", "receive_push", "report_callkit", "complete_push"), id: fc.integer({ min: 1, max: 5 }).map(String), mustReport: fc.boolean() }),
    fc.record({ type: fc.constantFrom("native_answer", "native_decline"), id: fc.integer({ min: 1, max: 5 }).map(String), expiresAt: fc.integer({ min: 1, max: 8 }) }),
    fc.record({ type: fc.constantFrom("consume_action", "server_accept", "server_decline"), id: fc.integer({ min: 1, max: 5 }).map(String) }),
    fc.record({ type: fc.constant("tick"), amount: fc.integer({ min: 1, max: 3 }) }),
    fc.constantFrom({ type: "auth_ready" }, { type: "react_ready" }, { type: "server_cancel" }, { type: "server_timeout" })
  ),
  apply(current, command, variant = "fixed") {
    const state = copy(current);
    const obligationsClear = () => state.receivedPushes.every(({ id, mustReport }) => !mustReport || (state.callKitReported.includes(id) && state.completedPushes.includes(id)));
    if (command.type === "apns_accept") {
      state.apnsAccepted = uniq([...state.apnsAccepted, command.id]);
      if (variant === "apns-200-is-delivery") state.deliveryProof = uniq([...state.deliveryProof, command.id]);
    } else if (command.type === "receive_push") {
      if (state.serverStatus === "ringing" && !state.receivedPushes.some((entry) => entry.id === command.id)) state.receivedPushes.push({ id: command.id, mustReport: command.mustReport });
    } else if (command.type === "report_callkit") {
      if (state.receivedPushes.some((entry) => entry.id === command.id)) state.callKitReported = uniq([...state.callKitReported, command.id]);
    } else if (command.type === "complete_push") {
      const push = state.receivedPushes.find((entry) => entry.id === command.id);
      if (push && (!push.mustReport || state.callKitReported.includes(command.id) || variant === "complete-without-report")) {
        state.completedPushes = uniq([...state.completedPushes, command.id]);
      }
    } else if (["native_answer", "native_decline"].includes(command.type)) {
      state.receivedActions = uniq([...state.receivedActions, command.id]);
      if (state.consumedActions.includes(command.id) || state.expiredActions.includes(command.id) || state.pendingActions.some((entry) => entry.id === command.id)) return state;
      if (variant !== "native-action-lost" || state.reactReady) {
        if (command.expiresAt <= state.now) {
          state.expiredActions = uniq([...state.expiredActions, command.id]);
        } else if (!state.pendingActions.some((entry) => entry.id === command.id) && !state.consumedActions.includes(command.id)) {
          state.pendingActions.push({ id: command.id, expiresAt: command.expiresAt, action: command.type.slice(7) });
        }
      }
    } else if (command.type === "auth_ready") {
      state.authenticationReady = true;
    } else if (command.type === "react_ready") {
      state.reactReady = true;
    } else if (command.type === "consume_action") {
      const pending = state.pendingActions.find((entry) => entry.id === command.id && entry.expiresAt > state.now);
      if (pending && state.serverStatus === "ringing" && state.authenticationReady && state.reactReady && !state.consumedActions.includes(command.id)) {
        state.consumedActions.push(command.id);
        state.consumedActionKinds[command.id] = pending.action;
        state.pendingActions = state.pendingActions.filter((entry) => entry.id !== command.id);
      }
    } else if (command.type === "server_accept") {
      if (state.serverStatus === "ringing" && state.consumedActionKinds[command.id] === "answer") {
        state.serverAccepted = uniq([...state.serverAccepted, command.id]);
        state.serverStatus = "accepted";
      }
    } else if (command.type === "server_decline") {
      if (state.serverStatus === "ringing" && obligationsClear() && state.consumedActionKinds[command.id] === "decline") state.serverStatus = "declined";
    } else if (["server_cancel", "server_timeout"].includes(command.type)) {
      if (state.serverStatus === "ringing" && (obligationsClear() || variant === "terminal-without-report")) state.serverStatus = command.type === "server_cancel" ? "cancelled" : "timed_out";
    } else if (command.type === "tick") {
      state.now += command.amount;
      const expired = state.pendingActions.filter((entry) => entry.expiresAt <= state.now).map(({ id }) => id);
      state.expiredActions = uniq([...state.expiredActions, ...expired]);
      state.pendingActions = state.pendingActions.filter((entry) => entry.expiresAt > state.now);
    } else {
      throw new Error(`UNKNOWN_NOTIFICATION_COMMAND:${command.type}`);
    }
    if (["declined", "cancelled", "timed_out"].includes(state.serverStatus) && state.pendingActions.length) {
      state.retiredActions = uniq([...state.retiredActions, ...state.pendingActions.map(({ id }) => id)]);
      state.pendingActions = [];
    }
    return state;
  },
  violations(state) {
    const failures = [];
    for (const push of state.receivedPushes) {
      const due = state.completedPushes.includes(push.id) || ["declined", "cancelled", "timed_out"].includes(state.serverStatus);
      if (push.mustReport && due && (!state.callKitReported.includes(push.id) || !state.completedPushes.includes(push.id))) failures.push("PUSHKIT_MUST_REPORT_BREACH");
    }
    if (state.deliveryProof.some((id) => !state.receivedPushes.some((push) => push.id === id))) failures.push("CALLKIT_PROOF_SUBSTITUTED_BY_APNS_200");
    const retained = new Set([...state.pendingActions.map(({ id }) => id), ...state.consumedActions, ...state.expiredActions, ...state.retiredActions]);
    if (state.receivedActions.some((id) => !retained.has(id))) failures.push("NATIVE_ACTION_LOST_BEFORE_REACT_CONTEXT");
    if (state.consumedActions.length !== uniq(state.consumedActions).length) failures.push("NATIVE_ACTION_CONSUMED_TWICE");
    if (state.serverAccepted.some((id) => !state.consumedActions.includes(id))) failures.push("NATIVE_ACTION_MUTATED_SERVER_DIRECTLY");
    return uniq(failures);
  }
};

const liveKitStages = ["none", "token", "claims", "room", "publication", "remote_participant", "subscription", "first_media", "ui"];
const liveKit = {
  id: "livekit",
  featureId: "livekit-media-transport",
  seed: 173505,
  initial: () => ({ stage: "none", visitedStages: ["none"], platform: null, evidencePlatforms: [], fixture: false, pass: false, rooms: 0, tracks: 0, terminal: false }),
  commandArbitrary: (fc) => fc.oneof(
    fc.record({ type: fc.constant("advance"), stage: fc.constantFrom(...liveKitStages.slice(1)), platform: fc.constantFrom("android", "ios"), fixture: fc.boolean() }),
    fc.constantFrom({ type: "reconnect" }, { type: "cleanup" }, { type: "declare_pass" })
  ),
  apply(current, command, variant = "fixed") {
    const state = copy(current);
    if (command.type === "advance" && !state.terminal) {
      const expected = liveKitStages[liveKitStages.indexOf(state.stage) + 1];
      if (command.stage === expected || variant === "stage-skip") {
        if (state.platform && state.platform !== command.platform) return state;
        state.platform = command.platform;
        state.evidencePlatforms = uniq([...state.evidencePlatforms, command.platform]);
        state.fixture ||= command.fixture;
        state.stage = command.stage;
        state.visitedStages = uniq([...state.visitedStages, command.stage]);
        if (command.stage === "room") state.rooms = 1;
        if (command.stage === "publication") state.tracks = 1;
      }
    } else if (command.type === "reconnect" && !state.terminal) {
      state.rooms = Math.min(1, state.rooms);
      state.tracks = Math.min(1, state.tracks);
    } else if (command.type === "declare_pass") {
      const fullChain = state.visitedStages.join(",") === liveKitStages.join(",");
      if ((state.stage === "ui" && fullChain && !state.fixture) || variant === "connected-is-pass") state.pass = true;
    } else if (command.type === "cleanup") {
      state.terminal = true;
      state.rooms = 0;
      state.tracks = 0;
    }
    return state;
  },
  violations(state) {
    const failures = [];
    const index = liveKitStages.indexOf(state.stage);
    if (state.rooms > 1 || state.tracks > 1) failures.push("LIVEKIT_DUPLICATE_ROOM_OR_TRACK");
    if (state.evidencePlatforms.length > 1) failures.push("PLATFORM_SCOPE_MISMATCH");
    if (state.pass && index < liveKitStages.indexOf("ui")) failures.push("LIVEKIT_CONNECTED_WITHOUT_MEDIA");
    if (state.pass && state.stage !== "ui") failures.push("LIVEKIT_MEDIA_WITHOUT_UI_RESOLUTION");
    if (state.pass && state.fixture) failures.push("LIVEKIT_FIXTURE_FALSE_REAL_FINDING");
    if (state.terminal && (state.rooms !== 0 || state.tracks !== 0)) failures.push("LIVEKIT_CLEANUP_NOT_TERMINAL");
    if (state.visitedStages.join(",") !== liveKitStages.slice(0, index + 1).join(",")) failures.push("LIVEKIT_STAGE_SKIPPED");
    return uniq(failures);
  }
};

const classifyMigration = (state) => {
  if (!state.remote) return "SOURCE_ONLY";
  if (!state.source) return "REMOTE_ONLY";
  if (state.remote.version !== state.source.version || state.remote.name !== state.source.name) return "VERSION_MISMATCH";
  if (state.remote.hash !== state.source.hash) return "BODY_MISMATCH";
  return "REMOTE_AND_SOURCE_MATCH";
};

const migrations = {
  id: "migrations",
  featureId: "supabase-migrations-rls",
  seed: 173506,
  initial: () => ({
    remote: { version: "2", name: "deployed", hash: "hash-2" },
    source: null,
    classification: "REMOTE_ONLY",
    mergeAllowed: false,
    rls: true,
    forceRls: true,
    broadGrant: false,
    remoteImmutableHash: "hash-2",
    forwardSuccessors: []
  }),
  commandArbitrary: (fc) => fc.oneof(
    fc.constantFrom(
      { type: "align_exact" }, { type: "source_wrong_version" }, { type: "source_wrong_body" },
      { type: "request_merge" }, { type: "broad_grant" }, { type: "drop_force_rls" },
      { type: "rewrite_remote" }
    ),
    fc.record({ type: fc.constant("forward_correction"), version: fc.constantFrom("3", "4"), name: fc.constantFrom("deployed_successor", ""), hash: fc.constantFrom("hash-3", "") })
  ),
  apply(current, command, variant = "fixed") {
    const state = copy(current);
    if (command.type === "align_exact") state.source = copy(state.remote);
    else if (command.type === "source_wrong_version") state.source = { ...state.remote, version: "1" };
    else if (command.type === "source_wrong_body") state.source = { ...state.remote, hash: "other" };
    else if (command.type === "request_merge") {
      state.mergeAllowed = classifyMigration(state) === "REMOTE_AND_SOURCE_MATCH" || variant === "remote-ahead-merge";
    } else if (command.type === "broad_grant" && variant === "broad-grant") state.broadGrant = true;
    else if (command.type === "drop_force_rls" && variant === "rls-lost") state.forceRls = false;
    else if (command.type === "rewrite_remote" && variant === "rewrite-deployed") state.remote.hash = "rewritten";
    else if (command.type === "forward_correction") {
      const identified = Number(command.version) > Number(state.remote.version) && command.name && command.hash && command.hash !== state.remote.hash;
      if ((identified && !state.forwardSuccessors.some(({ version }) => version === command.version)) || variant === "anonymous-forward-counter") state.forwardSuccessors.push({ version: command.version, name: command.name, hash: command.hash });
    }
    state.classification = classifyMigration(state);
    if (state.classification !== "REMOTE_AND_SOURCE_MATCH" && variant !== "remote-ahead-merge") state.mergeAllowed = false;
    return state;
  },
  violations(state) {
    const failures = [];
    if (state.mergeAllowed && state.classification !== "REMOTE_AND_SOURCE_MATCH") failures.push("REMOTE_MIGRATION_AHEAD_OF_GIT");
    if (state.remote.hash !== state.remoteImmutableHash) failures.push("MIGRATION_DEPLOYED_BODY_REWRITTEN");
    if (!state.rls || !state.forceRls) failures.push("MIGRATION_RLS_NOT_MAINTAINED");
    if (state.broadGrant) failures.push("MIGRATION_BROAD_GRANT");
    if (state.forwardSuccessors.some(({ version, name, hash }) => Number(version) <= Number(state.remote.version) || !name || !hash || hash === state.remote.hash)) failures.push("MIGRATION_FORWARD_CORRECTION_UNIDENTIFIED");
    return failures;
  }
};

export const modelDefinitions = Object.freeze({
  [chatCall.id]: chatCall,
  [revenueCat.id]: revenueCat,
  [otaBuild.id]: otaBuild,
  [notificationAction.id]: notificationAction,
  [liveKit.id]: liveKit,
  [migrations.id]: migrations
});

export const higherTierBlockers = Object.freeze([{
  featureId: "pushkit-callkit",
  tier: "T6_INSTALLED_PHYSICAL",
  status: "BLOCKED_EXTERNAL",
  detail: "Physical PushKit delivery remains outside Lane C; APNs acceptance is not delivery, CallKit presentation, or Answer/Decline proof."
}]);

export const escapedDefectFixtures = Object.freeze([
  { id: "ACCEPT_TIMEOUT_RACE", domain: "chat-call", variant: "accept-timeout-nonatomic", commands: [{ type: "invite", generation: 1, provider: "livekit" }, { type: "timeout" }, { type: "accept" }] },
  { id: "STALE_CLEANUP_CLEARS_NEW_CALL", domain: "chat-call", variant: "stale-cleanup", commands: [{ type: "invite", generation: 1, provider: "livekit" }, { type: "timeout" }, { type: "invite", generation: 2, provider: "livekit" }, { type: "cleanup", generation: 1 }] },
  { id: "TERMINAL_ROOM_ORPHAN", domain: "chat-call", variant: "old-membership-reactivates", commands: [{ type: "invite", generation: 1, provider: "livekit" }, { type: "timeout" }, { type: "membership_write", generation: 1, role: "caller" }] },
  { id: "NATIVE_ACTION_LOST_BEFORE_REACT_CONTEXT", domain: "notification-native-action", variant: "native-action-lost", commands: [{ type: "native_answer", id: "1", expiresAt: 5 }, { type: "react_ready" }] },
  { id: "REVENUECAT_OUT_OF_ORDER_EVENT", domain: "revenuecat", variant: "out-of-order-wins", commands: [
    { type: "event", eventId: "new", eventType: "renewal", eventTime: 10, store: "apple", environment: "production", authority: "provider", appUser: "user-a", target: "user-b", product: "premium.monthly", expiresAt: 20 },
    { type: "event", eventId: "old", eventType: "expiration", eventTime: 5, store: "apple", environment: "production", authority: "provider", appUser: "user-a", target: "user-b", product: "premium.monthly", expiresAt: 5 }
  ] },
  { id: "REVENUECAT_TRANSFER_TARGET_MISMATCH", domain: "revenuecat", variant: "double-owner-transfer", commands: [
    { type: "event", eventId: "buy", eventType: "purchase", eventTime: 1, store: "google", environment: "production", authority: "provider", appUser: "user-a", target: "user-b", product: "premium.monthly", expiresAt: 10 },
    { type: "event", eventId: "move", eventType: "transfer", eventTime: 2, store: "google", environment: "production", authority: "provider", appUser: "user-a", target: "user-b", product: "premium.monthly", expiresAt: 10 }
  ] },
  { id: "OTA_NATIVE_CAPABILITY_MISMATCH", domain: "ota-build", variant: "incompatible-update-allowed", commands: [
    { type: "install_build", platform: "android", environment: "internal", runtime: "runtime-1", channel: "internal", nativeDigest: "native-a", embeddedSafe: true, providedCapabilities: ["camera"] },
    { type: "activate_update", platform: "ios", environment: "internal", runtime: "runtime-2", channel: "internal", nativeDigest: "native-b", sourceCommit: "source-a", requiredCapabilities: ["callkit"] }
  ] },
  { id: "CALLKIT_PROOF_SUBSTITUTED_BY_APNS_200", domain: "notification-native-action", variant: "apns-200-is-delivery", commands: [{ type: "apns_accept", id: "1", mustReport: true }] },
  { id: "PUSHKIT_MUST_REPORT_BREACH", domain: "notification-native-action", variant: "complete-without-report", commands: [{ type: "receive_push", id: "1", mustReport: true }, { type: "complete_push", id: "1", mustReport: true }] },
  { id: "LIVEKIT_CONNECTED_WITHOUT_MEDIA", domain: "livekit", variant: "connected-is-pass", commands: [
    { type: "advance", stage: "token", platform: "android", fixture: false },
    { type: "advance", stage: "claims", platform: "android", fixture: false },
    { type: "advance", stage: "room", platform: "android", fixture: false },
    { type: "declare_pass" }
  ] },
  { id: "LIVEKIT_STAGE_SKIPPED", domain: "livekit", variant: "stage-skip", commands: [{ type: "advance", stage: "ui", platform: "ios", fixture: false }, { type: "declare_pass" }] },
  { id: "MIGRATION_FORWARD_CORRECTION_UNIDENTIFIED", domain: "migrations", variant: "anonymous-forward-counter", commands: [{ type: "forward_correction", version: "2", name: "", hash: "" }] },
  { id: "REMOTE_MIGRATION_AHEAD_OF_GIT", domain: "migrations", variant: "remote-ahead-merge", commands: [{ type: "source_wrong_body" }, { type: "request_merge" }] }
]);

export function runCommands(domainId, commands, variant = "fixed") {
  const definition = modelDefinitions[domainId];
  if (!definition) throw new Error(`UNKNOWN_MODEL_DOMAIN:${domainId}`);
  let state = definition.initial();
  const violations = [];
  for (const command of commands) {
    state = definition.apply(state, command, variant);
    violations.push(...definition.violations(state));
  }
  return { state, violations: uniq(violations) };
}
