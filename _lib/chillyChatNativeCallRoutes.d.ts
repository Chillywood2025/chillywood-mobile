export type ChillyChatNativeCallRoute = {
  destination: string;
  requestKey: string;
  threadId: string;
};

export type AndroidNativeCallActionPayload = {
  callInviteId: string;
  captureGeneration: number;
  createdAt: number;
  nativeCallAction: "answer" | "decline";
  requestKey: string;
  schemaVersion: 2;
  threadId: string;
};

export function resolveChillyChatNativeCallRoute(
  value?: string | null,
): ChillyChatNativeCallRoute | null;

export function resolveChillyChatNativeCallActionPayload(
  value?: unknown,
): AndroidNativeCallActionPayload | null;

export function resolveAuthoritativeNativeCallDecline<T extends {
  calleeUserId: string;
  callerUserId: string;
  id: string;
  status: string;
  threadId: string;
}>(input?: {
  currentUserId?: string;
  expectedInviteId?: string;
  expectedThreadId?: string;
  invite?: T | null;
} | null): T | null;

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
