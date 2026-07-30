export type ChillyChatNativeCallRoute = {
  destination: string;
  requestKey: string;
};

export const CHILLY_CHAT_NATIVE_CALL_INITIAL_ROUTE_RETRY_DELAYS_MS:
  readonly number[];

export function resolveChillyChatNativeCallRoute(
  value?: string | null,
): ChillyChatNativeCallRoute | null;
