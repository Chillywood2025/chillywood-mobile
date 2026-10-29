import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as singleFlight from "../_lib/actionSingleFlight.mjs";

// Execute the production modules, substituting only the network boundary. These
// tests prove client payloads and presentation, not deployed SQL or native billing.
const load = (path, imports = {}, source = readFileSync(path, "utf8")) => {
  const module = { exports: {} };
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("module", "exports", "require", js)(module, module.exports, (name) => {
    assert.ok(Object.hasOwn(imports, name), `unexpected dependency ${name}`);
    return imports[name];
  });
  return module.exports;
};
const schedule = load("_lib/eventSchedule.ts");
const presentation = load("_lib/customerExperiencePresentation.ts");
const timeZone = (zone, run) => {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try { run(); } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
};

test("Sunday 8 PM is stored as the correct instant across US zones and DST", () => {
  timeZone("America/New_York", () => {
    assert.equal(schedule.parseEventScheduleInput("2026-10-25T20:00"), "2026-10-26T00:00:00.000Z");
    assert.equal(schedule.parseEventScheduleInput("2026-11-01T20:00"), "2026-11-02T01:00:00.000Z");
    assert.match(schedule.formatEventScheduleTime("2026-11-02T01:00:00.000Z"), /2026/);
    assert.match(schedule.formatEventScheduleTime("2026-11-02T01:00:00.000Z"), /EST|GMT-5/);
  });
  timeZone("America/Los_Angeles", () => {
    assert.equal(schedule.parseEventScheduleInput("2026-11-01T20:00"), "2026-11-02T04:00:00.000Z");
  });
});

test("invalid, nonexistent, and ambiguous local times require a correction before save", () => {
  timeZone("America/New_York", () => {
    for (const value of ["tomorrow", "2026-02-30T20:00", "2026-13-01T20:00", "2026-11-01T24:00"]) {
      assert.throws(() => schedule.parseEventScheduleInput(value), schedule.EventScheduleInputError);
    }
    assert.throws(() => schedule.parseEventScheduleInput("2026-03-08T02:30"), /does not exist/);
    assert.throws(() => schedule.parseEventScheduleInput("2026-11-01T01:30"), /occurs twice/);
    assert.equal(schedule.parseEventScheduleInput("2026-11-01T01:30-04:00"), "2026-11-01T05:30:00.000Z");
    assert.equal(schedule.parseEventScheduleInput("2026-11-01T01:30-05:00"), "2026-11-01T06:30:00.000Z");
    assert.equal(schedule.formatEventScheduleInput("2026-11-01T06:30:00.000Z"), "2026-11-01T06:30:00.000Z");
    assert.equal(schedule.parseEventScheduleInput("  "), null);
  });
});

const row = {
  id: "event-one", host_user_id: "creator-one", event_title: "Sunday show",
  event_type: "live_first", visibility: "public", status: "scheduled",
  starts_at: "2026-11-02T01:00:00.000Z", ends_at: "2026-11-02T02:00:00.000Z",
  linked_title_id: "old-title", replay_policy: "until_expiration",
  replay_available_at: "2026-11-02T03:00:00.000Z", replay_expires_at: "2026-11-03T03:00:00.000Z",
  reminder_ready: true, created_at: "2026-10-26T00:00:00.000Z", updated_at: "2026-10-26T00:00:00.000Z",
};
function eventClient(source, storedRow = row) {
  const writes = [];
  const client = { from(name) {
    assert.equal(name, "creator_events");
    let payload;
    const query = {
      select() { return query; }, eq() { return query; }, returns() { return query; },
      async maybeSingle() { return { data: { ...storedRow }, error: null }; },
      insert(value) { payload = value; writes.push(value); return query; },
      update(value) { payload = value; writes.push(value); return query; },
      async single() { return { data: { ...storedRow, ...payload }, error: null }; },
    };
    return query;
  } };
  return { writes, api: load("_lib/liveEvents.ts", {
    "./supabase": { supabase: client }, "./actionSingleFlight.mjs": singleFlight,
  }, source) };
}

test("event version tokens retain the server timestamp precision and offset", () => {
  const { api } = eventClient();
  for (const updatedAt of ["2026-10-26T18:00:00.123456+00:00", "2026-10-26T13:00:00.987654-05:00"]) {
    assert.equal(api.parseCreatorEventRow({ ...row, updated_at: updatedAt }).updatedAt, updatedAt,
      "managed lifecycle and sale updates compare the exact PostgreSQL instant");
  }
});

test("event edit preserves omitted values but clears explicit nulls and obsolete replay expiry", async () => {
  const { writes, api } = eventClient();
  await api.updateCreatorEvent(row.id, { hostUserId: row.host_user_id, eventTitle: "Updated show" });
  assert.equal(writes[0].starts_at, row.starts_at);
  assert.equal(writes[0].ends_at, row.ends_at);
  const result = await api.updateCreatorEvent(row.id, {
    hostUserId: row.host_user_id, endsAt: null, linkedTitleId: null,
    replayAvailableAt: null, replayPolicy: "none",
  });
  assert.equal(result.endsAt, null);
  assert.equal(writes[1].linked_title_id, null);
  assert.equal(writes[1].replay_available_at, null);
  assert.equal(writes[1].replay_expires_at, null);
});

test("new events default live-only and replay requires explicit supported availability and expiry", async () => {
  const base = { hostUserId: row.host_user_id, eventTitle: row.event_title, status: "scheduled",
    startsAt: row.starts_at, endsAt: row.ends_at, timeZone: "America/New_York" };
  const live = eventClient();
  const saved = await live.api.createCreatorEvent(base);
  assert.equal(saved.replayPolicy, "none");
  assert.equal(live.writes[0].replay_available_at, null);
  assert.equal(live.writes[0].replay_expires_at, null);
  for (const replay of [
    { replayPolicy: "indefinite" },
    { replayPolicy: "until_expiration", replayExpiresAt: row.replay_expires_at },
    { replayPolicy: "until_expiration", replayAvailableAt: row.replay_available_at },
    { replayPolicy: "until_expiration", replayAvailableAt: row.starts_at, replayExpiresAt: row.replay_expires_at },
    { replayPolicy: "until_expiration", replayAvailableAt: row.replay_available_at, replayExpiresAt: row.replay_available_at },
  ]) {
    const h = eventClient();
    assert.ok("error" in await h.api.createCreatorEvent({ ...base, ...replay }));
    assert.equal(h.writes.length, 0);
  }
  const replay = eventClient();
  const terms = await replay.api.createCreatorEvent({ ...base, replayPolicy: "until_expiration",
    replayAvailableAt: "2026-11-01T21:00:00-05:00", replayExpiresAt: "2026-11-01T22:00:00-05:00" });
  assert.equal(terms.replayAvailableAt, row.ends_at, "availability may begin exactly at the scheduled end");
  assert.equal(terms.replayExpiresAt, "2026-11-02T03:00:00.000Z");
});

test("unchanged historical replay promises survive unrelated edits but cannot be newly introduced", async () => {
  const historical = { ...row, replay_policy: "indefinite", replay_available_at: null, replay_expires_at: null };
  const h = eventClient(undefined, historical);
  const saved = await h.api.updateCreatorEvent(row.id, { hostUserId: row.host_user_id, eventTitle: "Historical show title" });
  assert.equal(saved.replayPolicy, "indefinite");
  assert.equal(saved.replayAvailableAt, null);
  assert.equal(saved.replayExpiresAt, null);
  const changed = eventClient();
  assert.ok("error" in await changed.api.updateCreatorEvent(row.id, {
    hostUserId: row.host_user_id, replayPolicy: "indefinite", replayAvailableAt: null, replayExpiresAt: null,
  }));
  assert.equal(changed.writes.length, 0);
});

test("invalid schedules and wrong host never write; drafts can explicitly clear their start", async () => {
  const { writes, api } = eventClient();
  assert.ok("error" in await api.updateCreatorEvent(row.id, { hostUserId: "other-creator", eventTitle: "No" }));
  assert.ok("error" in await api.updateCreatorEvent(row.id, { hostUserId: row.host_user_id, startsAt: null }));
  assert.ok("error" in await api.updateCreatorEvent(row.id, { hostUserId: row.host_user_id, endsAt: "invalid" }));
  assert.equal(writes.length, 0);
  const draft = await api.updateCreatorEvent(row.id, { hostUserId: row.host_user_id, status: "draft", startsAt: null });
  assert.equal(draft.startsAt, null);
  assert.equal(writes[0].reminder_ready, false);
});

test("negative control: restoring null-coalescing update loses the requested field clear", async () => {
  const source = readFileSync("_lib/liveEvents.ts", "utf8");
  const changed = source.replace("input.endsAt === undefined ? current.endsAt : input.endsAt", "input.endsAt ?? current.endsAt");
  assert.notEqual(changed, source);
  const { writes, api } = eventClient(changed);
  await api.updateCreatorEvent(row.id, { hostUserId: row.host_user_id, endsAt: null });
  assert.notEqual(writes[0].ends_at, null, "negative control reproduces the original defect");
});

test("replay expires exactly at expiry and paid scheduled entry stays closed until live", () => {
  const { api } = eventClient();
  const event = api.parseCreatorEventRow({ ...row, status: "ended" });
  assert.equal(api.readEventReplayAvailability(event, Date.parse(row.replay_expires_at) - 1).isReplayAvailableNow, true);
  assert.equal(api.readEventReplayAvailability(event, Date.parse(row.replay_expires_at)).isReplayAvailableNow, false);
  const input = { status: "scheduled", startsAt: row.starts_at, isPaid: true, accessAllowed: true,
    requiresPurchase: false, soldOut: false, hasLiveDestination: true, hasReplayDestination: false };
  assert.equal(presentation.resolveEventCustomerPresentation(input).action, "none");
  assert.equal(presentation.resolveEventCustomerPresentation({ ...input, status: "live_now" }).action, "open_live");
  const soldOut = presentation.resolveEventCustomerPresentation({ ...input, accessAllowed: false, soldOut: true });
  assert.equal(soldOut.statusLabel, "Sold out");
  assert.equal(soldOut.action, "none");
  const canceled = presentation.resolveEventCustomerPresentation({ ...input, status: "canceled" });
  assert.match(canceled.body, /store purchase history/);
  assert.doesNotMatch(canceled.body, /nothing you need to do|automatic refund/i);
});
