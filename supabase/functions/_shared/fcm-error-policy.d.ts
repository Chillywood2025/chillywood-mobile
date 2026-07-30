export function readFcmProviderErrorCode(input: {
  body: unknown;
  httpStatus: number;
  responseOk: boolean;
}): string | null;

export function isPermanentFcmTokenError(value?: string | null): boolean;
