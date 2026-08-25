export type NativeCallEvent = {
  type: string;
  callUuid?: string;
  callInviteId?: string;
  threadId?: string;
  callType?: "voice" | "video";
  token?: string;
  reason?: string;
};

export type NativeCallsModule = {
  addListener(eventName: "onNativeCallEvent", listener: (event: NativeCallEvent) => void): { remove(): void };
  removeAllListeners(eventName: "onNativeCallEvent"): void;
  isBuildEnabledAsync(): Promise<boolean>;
  startVoipRegistrationAsync(
    userId: string,
    accountId: string,
    sessionGeneration: string,
    installId: string,
  ): Promise<boolean>;
  stopVoipRegistrationAsync(): Promise<boolean>;
  getPendingEventsAsync(): Promise<NativeCallEvent[]>;
  reportIncomingCallAsync(payload: Record<string, unknown>): Promise<string>;
  endCallAsync(callUuid: string, reason?: string): Promise<void>;
  reportRemoteEndAsync(callUuid: string, reason?: string): Promise<void>;
  completeAnswerAsync(callUuid: string, connected: boolean): Promise<void>;
  setMutedAsync(callUuid: string, muted: boolean): Promise<void>;
  setAudioRouteAsync(route: "speaker" | "receiver" | "system"): Promise<void>;
  presentDebugIncomingCallAsync(payload?: Record<string, unknown>): Promise<string>;
};

declare const module: NativeCallsModule | null;
export default module;
