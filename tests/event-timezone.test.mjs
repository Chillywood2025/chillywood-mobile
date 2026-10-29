import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const file = "_lib/eventSchedule.ts";
const source = readFileSync(file, "utf8");
const load = (text = source, intl = Intl) => {
  const module = { exports: {} };
  const compiled = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("module", "exports", "Intl", compiled)(module, module.exports, intl);
  return module.exports;
};
const api = load();

test("Sunday8PM uses the selected IANA zone independently of the device zone", () => {
  const original = process.env.TZ;
  try {
    for (const deviceZone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      process.env.TZ = deviceZone;
      assert.equal(api.parseZonedEventScheduleInput("2026-11-01T20:00", "America/New_York"), "2026-11-02T01:00:00.000Z");
      assert.equal(api.parseZonedEventScheduleInput("2026-11-01T20:00", "America/Los_Angeles"), "2026-11-02T04:00:00.000Z");
      assert.equal(api.parseZonedEventScheduleInput("2026-10-25T20:00", "America/New_York"), "2026-10-26T00:00:00.000Z");
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("DST gap fails and repeated hour needs an explicit first/second choice", () => {
  assert.throws(() => api.parseZonedEventScheduleInput("2026-03-08T02:30", "America/New_York"), /does not exist/);
  assert.throws(() => api.parseZonedEventScheduleInput("2026-11-01T01:30", "America/New_York"), /occurs twice/);
  assert.equal(api.parseZonedEventScheduleInput("2026-11-01T01:30", "America/New_York", "earlier"), "2026-11-01T05:30:00.000Z");
  assert.equal(api.parseZonedEventScheduleInput("2026-11-01T01:30", "America/New_York", "later"), "2026-11-01T06:30:00.000Z");
  assert.throws(() => api.parseZonedEventScheduleInput("2026-03-08T02:30", "America/New_York", "later"), /does not exist/);
});

test("explicit offsets disambiguate only when consistent with the selected zone", () => {
  assert.equal(api.parseZonedEventScheduleInput("2026-11-01T01:30-04:00", "America/New_York"), "2026-11-01T05:30:00.000Z");
  assert.equal(api.parseZonedEventScheduleInput("2026-11-01T01:30-05:00", "America/New_York"), "2026-11-01T06:30:00.000Z");
  assert.equal(api.parseZonedEventScheduleInput("2026-11-01T01:30Z", "UTC"), "2026-11-01T01:30:00.000Z");
  for (const wrong of ["2026-11-01T20:00-04:00", "2026-11-01T20:00Z", "2026-03-08T02:30-05:00"]) {
    assert.throws(() => api.parseZonedEventScheduleInput(wrong, "America/New_York"), /does not match/);
  }
});

test("formatting and reparsing preserves both fold instants and subminute precision", () => {
  for (const [instant, zone, expected] of [
    ["2026-11-01T05:30:00.000Z", "America/New_York", "2026-11-01T01:30-04:00"],
    ["2026-11-01T06:30:00.000Z", "America/New_York", "2026-11-01T01:30-05:00"],
    ["2026-11-01T06:30:15.123Z", "America/New_York", "2026-11-01T01:30:15.123-05:00"],
    ["2026-11-02T01:00:15.123Z", "America/New_York", "2026-11-01T20:00:15.123"],
    ["2026-11-02T01:00:00.000Z", "America/New_York", "2026-11-01T20:00"],
  ]) {
    const input = api.formatZonedEventScheduleInput(instant, zone);
    assert.equal(input, expected);
    assert.equal(api.parseZonedEventScheduleInput(input, zone), instant);
  }
});

test("non-hour offsets, half-hour DST, and skipped calendar days are handled", () => {
  assert.equal(api.parseZonedEventScheduleInput("2026-11-01T20:00", "Asia/Kathmandu"), "2026-11-01T14:15:00.000Z");
  assert.throws(() => api.parseZonedEventScheduleInput("2026-04-05T01:45", "Australia/Lord_Howe"), /occurs twice/);
  assert.equal(api.parseZonedEventScheduleInput("2026-04-05T01:45", "Australia/Lord_Howe", "earlier"), "2026-04-04T14:45:00.000Z");
  assert.equal(api.parseZonedEventScheduleInput("2026-04-05T01:45", "Australia/Lord_Howe", "later"), "2026-04-04T15:15:00.000Z");
  assert.throws(() => api.parseZonedEventScheduleInput("2026-10-04T02:15", "Australia/Lord_Howe"), /does not exist/);
  assert.throws(() => api.parseZonedEventScheduleInput("2011-12-30T12:00", "Pacific/Apia"), /does not exist/);
});

test("invalid zone, calendar, offset and fold choice fail closed with actionable labels", () => {
  for (const zone of ["", "America/Not_A_Zone", "+05:00"]) {
    assert.throws(() => api.parseZonedEventScheduleInput("2026-11-01T20:00", zone), /IANA time zone/);
  }
  for (const value of ["tomorrow", "2026-02-30T20:00", "2026-11-01T24:00", "2026-11-01T20:61", "2026-11-01T20:00:60", "2026-11-01T20:00+99:99"]) {
    assert.throws(() => api.parseZonedEventScheduleInput(value, "America/New_York", "reject", "Sale closes"), error => error instanceof api.EventScheduleInputError && error.message.startsWith("Sale closes:"));
  }
  assert.throws(() => api.parseZonedEventScheduleInput("2026-11-01T20:00", "America/New_York", "guess"), /first or second/);
  assert.equal(api.parseZonedEventScheduleInput("  ", "UTC"), null);
  assert.equal(api.formatZonedEventScheduleInput(null, "UTC"), "");
  assert.equal(api.parseZonedEventScheduleInput("2028-02-29T20:00", "UTC"), "2028-02-29T20:00:00.000Z");
});

test("device zone fallback uses UTC only if the native zone is missing or invalid", () => {
  assert.equal(api.getDeviceEventTimeZone(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  for (const zone of [undefined, "Invalid/Zone"]) {
    const fakeIntl = { DateTimeFormat: function (...args) {
      return args.length ? new Intl.DateTimeFormat(...args) : { resolvedOptions: () => ({ timeZone: zone }) };
    } };
    assert.equal(load(source, fakeIntl).getDeviceEventTimeZone(), "UTC");
  }
});

test("negative controls detect reversed fold selection and unchecked explicit offsets", () => {
  const reversed = source.replace(".sort((left, right) => left - right);", ".sort((left, right) => right - left);");
  assert.notEqual(reversed, source);
  assert.notEqual(load(reversed).parseZonedEventScheduleInput("2026-11-01T01:30", "America/New_York", "earlier"), "2026-11-01T05:30:00.000Z");
  const unchecked = source.replace("if (!sameEventWallTime(eventWallTimeAt(instant, formatter), wall)) {", "if (false) {");
  assert.notEqual(unchecked, source);
  assert.equal(load(unchecked).parseZonedEventScheduleInput("2026-11-01T20:00-04:00", "America/New_York"), "2026-11-02T00:00:00.000Z");
});
