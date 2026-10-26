export class EventScheduleInputError extends Error {}

/** Convert creator-entered device-local time without silently moving a show across DST. */
export function parseEventScheduleInput(value: string, label = "Event time"): string | null {
  const text = value.trim();
  if (!text) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/.exec(text);
  if (!parts) throw new EventScheduleInputError(`${label}: use YYYY-MM-DDTHH:mm, with an optional UTC offset.`);
  const [, year, month, day, hour, minute, second = "0", , offset] = parts;
  const wall = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
  if (wall.getUTCFullYear() !== +year || wall.getUTCMonth() !== +month - 1
    || wall.getUTCDate() !== +day || wall.getUTCHours() !== +hour
    || wall.getUTCMinutes() !== +minute || wall.getUTCSeconds() !== +second) {
    throw new EventScheduleInputError(`${label}: enter a valid calendar date and time.`);
  }
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) throw new EventScheduleInputError(`${label}: enter a valid time and UTC offset.`);
  if (!offset) {
    const sameWallTime = (candidate: Date) => candidate.getFullYear() === +year
      && candidate.getMonth() === +month - 1 && candidate.getDate() === +day
      && candidate.getHours() === +hour && candidate.getMinutes() === +minute;
    if (!sameWallTime(date)) {
      throw new EventScheduleInputError(`${label}: this local time does not exist because the clocks change. Choose another time.`);
    }
    // US DST repeats an hour in the fall; include half-hour transitions for device zones too.
    for (const minutes of [-120, -90, -60, -30, 30, 60, 90, 120]) {
      if (sameWallTime(new Date(date.getTime() + minutes * 60_000))) {
        throw new EventScheduleInputError(`${label}: this local time occurs twice because the clocks change. Add a UTC offset, such as -04:00 or -05:00.`);
      }
    }
  }
  return date.toISOString();
}

export function formatEventScheduleInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  try {
    parseEventScheduleInput(local);
    return local;
  } catch {
    // Preserve the exact instant when editing a time in a repeated DST hour.
    return date.toISOString();
  }
}

export function formatEventScheduleTime(value?: string | null, fallback = "Not scheduled"): string {
  const parsed = Date.parse(value ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return new Date(parsed).toLocaleString([], {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}
