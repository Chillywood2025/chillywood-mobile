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

export type EventTimeDisambiguation = "reject" | "earlier" | "later";

type EventWallTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

function eventTimeZoneFormatter(timeZone: string, label: string): Intl.DateTimeFormat {
  const zone = typeof timeZone === "string" ? timeZone.trim() : "";
  if (!zone || /^[+-]/.test(zone)) {
    throw new EventScheduleInputError(`${label}: choose an IANA time zone, such as America/New_York.`);
  }
  try {
    return new Intl.DateTimeFormat("en-US-u-ca-iso8601-nu-latn", {
      timeZone: zone,
      calendar: "iso8601",
      numberingSystem: "latn",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
  } catch {
    throw new EventScheduleInputError(`${label}: choose a valid IANA time zone, such as America/New_York.`);
  }
}

function eventWallTimeAt(instant: number, formatter: Intl.DateTimeFormat): EventWallTime {
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(instant))) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year, month: values.month, day: values.day,
    hour: values.hour, minute: values.minute, second: values.second,
    millisecond: new Date(instant).getUTCMilliseconds(),
  };
}

function eventWallTimeEpoch(wall: EventWallTime): number {
  const date = new Date(0);
  date.setUTCFullYear(wall.year, wall.month - 1, wall.day);
  date.setUTCHours(wall.hour, wall.minute, wall.second, wall.millisecond);
  return date.getTime();
}

function sameEventWallTime(left: EventWallTime, right: EventWallTime): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day
    && left.hour === right.hour && left.minute === right.minute && left.second === right.second
    && left.millisecond === right.millisecond;
}

function eventWallTimeCandidates(wall: EventWallTime, formatter: Intl.DateTimeFormat): number[] {
  const wallEpoch = eventWallTimeEpoch(wall);
  const offsets = new Set<number>();
  // Sample offsets on both sides of the local day, including date-line jumps
  // and half-hour DST transitions. Round-trip every candidate through Intl;
  // an offset guess is never accepted as a valid wall time on its own.
  for (let hours = -48; hours <= 48; hours += 6) {
    const probe = wallEpoch + hours * 3_600_000;
    offsets.add(eventWallTimeEpoch(eventWallTimeAt(probe, formatter)) - probe);
  }
  return [...offsets]
    .map(offset => wallEpoch - offset)
    .filter(instant => sameEventWallTime(eventWallTimeAt(instant, formatter), wall))
    .sort((left, right) => left - right);
}

/** Resolve a wall time in an explicit IANA zone, independently of device zone.
 * An explicit offset must match that zone at the supplied wall time. This
 * catches accidentally copied device offsets and still selects either DST fold.
 */
export function parseZonedEventScheduleInput(
  value: string,
  timeZone: string,
  disambiguation: EventTimeDisambiguation = "reject",
  label = "Event time",
): string | null {
  const formatter = eventTimeZoneFormatter(timeZone, label);
  if (!["reject", "earlier", "later"].includes(disambiguation)) {
    throw new EventScheduleInputError(`${label}: choose the first or second occurrence of a repeated time.`);
  }
  const text = value.trim();
  if (!text) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/.exec(text);
  if (!parts) throw new EventScheduleInputError(`${label}: use YYYY-MM-DDTHH:mm, with an optional UTC offset.`);
  const [, year, month, day, hour, minute, second = "0", fraction = "", offset] = parts;
  const wall: EventWallTime = {
    year: +year, month: +month, day: +day, hour: +hour, minute: +minute,
    second: +second, millisecond: Number(fraction.padEnd(3, "0")),
  };
  const wallEpoch = eventWallTimeEpoch(wall);
  const calendar = new Date(wallEpoch);
  if (wall.year < 1 || calendar.getUTCFullYear() !== wall.year
    || calendar.getUTCMonth() + 1 !== wall.month || calendar.getUTCDate() !== wall.day
    || calendar.getUTCHours() !== wall.hour || calendar.getUTCMinutes() !== wall.minute
    || calendar.getUTCSeconds() !== wall.second) {
    throw new EventScheduleInputError(`${label}: enter a valid calendar date and time.`);
  }
  if (offset) {
    const instant = Date.parse(text);
    if (!Number.isFinite(instant)) {
      throw new EventScheduleInputError(`${label}: enter a valid time and UTC offset.`);
    }
    if (!sameEventWallTime(eventWallTimeAt(instant, formatter), wall)) {
      throw new EventScheduleInputError(`${label}: this UTC offset does not match ${timeZone.trim()} at that local time. Check the zone and date.`);
    }
    return new Date(instant).toISOString();
  }
  const candidates = eventWallTimeCandidates(wall, formatter);
  if (!candidates.length) {
    throw new EventScheduleInputError(`${label}: this local time does not exist in ${timeZone.trim()} because the clocks change. Choose another time.`);
  }
  if (candidates.length > 1 && disambiguation === "reject") {
    throw new EventScheduleInputError(`${label}: this local time occurs twice in ${timeZone.trim()}. Choose the first or second occurrence, or enter its UTC offset.`);
  }
  const instant = disambiguation === "later" ? candidates[candidates.length - 1] : candidates[0];
  return new Date(instant).toISOString();
}

/** Return editable local text. Repeated hours include the exact offset so an
 * unchanged edit cannot move an existing show from one occurrence to the other.
 */
export function formatZonedEventScheduleInput(value: string | null, timeZone: string): string {
  if (!value) return "";
  const formatter = eventTimeZoneFormatter(timeZone, "Event time");
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return value;
  const wall = eventWallTimeAt(instant, formatter);
  const pad = (part: number, length = 2) => String(part).padStart(length, "0");
  let text = `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
  if (wall.second || wall.millisecond) text += `:${pad(wall.second)}`;
  if (wall.millisecond) text += `.${pad(wall.millisecond, 3)}`;
  if (eventWallTimeCandidates(wall, formatter).length > 1) {
    const offsetMinutes = (eventWallTimeEpoch(wall) - instant) / 60_000;
    if (!Number.isInteger(offsetMinutes)) {
      throw new EventScheduleInputError("Event time: this historical time uses an unsupported offset. Choose another time.");
    }
    const absolute = Math.abs(offsetMinutes);
    text += `${offsetMinutes < 0 ? "-" : "+"}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
  }
  return text;
}

export function getDeviceEventTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    eventTimeZoneFormatter(zone, "Event time");
    return zone;
  } catch {
    return "UTC";
  }
}
