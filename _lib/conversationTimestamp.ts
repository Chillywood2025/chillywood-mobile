export type ConversationTimestampValue = string | number | Date | null | undefined;

// An elapsed seven days, not seven calendar labels: DST must not move the boundary.
export const CONVERSATION_TIMESTAMP_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function conversationTimestampMillis(value: ConversationTimestampValue): number {
  if (value == null || (typeof value === "string" && !value.trim())) return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const calendar = /^(\d{4})-(\d{2})-(\d{2})(?:T| |$)/.exec(value.trim());
    if (calendar) {
      const [, year, month, day] = calendar.map(Number);
      const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
      if (month < 1 || month > 12 || day < 1 || day > days) return NaN;
    }
  }
  return new Date(value).getTime();
}

export function formatConversationTimestamp(
  value: ConversationTimestampValue,
  now = Date.now(),
  options: { locale?: string; timeZone?: string } = {},
) {
  const time = conversationTimestampMillis(value);
  if (!Number.isFinite(time)) return { label: "Time unavailable", fullLabel: "Time unavailable", valid: false };
  const age = now - time;
  // Future dates keep their date/year; never disguise clock skew as a recent weekday.
  const recent = age >= 0 && age < CONVERSATION_TIMESTAMP_WEEK_MS;
  const date = new Date(time);
  const clock: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", timeZone: options.timeZone };
  const label = new Intl.DateTimeFormat(options.locale, recent
    ? { ...clock, weekday: "short" }
    : { ...clock, month: "short", day: "numeric", year: "numeric" }).format(date);
  const fullLabel = new Intl.DateTimeFormat(options.locale, {
    ...clock, weekday: "long", month: "long", day: "numeric", year: "numeric", timeZoneName: "short",
  }).format(date);
  return { label, fullLabel, valid: true };
}

// Parsers can preserve a missing raw timestamp without changing legacy ordering fields.
export function conversationCreatedAt(record: { createdAt?: ConversationTimestampValue; displayCreatedAt?: ConversationTimestampValue }) {
  return record.displayCreatedAt === undefined ? record.createdAt : record.displayCreatedAt;
}
