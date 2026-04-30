import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

import { SUPABASE_URL, supabase } from "./supabase";

export type MediaStorageProvider = "supabase" | "s3";
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

const MEDIA_STORAGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/media-storage`;
const SLOW_DOWN_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

const toText = (value: unknown) => String(value ?? "").trim();

export const normalizeMediaStorageProvider = (value: unknown): MediaStorageProvider => (
  toText(value).toLowerCase() === "s3" ? "s3" : "supabase"
);

export const getMediaStorageProviderBucket = (input: {
  provider?: unknown;
  bucket?: unknown;
  fallbackBucket: string;
}) => toText(input.bucket) || input.fallbackBucket;

async function getSignedInAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = toText(data.session?.access_token);
  if (error || !accessToken) {
    throw new Error("Sign in before using media storage.");
  }
  return accessToken;
}

async function callMediaStorageFunction<T>(body: Record<string, unknown>): Promise<T> {
  const accessToken = await getSignedInAccessToken();
  const response = await fetch(MEDIA_STORAGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null) as {
    error?: unknown;
    message?: unknown;
  } | T | null;

  if (!response.ok) {
    const message = toText((payload as { message?: unknown } | null)?.message)
      || "Media storage is not available right now.";
    throw new Error(message);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Media storage returned an invalid response.");
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

  if (provider !== "s3" || !bucket || !objectKey || !uploadUrl) {
    throw new Error("Media storage returned an incomplete upload contract.");
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
  if (input.provider !== "s3") return "";

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
  if (input.provider !== "s3") return;

  await callMediaStorageFunction<{ ok?: boolean }>({
    action: "delete_object",
    surfaceType: input.surfaceType,
    bucket: input.bucket,
    objectKey: input.objectKey,
    recordId: input.recordId ?? null,
  });
}

class SlowDownUploadError extends Error {
  constructor(message = "Media storage is busy right now. Please try again in a moment.") {
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
}) {
  try {
    for (let attemptIndex = 0; attemptIndex <= SLOW_DOWN_RETRY_DELAYS_MS.length; attemptIndex += 1) {
      const result = await FileSystem.uploadAsync(input.uploadUrl, input.uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          "Content-Type": input.mimeType,
        },
      });

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
        const response = await fetch(input.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": input.mimeType,
          },
          body: localFile as unknown as Blob,
        });
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
      const response = await fetch(input.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": input.mimeType,
        },
        body: {
          uri: input.uri,
          name: toText(input.fileName) || "media-upload.bin",
          type: input.mimeType,
        } as unknown as BodyInit,
      });
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
      const rangeProbe = await fetch(signedUrl, { headers: { Range: "bytes=0-0" } });
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

  await uploadFileToSignedUrl({
    uploadUrl: upload.uploadUrl,
    uri: input.uri,
    mimeType: input.mimeType,
    fileName: input.fileName,
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

  return {
    provider: upload.provider,
    bucket: upload.bucket,
    objectKey: upload.objectKey,
  };
}
