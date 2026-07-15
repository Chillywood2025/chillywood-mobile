export type ImageUploadFile = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

const HEIC_MIME_TYPES = new Set([
  "image/heic",
  "image/heic-sequence",
  "image/heif",
  "image/heif-sequence",
]);

const HEIC_FILE_EXTENSION_PATTERN = /\.(?:heic|heif)$/iu;

const fileNameFromUri = (uri: string) => {
  const withoutQuery = uri.split(/[?#]/u, 1)[0] ?? "";
  return withoutQuery.split("/").pop()?.trim() ?? "";
};

export const isHeicOrHeifImage = (file: ImageUploadFile) => {
  const mimeType = String(file.mimeType ?? "").trim().toLowerCase();
  if (HEIC_MIME_TYPES.has(mimeType)) return true;

  const fileName = String(file.name ?? "").trim() || fileNameFromUri(String(file.uri ?? "").trim());
  return HEIC_FILE_EXTENSION_PATTERN.test(fileName);
};
