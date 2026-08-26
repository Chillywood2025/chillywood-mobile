export type MediaUploadReservationExpectation = {
  mimeType: string;
  sizeBytes: number;
};

export type ObservedMediaObject = {
  mimeType: string;
  sizeBytes: number;
};

export const PRIVATE_MEDIA_DOWNLOAD_EXPIRES_SECONDS = 45;
export const CREATOR_VIDEO_UPLOAD_EXPIRES_SECONDS = 60 * 60;
export const SOCIAL_ATTACHMENT_UPLOAD_EXPIRES_SECONDS = 15 * 60;

export const normalizeMediaContentType = (value: unknown) => String(value ?? "")
  .trim()
  .toLowerCase()
  .split(";", 1)[0]
  .trim();

export const buildRequiredUploadHeaders = (mimeType: string, sizeBytes: number) => ({
  "content-length": String(sizeBytes),
  "content-type": normalizeMediaContentType(mimeType),
  "if-none-match": "*",
});

export const buildCanonicalSignedHeaders = (
  host: string,
  headers: Record<string, string>,
) => {
  const normalizedHeaders = Object.entries({ ...headers, host: host.trim().toLowerCase() })
    .map(([name, value]) => [name.trim().toLowerCase(), value.trim().replace(/\s+/g, " ")] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return {
    canonicalHeaders: normalizedHeaders.map(([name, value]) => `${name}:${value}\n`).join(""),
    signedHeaders: normalizedHeaders.map(([name]) => name).join(";"),
  };
};

export const readObservedMediaObject = (headers: Headers): ObservedMediaObject | null => {
  const mimeType = normalizeMediaContentType(headers.get("content-type"));
  const rawSize = String(headers.get("content-length") ?? "").trim();
  const sizeBytes = Number(rawSize);
  if (!mimeType || !rawSize || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) return null;
  return { mimeType, sizeBytes };
};

export const matchesUploadReservation = (
  expected: MediaUploadReservationExpectation,
  observed: ObservedMediaObject | null,
) => !!observed
  && normalizeMediaContentType(expected.mimeType) === observed.mimeType
  && expected.sizeBytes === observed.sizeBytes;

export const classifyConditionalUploadStatus = (status: number) => {
  if (status >= 200 && status < 300) return "created" as const;
  if (status === 412) return "already_exists" as const;
  return "failed" as const;
};
