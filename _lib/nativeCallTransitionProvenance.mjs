import { normalizeCommunicationRoomIdentifier } from "./communicationRoomIdentifier.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ANDROID_REQUEST_KEY_PATTERN = /^[0-9a-f]{64}$/u;
const CLAIM_ID_PATTERN = /^[0-9a-f]{64}$/u;
const CLAIM_TTL_MS = 30_000;
const FOREGROUND_INTENT_TTL_MS = 30_000;
const MAX_ACTIVE_CLAIMS = 32;
const MAX_CONSUMED_EVENTS = 64;
const attestedNativeClaims = new WeakSet();
const attestedForegroundIntents = new WeakSet();
const INTERNAL_NATIVE_CLAIM_ATTESTATION = Object.freeze({});
const INTERNAL_FOREGROUND_INTENT_ATTESTATION = Object.freeze({});
const SENSITIVE_EXTERNAL_PARAMETERS = [
  "foregroundCallClaim",
  "nativeCallAction",
  "nativeCallUuid",
  "nativeCallClaim",
  "openCall",
  "startCall",
];
const SENSITIVE_EXTERNAL_PARAMETER_SET = new Set(
  SENSITIVE_EXTERNAL_PARAMETERS.map((value) => value.toLowerCase()),
);
const FOREGROUND_UI_ACTIONS = new Set(["open_call", "start_video", "start_voice"]);

const SOURCE_POLICIES = Object.freeze({
  android_native_action_store: Object.freeze({
    actions: new Set(["answer", "decline"]),
    nativePayloadSchemaVersion: 2,
    platform: "android",
  }),
  ios_callkit_native_event: Object.freeze({
    actions: new Set(["answer"]),
    nativePayloadSchemaVersion: null,
    platform: "ios",
  }),
});

const normalizeText = (value) => String(value ?? "").trim().toLowerCase();
const normalizeUuid = (value) => {
  const normalized = normalizeText(value);
  return UUID_PATTERN.test(normalized) ? normalized : "";
};
const defaultMonotonicNow = () => {
  const monotonic = globalThis.performance?.now?.();
  return Number.isFinite(monotonic) ? monotonic : Number.NaN;
};
const createCryptoClaimId = () => {
  if (typeof globalThis.crypto?.getRandomValues !== "function") return "";
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
};

const normalizeClaimInput = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const source = normalizeText(input.source);
  const sourcePolicy = SOURCE_POLICIES[source];
  const platform = normalizeText(input.platform);
  const action = normalizeText(input.action);
  const authenticatedUserId = normalizeUuid(input.authenticatedUserId);
  const threadId = normalizeUuid(input.threadId);
  const inviteId = normalizeUuid(input.inviteId);
  const nativeEventGeneration = Number(input.nativeEventGeneration);
  const nativePayloadSchemaVersion = platform === "android"
    ? Number(input.nativePayloadSchemaVersion)
    : null;
  const nativeIdentity = platform === "ios"
    ? normalizeUuid(input.nativeIdentity)
    : normalizeText(input.nativeIdentity);
  if (
    !sourcePolicy
    || platform !== sourcePolicy.platform
    || !sourcePolicy.actions.has(action)
    || !authenticatedUserId
    || !threadId
    || !inviteId
    || !Number.isSafeInteger(nativeEventGeneration)
    || nativeEventGeneration <= 0
    || nativePayloadSchemaVersion !== sourcePolicy.nativePayloadSchemaVersion
    || (platform === "ios" && !nativeIdentity)
    || (platform === "android" && !ANDROID_REQUEST_KEY_PATTERN.test(nativeIdentity))
  ) {
    return null;
  }
  return {action, authenticatedUserId, inviteId, nativeEventGeneration, nativeIdentity, nativePayloadSchemaVersion, platform, source, threadId};
};

const buildEventKey = (claim) => [
  claim.platform,
  claim.source,
  claim.authenticatedUserId,
  claim.nativeEventGeneration,
  claim.nativePayloadSchemaVersion ?? "none",
  claim.nativeIdentity,
  claim.threadId,
  claim.inviteId,
  claim.action,
].join(":");

const normalizeAuthenticatedUserId = (value) => normalizeUuid(value);

export function createNativeCallTransitionProvenanceRegistry({
  claimIdFactory = createCryptoClaimId,
  maxActive = MAX_ACTIVE_CLAIMS,
  maxConsumed = MAX_CONSUMED_EVENTS,
  now = defaultMonotonicNow,
  ttlMs = CLAIM_TTL_MS,
} = {}, attestationCapability = null) {
  const activeClaims = new Map();
  const activeEventKeys = new Map();
  const seenEventKeys = new Map();

  const purge = () => {
    const currentTime = now();
    if (!Number.isFinite(currentTime)) return false;
    activeClaims.forEach((claim, claimId) => {
      if (currentTime >= claim.expiresAtMonotonicMs) {
        activeClaims.delete(claimId);
        activeEventKeys.delete(claim.eventKey);
      }
    });
    return true;
  };

  return Object.freeze({
    clear(platform) {
      const normalizedPlatform = normalizeText(platform);
      if (normalizedPlatform !== "ios" && normalizedPlatform !== "android") return false;
      activeClaims.forEach((claim, claimId) => {
        if (claim.platform !== normalizedPlatform) return;
        activeClaims.delete(claimId);
        activeEventKeys.delete(claim.eventKey);
      });
      seenEventKeys.forEach((seen, eventKey) => {
        if (seen.platform === normalizedPlatform) seenEventKeys.delete(eventKey);
      });
      return true;
    },
    create(input) {
      if (!purge()) return Object.freeze({status: "denied"});
      const normalized = normalizeClaimInput(input);
      if (!normalized) return Object.freeze({status: "denied"});
      const eventKey = buildEventKey(normalized);
      if (activeEventKeys.has(eventKey) || seenEventKeys.has(eventKey)) {
        return Object.freeze({status: "duplicate"});
      }
      if (activeClaims.size >= maxActive) return Object.freeze({status: "capacity_denied"});
      const claimId = normalizeText(claimIdFactory());
      if (!CLAIM_ID_PATTERN.test(claimId) || activeClaims.has(claimId)) {
        return Object.freeze({status: "claim_id_denied"});
      }
      const createdAtMonotonicMs = now();
      if (!Number.isFinite(createdAtMonotonicMs)) return Object.freeze({status: "denied"});
      const claim = Object.freeze({
        ...normalized,
        claimId,
        consumed: false,
        createdAtMonotonicMs,
        eventKey,
        expiresAtMonotonicMs: createdAtMonotonicMs + ttlMs,
      });
      activeClaims.set(claimId, claim);
      activeEventKeys.set(eventKey, claimId);
      seenEventKeys.set(eventKey, Object.freeze({platform: claim.platform}));
      while (seenEventKeys.size > maxConsumed) {
        const oldest = seenEventKeys.keys().next().value;
        if (!oldest) break;
        seenEventKeys.delete(oldest);
      }
      return Object.freeze({
        action: claim.action,
        claimId,
        inviteId: claim.inviteId,
        nativeIdentity: claim.nativeIdentity,
        platform: claim.platform,
        status: "created",
        threadId: claim.threadId,
      });
    },
    consume(expected) {
      if (!purge()) return null;
      if (!expected || typeof expected !== "object" || Array.isArray(expected)) return null;
      const claimId = normalizeText(expected.claimId);
      const claim = CLAIM_ID_PATTERN.test(claimId) ? activeClaims.get(claimId) : null;
      if (!claim) return null;
      const expectedAction = normalizeText(expected.action);
      const expectedPlatform = normalizeText(expected.platform);
      const expectedSource = normalizeText(expected.source);
      const expectedAuthenticatedUserId = normalizeAuthenticatedUserId(expected.authenticatedUserId);
      const expectedThreadId = normalizeUuid(expected.threadId);
      const expectedInviteId = normalizeUuid(expected.inviteId);
      const expectedNativeIdentity = expectedPlatform === "ios"
        ? normalizeUuid(expected.nativeIdentity)
        : normalizeText(expected.nativeIdentity);
      if (
        expectedAction !== claim.action
        || expectedPlatform !== claim.platform
        || expectedSource !== claim.source
        || expectedAuthenticatedUserId !== claim.authenticatedUserId
        || expectedThreadId !== claim.threadId
        || expectedInviteId !== claim.inviteId
        || expectedNativeIdentity !== claim.nativeIdentity
      ) {
        return null;
      }

      // Delete authority before returning it to the caller. No rejected or
      // interrupted transition can acquire the same claim a second time.
      const consumedAtMonotonicMs = now();
      if (!Number.isFinite(consumedAtMonotonicMs)) return null;
      activeClaims.delete(claimId);
      activeEventKeys.delete(claim.eventKey);
      const consumedClaim = Object.freeze({
        ...claim,
        consumed: true,
        consumedAtMonotonicMs,
      });
      if (attestationCapability === INTERNAL_NATIVE_CLAIM_ATTESTATION) {
        attestedNativeClaims.add(consumedClaim);
      }
      return consumedClaim;
    },
    inspectCounts() {
      if (!purge()) return Object.freeze({active: 0, consumed: 0});
      return Object.freeze({active: activeClaims.size, consumed: seenEventKeys.size});
    },
  });
}

const nativeCallTransitionRegistry = createNativeCallTransitionProvenanceRegistry(
  undefined,
  INTERNAL_NATIVE_CLAIM_ATTESTATION,
);
const trustedAndroidNativeActionRouteListeners = new Set();

const buildTrustedAndroidNativeActionRoute = (input) => {
  const authenticatedUserId = normalizeAuthenticatedUserId(input?.authenticatedUserId);
  if (
    input?.authenticated !== true
    || !authenticatedUserId
    || Number(input?.schemaVersion) !== 2
    || !Number.isSafeInteger(Number(input?.captureGeneration))
    || Number(input?.captureGeneration) <= 0
  ) {
    return Object.freeze({status: "denied"});
  }
  const created = nativeCallTransitionRegistry.create({
    action: input?.nativeCallAction,
    authenticatedUserId,
    inviteId: input?.callInviteId,
    nativeEventGeneration: input?.captureGeneration,
    nativeIdentity: input?.requestKey,
    nativePayloadSchemaVersion: input?.schemaVersion,
    platform: "android",
    source: "android_native_action_store",
    threadId: input?.threadId,
  });
  if (
    created.status !== "created"
    || !created.claimId
    || !created.threadId
    || !created.inviteId
    || !created.nativeIdentity
    || !created.action
  ) {
    return created;
  }
  const params = new URLSearchParams({
    callInviteId: created.inviteId,
    nativeCallClaim: created.claimId,
    nativeCallUuid: created.nativeIdentity,
  });
  const route = Object.freeze({
    action: created.action,
    claimId: created.claimId,
    destination: `/chat/${encodeURIComponent(created.threadId)}?${params.toString()}`,
    inviteId: created.inviteId,
    nativeIdentity: created.nativeIdentity,
    status: "created",
    threadId: created.threadId,
  });
  let mountedConsumed = false;
  trustedAndroidNativeActionRouteListeners.forEach((listener) => {
    try {
      if (listener(route) === true) mountedConsumed = true;
    } catch {
      // A mounted navigation listener cannot revoke or replace native authority.
    }
  });
  return Object.freeze({
    ...route,
    destination: mountedConsumed ? undefined : route.destination,
    mountedConsumed,
  });
};

export const registerTrustedAndroidNativeActionStorePayload = (input) => (
  buildTrustedAndroidNativeActionRoute(input)
);

export const subscribeToTrustedAndroidNativeActionRoutes = (listener) => {
  if (typeof listener !== "function") return () => {};
  trustedAndroidNativeActionRouteListeners.add(listener);
  return () => trustedAndroidNativeActionRouteListeners.delete(listener);
};

const registerTrustedIosCallKitNativeEvent = (event) => {
  const authenticatedUserId = normalizeAuthenticatedUserId(event?.authenticatedUserId);
  if (
    event?.authenticated !== true
    || !authenticatedUserId
    || normalizeText(event?.callType) !== "voice" && normalizeText(event?.callType) !== "video"
    || normalizeText(event?.type) !== "answerrequested"
  ) {
    return Object.freeze({status: "denied"});
  }
  return nativeCallTransitionRegistry.create({
    action: "answer",
    authenticatedUserId,
    inviteId: event?.callInviteId,
    nativeEventGeneration: event?.nativeEventGeneration,
    nativeIdentity: event?.callUuid,
    platform: event?.platform,
    source: "ios_callkit_native_event",
    threadId: event?.threadId,
  });
};

const buildTrustedIosCallKitAnswerRoute = (event) => {
  const created = registerTrustedIosCallKitNativeEvent(event);
  if (
    created.status !== "created"
    || !created.claimId
    || !created.threadId
    || !created.inviteId
    || !created.nativeIdentity
  ) {
    return Object.freeze({
      callUuid: normalizeUuid(event?.callUuid),
      status: created.status,
    });
  }
  const params = new URLSearchParams({
    callInviteId: created.inviteId,
    nativeCallClaim: created.claimId,
    nativeCallUuid: created.nativeIdentity,
  });
  return Object.freeze({
    callUuid: created.nativeIdentity,
    claimId: created.claimId,
    destination: `/chat/${encodeURIComponent(created.threadId)}?${params.toString()}`,
    inviteId: created.inviteId,
    status: "created",
    threadId: created.threadId,
  });
};

export const createIosCallKitAnswerRouteHandler = ({
  completeAnswerFailure,
  getAuthenticatedUserId,
  isActive,
  replace,
} = {}) => async (event) => {
  if (
    typeof isActive !== "function"
    || isActive() !== true
    || typeof replace !== "function"
  ) return "inactive";
  const authenticatedUserId = typeof getAuthenticatedUserId === "function"
    ? normalizeAuthenticatedUserId(getAuthenticatedUserId())
    : "";
  const routed = buildTrustedIosCallKitAnswerRoute({
    ...event,
    authenticated: !!authenticatedUserId,
    authenticatedUserId,
  });
  if (routed.status === "duplicate") return "duplicate";
  if (routed.status !== "created" || !routed.destination) {
    if (routed.callUuid && typeof completeAnswerFailure === "function") {
      await Promise.resolve(completeAnswerFailure(routed.callUuid)).catch(() => undefined);
    }
    return "denied";
  }
  try {
    replace(routed.destination);
  } catch {
    nativeCallTransitionRegistry.consume({
      action: "answer",
      authenticatedUserId,
      claimId: routed.claimId,
      inviteId: routed.inviteId,
      nativeIdentity: routed.callUuid,
      platform: "ios",
      source: "ios_callkit_native_event",
      threadId: routed.threadId,
    });
    if (routed.callUuid && typeof completeAnswerFailure === "function") {
      await Promise.resolve(completeAnswerFailure(routed.callUuid)).catch(() => undefined);
    }
    return "denied";
  }
  return "routed";
};

export const isAttestedNativeCallTransitionClaim = (value) => (
  !!value && typeof value === "object" && attestedNativeClaims.has(value)
);

export const consumeNativeCallTransitionClaim = (expected) => (
  nativeCallTransitionRegistry.consume(expected)
);

export const consumeTrustedIosCallKitNativeEventClaim = (expected) => (
  nativeCallTransitionRegistry.consume({
    action: expected?.action,
    claimId: expected?.claimId,
    authenticatedUserId: expected?.authenticatedUserId,
    inviteId: expected?.inviteId,
    nativeIdentity: expected?.callUuid,
    platform: "ios",
    source: "ios_callkit_native_event",
    threadId: expected?.threadId,
  })
);

export const consumeMountedIosNativeCallRoute = (input) => {
  if (
    input?.platform !== "ios"
    || input?.authLoading === true
    || input?.isSignedIn !== true
    || !normalizeAuthenticatedUserId(input?.authenticatedUserId)
  ) {
    return null;
  }
  return consumeTrustedIosCallKitNativeEventClaim({
    action: input?.action,
    callUuid: input?.callUuid,
    claimId: input?.claimId,
    authenticatedUserId: input?.authenticatedUserId,
    inviteId: input?.inviteId,
    threadId: input?.threadId,
  });
};

export const consumeTrustedAndroidNativeActionStoreClaim = (expected) => {
  const common = {
    authenticatedUserId: expected?.authenticatedUserId,
    claimId: expected?.claimId,
    inviteId: expected?.inviteId,
    nativeIdentity: expected?.requestKey,
    platform: "android",
    source: "android_native_action_store",
    threadId: expected?.threadId,
  };
  return nativeCallTransitionRegistry.consume({...common, action: "answer"})
    ?? nativeCallTransitionRegistry.consume({...common, action: "decline"});
};

export const consumeMountedAndroidNativeCallRoute = (input) => {
  if (
    input?.platform !== "android"
    || input?.authLoading === true
    || input?.isSignedIn !== true
    || !normalizeAuthenticatedUserId(input?.authenticatedUserId)
  ) {
    return null;
  }
  return consumeTrustedAndroidNativeActionStoreClaim({
    authenticatedUserId: input?.authenticatedUserId,
    claimId: input?.claimId,
    inviteId: input?.inviteId,
    requestKey: input?.requestKey,
    threadId: input?.threadId,
  });
};

export function createForegroundAuthenticatedUiCallIntentRegistry({
  claimIdFactory = createCryptoClaimId,
  maxActive = MAX_ACTIVE_CLAIMS,
  now = defaultMonotonicNow,
  ttlMs = FOREGROUND_INTENT_TTL_MS,
} = {}, attestationCapability = null) {
  const activeIntents = new Map();

  const purge = () => {
    const currentTime = now();
    if (!Number.isFinite(currentTime)) return false;
    activeIntents.forEach((intent, claimId) => {
      if (currentTime >= intent.expiresAtMonotonicMs) activeIntents.delete(claimId);
    });
    return true;
  };

  return Object.freeze({
    create(input) {
      if (!purge() || input?.authenticated !== true) return Object.freeze({status: "denied"});
      const authenticatedUserId = normalizeAuthenticatedUserId(input?.authenticatedUserId);
      const action = normalizeText(input?.action);
      const threadId = normalizeUuid(input?.threadId);
      const inviteId = normalizeUuid(input?.inviteId);
      const roomId = normalizeCommunicationRoomIdentifier(input?.roomId);
      if (
        !authenticatedUserId
        || !FOREGROUND_UI_ACTIONS.has(action)
        || !threadId
        || (action === "open_call" && (!inviteId || !roomId))
        || (action !== "open_call" && (inviteId || roomId))
        || activeIntents.size >= maxActive
      ) {
        return Object.freeze({status: "denied"});
      }
      const claimId = normalizeText(claimIdFactory());
      const createdAtMonotonicMs = now();
      if (
        !CLAIM_ID_PATTERN.test(claimId)
        || activeIntents.has(claimId)
        || !Number.isFinite(createdAtMonotonicMs)
      ) {
        return Object.freeze({status: "denied"});
      }
      const intent = Object.freeze({
        action,
        authenticatedUserId,
        claimId,
        consumed: false,
        createdAtMonotonicMs,
        expiresAtMonotonicMs: createdAtMonotonicMs + ttlMs,
        inviteId,
        roomId,
        source: "foreground_authenticated_ui",
        threadId,
      });
      activeIntents.set(claimId, intent);
      return Object.freeze({
        action,
        claimId,
        inviteId,
        roomId,
        status: "created",
        threadId,
      });
    },
    consume(expected) {
      if (!purge()) return null;
      const claimId = normalizeText(expected?.claimId);
      const intent = CLAIM_ID_PATTERN.test(claimId) ? activeIntents.get(claimId) : null;
      const expectedInviteId = normalizeUuid(expected?.inviteId);
      const expectedRoomId = normalizeCommunicationRoomIdentifier(expected?.roomId);
      if (
        !intent
        || normalizeAuthenticatedUserId(expected?.authenticatedUserId) !== intent.authenticatedUserId
        || normalizeUuid(expected?.threadId) !== intent.threadId
        || (intent.action === "open_call" && (
          expectedInviteId !== intent.inviteId
          || expectedRoomId !== intent.roomId
        ))
        || (intent.action !== "open_call" && (expectedInviteId || expectedRoomId))
      ) {
        return null;
      }
      const consumedAtMonotonicMs = now();
      if (!Number.isFinite(consumedAtMonotonicMs)) return null;
      activeIntents.delete(claimId);
      const consumedIntent = Object.freeze({...intent, consumed: true, consumedAtMonotonicMs});
      if (attestationCapability === INTERNAL_FOREGROUND_INTENT_ATTESTATION) {
        attestedForegroundIntents.add(consumedIntent);
      }
      return consumedIntent;
    },
  });
}

const foregroundAuthenticatedUiCallIntentRegistry = createForegroundAuthenticatedUiCallIntentRegistry(
  undefined,
  INTERNAL_FOREGROUND_INTENT_ATTESTATION,
);

export const createForegroundAuthenticatedUiCallIntent = (input) => (
  foregroundAuthenticatedUiCallIntentRegistry.create(input)
);

export const consumeMountedForegroundAuthenticatedUiCallRoute = (input) => {
  if (
    input?.authLoading === true
    || input?.isSignedIn !== true
    || !normalizeAuthenticatedUserId(input?.authenticatedUserId)
  ) {
    return null;
  }
  return foregroundAuthenticatedUiCallIntentRegistry.consume({
    authenticatedUserId: input?.authenticatedUserId,
    claimId: input?.claimId,
    inviteId: input?.inviteId,
    roomId: input?.roomId,
    threadId: input?.threadId,
  });
};

export const isAttestedForegroundAuthenticatedUiCallIntent = (value) => (
  !!value && typeof value === "object" && attestedForegroundIntents.has(value)
);

export const containsSensitiveNativeCallClaimRouteParams = (params) => (
  !!params
  && typeof params === "object"
  && !Array.isArray(params)
  && Object.keys(params).some((key) => (
    key.toLowerCase() === "nativecallclaim" || key.toLowerCase() === "foregroundcallclaim"
  ))
);

export const clearNativeCallTransitionClaims = (platform) => {
  return nativeCallTransitionRegistry.clear(platform);
};

export const sanitizeExternalIosNativeCallPath = (value) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return normalized;
  const absolute = /^[a-z][a-z0-9+.-]*:/iu.test(normalized);
  try {
    const parsed = new URL(normalized, "https://native-intent.invalid");
    [...parsed.searchParams.keys()].forEach((parameter) => {
      if (SENSITIVE_EXTERNAL_PARAMETER_SET.has(parameter.toLowerCase())) {
        parsed.searchParams.delete(parameter);
      }
    });
    const fragmentParameters = new URLSearchParams(parsed.hash.replace(/^#/u, ""));
    [...fragmentParameters.keys()].forEach((parameter) => {
      if (SENSITIVE_EXTERNAL_PARAMETER_SET.has(parameter.toLowerCase())) {
        fragmentParameters.delete(parameter);
      }
    });
    const safeFragment = fragmentParameters.toString();
    parsed.hash = safeFragment ? `#${safeFragment}` : "";
    if (absolute) return parsed.toString();
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    const [path] = normalized.split(/[?#]/u);
    return path ?? "";
  }
};

export const nativeCallTransitionProvenancePolicy = Object.freeze({
  claimIdPattern: CLAIM_ID_PATTERN,
  maxActive: MAX_ACTIVE_CLAIMS,
  maxConsumed: MAX_CONSUMED_EVENTS,
  ttlMs: CLAIM_TTL_MS,
  foregroundIntentTtlMs: FOREGROUND_INTENT_TTL_MS,
});
