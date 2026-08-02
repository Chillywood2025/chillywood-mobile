const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ANDROID_REQUEST_KEY_PATTERN = /^[0-9a-f]{64}$/u;
const CLAIM_ID_PATTERN = /^[0-9a-f]{64}$/u;
const CLAIM_TTL_MS = 30_000;
const MAX_ACTIVE_CLAIMS = 32;
const MAX_CONSUMED_EVENTS = 64;
const SENSITIVE_EXTERNAL_PARAMETERS = [
  "nativeCallAction",
  "nativeCallUuid",
  "nativeCallClaim",
  "openCall",
  "startCall",
];

const SOURCE_POLICIES = Object.freeze({
  android_native_action_store: Object.freeze({
    actions: new Set(["answer", "decline"]),
    platform: "android",
  }),
  ios_callkit_native_event: Object.freeze({
    actions: new Set(["answer"]),
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
  const threadId = normalizeUuid(input.threadId);
  const inviteId = normalizeUuid(input.inviteId);
  const nativeEventGeneration = Number(input.nativeEventGeneration);
  const nativeIdentity = platform === "ios"
    ? normalizeUuid(input.nativeIdentity)
    : normalizeText(input.nativeIdentity);
  if (
    !sourcePolicy
    || platform !== sourcePolicy.platform
    || !sourcePolicy.actions.has(action)
    || !threadId
    || !inviteId
    || !Number.isSafeInteger(nativeEventGeneration)
    || nativeEventGeneration <= 0
    || (platform === "ios" && !nativeIdentity)
    || (platform === "android" && !ANDROID_REQUEST_KEY_PATTERN.test(nativeIdentity))
  ) {
    return null;
  }
  return {action, inviteId, nativeEventGeneration, nativeIdentity, platform, source, threadId};
};

const buildEventKey = (claim) => [
  claim.platform,
  claim.source,
  claim.nativeEventGeneration,
  claim.nativeIdentity,
  claim.threadId,
  claim.inviteId,
  claim.action,
].join(":");

export function createNativeCallTransitionProvenanceRegistry({
  claimIdFactory = createCryptoClaimId,
  maxActive = MAX_ACTIVE_CLAIMS,
  maxConsumed = MAX_CONSUMED_EVENTS,
  now = defaultMonotonicNow,
  ttlMs = CLAIM_TTL_MS,
} = {}) {
  const activeClaims = new Map();
  const activeEventKeys = new Map();
  const consumedEventKeys = new Map();

  const purge = () => {
    const currentTime = now();
    if (!Number.isFinite(currentTime)) return false;
    activeClaims.forEach((claim, claimId) => {
      if (currentTime >= claim.expiresAtMonotonicMs) {
        activeClaims.delete(claimId);
        activeEventKeys.delete(claim.eventKey);
      }
    });
    consumedEventKeys.forEach((consumedAt, eventKey) => {
      if (currentTime - consumedAt >= ttlMs) consumedEventKeys.delete(eventKey);
    });
    return true;
  };

  return Object.freeze({
    clear() {
      activeClaims.clear();
      activeEventKeys.clear();
      consumedEventKeys.clear();
    },
    create(input) {
      if (!purge()) return Object.freeze({status: "denied"});
      const normalized = normalizeClaimInput(input);
      if (!normalized) return Object.freeze({status: "denied"});
      const eventKey = buildEventKey(normalized);
      if (activeEventKeys.has(eventKey) || consumedEventKeys.has(eventKey)) {
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
      const expectedPlatform = normalizeText(expected.platform);
      const expectedSource = normalizeText(expected.source);
      const expectedThreadId = normalizeUuid(expected.threadId);
      const expectedInviteId = normalizeUuid(expected.inviteId);
      const expectedNativeIdentity = expectedPlatform === "ios"
        ? normalizeUuid(expected.nativeIdentity)
        : normalizeText(expected.nativeIdentity);
      if (
        expectedPlatform !== claim.platform
        || expectedSource !== claim.source
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
      consumedEventKeys.set(claim.eventKey, consumedAtMonotonicMs);
      while (consumedEventKeys.size > maxConsumed) {
        const oldest = consumedEventKeys.keys().next().value;
        if (!oldest) break;
        consumedEventKeys.delete(oldest);
      }
      return Object.freeze({
        ...claim,
        consumed: true,
        consumedAtMonotonicMs,
      });
    },
    inspectCounts() {
      if (!purge()) return Object.freeze({active: 0, consumed: 0});
      return Object.freeze({active: activeClaims.size, consumed: consumedEventKeys.size});
    },
  });
}

const nativeCallTransitionRegistry = createNativeCallTransitionProvenanceRegistry();

export const registerTrustedIosCallKitNativeEvent = (event) => {
  if (
    event?.authenticated !== true
    || normalizeText(event?.callType) !== "voice" && normalizeText(event?.callType) !== "video"
    || normalizeText(event?.type) !== "answerrequested"
  ) {
    return Object.freeze({status: "denied"});
  }
  return nativeCallTransitionRegistry.create({
    action: "answer",
    inviteId: event?.callInviteId,
    nativeEventGeneration: event?.nativeEventGeneration,
    nativeIdentity: event?.callUuid,
    platform: event?.platform,
    source: "ios_callkit_native_event",
    threadId: event?.threadId,
  });
};

export const consumeNativeCallTransitionClaim = (expected) => (
  nativeCallTransitionRegistry.consume(expected)
);

export const consumeTrustedIosCallKitNativeEventClaim = (expected) => (
  nativeCallTransitionRegistry.consume({
    claimId: expected?.claimId,
    inviteId: expected?.inviteId,
    nativeIdentity: expected?.callUuid,
    platform: "ios",
    source: "ios_callkit_native_event",
    threadId: expected?.threadId,
  })
);

export const clearNativeCallTransitionClaims = () => {
  nativeCallTransitionRegistry.clear();
};

export const sanitizeExternalIosNativeCallPath = (value) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return normalized;
  const absolute = /^[a-z][a-z0-9+.-]*:/iu.test(normalized);
  try {
    const parsed = new URL(normalized, "https://native-intent.invalid");
    SENSITIVE_EXTERNAL_PARAMETERS.forEach((parameter) => parsed.searchParams.delete(parameter));
    if (absolute) return parsed.toString();
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    const [path] = normalized.split("?");
    return path ?? "";
  }
};

export const nativeCallTransitionProvenancePolicy = Object.freeze({
  claimIdPattern: CLAIM_ID_PATTERN,
  maxActive: MAX_ACTIVE_CLAIMS,
  maxConsumed: MAX_CONSUMED_EVENTS,
  ttlMs: CLAIM_TTL_MS,
});
