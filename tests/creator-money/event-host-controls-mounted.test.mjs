import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {}, doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: doc, parentNode: null, tagName: "DIV" });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const textOf = node => Array.isArray(node) ? node.map(textOf).join(" ") : node == null || typeof node === "boolean" ? "" : typeof node === "object" ? textOf(node.props?.children) : String(node);
const creator = "11111111-1111-4111-8111-111111111111", eventId = "22222222-2222-4222-8222-222222222222", roomId = `EVENT${"A".repeat(32)}`;
const event = { id: eventId, hostUserId: creator, status: "scheduled", eventTitle: "Sunday show", timeZone: "America/New_York", startsAt: "2026-11-01T01:00:00Z" };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

async function mount(t, options = {}) {
  const nodes = new Map(), calls = [], listeners = new Set(), cache = new Map();
  let authority = { userId: creator, sessionGeneration: "one", restoreOnly: false }, props = { roomId, active: true, stageActive: options.stageActive ?? true, top: 100, maxHeight: 300 };
  let mediaMounts = 0, mediaUnmounts = 0, disposed = false;
  function MediaBoundary() { React.useEffect(() => { mediaMounts++; return () => { mediaUnmounts++; }; }, []); return null; }
  const host = name => function Native(componentProps) { const id = React.useId(); nodes.set(id, { type: name, props: componentProps }); React.useEffect(() => () => nodes.delete(id), [id]); return React.createElement(React.Fragment, null, ...React.Children.toArray(componentProps.children).filter(c => typeof c === "object")); };
  const native = { StyleSheet: { create: x => x } }; for (const name of ["View", "Text", "Pressable", "ActivityIndicator", "ScrollView", "TextInput"]) native[name] = host(name);
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const context = { exports: {}, require(name) {
      if (name === "react") return React;
      if (name === "react-native") return native;
      if (name === "expo-router") return { useRouter: () => ({ push: destination => calls.push(["navigate", destination]) }) };
      if (name.endsWith("/accountSessionAuthority")) return { getCurrentAccountSessionAuthoritySnapshot: () => authority,
        sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId && a.sessionGeneration === b.sessionGeneration && a.restoreOnly === b.restoreOnly,
        subscribeToAccountSessionAuthority: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
      if (name.endsWith("/creatorEventBroadcast")) return { CreatorEventBroadcastPreparationError: Error,
        readCreatorEventForHostRoom: async id => { calls.push(["mapping", id]); return options.read ? options.read(id) : event; },
        prepareCreatorEventBroadcast: async source => { calls.push(["prepare", source.id]); return { creatorEventId: source.id, hostUserId: source.hostUserId, roomId, broadcastSessionId: eventId, state: "awaiting_operator_setup", canStart: false }; } };
      if (name.endsWith("/creatorEventBroadcastProducer")) return { controlCreatorEventBroadcast: async (source, action) => { calls.push(["producer", source.id, action]); return options.control ? options.control(source, action) : { creatorEventId: source.id, state: action === "stop" ? "stopped" : "active", reason: "verified", canStart: action !== "stop" }; }, creatorEventBroadcastStatusCopy: result => result.state === "active" ? "Verified broadcast ready" : "Broadcast stopped" };
      if (name.endsWith("/creatorEventJourney")) return { manageCreatorEventLifecycle: async (source, action) => { calls.push(["lifecycle", source.id, action]); return { ...source, status: action === "start" ? "live_now" : "ended" }; } };
      if (name.endsWith("/eventSchedule")) return { EventScheduleInputError: Error, parseZonedEventScheduleInput: () => null };
      if (name === "./event-lifecycle-controls") return load("components/monetization/event-lifecycle-controls.tsx");
      if (name === "./event-broadcast-preparation") return load("components/monetization/event-broadcast-preparation.tsx");
      throw new Error(`Unexpected dependency ${name}`);
    } };
    let source = fs.readFileSync(file, "utf8");
    if (options.mutateNavigation && file.endsWith("event-broadcast-preparation.tsx")) source = source.replace("!inHostRoom && preparation &&", "preparation &&").replace(" || currentMode.current.inHostRoom", "");
    if (options.mutateTerminalRecovery && file.endsWith("event-broadcast-preparation.tsx")) source = source.replace("if (!canPrepare && !recovery) return null;", "if (!canPrepare) return null;");
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, context, { filename: file });
    cache.set(file, context.exports); return context.exports;
  }
  const Screen = load("components/monetization/event-host-broadcast-controls.tsx").EventHostBroadcastControls, root = createRoot(container());
  const render = async () => React.act(async () => root.render(React.createElement(React.Fragment, null, React.createElement(Screen, props), React.createElement(MediaBoundary))));
  await render(); t.after(async () => { if (!disposed) await React.act(async () => root.unmount()); });
  const find = label => [...nodes.values()].find(node => node.props.accessibilityLabel === label);
  return { calls, find, media: () => ({ mounts: mediaMounts, unmounts: mediaUnmounts }), text: () => [...nodes.values()].filter(node => node.type === "Text").map(textOf).join(" "),
    press: async label => { const node = find(label); assert.ok(node, label); await React.act(async () => { void node.props.onPress(); }); },
    update: async value => { props = { ...props, ...value }; await render(); },
    account: async value => React.act(async () => { authority = value; listeners.forEach(listener => listener(authority)); }),
    resolve: async (d, value) => React.act(async () => d.resolve(value)),
    unmount: async () => { disposed = true; await React.act(async () => root.unmount()); } };
}

test("host prepares, starts producer, opens and ends exact event without navigation or media remount", async t => {
  const h = await mount(t);
  assert.deepEqual(h.calls[0], ["mapping", roomId]);
  assert.match(h.text(), /Sunday show/);
  await h.press("Prepare event host room");
  assert.equal(h.find("Enter event host room"), undefined);
  await h.press("Start event broadcast"); await h.press("Refresh broadcast readiness");
  await h.press("Start verified event"); assert.match(h.text(), /This event is live/);
  await h.press("End event");
  assert.match(h.text(), /provider confirmation is still required/);
  assert.equal(h.find("Start event broadcast"), undefined);
  assert.equal(h.find("Prepare event host room"), undefined);
  await h.press("Refresh broadcast readiness");
  assert.match(h.text(), /broadcast is still active/);
  await h.press("Stop event broadcast"); assert.match(h.text(), /Broadcast stopped/);
  assert.deepEqual(h.calls.filter(call => call[0] === "producer").map(call => call.slice(1)), [[eventId, "start"], [eventId, "refresh"], [eventId, "refresh"], [eventId, "stop"]]);
  assert.deepEqual(h.calls.filter(call => call[0] === "lifecycle").map(call => call.slice(1)), [[eventId, "start"], [eventId, "end"]]);
  assert.equal(h.calls.some(call => call[0] === "navigate"), false);
  assert.deepEqual(h.media(), { mounts: 1, unmounts: 0 });
});

test("host controls require exact server mapping and active host media surface", async t => {
  const h = await mount(t, { stageActive: false }); assert.equal(h.find("Prepare event host room"), undefined); assert.match(h.text(), /Continue to Live Stage/);
  assert.equal(h.find("Start event broadcast"), undefined);
  await h.press("Refresh broadcast readiness"); await h.press("Stop event broadcast");
  assert.deepEqual(h.calls.filter(call => call[0] === "producer").map(call => call.slice(1)), [[eventId, "refresh"], [eventId, "stop"]]);
  await h.update({ stageActive: true }); assert.ok(h.find("Prepare event host room"));
  await h.update({ active: false }); assert.equal(h.find("Prepare event host room"), undefined);
  const missing = await mount(t, { read: async () => null }); assert.equal(missing.find("Prepare event host room"), undefined); assert.ok(missing.find("Refresh host event mapping"));
  const foreign = await mount(t, { read: async () => ({ ...event, hostUserId: eventId }) }); assert.equal(foreign.find("Start verified event"), undefined);
  assert.equal(foreign.find("Stop event broadcast"), undefined);
});

test("closed event recovery remains available after media loss without preparation or restart", async t => {
  for (const status of ["ended", "canceled", "expired"]) {
    const h = await mount(t, { stageActive: false, read: async () => ({ ...event, status }) });
    assert.equal(h.find("Prepare event host room"), undefined);
    assert.equal(h.find("Start event broadcast"), undefined);
    await h.press("Refresh broadcast readiness"); await h.press("Stop event broadcast");
    assert.equal(h.calls.some(call => call[0] === "prepare" || call[0] === "navigate"), false);
    assert.deepEqual(h.calls.filter(call => call[0] === "producer").map(call => call.slice(1)), [[eventId, "refresh"], [eventId, "stop"]]);
    assert.deepEqual(h.media(), { mounts: 1, unmounts: 0 });
  }
});

test("cleanup coalesces duplicate requests and rejects stale sessions or late results", async t => {
  const pending = deferred();
  const h = await mount(t, { stageActive: false, read: async () => ({ ...event, status: "ended" }), control: () => pending.promise });
  const press = h.find("Stop event broadcast").props.onPress;
  await React.act(async () => { press(); press(); });
  assert.equal(h.calls.filter(call => call[0] === "producer").length, 1);
  await h.account({ userId: creator, sessionGeneration: "two", restoreOnly: true });
  await React.act(async () => { press(); });
  await h.resolve(pending, { creatorEventId: eventId, state: "stopped" });
  assert.equal(h.calls.filter(call => call[0] === "producer").length, 1);
  assert.doesNotMatch(h.text(), /Broadcast stopped/);
  assert.deepEqual(h.media(), { mounts: 1, unmounts: 0 });
});

test("cleanup transport rejection stays visible and retry checks the same event", async t => {
  let attempts = 0;
  const h = await mount(t, { stageActive: false, control: async () => {
    if (++attempts === 1) throw new Error("synthetic transport failure");
    return { creatorEventId: eventId, state: "stopped" };
  } });
  await h.press("Stop event broadcast"); assert.match(h.text(), /existing attempt/);
  await h.press("Refresh broadcast readiness"); assert.match(h.text(), /Broadcast stopped/);
  assert.deepEqual(h.calls.filter(call => call[0] === "producer").map(call => call.slice(1)), [[eventId, "stop"], [eventId, "refresh"]]);
});

test("retired start handler cannot run after host media loss or event close", async t => {
  const h = await mount(t);
  await h.press("Prepare event host room");
  const oldStart = h.find("Start event broadcast").props.onPress;
  await h.update({ stageActive: false });
  await React.act(async () => { oldStart(); });
  assert.equal(h.calls.some(call => call[0] === "producer"), false);
  await h.update({ stageActive: true });
  await h.press("Prepare event host room");
  const beforeClose = h.find("Start event broadcast").props.onPress;
  await h.press("Start verified event"); await h.press("End event");
  await React.act(async () => { beforeClose(); });
  assert.equal(h.calls.some(call => call[0] === "producer"), false);
});

test("late active provider result after event end remains a shutdown obligation", async t => {
  const pending = deferred(); const h = await mount(t, { control: () => pending.promise });
  await h.press("Prepare event host room"); await h.press("Start event broadcast");
  await h.press("Start verified event"); await h.press("End event");
  await h.resolve(pending, { creatorEventId: eventId, state: "active", canStart: true });
  assert.match(h.text(), /broadcast is still active/);
  assert.equal(h.find("Start event broadcast"), undefined);
  assert.ok(h.find("Stop event broadcast"));
  assert.deepEqual(h.media(), { mounts: 1, unmounts: 0 });
});

test("terminal recovery mutation reproduces hidden shutdown confirmation", async t => {
  const h = await mount(t, { mutateTerminalRecovery: true, read: async () => ({ ...event, status: "ended" }) });
  assert.equal(h.find("Refresh broadcast readiness"), undefined);
  assert.equal(h.find("Stop event broadcast"), undefined);
});

test("pending mapping cannot cross session, room, background or unmount", async t => {
  for (const change of ["session", "room", "background", "unmount"]) {
    const d = deferred(); const h = await mount(t, { read: () => d.promise });
    if (change === "session") await h.account({ userId: creator, sessionGeneration: "two", restoreOnly: true });
    if (change === "room") await h.update({ roomId: `EVENT${"B".repeat(32)}`, active: false });
    if (change === "background") await h.update({ active: false });
    if (change === "unmount") await h.unmount();
    await h.resolve(d, event); assert.equal(h.find("Start verified event"), undefined);
    assert.equal(h.calls.some(call => call[0] === "producer"), false);
  }
});

test("navigation mutation control reproduces the forbidden duplicate-host navigation", async t => {
  const h = await mount(t, { mutateNavigation: true }); await h.press("Prepare event host room");
  assert.ok(h.find("Enter event host room")); await h.press("Enter event host room"); assert.ok(h.calls.some(call => call[0] === "navigate"));
});

test("production stage colocates controls beside media with existing focus and host authority", () => {
  const source = fs.readFileSync("app/watch-party/live-stage/[partyId].tsx", "utf8");
  assert.match(source, /const canOwnActiveStageSurface = isFocused && !isLiveRoomSurface/);
  assert.match(source, /isHost && isPreparedEventRoom \? <EventHostBroadcastControls[\s\S]*?active=\{isFocused && mediaAppState === "active" && canUseBetaStage && authority\?\.userId === room\?\.hostUserId\}/);
  assert.match(source, /stageActive=\{shouldRenderLiveKitStage && liveKitStageSurfaceContract\?\.participantRole === "host"\}/);
  assert.match(source, /isHost && !isPreparedEventRoom \? \([\s\S]*?live-stage-host-money-controls/);
  assert.equal(source.split("<EventHostBroadcastControls").length - 1, 1);
});
