export type MediaObjectStorageProvider =
  | "hetzner_s3"
  | "cloudflare_r2"
  | "supabase_storage"
  | "unknown";

export type MediaObjectStorageReference = {
  tableName: string;
  rowId: string;
  sourceType?: string | null;
  sourceId?: string | null;
  storageProvider?: string | null;
  storageBucket?: string | null;
  storageObjectKey?: string | null;
  storagePath?: string | null;
  visibility?: string | null;
  accessTier?: string | null;
  scanStatus?: string | null;
  moderationStatus?: string | null;
  isOriginal?: boolean | null;
  liveKitRelated?: boolean | null;
};

export type MediaObjectStorageManifestEntry = {
  migrationId: string;
  tableName: string;
  rowId: string;
  sourceType: string;
  sourceId: string;
  sourceProvider: "hetzner_s3";
  sourceBucket: string;
  sourceObjectKeyRedacted: true;
  targetProvider: "cloudflare_r2";
  targetBucket: string;
  targetObjectKey: string;
  visibility: string;
  accessTier: string;
  scanStatus: string;
  moderationStatus: string;
  isOriginal: boolean;
  copyStatus: "not_started" | "blocked" | "verified";
  verifyStatus: "not_started" | "blocked" | "verified";
  dbUpdateStatus: "not_started" | "blocked_until_copy_verified" | "updated";
  rollbackStatus: "not_started" | "hetzner_fallback_retained";
};

export type MediaObjectStorageInventorySummary = {
  totalReferences: number;
  hetznerObjectStorageReferences: number;
  r2References: number;
  supabaseStorageReferences: number;
  migrationCandidates: number;
  liveKitReferences: number;
  blockedOrUnknownReferences: number;
};

export const MEDIA_ORIGIN_PROVIDER = "cloudflare_r2";
export const MEDIA_ORIGIN_BUCKET = "chillywood-media-origin";
export const LEGACY_HETZNER_BUCKET = "chillywood-media-prod";

const text = (value: unknown) => String(value ?? "").trim();

const slug = (value: unknown) => {
  const normalized = text(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "unknown";
};

export const normalizeMediaObjectStorageProvider = (value: unknown): MediaObjectStorageProvider => {
  const normalized = text(value).toLowerCase();
  if (normalized === "s3" || normalized === "hetzner" || normalized === "hetzner_s3") return "hetzner_s3";
  if (normalized === "cloudflare_r2" || normalized === "r2") return "cloudflare_r2";
  if (normalized === "supabase" || normalized === "supabase_storage") return "supabase_storage";
  return "unknown";
};

export const isHetznerObjectStorageReference = (reference: MediaObjectStorageReference) => {
  if (reference.liveKitRelated === true) return false;
  const provider = normalizeMediaObjectStorageProvider(reference.storageProvider);
  const bucket = text(reference.storageBucket);
  return provider === "hetzner_s3" || bucket === LEGACY_HETZNER_BUCKET;
};

export const isLiveKitHetznerReference = (value: unknown) => {
  const normalized = text(value).toLowerCase();
  return normalized.includes("live.chillywoodstream.com") || normalized.includes("chillywood-prod-01");
};

export const buildR2OriginObjectKey = (reference: MediaObjectStorageReference) => {
  const tableName = slug(reference.tableName);
  const sourceType = slug(reference.sourceType || reference.tableName);
  const sourceId = slug(reference.sourceId || reference.rowId);
  const rowId = slug(reference.rowId);
  const original = reference.isOriginal === true || text(reference.accessTier).toLowerCase() === "owner";
  const prefix = original ? "originals" : "source";
  return `${prefix}/${tableName}/${sourceType}/${sourceId}/${rowId}`;
};

export const validateR2OriginTarget = (input: {
  targetBucket: string;
  targetObjectKey: string;
  publicDomain?: string | null;
}) => {
  const bucket = text(input.targetBucket);
  const objectKey = text(input.targetObjectKey);
  const publicDomain = text(input.publicDomain).toLowerCase();
  const allowedPrefix = /^(originals|uploads|source|processing|quarantine)\//.test(objectKey);
  const forbiddenPublicPrefix = objectKey.startsWith("playback/public/")
    || objectKey.startsWith("playback/protected/")
    || objectKey.startsWith("playback/premium/");
  const forbiddenPublicBucket = bucket.includes("public") || bucket.includes("playback");
  const forbiddenDomain = publicDomain.includes("media.chillywoodstream.com");
  return {
    ok: bucket === MEDIA_ORIGIN_BUCKET
      && allowedPrefix
      && !forbiddenPublicPrefix
      && !forbiddenPublicBucket
      && !forbiddenDomain,
    allowedPrefix,
    forbiddenPublicPrefix,
    forbiddenPublicBucket,
    forbiddenDomain,
    privateOriginBucket: bucket === MEDIA_ORIGIN_BUCKET,
  };
};

export const buildMediaObjectStorageMigrationManifest = (input: {
  migrationId: string;
  references: MediaObjectStorageReference[];
  targetBucket?: string | null;
}) => {
  const targetBucket = text(input.targetBucket) || MEDIA_ORIGIN_BUCKET;
  return input.references
    .filter(isHetznerObjectStorageReference)
    .map((reference): MediaObjectStorageManifestEntry => {
      const targetObjectKey = buildR2OriginObjectKey(reference);
      const targetValidation = validateR2OriginTarget({ targetBucket, targetObjectKey });
      return {
        migrationId: text(input.migrationId) || "media-object-storage-r2-migration",
        tableName: text(reference.tableName),
        rowId: text(reference.rowId),
        sourceType: text(reference.sourceType || reference.tableName),
        sourceId: text(reference.sourceId || reference.rowId),
        sourceProvider: "hetzner_s3",
        sourceBucket: text(reference.storageBucket) || LEGACY_HETZNER_BUCKET,
        sourceObjectKeyRedacted: true,
        targetProvider: "cloudflare_r2",
        targetBucket,
        targetObjectKey,
        visibility: text(reference.visibility) || "unknown",
        accessTier: text(reference.accessTier) || "unknown",
        scanStatus: text(reference.scanStatus) || "unknown",
        moderationStatus: text(reference.moderationStatus) || "unknown",
        isOriginal: reference.isOriginal === true,
        copyStatus: targetValidation.ok ? "not_started" : "blocked",
        verifyStatus: targetValidation.ok ? "not_started" : "blocked",
        dbUpdateStatus: "blocked_until_copy_verified",
        rollbackStatus: "hetzner_fallback_retained",
      };
    });
};

export const summarizeMediaObjectStorageInventory = (
  references: MediaObjectStorageReference[],
): MediaObjectStorageInventorySummary => references.reduce((summary, reference) => {
  const provider = normalizeMediaObjectStorageProvider(reference.storageProvider);
  const hetzner = isHetznerObjectStorageReference(reference);
  return {
    totalReferences: summary.totalReferences + 1,
    hetznerObjectStorageReferences: summary.hetznerObjectStorageReferences + (hetzner ? 1 : 0),
    r2References: summary.r2References + (provider === "cloudflare_r2" ? 1 : 0),
    supabaseStorageReferences: summary.supabaseStorageReferences + (provider === "supabase_storage" ? 1 : 0),
    migrationCandidates: summary.migrationCandidates + (hetzner ? 1 : 0),
    liveKitReferences: summary.liveKitReferences + (reference.liveKitRelated === true ? 1 : 0),
    blockedOrUnknownReferences: summary.blockedOrUnknownReferences + (provider === "unknown" ? 1 : 0),
  };
}, {
  totalReferences: 0,
  hetznerObjectStorageReferences: 0,
  r2References: 0,
  supabaseStorageReferences: 0,
  migrationCandidates: 0,
  liveKitReferences: 0,
  blockedOrUnknownReferences: 0,
});

export const canCloseHetznerObjectStorage = (input: {
  remainingHetznerObjectStorageReferences: number;
  resolvedHistoricalHetznerObjectStorageReferences?: number | null;
  activeUnresolvedHetznerObjectStorageReferences?: number | null;
  liveKitHetznerReferences?: number | null;
  copyVerified: boolean;
  dbUpdated: boolean;
  newUploadsR2: boolean;
}) => ({
  ok: (
    input.remainingHetznerObjectStorageReferences === 0
    || (
      Number(input.remainingHetznerObjectStorageReferences ?? 0) > 0
      && Number(input.activeUnresolvedHetznerObjectStorageReferences ?? input.remainingHetznerObjectStorageReferences) === 0
      && Number(input.resolvedHistoricalHetznerObjectStorageReferences ?? 0) === Number(input.remainingHetznerObjectStorageReferences ?? 0)
    )
  )
    && input.copyVerified
    && input.dbUpdated
    && input.newUploadsR2,
  liveKitOutOfScope: Number(input.liveKitHetznerReferences ?? 0) >= 0,
  requiresFallbackRetentionDecision: (
    input.remainingHetznerObjectStorageReferences === 0
    || Number(input.activeUnresolvedHetznerObjectStorageReferences ?? input.remainingHetznerObjectStorageReferences) === 0
  )
    && input.copyVerified
    && input.dbUpdated
    && input.newUploadsR2,
});

export const sanitizeMediaObjectStorageMigrationProof = (value: Record<string, unknown>) => ({
  ...value,
  objectKeysRedacted: true,
  signedUrlsPrinted: false,
  secretsPrinted: false,
  liveKitTouched: false,
});
