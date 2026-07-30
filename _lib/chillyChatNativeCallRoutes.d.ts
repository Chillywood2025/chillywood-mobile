export type ChillyChatNativeCallRoute = {
  destination: string;
  requestKey: string;
};

export function resolveChillyChatNativeCallRoute(
  value?: string | null,
): ChillyChatNativeCallRoute | null;

export function resolveChillyChatNativeCallActionPayload(
  value?: unknown,
): ChillyChatNativeCallRoute | null;

export function redirectChillyChatNativeCallSystemPath(
  value?: string | null,
): string;

export type ChillyChatNativeCallRouteBuffer = {
  capture(value?: string | null): boolean;
  subscribe(
    listener: (route: ChillyChatNativeCallRoute) => void,
  ): () => void;
};

export function createChillyChatNativeCallRouteBuffer():
  ChillyChatNativeCallRouteBuffer;
