export type MediaRenditionLadderLabel = "360p" | "480p" | "720p" | "1080p";
export type MediaRenditionLadderAccessTier = "free" | "premium";

export type MediaRenditionLadderSource = {
  width?: number | null;
  height?: number | null;
};

export type MediaRenditionLadderOptions = {
  allowUpscale?: boolean | null;
  premiumEnabled?: boolean | null;
  unknownSourceStrategy?: "none" | "conservative_free" | null;
};

export type MediaRenditionLadderEntry = {
  label: MediaRenditionLadderLabel;
  height: number;
  accessTier: MediaRenditionLadderAccessTier;
};

export const MEDIA_RENDITION_LADDER: readonly MediaRenditionLadderEntry[] = [
  { label: "360p", height: 360, accessTier: "free" },
  { label: "480p", height: 480, accessTier: "free" },
  { label: "720p", height: 720, accessTier: "premium" },
  { label: "1080p", height: 1080, accessTier: "premium" },
] as const;

const FREE_LABELS = new Set<MediaRenditionLadderLabel>(["360p", "480p"]);
const PREMIUM_LABELS = new Set<MediaRenditionLadderLabel>(["720p", "1080p"]);

const toFinitePositiveNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const sourceHeightFor = (source: MediaRenditionLadderSource): number | null => (
  toFinitePositiveNumber(source.height)
);

const entryFor = (label: MediaRenditionLadderLabel): MediaRenditionLadderEntry | null => (
  MEDIA_RENDITION_LADDER.find((entry) => entry.label === label) ?? null
);

export function shouldGenerateRendition(
  source: MediaRenditionLadderSource,
  label: MediaRenditionLadderLabel,
  options: MediaRenditionLadderOptions = {},
): boolean {
  const entry = entryFor(label);
  if (!entry) return false;
  if (entry.accessTier === "premium" && options.premiumEnabled === false) return false;

  const sourceHeight = sourceHeightFor(source);
  if (sourceHeight == null) {
    return options.unknownSourceStrategy === "conservative_free" && entry.accessTier === "free";
  }

  if (options.allowUpscale === true) return true;
  return sourceHeight >= entry.height;
}

export function getSupportedRenditionsForSource(
  source: MediaRenditionLadderSource,
  options: MediaRenditionLadderOptions = {},
): MediaRenditionLadderEntry[] {
  return MEDIA_RENDITION_LADDER.filter((entry) => shouldGenerateRendition(source, entry.label, options));
}

export function getFreeRenditionsForSource(
  source: MediaRenditionLadderSource,
  options: Omit<MediaRenditionLadderOptions, "premiumEnabled"> = {},
): MediaRenditionLadderEntry[] {
  return getSupportedRenditionsForSource(source, { ...options, premiumEnabled: false })
    .filter((entry) => FREE_LABELS.has(entry.label));
}

export function getPremiumRenditionsForSource(
  source: MediaRenditionLadderSource,
  options: MediaRenditionLadderOptions = {},
): MediaRenditionLadderEntry[] {
  if (options.premiumEnabled === false) return [];
  return getSupportedRenditionsForSource(source, { ...options, premiumEnabled: true })
    .filter((entry) => PREMIUM_LABELS.has(entry.label));
}
