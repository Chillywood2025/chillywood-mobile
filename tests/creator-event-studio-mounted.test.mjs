import assert from "node:assert/strict";
import test from "node:test";
import { mount, React } from "./platform-studio-mounted-harness.mjs";

test("new event form defaults to live-only and offers replay with explicit availability and expiry", async t => {
  const h = await mount(t, { route: { tab: "live", focus: "schedule" }, videos: [] });
  assert.equal(h.button("Replay policy: No Replay").props.accessibilityState.selected, true);
  assert.equal(h.find(n => n.props.accessibilityLabel === "Replay policy: Existing Replay Without Expiry"), undefined);
  assert.match(h.text(), /Tickets are live-only by default/);
  await h.press(h.button("Replay policy: Replay Until Expiration"));
  assert.ok(h.find(n => n.props.accessibilityLabel === "Replay available date and time"));
  assert.ok(h.find(n => n.props.accessibilityLabel === "Replay expiration date and time"));
});

test("creator event save displays invalid date guidance without calling create", async t => {
  const h = await mount(t, { route: { tab: "live", focus: "schedule" }, videos: [] });
  await h.change(h.input("Event title"), "Sunday show");
  await h.change(h.input("Starts at (YYYY-MM-DDTHH:mm)"), "2026-02-30T20:00");
  await h.press(h.button("Create Event"));
  assert.match(h.text(), /Start time: enter a valid calendar date and time/);
  assert.equal(h.calls.some(([name]) => name === "createCreatorEvent"), false);
});

test("verified event ticket save survives a failed later refresh without displaying free entry",async t=>{
  const event={id:'event-one',hostUserId:'owner',eventTitle:'Sunday show',eventType:'live_first',status:'scheduled',startsAt:'2099-01-04T01:00:00.000Z',endsAt:'2099-01-04T02:00:00.000Z',timeZone:'America/New_York',replayPolicy:'none',replay:{policy:'none'},reminder:{reason:'ready'},updatedAt:'2026-10-26T00:00:00Z'};
  let reads=0,failReads=false;
  const h=await mount(t,{route:{tab:'live',focus:'schedule'},videos:[],overrides:{
    readCreatorEventReminderSummaries:async()=>[{event,activeReminderCount:0,canceledReminderCount:0}],
    listMyPaidCreatorEventOffers:async()=>{reads++;if(failReads)throw Error('network unavailable');return[];},
    configurePaidCreatorEventSale:async input=>{failReads=true;return{id:'offer-one',creatorEventId:event.id,creatorId:'owner',status:'sandbox',currency:'usd',passesSold:0,...input};},
    manageCreatorEventLifecycle:async()=>({...event,managementStatus:'sales_paused'}),
  }});
  await h.press(h.button('Configure tickets for Sunday show'));
  await h.press(h.find(n=>n.props.testID==='event-price-picker-fixture-price'));
  await h.change(h.find(n=>n.props.accessibilityLabel==='Event ticket sales open date and time'),'2098-12-20T20:00');
  await h.change(h.find(n=>n.props.accessibilityLabel==='Event ticket sales close date and time'),'2099-01-03T19:30');
  const before=reads;await h.press(h.button('Publish ticket terms'));assert.equal(reads,before,'successful readback is not replaced by another offer list read');
  assert.match(h.text(),/Viewer preview: Join Event/);assert.doesNotMatch(h.text(),/Viewer preview: Free entry/);
  await h.press(h.button('Pause new sales'));assert.equal(reads,before+1);
  assert.match(h.text(),/Previously verified settings are preserved/);assert.doesNotMatch(h.text(),/Viewer preview: Free entry/);
  assert.equal(h.button('Make Sunday show free to enter').props.disabled,true);
});

test("creator Sunday8PM schedule passes an exact instant and cleared optional fields to production save handler", async t => {
  const h = await mount(t, { route: { tab: "live", focus: "schedule" }, videos: [], overrides: {
    createCreatorEvent: async () => ({ id: "event-one" }),
  } });
  await h.change(h.input("Event title"), "Sunday show");
  await h.change(h.input("Starts at (YYYY-MM-DDTHH:mm)"), "2026-11-01T20:00-05:00");
  await h.change(h.find(n=>n.props.accessibilityLabel === "Event IANA time zone"), "America/New_York");
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

const savedEvent = {
  id: "event-one", hostUserId: "owner", eventTitle: "Sunday show", eventType: "live_first", visibility: "public",
  status: "scheduled", startsAt: "2099-01-04T01:00:00.000Z", endsAt: "2099-01-04T02:00:00.000Z",
  timeZone: "America/New_York", replayPolicy: "none", replay: { policy: "none" }, reminder: { reason: "ready" },
  updatedAt: "2026-10-26T00:00:00Z",
};

for (const status of ["sandbox", "paused", "blocked", "archived", "canceled"]) {
  test(`published ${status} ticketed event cannot be hidden with the legacy Draft toggle`, async t => {
    const h = await mount(t, { route: { tab: "live", focus: "schedule" }, videos: [], overrides: {
      readCreatorEventReminderSummaries: async () => [{ event: savedEvent, activeReminderCount: 0, canceledReminderCount: 0 }],
      listMyPaidCreatorEventOffers: async () => [{ id: "offer-one", creatorEventId: savedEvent.id, creatorId: "owner", status, currency: "usd", priceCents: 99, passesSold: 0 }],
    } });
    await h.press(h.button("Edit"));
    const draft = h.button("Event status: Draft");
    assert.equal(draft.props.disabled, true);
    assert.equal(draft.props.accessibilityState.disabled, true);
    await React.act(async () => draft.props.onPress());
    assert.equal(h.button("Event status: Scheduled").props.accessibilityState.selected, true);
    assert.match(h.text(), /Use Manage this event to pause sales or cancel a published ticketed event/);
    assert.equal(h.calls.some(([name]) => name === "updateCreatorEvent"), false);
  });
}

test("unavailable ticket readback blocks legacy Draft while verified free events retain it", async t => {
  for (const available of [false, true]) {
    const h = await mount(t, { route: { tab: "live", focus: "schedule" }, videos: [], overrides: {
      readCreatorEventReminderSummaries: async () => [{ event: savedEvent, activeReminderCount: 0, canceledReminderCount: 0 }],
      listMyPaidCreatorEventOffers: async () => { if (!available) throw new Error("ticket settings unavailable"); return []; },
      updateCreatorEvent: async (_id, payload) => ({ ...savedEvent, status: payload.status }),
    } });
    await h.press(h.button("Edit"));
    assert.equal(h.button("Event status: Draft").props.disabled, !available);
    if (available) {
      await h.press(h.button("Event status: Draft"));
      await h.press(h.button("Update Event"));
      const update = h.calls.find(([name]) => name === "updateCreatorEvent");
      assert.ok(update, "verified free event still uses the existing save handler");
      assert.equal(update[2].status, "draft");
    }
  }
});
