export type ChillyChatNativeCallRoute = {
  destination: string;
  requestKey: string;
};

export function resolveChillyChatNativeCallRoute(
  value?: string | null,
): ChillyChatNativeCallRoute | null;
