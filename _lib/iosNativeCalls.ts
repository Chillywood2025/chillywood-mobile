import Constants from "expo-constants";
import * as Application from "expo-application";
import { Platform } from "react-native";

import NativeCallsModule, {
  type NativeCallEvent,
} from "../modules/chillywood-native-calls";
import {
  isCurrentAccountSessionAuthority,
  type AccountSessionAuthorityBinding,
} from "./accountSessionAuthority";
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

let nativeSubscription: { remove(): void } | null = null;
let eventListener: IosNativeCallEventListener | null = null;
const nativeEventSubscribers = new Set<IosNativeCallEventListener>();
const nativePresentationSubscribers = new Set<() => void>();
const nativePresentedCallUuidsByInviteId = new Map<string, string>();
let voipLifecycleGeneration = 0;
let iosNativeApplicationActiveSerial = 0;
const iosNativeAnswerApplicationActiveBaselines = new Map<string, number>();
let voipRegistrationActive = false;
let voipAuthorityContext: IosVoipAuthorityContext | null = null;
let voipTokenLifecycleQueue: Promise<void> = Promise.resolve();
let voipTransitionQueue: Promise<void> = Promise.resolve();

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
  const currentAfterRegistration = await isExactVoipAuthorityCurrent(context);
  if (!currentAfterRegistration) {
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
    if (!voipRegistrationActive || generation !== voipLifecycleGeneration || voipAuthorityContext !== context) return;
    await registerVoipToken(normalizedToken, context);
  });
};

const enqueueVoipTokenInvalidation = (generation: number, context: IosVoipAuthorityContext) => {
  void enqueueVoipTokenLifecycle(async () => {
    if (!voipRegistrationActive || generation !== voipLifecycleGeneration || voipAuthorityContext !== context) return;
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

const clearNativePresentedInvites = () => {
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
    if (!callUuid || nativePresentedCallUuidsByInviteId.get(inviteId) === callUuid) return;
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
  ].includes(event.type) && nativePresentedCallUuidsByInviteId.delete(inviteId)) {
    notifyNativePresentationSubscribers();
  }
};

const handleNativeEvent = (
  event: NativeCallEvent,
  generation: number,
  context: IosVoipAuthorityContext,
) => {
  if (!voipRegistrationActive || generation !== voipLifecycleGeneration || voipAuthorityContext !== context) return;

  if (event.type === "applicationActive") {
    iosNativeApplicationActiveSerial = iosNativeApplicationActiveSerial >= Number.MAX_SAFE_INTEGER
      ? 1
      : iosNativeApplicationActiveSerial + 1;
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
  ].includes(event.type)) {
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
  updateNativePresentationOwnership(sanitizedEvent);
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
) {
  const generation = voipLifecycleGeneration;
  const context = voipAuthorityContext;
  if (!context) return false;
  const readiness = await waitForIosCallKitAnswerRouteReadiness(event, {
    isApplicationActive: readIosNativeApplicationActive,
    isExactContextCurrent: async (candidateEvent: unknown) => {
      const candidate = candidateEvent as SanitizedNativeCallEvent;
      const inviteId = toText(candidate.callInviteId);
      const callUuid = toText(candidate.callUuid).toLowerCase();
      return !!inviteId
        && !!callUuid
        && candidate.nativeEventGeneration === generation
        && voipRegistrationActive
        && generation === voipLifecycleGeneration
        && context === voipAuthorityContext
        && nativePresentedCallUuidsByInviteId.get(inviteId) === callUuid
        && await isExactVoipAuthorityCurrent(context);
    },
  });
  return readiness === "ready";
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

export async function startIosNativeCallsReadiness(
  authority: AccountSessionAuthorityBinding,
  listener?: IosNativeCallEventListener,
): Promise<IosVoipRegistrationState> {
  return runVoipTransition(async () => {
    const apnsEnvironment = readApnsEnvironment();
    const readiness = await readIosNativeCallsReadiness();
    const generation = ++voipLifecycleGeneration;
    iosNativeApplicationActiveSerial = 0;
    iosNativeAnswerApplicationActiveBaselines.clear();
    clearNativeCallTransitionClaims("ios");
    voipRegistrationActive = false;
    voipAuthorityContext = null;
    nativeSubscription?.remove();
    nativeSubscription = null;
    eventListener = null;
    clearNativePresentedInvites();

    // Let any request from the previous lifecycle finish before a new native
    // listener can enqueue work under the next authenticated account state.
    await waitForVoipTokenLifecycle();

    if (!readiness.available || !NativeCallsModule) {
      await NativeCallsModule?.stopVoipRegistrationAsync().catch(() => false);
      return { apnsEnvironment, status: "disabled", tokenFingerprint: null };
    }
    if (authority.restoreOnly || authority.accountId !== authority.userId
      || !await isCurrentAccountSessionAuthority(authority)) {
      await NativeCallsModule.stopVoipRegistrationAsync().catch(() => false);
      return { apnsEnvironment, status: "error", tokenFingerprint: null };
    }

    const context: IosVoipAuthorityContext = {
      authority: { ...authority },
      installId: await getNotificationInstallId(),
      revocationCredential: await getNotificationRevocationCredential(),
    };

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
    const started = await NativeCallsModule.startVoipRegistrationAsync(
      context.authority.userId,
      context.authority.accountId,
      context.authority.sessionGeneration,
      context.installId,
    ).catch(() => false);
    const authorityStillCurrent = started && await isExactVoipAuthorityCurrent(context);
    if ((!started || !authorityStillCurrent) && generation === voipLifecycleGeneration) {
      voipRegistrationActive = false;
      voipAuthorityContext = null;
      nativeSubscription?.remove();
      nativeSubscription = null;
      eventListener = null;
      await NativeCallsModule.stopVoipRegistrationAsync().catch(() => false);
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
  return NativeCallsModule.completeAnswerAsync(callUuid, connected).then(() => true).catch(() => false);
}

export async function requestIosNativeCallAnswer(inviteId: string) {
  if (
    !NativeCallsModule
    || typeof NativeCallsModule.requestAnswerAsync !== "function"
    || !isIosNativeCallsRuntimeEnabled()
    || !voipRegistrationActive
  ) return false;
  const normalizedInviteId = toText(inviteId);
  const callUuid = nativePresentedCallUuidsByInviteId.get(normalizedInviteId);
  if (!normalizedInviteId || !callUuid) return false;
  return NativeCallsModule.requestAnswerAsync(callUuid, normalizedInviteId)
    .then((requested) => requested === true)
    .catch(() => false);
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

export async function presentDebugIosNativeIncomingCall(payload?: Record<string, unknown>) {
  if (!__DEV__ || !NativeCallsModule || !isIosNativeCallsRuntimeEnabled()) return null;
  return NativeCallsModule.presentDebugIncomingCallAsync(payload).catch(() => null);
}
