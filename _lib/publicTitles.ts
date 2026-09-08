export type PublicTitleReleaseState = {
  is_published?: boolean | null;
  status?: string | null;
  release_at?: string | null;
  release_date?: string | null;
};

const isReleasedBy = (value: string | null | undefined, nowMillis: number) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return true;

  const releaseMillis = Date.parse(normalized);
  return Number.isFinite(releaseMillis) && releaseMillis <= nowMillis;
};

export const isPubliclyReleasedTitle = (
  item: PublicTitleReleaseState,
  nowMillis = Date.now(),
) => {
  if (item.is_published !== true) return false;
  if (String(item.status ?? "").trim().toLowerCase() !== "published") return false;

  return isReleasedBy(item.release_at, nowMillis)
    && isReleasedBy(item.release_date, nowMillis);
};

export const filterPubliclyReleasedTitles = <T extends PublicTitleReleaseState>(
  items: T[],
  nowMillis = Date.now(),
) => items.filter((item) => isPubliclyReleasedTitle(item, nowMillis));
