/** Unknown is not zero. Never manufacture engagement from an unavailable read. */
export function normalizeSocialCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function formatSocialCount(value: number | null | undefined): string {
  const count = normalizeSocialCount(value);
  if (count === null) return "—";
  if (count < 1000) return String(count);
  const unit = count >= 1_000_000_000 ? 1_000_000_000 : count >= 1_000_000 ? 1_000_000 : 1000;
  const suffix = unit === 1_000_000_000 ? "B" : unit === 1_000_000 ? "M" : "K";
  // Truncate instead of rounding up to a milestone that has not happened.
  return `${(Math.floor(count / unit * 10) / 10).toFixed(1).replace(/\.0$/, "")}${suffix}`;
}

export function socialCountAccessibilityLabel(label: string, value: number | null | undefined): string {
  const count = normalizeSocialCount(value);
  return count === null ? `${label}, count unavailable` : `${count.toLocaleString()} ${label}`;
}
