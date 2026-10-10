import Constants from "expo-constants";
import * as Application from "expo-application";
import { Platform } from "react-native";

import NativeCallsModule, {
  type NativeCallEvent,
} from "../modules/chillywood-native-calls";
import {
  isCurrentAccountSessionAuthority,
  readCurrentAccountSessionAuthority,
  sameAccountSessionAuthority,
  type AccountSessionAuthorityBinding,
} from "./accountSessionAuthority";
import { shouldReuseIosNativeCallReadiness } from "./iosNativeCallBridgeLifecycle.mjs";
import { synchronizeLiveKitCallKitAudioSession } from "./livekit/bootstrap";
import {
  clearNativeCallTransitionClaims,
  waitForIosCallKitAnswerRouteReadiness,
} from "./nativeCallTransitionProvenance.mjs";
import {
  createPushOwnershipOperationKey,
  getNotificationInstallId,
  getNotificationRevocationCredential,
  type PushRevocationReason,
} from "./notifications";
import { supabase } from "./supabase";
import { reportRuntimeError } from "./logger";
import { reportBoundedNativeCallError } from "./nativeCallErrorDiagnostics.mjs";
import { normalizeCommunicationRoomIdentifier } from "./communicationRoomIdentifier.mjs";
import { createIosAcceptedCallKitMediaDescriptor, doesIosAcceptedCallKitMediaDescriptorOwnSession } from "./communicationCallMediaPolicy.mjs";
import { reportInternalCallMediaDiagnostic } from "./internalCallMediaDiagnostics";

export type IosNativeCallsDisabledReason =
  | "not_ios"
  | "native_module_unavailable"
  | "build_disabled"
  | "runtime_disabled";

export type IosNativeCallsReadiness = {
  available: boolean;
  buildEnabled: boolean;
  disabledReason: IosNativeCallsDisabledReason | null;
  runtimeEnabled: boolean;
};

export type SanitizedNativeCallEvent = Omit<NativeCallEvent, "token"> & {
  nativeEventGeneration: number;
  platform: "ios";
  audioSdkSynchronized?: boolean;
};
export type IosNativeCallEventListener = (event: SanitizedNativeCallEvent) => void;
export type IosNativePresentationWaitOutcome = "not_expected" | "presented" | "stale" | "timeout";

export type IosVoipRegistrationState = {
  apnsEnvironment: "development" | "production";
  status: "disabled" | "error" | "not_registered" | "registered" | "revoked" | "started";
  tokenFingerprint: string | null;
};

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

type IosVoipAuthorityContext = {
  authority: AccountSessionAuthorityBinding;
  installId: string;
  revocationCredential: string;
};
type IosAcceptedCallKitMediaDescriptor = NonNullable<ReturnType<typeof createIosAcceptedCallKitMediaDescriptor>>;

let nativeSubscription: { remove(): void } | null = null;
let eventListener: IosNativeCallEventListener | null = null;
const nativeEventSubscribers = new Set<IosNativeCallEventListener>();
const nativePresentationSubscribers = new Set<() => void>();
const nativePresentedCallUuidsByInviteId = new Map<string, string>();
const nativePresentedCallGenerations = new Map<string, string>();
const nativeAudioActivatedCallUuids = new Set<string>();
const acceptedNativeMediaSessions = new Map<string, {
  descriptor: IosAcceptedCallKitMediaDescriptor;
  context: IosVoipAuthorityContext;
  generation: number;
  nativeCallGeneration: string;
  readinessDeadlineMs: number;
}>();
let voipLifecycleGeneration = 0;
let iosNativeApplicationActiveSerial = 0;
const iosNativeAnswerApplicationActiveBaselines = new Map<string, number>();
let voipRegistrationActive = false;
let voipAuthorityContext: IosVoipAuthorityContext | null = null;
let voipTokenLifecycleQueue: Promise<void> = Promise.resolve();
let voipTransitionQueue: Promise<void> = Promise.resolve();
// Process memory only; used to suppress confirmed same-lifecycle replay writes.
// Never persisted, included in diagnostics, or exposed to event consumers.
let confirmedVoipToken: { token: string; generation: number; context: IosVoipAuthorityContext } | null = null;
const voipTokenRetryWaiters = new Set<() => void>();
const cancelVoipTokenRetries = () => { voipTokenRetryWaiters.forEach((finish) => finish()); };
const waitForVoipTokenRetry = (delay: number) => new Promise<void>((resolve) => {
  const finish = () => {
    clearTimeout(timer);
    voipTokenRetryWaiters.delete(finish);
    resolve();
  };
  const timer = setTimeout(finish, delay);
  voipTokenRetryWaiters.add(finish);
});
let foregroundAnswerValidations = new WeakMap<() => boolean, {
  inviteId: string;
  generation: number;
  context: IosVoipAuthorityContext;
  validate(): Promise<boolean>;
}>();

const toText = (value: unknown) => String(value ?? "").trim();
const isExplicitlyEnabled = (value: unknown) => ENABLED_VALUES.has(toText(value).toLowerCase());

const readRuntimeExtra = () => {
  const extra = Constants.expoConfig?.extra;
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return {};
  const runtime = (extra as Record<string, unknown>).runtime;
  return runtime && typeof runtime === "object" && !Array.isArray(runtime)
    ? runtime as Record<string, unknown>
    : {};
};

const readApnsEnvironment = (): "development" | "production" => {
  const runtime = readRuntimeExtra();
  const communication = runtime.communication && typeof runtime.communication === "object" && !Array.isArray(runtime.communication)
    ? runtime.communication as Record<string, unknown>
    : {};
  const configured = toText(
    process.env.EXPO_PUBLIC_IOS_APNS_ENVIRONMENT
      || communication.iosApnsEnvironment
      || runtime.iosApnsEnvironment,
  ).toLowerCase();
  if (configured === "production") return "production";
  if (configured === "development") return "development";
  return __DEV__ ? "development" : "production";
};

export const isIosNativeCallsRuntimeEnabled = () => {
  if (Platform.OS !== "ios") return false;
  const runtime = readRuntimeExtra();
  const communication = runtime.communication && typeof runtime.communication === "object" && !Array.isArray(runtime.communication)
    ? runtime.communication as Record<string, unknown>
    : {};
  const configuredRuntimeValue = communication.iosNativeCallsEnabled
    ?? runtime.iosNativeCallsEnabled;
  return isExplicitlyEnabled(
    configuredRuntimeValue === undefined
      ? process.env.EXPO_PUBLIC_IOS_NATIVE_CALLS_ENABLED
      : configuredRuntimeValue,
  );
};

export async function readIosNativeCallsReadiness(): Promise<IosNativeCallsReadiness> {
  if (Platform.OS !== "ios") {
    return {
      available: false,
      buildEnabled: false,
      disabledReason: "not_ios",
      runtimeEnabled: false,
    };
  }
  if (!NativeCallsModule) {
    return {
      available: false,
      buildEnabled: false,
      disabledReason: "native_module_unavailable",
      runtimeEnabled: false,
    };
  }

  const buildEnabled = await NativeCallsModule.isBuildEnabledAsync().catch(() => false);
  const runtimeEnabled = isIosNativeCallsRuntimeEnabled();
  return {
    available: buildEnabled && runtimeEnabled,
    buildEnabled,
    disabledReason: !buildEnabled ? "build_disabled" : !runtimeEnabled ? "runtime_disabled" : null,
    runtimeEnabled,
  };
}

export async function readIosNativeApplicationActive(): Promise<boolean> {
  if (
    Platform.OS !== "ios"
    || !NativeCallsModule
    || !isIosNativeCallsRuntimeEnabled()
    || typeof NativeCallsModule.isApplicationActiveAsync !== "function"
  ) return false;
  return NativeCallsModule.isApplicationActiveAsync().catch(() => false);
}

const sanitizeNativeEvent = (
  event: NativeCallEvent,
  nativeEventGeneration: number,
): SanitizedNativeCallEvent => {
  const { token: _token, ...sanitized } = event;
  return {...sanitized, nativeEventGeneration, platform: "ios"};
};

const enqueueVoipTokenLifecycle = (task: () => Promise<void>) => {
  const queued = voipTokenLifecycleQueue
    .catch(() => undefined)
    .then(task);
  voipTokenLifecycleQueue = queued.catch(() => undefined);
  return queued;
};

const waitForVoipTokenLifecycle = () => voipTokenLifecycleQueue.catch(() => undefined);

const runVoipTransition = <T>(task: () => Promise<T>) => {
  const result = voipTransitionQueue
    .catch(() => undefined)
    .then(task);
  voipTransitionQueue = result.then(() => undefined, () => undefined);
  return result;
};

// A failed network read is not a logout. Quarantine JavaScript actions while
// retaining the persisted native binding and its queued receipts for recovery.
// Explicit account/session revocation still clears PushKit and backend ownership.
const suspendVoipReadiness = () => {
  ++voipLifecycleGeneration;
  cancelVoipTokenRetries();
  voipRegistrationActive = false;
  nativeSubscription?.remove();
  nativeSubscription = null;
  eventListener = null;
  clearNativeCallTransitionClaims("ios");
  clearNativePresentedInvites(true);
};

const isExactVoipAuthorityCurrent = async (context: IosVoipAuthorityContext) => (
  context.authority.state === "ACTIVE"
  && !context.authority.restoreOnly
  && context.authority.accountId === context.authority.userId
  && await isCurrentAccountSessionAuthority(context.authority)
);

const isExactVoipLifecycleResponse = (
  context: IosVoipAuthorityContext,
  operationKey: string,
  data: unknown,
  expectedStatus: "registered" | "revoked",
) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const response = data as Record<string, unknown>;
  return response.requestAccepted === true
    && toText(response.status) === expectedStatus
    && toText(response.userId) === context.authority.userId
    && toText(response.accountId) === context.authority.accountId
    && toText(response.sessionGeneration) === context.authority.sessionGeneration
    && toText(response.installId) === context.installId
    && toText(response.platform) === "ios"
    && toText(response.provider) === "apns_voip"
    && toText(response.operationKey) === operationKey;
};

const revokeBackendVoipRegistration = async (
  context: IosVoipAuthorityContext,
  reason: PushRevocationReason | "provider_invalid",
): Promise<IosVoipRegistrationState> => {
  const apnsEnvironment = readApnsEnvironment();
  const operationKey = createPushOwnershipOperationKey("revoke");
  const { data, error } = await supabase.functions.invoke("ios-voip-push-tokens", {
    body: {
      accountId: context.authority.accountId,
      action: "revoke",
      apnsEnvironment: "all",
      installId: context.installId,
      operationKey,
      reason,
      revocationCredential: context.revocationCredential,
      sessionGeneration: context.authority.sessionGeneration,
      userId: context.authority.userId,
    },
  });
  return {
    apnsEnvironment,
    status: !error && isExactVoipLifecycleResponse(context, operationKey, data, "revoked")
      ? "revoked"
      : "error",
    tokenFingerprint: null,
  };
};

const registerVoipToken = async (
  token: string,
  context: IosVoipAuthorityContext,
): Promise<IosVoipRegistrationState> => {
  const apnsEnvironment = readApnsEnvironment();
  if (!await isExactVoipAuthorityCurrent(context)) {
    return { apnsEnvironment, status: "error", tokenFingerprint: null };
  }
  const operationKey = createPushOwnershipOperationKey("register");
  const { data, error } = await supabase.functions.invoke("ios-voip-push-tokens", {
    body: {
      accountId: context.authority.accountId,
      action: "register",
      apnsEnvironment,
      appVersion: Application.nativeApplicationVersion,
      buildVersion: Application.nativeBuildVersion,
      installId: context.installId,
      operationKey,
      revocationCredential: context.revocationCredential,
      sessionGeneration: context.authority.sessionGeneration,
      token,
      userId: context.authority.userId,
    },
  });
  const authorityAfterRegistration = await readCurrentAccountSessionAuthority();
  const currentAfterRegistration = sameAccountSessionAuthority(context.authority, authorityAfterRegistration);
  if (authorityAfterRegistration && !currentAfterRegistration) {
    await revokeBackendVoipRegistration(context, "account_switch").catch(() => null);
  }
  const exactResponse = !error
    && currentAfterRegistration
    && isExactVoipLifecycleResponse(context, operationKey, data, "registered");
  return {
    apnsEnvironment,
    status: exactResponse ? "registered" : "error",
    tokenFingerprint: exactResponse
      ? toText((data as Record<string, unknown>).tokenFingerprint) || null
      : null,
  };
};

const enqueueVoipTokenRegistration = (
  token: string,
  generation: number,
  context: IosVoipAuthorityContext,
) => {
  const normalizedToken = toText(token);
  if (!normalizedToken) return;

  void enqueueVoipTokenLifecycle(async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!voipRegistrationActive || generation !== voipLifecycleGeneration || voipAuthorityContext !== context) return;
      if (confirmedVoipToken?.generation === generation && confirmedVoipToken.context === context
        && confirmedVoipToken.token === normalizedToken) return;
      const result = await registerVoipToken(normalizedToken, context).catch(() => null);
      if (result?.status === "registered") {
        if (voipRegistrationActive && generation === voipLifecycleGeneration && voipAuthorityContext === context) {
          confirmedVoipToken = { token: normalizedToken, generation, context };
        }
        return;
      }
      if (attempt === 2) return;
      if (!voipRegistrationActive || generation !== voipLifecycleGeneration || voipAuthorityContext !== context) return;
      await waitForVoipTokenRetry([1_000, 3_000][attempt]);
    }
  });
};

const enqueueVoipTokenInvalidation = (generation: number, context: IosVoipAuthorityContext) => {
  void enqueueVoipTokenLifecycle(async () => {
    if (!voipRegistrationActive || generation !== voipLifecycleGeneration || voipAuthorityContext !== context) return;
    confirmedVoipToken = null;
    await revokeBackendVoipRegistration(context, "provider_invalid");
  });
};

const notifyNativePresentationSubscribers = () => {
  nativePresentationSubscribers.forEach((subscriber) => {
    try {
      subscriber();
    } catch {
      // Presentation diagnostics cannot interrupt native call handling.
    }
  });
};

const invalidateNativeAudioReadiness = (callUuid?: string) => {
  for (const retained of acceptedNativeMediaSessions.values()) {
    const uuid = retained.descriptor.callUuid;
    if ((!callUuid || callUuid === uuid) && nativeAudioActivatedCallUuids.has(uuid)) {
      // An already healthy call gets one bounded recovery window on loss of
      // readiness. Repeated quarantine notifications cannot restart it.
      retained.readinessDeadlineMs = performance.now() + 15_000;
    }
  }
  if (callUuid) nativeAudioActivatedCallUuids.delete(callUuid);
  else nativeAudioActivatedCallUuids.clear();
};

const clearNativePresentedInvites = (preserveAcceptedSessions = false) => {
  foregroundAnswerValidations = new WeakMap();
  confirmedVoipToken = null;
  invalidateNativeAudioReadiness();
  if (!preserveAcceptedSessions) acceptedNativeMediaSessions.clear();
  nativePresentedCallGenerations.clear();
  if (nativePresentedCallUuidsByInviteId.size === 0) return;
  nativePresentedCallUuidsByInviteId.clear();
  notifyNativePresentationSubscribers();
};

const updateNativePresentationOwnership = (event: SanitizedNativeCallEvent) => {
  const inviteId = toText(event.callInviteId);
  if (!inviteId) {
    if (event.type === "providerReset") clearNativePresentedInvites();
    return;
  }

  if (event.type === "incoming" || event.type === "recovered") {
    const callUuid = toText(event.callUuid).toLowerCase();
    const callGeneration = toText(event.nativeCallGeneration).toLowerCase();
    const context = voipAuthorityContext;
    if (!callUuid || (event.nativeSessionGeneration && event.nativeSessionGeneration !== context?.authority.sessionGeneration)) return;
    const samePresentation = nativePresentedCallUuidsByInviteId.get(inviteId) === callUuid
      && nativePresentedCallGenerations.get(callUuid) === callGeneration;
    if (samePresentation) return;
    invalidateNativeAudioReadiness(callUuid);
    if (callGeneration) nativePresentedCallGenerations.set(callUuid, callGeneration);
    else nativePresentedCallGenerations.delete(callUuid);
    const retained = acceptedNativeMediaSessions.get(inviteId);
    if (retained && context && retained.descriptor.callUuid === callUuid
      && retained.nativeCallGeneration === callGeneration
      && sameAccountSessionAuthority(retained.context.authority, context.authority)
      && retained.context.installId === context.installId
      && retained.context.revocationCredential === context.revocationCredential) {
      retained.context = context;
      retained.generation = voipLifecycleGeneration;
    }
    nativePresentedCallUuidsByInviteId.set(inviteId, callUuid);
    notifyNativePresentationSubscribers();
    return;
  }

  if ([
    "answerFailed",
    "audioSessionFailed",
    "declined",
    "ended",
    "invalidIncomingPayload",
    "providerReset",
    "remoteEnded",
    "reportFailed",
    "timeout",
  ].includes(event.type)
    && nativePresentedCallUuidsByInviteId.get(inviteId) === toText(event.callUuid).toLowerCase()
    && nativePresentedCallUuidsByInviteId.delete(inviteId)) {
    nativeAudioActivatedCallUuids.delete(toText(event.callUuid).toLowerCase());
    nativePresentedCallGenerations.delete(toText(event.callUuid).toLowerCase());
    notifyNativePresentationSubscribers();
  }
};

const handleNativeEvent = (
  event: NativeCallEvent,
  generation: number,
  context: IosVoipAuthorityContext,
) => {
  if (!voipRegistrationActive || generation !== voipLifecycleGeneration || voipAuthorityContext !== context) return;
  if (event.nativeSessionGeneration && event.nativeSessionGeneration !== context.authority.sessionGeneration) return;
  const observedUuid = toText(event.callUuid).toLowerCase();
  const observedCallGeneration = nativePresentedCallGenerations.get(observedUuid);
  if (event.nativeCallGeneration && observedCallGeneration
    && event.nativeCallGeneration !== observedCallGeneration && event.type !== "incoming") return;

  if (event.type === "applicationActive") {
    iosNativeApplicationActiveSerial = iosNativeApplicationActiveSerial >= Number.MAX_SAFE_INTEGER
      ? 1
      : iosNativeApplicationActiveSerial + 1;
  }
  let audioSdkSynchronized: boolean | undefined;
  if (event.type === "audioSessionActivated") {
    const eventUuid = toText(event.callUuid).toLowerCase();
    // Native queue delivery and the React Native queue are separate boundaries.
    // Match the native call generation and authenticated session again here.
    const receiptMatches = !!eventUuid && !!event.nativeCallGeneration
      && nativePresentedCallGenerations.get(eventUuid) === event.nativeCallGeneration
      && event.nativeSessionGeneration === context.authority.sessionGeneration;
    if (!receiptMatches) return;
    invalidateNativeAudioReadiness(eventUuid || undefined);
    const synchronized = synchronizeLiveKitCallKitAudioSession("activated");
    audioSdkSynchronized = synchronized === true;
    reportInternalCallMediaDiagnostic("native_audio_activation_received", { enabled: synchronized === true });
    // Retain only an observed activation for currently presented native UUIDs.
    // A remounted thread may reuse this receipt; a replacement call may not.
    if (synchronized === true) {
      for (const uuid of nativePresentedCallUuidsByInviteId.values()) {
        if (!eventUuid || uuid === eventUuid) nativeAudioActivatedCallUuids.add(uuid);
      }
    }
  } else if (["audioSessionDeactivated", "audioSessionFailed", "audioInterruptionBegan"].includes(event.type)) {
    const synchronized = synchronizeLiveKitCallKitAudioSession("deactivated");
    invalidateNativeAudioReadiness();
    reportInternalCallMediaDiagnostic("native_audio_deactivation_received", { enabled: synchronized === true });
  }
  const eventInviteId = toText(event.callInviteId);
  if (event.type === "answerRequested" && eventInviteId) {
    iosNativeAnswerApplicationActiveBaselines.set(
      eventInviteId,
      iosNativeApplicationActiveSerial,
    );
  } else if (eventInviteId && [
    "answerFailed",
    "declined",
    "ended",
    "providerReset",
    "remoteEnded",
    "timeout",
  ].includes(event.type)
    && nativePresentedCallUuidsByInviteId.get(eventInviteId) === toText(event.callUuid).toLowerCase()) {
    iosNativeAnswerApplicationActiveBaselines.delete(eventInviteId);
  }

  if (event.type === "voipTokenUpdated") {
    enqueueVoipTokenRegistration(event.token ?? "", generation, context);
  } else if (event.type === "voipTokenInvalidated") {
    // Keep PKPushRegistry active so Apple can deliver a rotated token. Logout
    // and account transitions use revokeIosVoipRegistration(), which also
    // stops native registration.
    enqueueVoipTokenInvalidation(generation, context);
  }

  const sanitizedEvent = sanitizeNativeEvent(event, generation);
  if (audioSdkSynchronized !== undefined) sanitizedEvent.audioSdkSynchronized = audioSdkSynchronized;
  updateNativePresentationOwnership(sanitizedEvent);
  if (event.type === "recovered") {
    const retained = acceptedNativeMediaSessions.get(toText(event.callInviteId));
    const uuid = toText(event.callUuid).toLowerCase();
    invalidateNativeAudioReadiness(uuid);
    if (retained?.descriptor.callUuid === uuid && retained.context === context && retained.generation === generation
      && retained.nativeCallGeneration === event.nativeCallGeneration
      && event.nativeSessionGeneration === context.authority.sessionGeneration) {
      // Native recomputes this boolean when delivering a recovered receipt,
      // after checking its current CallKit activation, exact call and authority.
      // A persisted event or JS presentation alone cannot supply readiness.
      const synchronized = event.audioSessionActive === true
        && synchronizeLiveKitCallKitAudioSession("activated") === true;
      if (synchronized) nativeAudioActivatedCallUuids.add(uuid);
      reportInternalCallMediaDiagnostic("native_audio_recovered", { enabled: synchronized });
    }
  }
  if (["audioSessionActivated", "audioSessionDeactivated", "audioSessionFailed", "audioInterruptionBegan", "recovered"].includes(event.type)) {
    notifyNativePresentationSubscribers();
  }
  eventListener?.(sanitizedEvent);
  nativeEventSubscribers.forEach((subscriber) => {
    try {
      subscriber(sanitizedEvent);
    } catch {
      // A diagnostic/consumer listener cannot interrupt the native lifecycle.
    }
  });
};

const drainPendingEventsForExactLifecycle = async (
  generation: number,
  context: IosVoipAuthorityContext,
) => {
  if (
    !NativeCallsModule
    || !voipRegistrationActive
    || generation !== voipLifecycleGeneration
    || voipAuthorityContext !== context
    || !await isExactVoipAuthorityCurrent(context)
  ) return 0;

  const pending = await NativeCallsModule.getPendingEventsAsync().catch(() => []);
  if (
    !voipRegistrationActive
    || generation !== voipLifecycleGeneration
    || voipAuthorityContext !== context
  ) return 0;
  pending.forEach((event) => handleNativeEvent(event, generation, context));
  return pending.length;
};

export async function drainIosNativeCallPendingEvents() {
  const generation = voipLifecycleGeneration;
  const context = voipAuthorityContext;
  if (!context) return 0;
  return drainPendingEventsForExactLifecycle(generation, context);
}

export async function waitForIosNativeCallAnswerRouteReadiness(
  event: SanitizedNativeCallEvent,
): Promise<boolean | "stale"> {
  const generation = voipLifecycleGeneration;
  const context = voipAuthorityContext;
  if (!context || event.nativeEventGeneration !== generation) return "stale";
  // Swift replays durable Answer before its one-shot incoming/recovered
  // events, both through the observer and the explicit pending-event drain.
  // Wait briefly for that presentation rather than reject a valid Answer at
  // the first missing JS map entry. This grants no routing authority: the
  // exact UUID/account/generation checks still follow.
  const presentation = await waitForIosNativeCallPresentation(event.callInviteId, 2_000);
  if (presentation !== "presented") return false;
  const isExactContextCurrent = async (candidateEvent: unknown) => {
    const candidate = candidateEvent as SanitizedNativeCallEvent;
    const inviteId = toText(candidate.callInviteId);
    const callUuid = toText(candidate.callUuid).toLowerCase();
    const callGeneration = toText(candidate.nativeCallGeneration).toLowerCase();
    const ownsContext = () => !!inviteId
      && !!callUuid
      && candidate.nativeEventGeneration === generation
      && voipRegistrationActive
      && generation === voipLifecycleGeneration
      && context === voipAuthorityContext
      && nativePresentedCallUuidsByInviteId.get(inviteId) === callUuid
      && (!callGeneration || nativePresentedCallGenerations.get(callUuid) === callGeneration);
    return ownsContext() && await isExactVoipAuthorityCurrent(context) && ownsContext();
  };
  const callUuid = toText(event.callUuid).toLowerCase();
  const nativeCallGeneration = toText(event.nativeCallGeneration).toLowerCase();
  const ownsVoiceAnswerReceipt = () => event.type === "answerRequested"
    && event.callType === "voice"
    && !!nativeCallGeneration
    && event.nativeSessionGeneration === context.authority.sessionGeneration
    && nativePresentedCallGenerations.get(callUuid) === nativeCallGeneration;
  // Locked voice Answer does not activate the app. A fresh native pending
  // action is an explicit user handoff; a stored event/presentation alone is
  // insufficient. Older binaries and video keep the foreground-only path.
  if (ownsVoiceAnswerReceipt() && typeof NativeCallsModule?.hasPendingVoiceAnswerAsync === "function"
    && await isExactContextCurrent(event)) {
    const pendingVoiceAnswer = await NativeCallsModule.hasPendingVoiceAnswerAsync({
      callUuid, callInviteId: toText(event.callInviteId), threadId: toText(event.threadId), nativeCallGeneration,
      userId: context.authority.userId, accountId: context.authority.accountId,
      sessionGeneration: context.authority.sessionGeneration, installId: context.installId,
    }).catch(() => false);
    if (pendingVoiceAnswer === true && await isExactContextCurrent(event) && ownsVoiceAnswerReceipt()) return true;
  }
  const readiness = await waitForIosCallKitAnswerRouteReadiness(event, {
    isApplicationActive: readIosNativeApplicationActive,
    isExactContextCurrent,
  });
  // A replaced call must neither route nor fail its replacement's Answer.
  return readiness === "stale" ? "stale" : readiness === "ready";
}

export function subscribeToIosNativeCallEvents(listener: IosNativeCallEventListener) {
  nativeEventSubscribers.add(listener);
  return () => {
    nativeEventSubscribers.delete(listener);
  };
}

export function readIosNativeApplicationActiveSerial(inviteId: string) {
  const normalizedInviteId = toText(inviteId);
  const answerBaseline = iosNativeAnswerApplicationActiveBaselines.get(normalizedInviteId);
  return normalizedInviteId
    && answerBaseline !== undefined
    && iosNativeApplicationActiveSerial > answerBaseline
    ? iosNativeApplicationActiveSerial
    : 0;
}

export function hasIosNativeCallPresentation(inviteId: string | null | undefined) {
  const normalizedInviteId = toText(inviteId);
  return !!normalizedInviteId && nativePresentedCallUuidsByInviteId.has(normalizedInviteId);
}

// Already-observed presentations can outlive a React bridge effect. Reattach
// terminal watchers without fabricating or replaying an Answer event.
export function readIosNativeCallPresentations() {
  if (!voipRegistrationActive || !voipAuthorityContext) return [];
  return Array.from(nativePresentedCallUuidsByInviteId, ([callInviteId, callUuid]) => ({
    callInviteId,
    callUuid,
  }));
}

// The one-use route claim ends at the screen boundary; accepted media ownership
// lasts until exact call cleanup. Retain its existing attestation in this same
// authenticated native lifecycle, never in storage or route parameters.
export function retainIosAcceptedNativeMediaSession(descriptor: IosAcceptedCallKitMediaDescriptor) {
  const context = voipAuthorityContext;
  if (!context || !voipRegistrationActive
    || context.authority.userId !== descriptor?.authenticatedUserId
    || nativePresentedCallUuidsByInviteId.get(descriptor?.inviteId) !== descriptor?.callUuid
    || !nativePresentedCallGenerations.has(descriptor?.callUuid)
    || !doesIosAcceptedCallKitMediaDescriptorOwnSession({ ...descriptor, descriptor, inviteStatus: "accepted" })) return false;
  const previous = acceptedNativeMediaSessions.get(descriptor.inviteId);
  if (previous) return previous.descriptor === descriptor && previous.context === context
    && previous.generation === voipLifecycleGeneration;
  // Native configuration permits one call; bound even unexpected retained
  // terminal cleanup without evicting an unresolved owner to admit another.
  if (acceptedNativeMediaSessions.size >= 8) return false;
  acceptedNativeMediaSessions.set(descriptor.inviteId, {
    descriptor, context, generation: voipLifecycleGeneration,
    nativeCallGeneration: nativePresentedCallGenerations.get(descriptor.callUuid)!,
    readinessDeadlineMs: performance.now() + 15_000,
  });
  reportInternalCallMediaDiagnostic("native_audio_session_retained", { enabled: true });
  return true;
}

export function readIosAcceptedNativeMediaSession(input: {
  authenticatedUserId: string; sessionGeneration: string; inviteId?: string; inviteStatus?: string;
  mediaProvider?: string; roomId?: string | null; threadId: string;
}) {
  const retained = acceptedNativeMediaSessions.get(toText(input.inviteId));
  if (!retained || retained.context.authority.userId !== input.authenticatedUserId
    || retained.context.authority.sessionGeneration !== input.sessionGeneration
    || !doesIosAcceptedCallKitMediaDescriptorOwnSession({ ...input, descriptor: retained.descriptor })) return null;
  return {
    descriptor: retained.descriptor,
    readinessDeadlineMs: retained.readinessDeadlineMs,
    nativeAuthorityCurrent: voipRegistrationActive && retained.context === voipAuthorityContext
      && retained.generation === voipLifecycleGeneration
      && (!nativePresentedCallGenerations.has(retained.descriptor.callUuid)
        || nativePresentedCallGenerations.get(retained.descriptor.callUuid) === retained.nativeCallGeneration),
    // During transient readiness quarantine the exact descriptor remains a
    // capture gate, never an activation grant. A recovered native receipt must
    // rebind it to the authenticated lifecycle before new readiness is usable.
    audioSessionActive: voipRegistrationActive && retained.context === voipAuthorityContext
      && retained.generation === voipLifecycleGeneration
      && nativePresentedCallGenerations.get(retained.descriptor.callUuid) === retained.nativeCallGeneration
      && nativeAudioActivatedCallUuids.has(retained.descriptor.callUuid),
  };
}

export function isIosNativeCallAuthorityCurrent(input: { authenticatedUserId: string; sessionGeneration: string }) {
  return voipRegistrationActive && voipAuthorityContext?.authority.userId === input.authenticatedUserId
    && voipAuthorityContext.authority.sessionGeneration === input.sessionGeneration;
}

export function isIosAcceptedNativeMediaAuthorityCurrent(descriptor: IosAcceptedCallKitMediaDescriptor,
  input: { authenticatedUserId: string; sessionGeneration: string }) {
  const retained = acceptedNativeMediaSessions.get(descriptor.inviteId);
  return retained?.descriptor === descriptor && isIosNativeCallAuthorityCurrent(input)
    && retained.context === voipAuthorityContext && retained.generation === voipLifecycleGeneration
    && (!nativePresentedCallGenerations.has(descriptor.callUuid)
      || nativePresentedCallGenerations.get(descriptor.callUuid) === retained.nativeCallGeneration);
}

export function releaseIosAcceptedNativeMediaSession(inviteId: string, callUuid: string,
  screenAuthority: { authenticatedUserId: string; sessionGeneration: string }) {
  const retained = acceptedNativeMediaSessions.get(inviteId);
  if (!retained || retained.context.authority.userId !== screenAuthority.authenticatedUserId
    || retained.context.authority.sessionGeneration !== screenAuthority.sessionGeneration
    || retained.descriptor.callUuid !== callUuid) return false;
  acceptedNativeMediaSessions.delete(inviteId);
  nativeAudioActivatedCallUuids.delete(callUuid);
  return true;
}

export function subscribeToIosNativeCallPresentation(listener: () => void) {
  nativePresentationSubscribers.add(listener);
  return () => {
    nativePresentationSubscribers.delete(listener);
  };
}

export async function waitForIosNativeCallPresentation(
  inviteId: string | null | undefined,
  timeoutMs = 12_000,
): Promise<IosNativePresentationWaitOutcome> {
  const normalizedInviteId = toText(inviteId);
  if (!normalizedInviteId) return "stale";
  if (Platform.OS !== "ios" || !NativeCallsModule || !isIosNativeCallsRuntimeEnabled()) {
    return "not_expected";
  }
  if (nativePresentedCallUuidsByInviteId.has(normalizedInviteId)) return "presented";

  const generation = voipLifecycleGeneration;
  const context = voipAuthorityContext;
  if (!voipRegistrationActive || !context) return "stale";

  const boundedTimeoutMs = Number.isFinite(timeoutMs)
    ? Math.max(0, Math.min(20_000, timeoutMs))
    : 12_000;
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = (outcome: IosNativePresentationWaitOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      resolve(outcome);
    };
    const inspect = () => {
      if (
        !voipRegistrationActive
        || generation !== voipLifecycleGeneration
        || context !== voipAuthorityContext
      ) {
        finish("stale");
        return;
      }
      if (nativePresentedCallUuidsByInviteId.has(normalizedInviteId)) finish("presented");
    };
    const timeout = setTimeout(() => {
      if (nativePresentedCallUuidsByInviteId.has(normalizedInviteId)) {
        finish("presented");
        return;
      }
      finish("timeout");
    }, boundedTimeoutMs);
    unsubscribe = subscribeToIosNativeCallPresentation(inspect);
    inspect();
  });
}

const FOREGROUND_CALL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const FOREGROUND_CALL_EXPIRY = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u;
const isFutureForegroundCallExpiry = (value: unknown): value is string => {
  if (typeof value !== "string" || !FOREGROUND_CALL_EXPIRY.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60
    && Number(value.slice(17, 19)) < 60
    && Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now();
};

// A deliberate foreground Answer may reach the authenticated invite before
// PushKit. Ask CallKit to present that freshly verified invite, then wait for
// its real receipt. A returned UUID alone never manufactures native ownership.
export async function ensureIosForegroundIncomingCallPresentation(input: {
  inviteId: string;
  threadId: string;
  roomId: string;
  authority: AccountSessionAuthorityBinding | null;
  isCurrent(): boolean;
  timeoutMs?: number;
}): Promise<IosNativePresentationWaitOutcome> {
  if (Platform.OS !== "ios" || !isIosNativeCallsRuntimeEnabled()) return "not_expected";
  const native = NativeCallsModule;
  const context = voipAuthorityContext;
  const generation = voipLifecycleGeneration;
  const inviteId = toText(input.inviteId).toLowerCase();
  const threadId = toText(input.threadId).toLowerCase();
  const roomId = normalizeCommunicationRoomIdentifier(input.roomId);
  if (!native || !context || !voipRegistrationActive || !roomId
    || !FOREGROUND_CALL_UUID.test(inviteId) || !FOREGROUND_CALL_UUID.test(threadId)
    || !sameAccountSessionAuthority(input.authority, context.authority)) return "stale";
  const ownsOperation = () => input.isCurrent() && voipRegistrationActive
    && generation === voipLifecycleGeneration && voipAuthorityContext === context;
  const currentNativeAuthority = async () => {
    if (!ownsOperation() || !await isExactVoipAuthorityCurrent(context) || !ownsOperation()) return false;
    if (await getNotificationInstallId() !== context.installId || !ownsOperation()) return false;
    return await readIosNativeApplicationActive() && ownsOperation();
  };
  const readExactRingingInvite = async () => {
    if (!await currentNativeAuthority()) return null;
    // Read the raw call_type/status. The ordinary display parser supplies
    // defaults for unknown values; those defaults cannot grant call authority.
    const [inviteResult, threadResult] = await Promise.all([
      supabase.from("chat_call_invites")
        .select("id,thread_id,communication_room_id,caller_user_id,callee_user_id,call_type,status,expires_at")
        .eq("id", inviteId).maybeSingle(),
      supabase.from("chat_threads")
        .select("id,active_communication_room_id,members:chat_thread_members(user_id,thread_id)")
        .eq("id", threadId).maybeSingle(),
    ]);
    if (!ownsOperation() || inviteResult.error || threadResult.error) return null;
    const invite = inviteResult.data;
    const thread = threadResult.data;
    if (!invite || !thread || invite.id !== inviteId || invite.thread_id !== threadId
      || invite.communication_room_id !== roomId || thread.id !== threadId
      || thread.active_communication_room_id !== roomId
      || invite.callee_user_id !== context.authority.userId
      || invite.caller_user_id === context.authority.userId
      || !FOREGROUND_CALL_UUID.test(invite.caller_user_id)
      || invite.status !== "ringing"
      || (invite.call_type !== "voice" && invite.call_type !== "video")
      || !isFutureForegroundCallExpiry(invite.expires_at)
      || !Array.isArray(thread.members)
      || ![context.authority.userId, invite.caller_user_id].every((userId) => thread.members.some(
        (member) => member.user_id === userId && member.thread_id === threadId,
      ))) return null;
    if (!await currentNativeAuthority() || Date.parse(invite.expires_at) <= Date.now()) return null;
    return invite;
  };
  try {
    const invite = await readExactRingingInvite();
    if (!invite || !ownsOperation()) return "stale";
    const observedUuid = nativePresentedCallUuidsByInviteId.get(inviteId);
    if (observedUuid && observedUuid !== inviteId) return "stale";
    if (!observedUuid) {
      if (typeof native.reportForegroundIncomingCallAsync !== "function") return "stale";
      let reportTimeout: ReturnType<typeof setTimeout> | undefined;
      const nativeReport = native.reportForegroundIncomingCallAsync({
        callInviteId: inviteId,
        callUuid: inviteId,
        threadId,
        callType: invite.call_type,
        expiresAt: invite.expires_at,
      }, {
        userId: context.authority.userId,
        accountId: context.authority.accountId,
        sessionGeneration: context.authority.sessionGeneration,
        installId: context.installId,
      });
      const reportedUuid = await Promise.race([
        nativeReport,
        new Promise<null>((resolve) => { reportTimeout = setTimeout(() => resolve(null), 5_000); }),
      ]).finally(() => clearTimeout(reportTimeout));
      // A late CallKit callback retains its own native lifecycle. It cannot
      // continue this timed-out tap or trigger an indiscriminate native End.
      if (reportedUuid === null) return "timeout";
      if (!ownsOperation() || reportedUuid !== inviteId) return "stale";
    }
    const outcome = await waitForIosNativeCallPresentation(inviteId,
      Math.max(0, Math.min(3_000, input.timeoutMs ?? 2_000)));
    if (!ownsOperation()) return "stale";
    if (outcome !== "presented") return outcome;
    const validate = async () => {
      if (nativePresentedCallUuidsByInviteId.get(inviteId) !== inviteId) return false;
      const latest = await readExactRingingInvite();
      return !!latest && latest.call_type === invite.call_type
        && latest.caller_user_id === invite.caller_user_id && latest.expires_at === invite.expires_at
        && ownsOperation() && nativePresentedCallUuidsByInviteId.get(inviteId) === inviteId;
    };
    if (!await validate()) return "stale";
    foregroundAnswerValidations.set(input.isCurrent, { inviteId, generation, context, validate });
    return "presented";
  } catch {
    return "stale";
  }
}

export async function startIosNativeCallsReadiness(
  authority: AccountSessionAuthorityBinding,
  listener?: IosNativeCallEventListener,
): Promise<IosVoipRegistrationState> {
  return runVoipTransition(async () => {
    const apnsEnvironment = readApnsEnvironment();
    const readiness = await readIosNativeCallsReadiness();
    const currentContext = voipAuthorityContext;
    const currentAuthority = readiness.available
      ? await readCurrentAccountSessionAuthority() : null;
    if (readiness.available && !currentAuthority) {
      suspendVoipReadiness();
      return { apnsEnvironment, status: "error", tokenFingerprint: null };
    }
    const exactAuthority = sameAccountSessionAuthority(authority, currentAuthority)
      && authority.restoreOnly === false && authority.accountId === authority.userId;
    if (
      readiness.available
      && NativeCallsModule
      && nativeSubscription
      && currentContext
      && shouldReuseIosNativeCallReadiness({
        currentAuthority: currentContext.authority,
        nextAuthority: authority,
        registrationActive: voipRegistrationActive,
      })
      && exactAuthority
    ) {
      // React can re-enter this bridge while the same account/session is being
      // harmlessly revalidated. CallKit may already be presenting an exact
      // invite at that moment. Replacing the listener lifecycle would erase
      // its invite/UUID ownership and make a visible foreground Answer fail
      // closed even though the native call remains live.
      eventListener = listener ?? null;
      // Rebind the same native owner without clearing its calls/listener. Native
      // replays the current registry token and confirmed live presentations,
      // recovering a prior failed token write without inventing either receipt.
      const rebound = await NativeCallsModule.startVoipRegistrationAsync(
        currentContext.authority.userId, currentContext.authority.accountId,
        currentContext.authority.sessionGeneration, currentContext.installId,
      ).catch(() => false);
      if (!rebound) {
        suspendVoipReadiness();
        return { apnsEnvironment, status: "error", tokenFingerprint: null };
      }
      await drainPendingEventsForExactLifecycle(voipLifecycleGeneration, currentContext);
      return { apnsEnvironment, status: "started", tokenFingerprint: null };
    }
    const generation = ++voipLifecycleGeneration;
    cancelVoipTokenRetries();
    iosNativeApplicationActiveSerial = 0;
    iosNativeAnswerApplicationActiveBaselines.clear();
    clearNativeCallTransitionClaims("ios");
    voipRegistrationActive = false;
    voipAuthorityContext = null;
    nativeSubscription?.remove();
    nativeSubscription = null;
    eventListener = null;
    clearNativePresentedInvites(readiness.available && exactAuthority && !!currentContext
      && sameAccountSessionAuthority(currentContext.authority, authority));

    // Let any request from the previous lifecycle finish before a new native
    // listener can enqueue work under the next authenticated account state.
    await waitForVoipTokenLifecycle();

    if (!readiness.available || !NativeCallsModule) {
      await NativeCallsModule?.stopVoipRegistrationAsync().catch(() => false);
      if (currentContext) await revokeBackendVoipRegistration(currentContext, "auth_loss").catch(() => null);
      return { apnsEnvironment, status: "disabled", tokenFingerprint: null };
    }
    if (!exactAuthority) {
      await NativeCallsModule.stopVoipRegistrationAsync().catch(() => false);
      if (currentContext) await revokeBackendVoipRegistration(currentContext, "account_switch").catch(() => null);
      return { apnsEnvironment, status: "error", tokenFingerprint: null };
    }

    const context: IosVoipAuthorityContext = {
      authority: { ...authority },
      installId: await getNotificationInstallId(),
      revocationCredential: await getNotificationRevocationCredential(),
    };

    // Native startup compares its persisted authority and clears old-account
    // calls/events only when that binding differs. Bind first: addListener can
    // synchronously schedule pending-event replay, so listening before this
    // reset could reinterpret an old Answer under the new JS account. A
    // same-authority cold launch deliberately retains its legitimate queue.
    const started = await NativeCallsModule.startVoipRegistrationAsync(
      context.authority.userId,
      context.authority.accountId,
      context.authority.sessionGeneration,
      context.installId,
    ).catch(() => false);
    const authorityAfterStart = started ? await readCurrentAccountSessionAuthority() : null;
    const authorityStillCurrent = started && sameAccountSessionAuthority(context.authority, authorityAfterStart);
    if (started && !authorityAfterStart && generation === voipLifecycleGeneration) {
      // Native startup may have succeeded while the following authority RPC
      // timed out. Keep its exact binding and pending token/event queue, grant
      // no JS action authority, and let bounded root recovery revalidate it.
      voipAuthorityContext = context;
      return { apnsEnvironment, status: "error", tokenFingerprint: null };
    }
    if ((!started || !authorityStillCurrent) && generation === voipLifecycleGeneration) {
      voipRegistrationActive = false;
      voipAuthorityContext = null;
      nativeSubscription = null;
      eventListener = null;
      await NativeCallsModule.stopVoipRegistrationAsync().catch(() => false);
      await revokeBackendVoipRegistration(currentContext ?? context, started ? "account_switch" : "auth_loss").catch(() => null);
    }
    if (started && authorityStillCurrent && generation === voipLifecycleGeneration) {
      voipRegistrationActive = true;
      voipAuthorityContext = context;
      eventListener = listener ?? null;
      nativeSubscription = NativeCallsModule.addListener(
        "onNativeCallEvent",
        (event) => {
          handleNativeEvent(event, generation, context);
          if (event.type === "applicationActive") {
            void drainPendingEventsForExactLifecycle(generation, context);
          }
        },
      );
      await drainPendingEventsForExactLifecycle(generation, context);
    }
    return {
      apnsEnvironment,
      status: started && authorityStillCurrent ? "started" : "error",
      tokenFingerprint: null,
    };
  });
}

export async function readIosVoipRegistrationStatus(): Promise<IosVoipRegistrationState> {
  const apnsEnvironment = readApnsEnvironment();
  const readiness = await readIosNativeCallsReadiness();
  if (!readiness.available) return { apnsEnvironment, status: "disabled", tokenFingerprint: null };

  const authority = voipAuthorityContext?.authority;
  if (!authority || authority.restoreOnly || !await isCurrentAccountSessionAuthority(authority)) {
    return { apnsEnvironment, status: "not_registered", tokenFingerprint: null };
  }
  const installId = await getNotificationInstallId();
  const { data, error } = await supabase.functions.invoke("ios-voip-push-tokens", {
    body: {
      accountId: authority.accountId,
      action: "status",
      apnsEnvironment,
      installId,
      operationKey: createPushOwnershipOperationKey("status"),
      revocationCredential: await getNotificationRevocationCredential(),
      sessionGeneration: authority.sessionGeneration,
      userId: authority.userId,
    },
  });
  if (error) return { apnsEnvironment, status: "error", tokenFingerprint: null };
  const payload = data as { registered?: unknown; tokenFingerprint?: unknown } | null;
  return {
    apnsEnvironment,
    status: payload?.registered === true ? "registered" : "not_registered",
    tokenFingerprint: toText(payload?.tokenFingerprint) || null,
  };
}

export async function revokeIosVoipRegistration(): Promise<IosVoipRegistrationState> {
  return runVoipTransition(async () => {
    const apnsEnvironment = readApnsEnvironment();
    if (Platform.OS !== "ios") return { apnsEnvironment, status: "disabled", tokenFingerprint: null };

    ++voipLifecycleGeneration;
    cancelVoipTokenRetries();
    iosNativeApplicationActiveSerial = 0;
    iosNativeAnswerApplicationActiveBaselines.clear();
    const context = voipAuthorityContext;
    clearNativeCallTransitionClaims("ios");
    voipRegistrationActive = false;
    voipAuthorityContext = null;
    nativeSubscription?.remove();
    nativeSubscription = null;
    eventListener = null;
    clearNativePresentedInvites();
    await NativeCallsModule?.stopVoipRegistrationAsync().catch(() => false);

    // An already-issued request cannot be aborted reliably. Waiting before the
    // final revoke guarantees that it cannot reactivate this install afterward.
    await waitForVoipTokenLifecycle();
    return context
      ? revokeBackendVoipRegistration(context, "auth_loss")
      : { apnsEnvironment, status: "revoked", tokenFingerprint: null };
  });
}

export async function dispatchIosVoipIncomingCall(inviteId: string) {
  if (!isIosNativeCallsRuntimeEnabled()) {
    return { eligible: false, reason: "runtime_disabled", status: "disabled" } as const;
  }
  const normalizedInviteId = toText(inviteId);
  if (!normalizedInviteId) return { eligible: false, reason: "missing_invite_id", status: "error" } as const;
  const { data, error } = await supabase.functions.invoke("ios-voip-call-dispatch", {
    body: { action: "incoming", inviteId: normalizedInviteId },
  });
  return error
    ? { eligible: false, reason: "dispatch_failed", status: "error" } as const
    : data;
}

export async function endIosNativeCall(callUuid: string, reason = "local_end") {
  if (!NativeCallsModule || !isIosNativeCallsRuntimeEnabled()) return false;
  return NativeCallsModule.endCallAsync(callUuid, reason).then(() => true).catch(() => false);
}

export async function reportIosNativeCallRemoteEnd(callUuid: string, reason = "remote_end") {
  if (!NativeCallsModule || !isIosNativeCallsRuntimeEnabled()) return false;
  return NativeCallsModule.reportRemoteEndAsync(callUuid, reason).then(() => true).catch(() => false);
}

export async function completeIosNativeCallAnswer(callUuid: string, connected: boolean) {
  if (!NativeCallsModule || !isIosNativeCallsRuntimeEnabled()) return false;
  return NativeCallsModule.completeAnswerAsync(callUuid, connected).then(() => true).catch((error) => {
    reportBoundedNativeCallError(reportRuntimeError, "complete_answer", error, { connected });
    return false;
  });
}

export async function requestIosNativeCallAnswer(inviteId: string, isCurrent: () => boolean) {
  if (
    !NativeCallsModule
    || typeof NativeCallsModule.requestAnswerAsync !== "function"
    || !isIosNativeCallsRuntimeEnabled()
    || !voipRegistrationActive
  ) return false;
  const normalizedInviteId = toText(inviteId);
  const callUuid = nativePresentedCallUuidsByInviteId.get(normalizedInviteId);
  const context = voipAuthorityContext;
  const generation = voipLifecycleGeneration;
  const foregroundValidation = foregroundAnswerValidations.get(isCurrent);
  // Admission belongs to this deliberate mounted UI operation. Consuming it
  // cannot let a second tap skip its own final authoritative row read.
  foregroundAnswerValidations.delete(isCurrent);
  if (!foregroundValidation || foregroundValidation.inviteId !== normalizedInviteId
    || foregroundValidation.generation !== generation || foregroundValidation.context !== context) return false;
  const ownsRequest = () => isCurrent() && voipRegistrationActive
    && generation === voipLifecycleGeneration && voipAuthorityContext === context
    && nativePresentedCallUuidsByInviteId.get(normalizedInviteId) === callUuid;
  if (!normalizedInviteId || !callUuid || !context || !ownsRequest()
    || !await isExactVoipAuthorityCurrent(context) || !ownsRequest()
    || await getNotificationInstallId() !== context.installId || !ownsRequest()
    || !await readIosNativeApplicationActive() || !ownsRequest()) return false;
  if (!await foregroundValidation.validate().catch(() => false) || !ownsRequest()) return false;
  return NativeCallsModule.requestAnswerAsync(callUuid, normalizedInviteId)
    .then((requested) => requested === true)
    .catch((error) => {
      reportBoundedNativeCallError(reportRuntimeError, "request_answer", error);
      return false;
    });
}

export async function completeIosNativeCallTerminalTransition(callUuid: string) {
  if (!NativeCallsModule || !isIosNativeCallsRuntimeEnabled()) return false;
  return NativeCallsModule.completeTerminalTransitionAsync(callUuid).then(() => true).catch(() => false);
}

export async function setIosNativeCallMuted(callUuid: string, muted: boolean) {
  if (!NativeCallsModule || !isIosNativeCallsRuntimeEnabled()) return false;
  return NativeCallsModule.setMutedAsync(callUuid, muted).then(() => true).catch(() => false);
}

export async function setIosNativeCallAudioRoute(route: "receiver" | "speaker" | "system") {
  if (!NativeCallsModule || !isIosNativeCallsRuntimeEnabled()) return false;
  return NativeCallsModule.setAudioRouteAsync(route).then(() => true).catch(() => false);
}

export function createIosOutgoingAudioHandoff(input: {
  ownerId: string; authority: AccountSessionAuthorityBinding;
  inviteId: string; threadId: string; roomId: string; callType: "voice" | "video";
  isCurrent(): boolean; onRevoked(): void;
}) {
  let retired = false;
  let nativeReservationRequested = false;
  const context = voipAuthorityContext;
  const generation = voipLifecycleGeneration;
  const current = () => !retired && input.isCurrent() && !!context
    && context === voipAuthorityContext && generation === voipLifecycleGeneration
    && sameAccountSessionAuthority(input.authority, context.authority);
  const unsubscribe = subscribeToIosNativeCallEvents((event) => {
    if (event.type !== "outgoingAudioHandoffRevoked" || event.outgoingAudioOwnerId !== input.ownerId) return;
    retired = true;
    input.onRevoked();
  });
  const retire = () => {
    retired = true;
    unsubscribe();
    if (nativeReservationRequested) {
      void NativeCallsModule?.retireOutgoingAudioHandoffAsync?.(input.ownerId).catch(() => undefined);
    }
  };
  return {
    retire,
    async prepare(soundRetired: Promise<void>) {
      // Observe drain rejection immediately while account validation is pending.
      const drained = soundRetired.then(() => ({ ok: true as const }), (error: unknown) => ({ ok: false as const, error }));
      try {
        if (!current() || !context || !NativeCallsModule?.beginOutgoingAudioHandoffAsync
            || !NativeCallsModule.prepareOutgoingAudioHandoffAsync || !NativeCallsModule.retireOutgoingAudioHandoffAsync
            || !isIosNativeCallsRuntimeEnabled() || !await isExactVoipAuthorityCurrent(context) || !current()) {
          throw new Error("outgoing_call_audio_authority_unavailable");
        }
        const result = await drained;
        if (!result.ok) throw result.error;
        // A still-current sound owner rejects competing screen ownership.
        // Do not replace its native lease before that admission has succeeded.
        if (!current() || !await isExactVoipAuthorityCurrent(context) || !current()) {
          throw new Error("outgoing_call_audio_handoff_retired");
        }
        // Once begin is issued, even an uncertain failure needs exact-owner
        // retirement. Before this point there is no native lease to retire.
        nativeReservationRequested = true;
        await NativeCallsModule.beginOutgoingAudioHandoffAsync({
          ownerId: input.ownerId, userId: input.authority.userId, accountId: input.authority.accountId,
          sessionGeneration: input.authority.sessionGeneration, installId: context.installId,
          inviteId: input.inviteId, threadId: input.threadId, roomId: input.roomId, callType: input.callType,
        });
        if (!current() || !await isExactVoipAuthorityCurrent(context) || !current()) {
          throw new Error("outgoing_call_audio_handoff_retired");
        }
        await NativeCallsModule.prepareOutgoingAudioHandoffAsync(input.ownerId);
        if (!current()) throw new Error("outgoing_call_audio_handoff_retired");
      } catch (error) {
        retire();
        throw error;
      }
    },
  };
}

export async function presentDebugIosNativeIncomingCall(payload?: Record<string, unknown>) {
  if (!__DEV__ || !NativeCallsModule || !isIosNativeCallsRuntimeEnabled()) return null;
  return NativeCallsModule.presentDebugIncomingCallAsync(payload).catch(() => null);
}
