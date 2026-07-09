export type MediaTranscodeJobStatus =
  | "queued"
  | "probing"
  | "transcoding"
  | "uploading"
  | "ready"
  | "failed";

export type MediaTranscodeSourceType = "creator_video" | "proof_demo";

export type MediaTranscodeProvider =
  | "origin_signed_direct"
  | "cloudflare_r2_custom_domain";

export type MediaTranscodeRequestedRendition = {
  label: string;
  height: number;
  width?: number | null;
  videoBitrate?: string | null;
  audioBitrate?: string | null;
};

export type MediaTranscodeRendition = {
  label: string;
  width: number;
  height: number;
  bandwidth: number;
  playlistPath: string;
  segmentPaths: string[];
  cacheControl: string;
  contentType: string;
  ready: boolean;
};

export type MediaTranscodeManifest = {
  format: "hls";
  masterPath: string;
  outputPrefix: string;
  contentType: "application/vnd.apple.mpegurl";
  cacheControl: string;
  publicPlaybackSafe: boolean;
  allowlistedForCdn: boolean;
  renditions: MediaTranscodeRendition[];
};

export type MediaTranscodeJob = {
  jobId: string;
  sourceId: string;
  sourceType: MediaTranscodeSourceType | string;
  inputProvider: MediaTranscodeProvider | string;
  inputPath: string;
  outputProvider: MediaTranscodeProvider | string;
  outputPrefix: string;
  requestedRenditions: MediaTranscodeRequestedRendition[];
  completedRenditions: MediaTranscodeRendition[];
  durationMillis: number | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  sourceCodec: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  status: MediaTranscodeJobStatus;
  proofMode: boolean;
  productionDbWritesEnabled: false;
  productionPlaybackSwitched: false;
  productionTranscodeServiceLive: false;
  createdAt: string;
  updatedAt: string;
};

export type MediaTranscodeProofResult = {
  job: MediaTranscodeJob;
  manifest: MediaTranscodeManifest | null;
  statusHistory: MediaTranscodeJobStatus[];
  productionDbWritesEnabled: false;
  productionPlaybackSwitched: false;
  productionTranscodeServiceLive: false;
};

export type ProofTranscodeJobResolution = {
  canResolve: boolean;
  blockedReason: string | null;
};

export const MEDIA_TRANSCODE_PROOF_PUBLIC_PREFIX = "playback/public/";
export const MEDIA_TRANSCODE_PROOF_APPROVED_CITY_LIGHTS_INPUT =
  "playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4";

const FORBIDDEN_PROOF_OUTPUT_SEGMENTS = new Set([
  "original",
  "originals",
  "master",
  "masters",
  "source",
  "sources",
  "uploads",
  "private",
  "premium",
  "processing",
  "moderation-blocked",
  "moderation_blocked",
  "unscanned",
]);

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizePath = (value: unknown) => (
  normalizeText(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/g, "")
    .replace(/\/+$/g, "")
);

const normalizeObjectPath = (value: unknown) => (
  normalizeText(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/g, "")
);

const isInvalidObjectPath = (value: string) => (
  !value
  || value.includes("..")
  || /[\u0000-\u001F\u007F]/u.test(value)
  || /^https?:\/\//i.test(value)
);

const findForbiddenOutputSegment = (value: string) => (
  value
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .find((segment) => FORBIDDEN_PROOF_OUTPUT_SEGMENTS.has(segment)) ?? null
);

export function isApprovedProofTranscodeInputPath(inputPath: string): boolean {
  return normalizeObjectPath(inputPath) === MEDIA_TRANSCODE_PROOF_APPROVED_CITY_LIGHTS_INPUT;
}

export function isPublicPlaybackProofOutputPrefix(outputPrefix: string): boolean {
  const normalized = normalizePath(outputPrefix);
  return normalized.startsWith(MEDIA_TRANSCODE_PROOF_PUBLIC_PREFIX)
    && !isInvalidObjectPath(normalized)
    && !findForbiddenOutputSegment(normalized);
}

export function createProofMediaTranscodeJob(input: {
  jobId: string;
  sourceId: string;
  sourceType: MediaTranscodeSourceType | string;
  inputProvider: MediaTranscodeProvider | string;
  inputPath: string;
  outputProvider: MediaTranscodeProvider | string;
  outputPrefix: string;
  requestedRenditions: MediaTranscodeRequestedRendition[];
  now: string;
}): MediaTranscodeJob {
  const inputPath = normalizeObjectPath(input.inputPath);
  const outputPrefix = normalizePath(input.outputPrefix);

  if (!isApprovedProofTranscodeInputPath(inputPath)) {
    throw new Error("proof_transcode_input_not_approved");
  }
  if (!isPublicPlaybackProofOutputPrefix(outputPrefix)) {
    throw new Error("proof_transcode_output_prefix_not_public_safe");
  }

  return {
    jobId: normalizeText(input.jobId) || "proof_transcode_job",
    sourceId: normalizeText(input.sourceId) || "proof_source",
    sourceType: normalizeText(input.sourceType) || "proof_demo",
    inputProvider: normalizeText(input.inputProvider) || "cloudflare_r2_custom_domain",
    inputPath,
    outputProvider: normalizeText(input.outputProvider) || "cloudflare_r2_custom_domain",
    outputPrefix,
    requestedRenditions: input.requestedRenditions.map((rendition) => ({
      label: normalizeText(rendition.label),
      height: rendition.height,
      width: rendition.width ?? null,
      videoBitrate: normalizeText(rendition.videoBitrate) || null,
      audioBitrate: normalizeText(rendition.audioBitrate) || null,
    })),
    completedRenditions: [],
    durationMillis: null,
    sourceWidth: null,
    sourceHeight: null,
    sourceCodec: null,
    errorCode: null,
    errorMessage: null,
    status: "queued",
    proofMode: true,
    productionDbWritesEnabled: false,
    productionPlaybackSwitched: false,
    productionTranscodeServiceLive: false,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function transitionMediaTranscodeJob(
  job: MediaTranscodeJob,
  status: MediaTranscodeJobStatus,
  input: Partial<Pick<
    MediaTranscodeJob,
    | "durationMillis"
    | "sourceWidth"
    | "sourceHeight"
    | "sourceCodec"
    | "completedRenditions"
    | "errorCode"
    | "errorMessage"
  >> & { now: string },
): MediaTranscodeJob {
  return {
    ...job,
    ...input,
    status,
    updatedAt: input.now,
    productionDbWritesEnabled: false,
    productionPlaybackSwitched: false,
    productionTranscodeServiceLive: false,
  };
}

export function buildMediaTranscodeRendition(input: {
  label: string;
  width: number;
  height: number;
  bandwidth: number;
  playlistPath: string;
  segmentPaths: string[];
}): MediaTranscodeRendition {
  return {
    label: normalizeText(input.label),
    width: input.width,
    height: input.height,
    bandwidth: input.bandwidth,
    playlistPath: normalizeObjectPath(input.playlistPath),
    segmentPaths: input.segmentPaths.map((segmentPath) => normalizeObjectPath(segmentPath)),
    cacheControl: "public, max-age=31536000, immutable",
    contentType: "video/mp2t",
    ready: true,
  };
}

export function buildMediaTranscodeManifest(input: {
  outputPrefix: string;
  masterPath: string;
  renditions: MediaTranscodeRendition[];
  allowlistedForCdn: boolean;
}): MediaTranscodeManifest {
  const outputPrefix = normalizePath(input.outputPrefix);
  const masterPath = normalizeObjectPath(input.masterPath);
  if (!isPublicPlaybackProofOutputPrefix(outputPrefix)) {
    throw new Error("proof_manifest_output_prefix_not_public_safe");
  }
  if (!masterPath.startsWith(`${outputPrefix}/`) || !masterPath.endsWith("/master.m3u8")) {
    throw new Error("proof_manifest_master_path_invalid");
  }

  return {
    format: "hls",
    masterPath,
    outputPrefix,
    contentType: "application/vnd.apple.mpegurl",
    cacheControl: "public, max-age=300",
    publicPlaybackSafe: true,
    allowlistedForCdn: input.allowlistedForCdn === true,
    renditions: input.renditions,
  };
}

export function canResolveCompletedProofTranscodeJob(
  job: MediaTranscodeJob,
  manifest: MediaTranscodeManifest | null,
): ProofTranscodeJobResolution {
  if (job.proofMode !== true) return { canResolve: false, blockedReason: "not_proof_mode" };
  if (job.productionDbWritesEnabled !== false) return { canResolve: false, blockedReason: "production_db_writes_enabled" };
  if (job.productionPlaybackSwitched !== false) return { canResolve: false, blockedReason: "production_playback_switched" };
  if (job.productionTranscodeServiceLive !== false) return { canResolve: false, blockedReason: "production_transcode_service_claimed" };
  if (job.status !== "ready") return { canResolve: false, blockedReason: "transcode_job_not_ready" };
  if (!isApprovedProofTranscodeInputPath(job.inputPath)) return { canResolve: false, blockedReason: "input_not_approved_demo" };
  if (!isPublicPlaybackProofOutputPrefix(job.outputPrefix)) return { canResolve: false, blockedReason: "output_prefix_not_public_safe" };
  if (!manifest) return { canResolve: false, blockedReason: "missing_manifest" };
  if (manifest.format !== "hls") return { canResolve: false, blockedReason: "manifest_format_not_hls" };
  if (manifest.publicPlaybackSafe !== true) return { canResolve: false, blockedReason: "manifest_not_public_safe" };
  if (manifest.allowlistedForCdn !== true) return { canResolve: false, blockedReason: "manifest_not_allowlisted" };
  if (manifest.masterPath !== `${job.outputPrefix}/master.m3u8`) {
    return { canResolve: false, blockedReason: "manifest_master_path_mismatch" };
  }
  return { canResolve: true, blockedReason: null };
}

export function buildMediaTranscodeProofResult(input: {
  job: MediaTranscodeJob;
  manifest: MediaTranscodeManifest | null;
  statusHistory: MediaTranscodeJobStatus[];
}): MediaTranscodeProofResult {
  return {
    job: input.job,
    manifest: input.manifest,
    statusHistory: input.statusHistory,
    productionDbWritesEnabled: false,
    productionPlaybackSwitched: false,
    productionTranscodeServiceLive: false,
  };
}
