// Preserve database microseconds within a millisecond tie. Missing timestamps
// stay unknown: never synthesize "now" for activity ordering or unread state.
export function compareChatActivityTimestamps(left?: string | null, right?: string | null): number {
  const l = Date.parse(left ?? ""), r = Date.parse(right ?? "");
  if (!Number.isFinite(l)) return Number.isFinite(r) ? -1 : 0;
  if (!Number.isFinite(r)) return 1;
  if (l !== r) return l > r ? 1 : -1;
  const fraction = (value?: string | null) => (value?.match(/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/iu)?.[1] ?? "").padEnd(9, "0").slice(0, 9);
  const lf = fraction(left), rf = fraction(right);
  return lf === rf ? 0 : lf > rf ? 1 : -1;
}

export function latestObservedChatTimestamp(values: (string | null | undefined)[]): string | null {
  return values.reduce<string | null>((latest, value) =>
    Number.isFinite(Date.parse(value ?? "")) && compareChatActivityTimestamps(value, latest) > 0 ? value! : latest, null);
}

export function observedChatTimestamp(record: { createdAt: string; displayCreatedAt?: string | null }): string | null {
  return record.displayCreatedAt === undefined ? record.createdAt : record.displayCreatedAt;
}

export function isUnreadChatCallEvent(event: { actorUserId: string; createdAt: string; displayCreatedAt?: string | null },
  currentUserId: string | null | undefined, lastReadAt?: string | null): boolean {
  if (!currentUserId || event.actorUserId === currentUserId) return false;
  const created = event.displayCreatedAt === undefined ? event.createdAt : event.displayCreatedAt;
  if (!created || !Number.isFinite(Date.parse(created))) return false;
  if (!lastReadAt) return true;
  if (!Number.isFinite(Date.parse(lastReadAt))) return false;
  return compareChatActivityTimestamps(created, lastReadAt) > 0;
}
