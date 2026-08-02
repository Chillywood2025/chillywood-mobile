export type ChillyChatNativeCallRoute = {
  destination: string;
  requestKey: string;
  threadId: string;
};

export type AndroidNativeCallActionPayload = {
  callInviteId: string;
  createdAt: number;
  nativeCallAction: "answer" | "decline";
  requestKey: string;
  schemaVersion: 2;
  threadId: string;
};

export type TrustedAndroidNativeCallAction = AndroidNativeCallActionPayload & {
  consumedAt: number;
  platform: "android";
  source: "native_action_store";
};

export function resolveChillyChatNativeCallRoute(
  value?: string | null,
): ChillyChatNativeCallRoute | null;

export function resolveChillyChatNativeCallActionPayload(
  value?: unknown,
): AndroidNativeCallActionPayload | null;

export function redirectChillyChatNativeCallSystemPath(
  value?: string | null,
): string;

export type ChillyChatNativeCallRouteBuffer = {
  capture(value?: string | null): boolean;
  subscribe(
    listener: (route: ChillyChatNativeCallRoute) => void,
  ): () => void;
};

export function createChillyChatNativeCallRouteBuffer(): ChillyChatNativeCallRouteBuffer;

export type AndroidNativeCallProvenanceRegistry = {
  registerConsumedNativeStorePayload(
    value?: unknown,
  ): ChillyChatNativeCallRoute | null;
  consumeForThread(threadId?: string | null): TrustedAndroidNativeCallAction | null;
  clear(): void;
  subscribe(listener: (event: { threadId: string }) => void): () => void;
};

export function createAndroidNativeCallProvenanceRegistry(input?: {
  now?: () => number;
  ttlMs?: number;
}): AndroidNativeCallProvenanceRegistry;

export function registerConsumedAndroidNativeCallAction(
  value?: unknown,
): ChillyChatNativeCallRoute | null;

export function consumeTrustedAndroidNativeCallActionForThread(
  threadId?: string | null,
): TrustedAndroidNativeCallAction | null;

export function subscribeToTrustedAndroidNativeCallActions(
  listener: (event: { threadId: string }) => void,
): () => void;

export function clearTrustedAndroidNativeCallActions(): void;
