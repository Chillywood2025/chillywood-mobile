export type CreatorVideoObjectKind = "source" | "thumbnail";

export type CreatorVideoObjectAuthorityInput = {
  ownerId: string;
  storageProvider: string;
  storageBucket: string;
  storageObjectKey?: string | null;
  storagePath?: string | null;
  thumbnailStoragePath?: string | null;
  requestedBucket: string;
  requestedObjectKey: string;
  legacyMigrationAuditVerified?: boolean;
};

const normalize = (value: unknown) => String(value ?? "").trim();

const objectKeyOwner = (objectKey: string) => objectKey.split("/")[0] ?? "";

const LEGACY_R2_KEY_PREFIXES = [
  "originals/",
  "uploads/",
  "source/",
  "processing/",
  "quarantine/",
] as const;

const isSupportedProvider = (value: string) => value === "s3" || value === "cloudflare_r2";

const isAuditedLegacyR2Key = (provider: string, objectKey: string, auditVerified: boolean) => (
  auditVerified
  && provider === "cloudflare_r2"
  && LEGACY_R2_KEY_PREFIXES.some((prefix) => objectKey.startsWith(prefix))
);

/**
 * Resolves the exact creator-video object represented by a videos row.
 *
 * New app-issued objects must retain the row owner's UUID as their first path
 * segment. A bounded exception exists for verified R2 migration keys whose
 * exact table/row/provider/bucket/key provenance is recorded by the private
 * immutable migration audit.
 */
export const resolveCreatorVideoObjectAuthority = (
  input: CreatorVideoObjectAuthorityInput,
): CreatorVideoObjectKind | null => {
  const ownerId = normalize(input.ownerId);
  const provider = normalize(input.storageProvider).toLowerCase();
  const rowBucket = normalize(input.storageBucket);
  const requestedBucket = normalize(input.requestedBucket);
  const requestedObjectKey = normalize(input.requestedObjectKey);
  const sourceObjectKey = normalize(input.storageObjectKey) || normalize(input.storagePath);
  const thumbnailObjectKey = normalize(input.thumbnailStoragePath);

  if (
    !ownerId
    || !isSupportedProvider(provider)
    || !rowBucket
    || rowBucket !== requestedBucket
    || !requestedObjectKey
  ) {
    return null;
  }

  const kind = requestedObjectKey === sourceObjectKey
    ? "source"
    : requestedObjectKey === thumbnailObjectKey
    ? "thumbnail"
    : null;
  if (!kind) return null;

  if (objectKeyOwner(requestedObjectKey) === ownerId) return kind;

  return isAuditedLegacyR2Key(
      provider,
      requestedObjectKey,
      input.legacyMigrationAuditVerified === true,
    )
    ? kind
    : null;
};
