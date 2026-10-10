import { DeviceEventEmitter, NativeModules, Platform } from "react-native";

import { LiveKitAudioSession } from "./react-native-module";

export type OwnedAudioRoute = Readonly<{
  owner: string;
  supported: boolean;
  selected: "speaker" | "earpiece" | "other" | "none";
  available: readonly string[];
}>;

type OwnedAudioBridge = {
  acquireOwnedAudioSession(owner: string, defaultOutput: "speaker" | "earpiece" | "system"): Promise<unknown>;
  releaseOwnedAudioSession(owner: string): Promise<unknown>;
  readOwnedAudioRoute(owner: string): Promise<unknown>;
  selectOwnedAudioOutput(owner: string, output: "speaker" | "earpiece"): Promise<unknown>;
};

let nextOwner = 0;
const ownerEpoch = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const retiredAndroidSessions = new Set<() => Promise<void>>();

// Retain failed teardown beyond a component's lifetime. A later owner cannot
// silently replace unproved cleanup, and explicit End can retry retired leases.
export async function retryRetiredAndroidAudioSessions() {
  await Promise.all([...retiredAndroidSessions].map((cleanup) => cleanup()));
}

const readReceipt = (value: unknown, owner: string): OwnedAudioRoute => {
  const receipt = value as Partial<OwnedAudioRoute> | null;
  if (!receipt || receipt.owner !== owner || typeof receipt.supported !== "boolean"
    || !["speaker", "earpiece", "other", "none"].includes(String(receipt.selected))
    || !Array.isArray(receipt.available)
    || receipt.available.some((output) => !["speaker", "earpiece", "other"].includes(output))) {
    throw new Error("The native audio route could not be confirmed.");
  }
  return Object.freeze({
    owner, supported: receipt.supported, selected: receipt.selected!,
    available: Object.freeze([...new Set(receipt.available)]),
  });
};

/** One captured native owner per media session; never reuse it after cleanup. */
export function createOwnedAudioSession(defaultOutput: "speaker" | "earpiece" | "system" = "system") {
  const owner = `audio-${ownerEpoch}-${++nextOwner}`;
  const android = Platform.OS === "android";
  const bridge = NativeModules?.LivekitReactNativeModule as OwnedAudioBridge | undefined;
  let retired = false;
  let acquisitionIssued = false;
  let cleanupComplete = false;
  let startTask: Promise<void> | null = null;
  let stopTask: Promise<void> | null = null;
  const current = () => {
    if (retired) throw new Error("This audio session has ended.");
  };
  const native = () => {
    if (!bridge || typeof bridge.acquireOwnedAudioSession !== "function"
      || typeof bridge.releaseOwnedAudioSession !== "function"
      || typeof bridge.readOwnedAudioRoute !== "function"
      || typeof bridge.selectOwnedAudioOutput !== "function") {
      throw new Error("Owned native audio routing is unavailable in this build.");
    }
    return bridge;
  };
  const cleanup = (): Promise<void> => {
    if (!stopTask) stopTask = (async () => {
      if (android) {
        if (acquisitionIssued && await native().releaseOwnedAudioSession(owner) !== true) {
          throw new Error("Audio session cleanup could not be confirmed.");
        }
        retiredAndroidSessions.delete(cleanup);
      } else await LiveKitAudioSession.stopAudioSession();
      cleanupComplete = true;
    })().catch((error) => { stopTask = null; throw error; });
    return stopTask;
  };
  return {
    owner,
    observe(onReceipt: (receipt: OwnedAudioRoute) => void, onUnavailable: () => void) {
      if (!android || !DeviceEventEmitter?.addListener) return { remove() {} };
      return DeviceEventEmitter.addListener("ChillywoodAndroidAudioRouteChanged", (value: unknown) => {
        if (retired || (value as Partial<OwnedAudioRoute> | null)?.owner !== owner) return;
        try { onReceipt(readReceipt(value, owner)); }
        catch { onUnavailable(); }
      });
    },
    async start() {
      current();
      if (!startTask) {
        startTask = (async () => {
          if (android) {
            await retryRetiredAndroidAudioSessions();
            current();
            const api = native();
            acquisitionIssued = true;
            readReceipt(await api.acquireOwnedAudioSession(owner, defaultOutput), owner);
          }
          else await LiveKitAudioSession.startAudioSession();
          current();
        })().catch((error) => { startTask = null; throw error; });
      }
      await startTask;
      current();
    },
    async readRoute(): Promise<OwnedAudioRoute> {
      current();
      if (!android) throw new Error("This route readback is Android only.");
      const receipt = readReceipt(await native().readOwnedAudioRoute(owner), owner);
      current();
      return receipt;
    },
    async select(output: "speaker" | "earpiece"): Promise<OwnedAudioRoute> {
      current();
      if (!android) throw new Error("This route selection is Android only.");
      const receipt = readReceipt(await native().selectOwnedAudioOutput(owner, output), owner);
      current();
      if (!receipt.supported || receipt.selected !== output || !receipt.available.includes(output)) {
        throw new Error("The requested audio output was not confirmed.");
      }
      return receipt;
    },
    stop(): Promise<void> {
      // Revoke before awaiting the bridge: a late start/read/select cannot
      // publish success or reacquire an owner that End already retired.
      retired = true;
      if (android && acquisitionIssued && !cleanupComplete) retiredAndroidSessions.add(cleanup);
      return cleanup();
    },
  };
}

export type OwnedAudioSession = ReturnType<typeof createOwnedAudioSession>;
