import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

import { SUPABASE_FUNCTIONS_URL, supabase } from "./supabase";

export type MediaStorageProvider = "supabase" | "s3" | "cloudflare_r2";
export type MediaStorageSurfaceType = "creator_video" | "social_attachment";

export type MediaStorageObject = {
  provider: MediaStorageProvider;
  bucket: string;
  objectKey: string;
};

type SignedUploadResponse = MediaStorageObject & {
  uploadUrl: string;
  expiresAt: string;
};

type SignedDownloadResponse = {
  downloadUrl: string;
  expiresAt: string;
};

const MEDIA_STORAGE_FUNCTION_URL = `${SUPABASE_FUNCTIONS_URL.replace(/\/+$/g, "")}/functions/v1/media-storage`;
const SLOW_DOWN_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];
const MEDIA_STORAGE_REQUEST_TIMEOUT_MS = 20000;
const MEDIA_STORAGE_MIN_UPLOAD_TIMEOUT_MS = 45000;
const MEDIA_STORAGE_MAX_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const MEDIA_STORAGE_UPLOAD_TIMEOUT_PER_MB_MS = 3000;

const toText = (value: unknown) => String(value ?? "").trim();
const createClientId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const next = Math.floor(Math.random() * 16);
    const value = char === "x" ? next : (next & 0x3) | 0x8;
    return value.toString(16);
  });

const getUploadExtension = (fileName?: string | null, mimeType?: string | null) => {
  const normalizedName = toText(fileName).toLowerCase();
  const extension = normalizedName.includes(".") ? normalizedName.split(".").pop() : "";
  if (extension && /^[a-z0-9]+$/.test(extension)) return extension;

  const normalizedMime = toText(mimeType).toLowerCase();
  if (normalizedMime.includes("quicktime")) return "mov";
  if (normalizedMime.includes("webm")) return "webm";
  if (normalizedMime.includes("mp4")) return "mp4";
  if (normalizedMime.includes("jpeg")) return "jpg";
  if (normalizedMime.includes("png")) return "png";
  if (normalizedMime.includes("webp")) return "webp";
  return "bin";
};

const getMediaUploadTimeoutMs = (sizeBytes?: number | null) => {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return MEDIA_STORAGE_MIN_UPLOAD_TIMEOUT_MS;
  }

  const sizeMb = Math.ceil(sizeBytes / (1024 * 1024));
  return Math.min(
    MEDIA_STORAGE_MAX_UPLOAD_TIMEOUT_MS,
    Math.max(
      MEDIA_STORAGE_MIN_UPLOAD_TIMEOUT_MS,
      MEDIA_STORAGE_MIN_UPLOAD_TIMEOUT_MS + (sizeMb * MEDIA_STORAGE_UPLOAD_TIMEOUT_PER_MB_MS),
    ),
  );
};

export const normalizeMediaStorageProvider = (value: unknown): MediaStorageProvider => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "s3" || normalized === "hetzner_s3") return "s3";
  if (normalized === "cloudflare_r2" || normalized === "r2") return "cloudflare_r2";
  return "supabase";
};

export const getMediaStorageProviderBucket = (input: {
  provider?: unknown;
  bucket?: unknown;
  fallbackBucket: string;
}) => toText(input.bucket) || input.fallbackBucket;

async function getSignedInAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = toText(data.session?.access_token);
  if (error || !accessToken) {
    throw new Error("Sign in before uploading media.");
  }
  return accessToken;
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number, message: string) {
  if (typeof AbortController === "undefined") {
    return withTimeout(fetch(input, init), timeoutMs, message);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(message);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callMediaStorageFunction<T>(body: Record<string, unknown>): Promise<T> {
  const accessToken = await getSignedInAccessToken();
  const response = await fetchWithTimeout(
    MEDIA_STORAGE_FUNCTION_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    },
    MEDIA_STORAGE_REQUEST_TIMEOUT_MS,
    "Media upload took too long. Try again.",
  );

  const payload = await response.json().catch(() => null) as {
    error?: unknown;
    message?: unknown;
  } | T | null;

  if (!response.ok) {
    throw new Error("Media upload is not available right now.");
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Media upload is not available right now.");
  }

  return payload as T;
}

export async function createSignedMediaUpload(input: {
  surfaceType: MediaStorageSurfaceType;
  objectKey: string;
  mimeType: string;
  sizeBytes?: number | null;
}): Promise<SignedUploadResponse> {
  const payload = await callMediaStorageFunction<SignedUploadResponse>({
    action: "create_upload_url",
    surfaceType: input.surfaceType,
    objectKey: input.objectKey,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes ?? null,
  });

  const provider = normalizeMediaStorageProvider(payload.provider);
  const bucket = toText(payload.bucket);
  const objectKey = toText(payload.objectKey);
  const uploadUrl = toText(payload.uploadUrl);
  const expiresAt = toText(payload.expiresAt);

  if ((provider !== "s3" && provider !== "cloudflare_r2") || !bucket || !objectKey || !uploadUrl) {
    throw new Error("Media upload is not available right now.");
  }

  return {
    provider,
    bucket,
    objectKey,
    uploadUrl,
    expiresAt,
  };
}

export async function createSignedMediaDownload(input: {
  surfaceType: MediaStorageSurfaceType;
  provider: MediaStorageProvider;
  bucket: string;
  objectKey: string;
  recordId?: string | null;
}): Promise<string> {
  if (input.provider !== "s3" && input.provider !== "cloudflare_r2") return "";

  const payload = await callMediaStorageFunction<SignedDownloadResponse>({
    action: "create_download_url",
    surfaceType: input.surfaceType,
    bucket: input.bucket,
    objectKey: input.objectKey,
    recordId: input.recordId ?? null,
  });

  return toText(payload.downloadUrl);
}

export async function deleteStoredMediaObject(input: {
  surfaceType: MediaStorageSurfaceType;
  provider: MediaStorageProvider;
  bucket: string;
  objectKey: string;
  recordId?: string | null;
}): Promise<void> {
  if (input.provider !== "s3" && input.provider !== "cloudflare_r2") return;

  await callMediaStorageFunction<{ ok?: boolean }>({
    action: "delete_object",
    surfaceType: input.surfaceType,
    bucket: input.bucket,
    objectKey: input.objectKey,
    recordId: input.recordId ?? null,
  });
}

class SlowDownUploadError extends Error {
  constructor(message = "Media upload is busy right now. Please try again in a moment.") {
    super(message);
    this.name = "SlowDownUploadError";
  }
}

const wait = (delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs));

const isSlowDownResponse = (status: number, body: string) => (
  status === 503 && /<Code>\s*SlowDown\s*<\/Code>|SlowDown/i.test(body)
);

const waitForSlowDownRetry = async (attemptIndex: number, status: number, body: string) => {
  if (!isSlowDownResponse(status, body)) return false;
  const delayMs = SLOW_DOWN_RETRY_DELAYS_MS[attemptIndex];
  if (!delayMs) throw new SlowDownUploadError();
  await wait(delayMs);
  return true;
};

const assertUploadResponseOk = async (response: Response, attemptIndex = SLOW_DOWN_RETRY_DELAYS_MS.length) => {
  if (response.ok) return;
  const body = await response.text().catch(() => "");
  if (await waitForSlowDownRetry(attemptIndex, response.status, body)) {
    throw new SlowDownUploadError("retry");
  }
  throw new Error(toText(body) || "Unable to upload this media file.");
};

async function uploadFileToSignedUrl(input: {
  uploadUrl: string;
  uri: string;
  mimeType: string;
  fileName?: string | null;
  sizeBytes?: number | null;
}) {
  const preparedUpload = await prepareUploadUri(input);
  try {
    await uploadPreparedFileToSignedUrl({
      ...input,
      uri: preparedUpload.uri,
    });
  } finally {
    await preparedUpload.cleanup();
  }
}

async function prepareUploadUri(input: {
  uri: string;
  mimeType: string;
  fileName?: string | null;
}): Promise<{ uri: string; cleanup: () => Promise<void> }> {
  const normalizedUri = toText(input.uri);
  if (!normalizedUri.startsWith("content://") || !FileSystem.cacheDirectory) {
    return { uri: normalizedUri, cleanup: async () => undefined };
  }

  const cacheUri = `${FileSystem.cacheDirectory}media-upload-${createClientId()}.${getUploadExtension(input.fileName, input.mimeType)}`;
  await withTimeout(
    FileSystem.copyAsync({ from: normalizedUri, to: cacheUri }),
    MEDIA_STORAGE_REQUEST_TIMEOUT_MS,
    "Media file preparation took too long. Try again.",
  );

  return {
    uri: cacheUri,
    cleanup: async () => {
      await FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => undefined);
    },
  };
}

async function uploadPreparedFileToSignedUrl(input: {
  uploadUrl: string;
  uri: string;
  mimeType: string;
  fileName?: string | null;
  sizeBytes?: number | null;
}) {
  const uploadTimeoutMs = getMediaUploadTimeoutMs(input.sizeBytes);

  try {
    for (let attemptIndex = 0; attemptIndex <= SLOW_DOWN_RETRY_DELAYS_MS.length; attemptIndex += 1) {
      const result = await withTimeout(
        FileSystem.uploadAsync(input.uploadUrl, input.uri, {
          httpMethod: "PUT",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            "Content-Type": input.mimeType,
          },
        }),
        uploadTimeoutMs,
        "Media upload took too long. Try again.",
      );

      if (result.status >= 200 && result.status < 300) break;
      if (await waitForSlowDownRetry(attemptIndex, result.status, toText(result.body))) continue;
      throw new Error(toText(result.body) || "Unable to upload this media file.");
    }
    return;
  } catch (error) {
    if (error instanceof SlowDownUploadError) throw error;
    // Android content/file URI handling can vary; try the Blob-style uploader next.
  }

  try {
    for (let attemptIndex = 0; attemptIndex <= SLOW_DOWN_RETRY_DELAYS_MS.length; attemptIndex += 1) {
      try {
        const localFile = new File(input.uri);
        const response = await fetchWithTimeout(
          input.uploadUrl,
          {
            method: "PUT",
            headers: {
              "Content-Type": input.mimeType,
          },
          body: localFile as unknown as Blob,
        },
          uploadTimeoutMs,
          "Media upload took too long. Try again.",
        );
        await assertUploadResponseOk(response, attemptIndex);
        break;
      } catch (error) {
        if (error instanceof SlowDownUploadError && error.message === "retry") continue;
        throw error;
      }
    }
    return;
  } catch (error) {
    if (error instanceof SlowDownUploadError) throw error;
    // Keep one final fetch fallback for platforms that accept React Native file bodies.
  }

  for (let attemptIndex = 0; attemptIndex <= SLOW_DOWN_RETRY_DELAYS_MS.length; attemptIndex += 1) {
    try {
      const response = await fetchWithTimeout(
        input.uploadUrl,
        {
          method: "PUT",
          headers: {
            "Content-Type": input.mimeType,
          },
          body: {
            uri: input.uri,
            name: toText(input.fileName) || "media-upload.bin",
            type: input.mimeType,
          } as unknown as BodyInit,
        },
        uploadTimeoutMs,
        "Media upload took too long. Try again.",
      );
      await assertUploadResponseOk(response, attemptIndex);
      return;
    } catch (error) {
      if (error instanceof SlowDownUploadError && error.message === "retry") continue;
      throw error;
    }
  }
}

const objectHasReadableBytes = async (signedUrl: string, expectedSize?: number | null) => {
  if (!signedUrl) return true;
  const parsed = Number(expectedSize);
  if (!Number.isFinite(parsed) || parsed <= 0) return true;

  for (let attemptIndex = 0; attemptIndex <= SLOW_DOWN_RETRY_DELAYS_MS.length; attemptIndex += 1) {
    try {
      const rangeProbe = await fetchWithTimeout(
        signedUrl,
        { headers: { Range: "bytes=0-0" } },
        MEDIA_STORAGE_REQUEST_TIMEOUT_MS,
        "Media upload verification took too long. Try again.",
      );
      if (rangeProbe.status === 416) return false;
      if (rangeProbe.ok) {
        const body = await rangeProbe.arrayBuffer();
        return body.byteLength > 0;
      }

      const responseBody = await rangeProbe.text().catch(() => "");
      if (await waitForSlowDownRetry(attemptIndex, rangeProbe.status, responseBody)) continue;
      return false;
    } catch {
      return false;
    }
  }

  return false;
};

export async function uploadFileToMediaStorage(input: {
  surfaceType: MediaStorageSurfaceType;
  objectKey: string;
  uri: string;
  mimeType: string;
  fileName?: string | null;
  sizeBytes?: number | null;
}): Promise<MediaStorageObject> {
  const upload = await createSignedMediaUpload({
    surfaceType: input.surfaceType,
    objectKey: input.objectKey,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });

  try {
    await uploadFileToSignedUrl({
      uploadUrl: upload.uploadUrl,
      uri: input.uri,
      mimeType: input.mimeType,
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
    });

    const signedUrl = await createSignedMediaDownload({
      surfaceType: input.surfaceType,
      provider: upload.provider,
      bucket: upload.bucket,
      objectKey: upload.objectKey,
    });
    const hasBytes = await objectHasReadableBytes(signedUrl, input.sizeBytes);

    if (!hasBytes) {
      await deleteStoredMediaObject({
        surfaceType: input.surfaceType,
        provider: upload.provider,
        bucket: upload.bucket,
        objectKey: upload.objectKey,
      }).catch(() => undefined);
      throw new Error("Uploaded media object was empty after upload.");
    }
  } catch (error) {
    await deleteStoredMediaObject({
      surfaceType: input.surfaceType,
      provider: upload.provider,
      bucket: upload.bucket,
      objectKey: upload.objectKey,
    }).catch(() => undefined);
    throw error;
  }

  return {
    provider: upload.provider,
    bucket: upload.bucket,
    objectKey: upload.objectKey,
  };
}
