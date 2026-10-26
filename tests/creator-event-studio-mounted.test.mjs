import assert from "node:assert/strict";
import test from "node:test";
import { mount } from "./platform-studio-mounted-harness.mjs";

test("creator event save displays invalid date guidance without calling create", async t => {
  const h = await mount(t, { route: { tab: "live", focus: "schedule" }, videos: [] });
  await h.change(h.input("Event title"), "Sunday show");
  await h.change(h.input("Starts at (YYYY-MM-DDTHH:mm)"), "2026-02-30T20:00");
  await h.press(h.button("Create Event"));
  assert.match(h.text(), /Start time: enter a valid calendar date and time/);
  assert.equal(h.calls.some(([name]) => name === "createCreatorEvent"), false);
});

test("creator Sunday8PM schedule passes an exact instant and cleared optional fields to production save handler", async t => {
  const h = await mount(t, { route: { tab: "live", focus: "schedule" }, videos: [], overrides: {
    createCreatorEvent: async () => ({ id: "event-one" }),
  } });
  await h.change(h.input("Event title"), "Sunday show");
  await h.change(h.input("Starts at (YYYY-MM-DDTHH:mm)"), "2026-11-01T20:00-05:00");
  await h.press(h.button("Event status: Scheduled"));
  await h.press(h.button("Create Event"));
  const call = h.calls.find(([name]) => name === "createCreatorEvent");
  assert.ok(call, "actual screen called event creation boundary");
  assert.equal(call[1].startsAt, "2026-11-02T01:00:00.000Z");
  assert.equal(call[1].endsAt, null);
  assert.equal(call[1].status, "scheduled");
  assert.equal(call[1].replayExpiresAt, null);
  assert.match(h.text(), /Creator event created/);
});
