import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { Platform } from "react-native";

import NativeCallsModule, {
  type NativeCallEvent,
} from "../modules/chillywood-native-calls";
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

export type SanitizedNativeCallEvent = Omit<NativeCallEvent, "token">;
export type IosNativeCallEventListener = (event: SanitizedNativeCallEvent) => void;

export type IosVoipRegistrationState = {
  apnsEnvironment: "development" | "production";
  status: "disabled" | "error" | "not_registered" | "registered" | "revoked" | "started";
  tokenFingerprint: string | null;
};

const INSTALL_ID_STORAGE_KEY = "chillywood.notification.install_id.v1";
const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

let nativeSubscription: { remove(): void } | null = null;
let eventListener: IosNativeCallEventListener | null = null;
let voipLifecycleGeneration = 0;
let voipRegistrationActive = false;
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

const buildClientId = () => (
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/gu, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  })
);

const readInstallId = async () => {
  const existing = toText(await AsyncStorage.getItem(INSTALL_ID_STORAGE_KEY));
  if (existing) return existing;
  const next = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : buildClientId();
  await AsyncStorage.setItem(INSTALL_ID_STORAGE_KEY, next);
  return next;
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
  return isExplicitlyEnabled(
    process.env.EXPO_PUBLIC_IOS_NATIVE_CALLS_ENABLED
      || communication.iosNativeCallsEnabled
      || runtime.iosNativeCallsEnabled,
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

const sanitizeNativeEvent = (event: NativeCallEvent): SanitizedNativeCallEvent => {
  const { token: _token, ...sanitized } = event;
  return sanitized;
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

const registerVoipToken = async (token: string): Promise<IosVoipRegistrationState> => {
  const apnsEnvironment = readApnsEnvironment();
  const installId = await readInstallId();
  const { data, error } = await supabase.functions.invoke("ios-voip-push-tokens", {
    body: {
      action: "register",
      apnsEnvironment,
      appVersion: Application.nativeApplicationVersion,
      buildVersion: Application.nativeBuildVersion,
      installId,
      token,
    },
  });
  if (error) return { apnsEnvironment, status: "error", tokenFingerprint: null };

  const payload = data as { status?: unknown; tokenFingerprint?: unknown } | null;
  return {
    apnsEnvironment,
    status: toText(payload?.status) === "registered" || toText(payload?.status) === "rotated"
      ? "registered"
      : "error",
    tokenFingerprint: toText(payload?.tokenFingerprint) || null,
  };
};

const revokeBackendVoipRegistration = async (): Promise<IosVoipRegistrationState> => {
  const apnsEnvironment = readApnsEnvironment();
  const installId = await readInstallId();
  const { error } = await supabase.functions.invoke("ios-voip-push-tokens", {
    body: { action: "revoke", apnsEnvironment, installId },
  });
  return {
    apnsEnvironment,
    status: error ? "error" : "revoked",
    tokenFingerprint: null,
  };
};

const enqueueVoipTokenRegistration = (token: string, generation: number) => {
  const normalizedToken = toText(token);
  if (!normalizedToken) return;

  void enqueueVoipTokenLifecycle(async () => {
    if (!voipRegistrationActive || generation !== voipLifecycleGeneration) return;
    await registerVoipToken(normalizedToken);
  });
};

const enqueueVoipTokenInvalidation = (generation: number) => {
  void enqueueVoipTokenLifecycle(async () => {
    if (!voipRegistrationActive || generation !== voipLifecycleGeneration) return;
    await revokeBackendVoipRegistration();
  });
};

const handleNativeEvent = (event: NativeCallEvent, generation: number) => {
  if (!voipRegistrationActive || generation !== voipLifecycleGeneration) return;

  if (event.type === "voipTokenUpdated") {
    enqueueVoipTokenRegistration(event.token ?? "", generation);
  } else if (event.type === "voipTokenInvalidated") {
    // Keep PKPushRegistry active so Apple can deliver a rotated token. Logout
    // and account transitions use revokeIosVoipRegistration(), which also
    // stops native registration.
    enqueueVoipTokenInvalidation(generation);
  }

  eventListener?.(sanitizeNativeEvent(event));
};

export async function startIosNativeCallsReadiness(
  listener?: IosNativeCallEventListener,
): Promise<IosVoipRegistrationState> {
  return runVoipTransition(async () => {
    const apnsEnvironment = readApnsEnvironment();
    const readiness = await readIosNativeCallsReadiness();
    const generation = ++voipLifecycleGeneration;
    voipRegistrationActive = false;
    nativeSubscription?.remove();
    nativeSubscription = null;
    eventListener = null;

    // Let any request from the previous lifecycle finish before a new native
    // listener can enqueue work under the next authenticated account state.
    await waitForVoipTokenLifecycle();

    if (!readiness.available || !NativeCallsModule) {
      return { apnsEnvironment, status: "disabled", tokenFingerprint: null };
    }

    voipRegistrationActive = true;
    eventListener = listener ?? null;
    nativeSubscription = NativeCallsModule.addListener(
      "onNativeCallEvent",
      (event) => handleNativeEvent(event, generation),
    );

    const pending = await NativeCallsModule.getPendingEventsAsync().catch(() => []);
    pending.forEach((event) => handleNativeEvent(event, generation));
    const started = await NativeCallsModule.startVoipRegistrationAsync().catch(() => false);
    if (!started && generation === voipLifecycleGeneration) {
      voipRegistrationActive = false;
      nativeSubscription?.remove();
      nativeSubscription = null;
      eventListener = null;
    }
    return {
      apnsEnvironment,
      status: started ? "started" : "error",
      tokenFingerprint: null,
    };
  });
}

export async function readIosVoipRegistrationStatus(): Promise<IosVoipRegistrationState> {
  const apnsEnvironment = readApnsEnvironment();
  const readiness = await readIosNativeCallsReadiness();
  if (!readiness.available) return { apnsEnvironment, status: "disabled", tokenFingerprint: null };

  const installId = await readInstallId();
  const { data, error } = await supabase.functions.invoke("ios-voip-push-tokens", {
    body: { action: "status", apnsEnvironment, installId },
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
    voipRegistrationActive = false;
    nativeSubscription?.remove();
    nativeSubscription = null;
    eventListener = null;
    await NativeCallsModule?.stopVoipRegistrationAsync().catch(() => false);

    // An already-issued request cannot be aborted reliably. Waiting before the
    // final revoke guarantees that it cannot reactivate this install afterward.
    await waitForVoipTokenLifecycle();
    return revokeBackendVoipRegistration();
  });
}

export async function dispatchIosVoipIncomingCall(inviteId: string) {
  if (!isIosNativeCallsRuntimeEnabled()) {
    return { eligible: false, reason: "runtime_disabled", status: "disabled" } as const;
  }
  const normalizedInviteId = toText(inviteId);
  if (!normalizedInviteId) return { eligible: false, reason: "missing_invite_id", status: "error" } as const;
  const { data, error } = await supabase.functions.invoke("ios-voip-call-dispatch", {
    body: { inviteId: normalizedInviteId },
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
