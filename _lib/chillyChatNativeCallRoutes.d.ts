export type ChillyChatNativeCallRoute = {
  destination: string;
  requestKey: string;
};

export function resolveChillyChatNativeCallRoute(
  value?: string | null,
): ChillyChatNativeCallRoute | null;

export function redirectChillyChatNativeCallSystemPath(
  value?: string | null,
): string;
