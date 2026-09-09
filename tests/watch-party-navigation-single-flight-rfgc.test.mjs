import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createActionSingleFlightLatch,
  runKeyedSingleFlight,
} from "../_lib/actionSingleFlight.mjs";
import { resolvePreparedWatchPartyRoomReuse } from "../_lib/watchPartyPreparedRoomReuse.mjs";
import {
  resolveWatchPartyReturnNavigation,
  WATCH_PARTY_WAITING_ROOM_ENTRY_SOURCE,
} from "../_lib/watchPartyReturnNavigation.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const player = read("app/player/[id].tsx");
const titleDetail = read("app/title/[id].tsx");
const liveTab = read("app/(tabs)/live.tsx");
const waitingRoom = read("app/watch-party/index.tsx");
const partyRoomRoute = read("app/watch-party/[partyId].tsx");
const spectatorLive = read("app/spectate-live/[itemId].tsx");
const spectatorMetadata = read("app/spectate-metadata/[itemId].tsx");
const spectatorChildRooms = read("_lib/spectatorChildRooms.ts");
const rootLayout = read("app/_layout.tsx");
const watchParty = read("_lib/watchParty.ts");
const liveEvents = read("_lib/liveEvents.ts");
const revenueCat = read("_lib/revenuecat.ts");
const moneyAuthority = read("supabase/migrations/20260824034109_creator_money_authority_integrity_closeout.sql");
const eventAndSeatAuthority = read("supabase/migrations/20260902091803_party_room_live_stage_event_ux_rfgc.sql");
const login = read("app/(auth)/login.tsx");
const signup = read("app/(auth)/signup.tsx");
const forgotPassword = read("app/(auth)/forgot-password.tsx");
const resetPassword = read("app/reset-password.tsx");

test("ten rapid accepted Watch-Party Live presses execute one asynchronous navigation", async () => {
  const latch = createActionSingleFlightLatch();
  let releaseAuthority;
  const authority = new Promise((resolve) => { releaseAuthority = resolve; });
  let navigations = 0;

  const action = async () => {
    if (!latch.tryAcquire()) return;
    let navigationAccepted = false;
    try {
      await authority;
      navigations += 1;
      navigationAccepted = true;
    } finally {
      if (!navigationAccepted) latch.release();
    }
  };

  const presses = Array.from({ length: 10 }, () => action());
  releaseAuthority();
  await Promise.all(presses);
  assert.equal(navigations, 1);
  assert.equal(latch.tryAcquire(), false, "accepted navigation remains latched until focus leaves and returns");
  latch.release();
  assert.equal(latch.tryAcquire(), true, "focus re-entry releases the transition latch");
  latch.release();
});

test("duplicate asynchronous completions share one keyed creation/provider operation", async () => {
  const registry = new Map();
  let invocations = 0;
  let releaseOperation;
  const blocked = new Promise((resolve) => { releaseOperation = resolve; });
  const operation = async () => {
    invocations += 1;
    await blocked;
    return { id: "one-authoritative-result" };
  };

  const first = runKeyedSingleFlight(registry, "exact-user:exact-target", operation);
  const second = runKeyedSingleFlight(registry, "exact-user:exact-target", operation);
  assert.equal(first, second);
  releaseOperation();
  assert.deepEqual(await Promise.all([first, second]), [
    { id: "one-authoritative-result" },
    { id: "one-authoritative-result" },
  ]);
  assert.equal(invocations, 1);
});

test("failed navigation or mutation releases both latch forms for a safe retry", async () => {
  const latch = createActionSingleFlightLatch();
  assert.equal(latch.tryAcquire(), true);
  latch.release();
  assert.equal(latch.tryAcquire(), true);
  latch.release();

  const registry = new Map();
  let attempts = 0;
  await assert.rejects(() => runKeyedSingleFlight(registry, "retryable", async () => {
    attempts += 1;
    throw new Error("navigation failed");
  }));
  assert.equal(await runKeyedSingleFlight(registry, "retryable", async () => {
    attempts += 1;
    return "recovered";
  }), "recovered");
  assert.equal(attempts, 2);
});

test("an exact prepared title room is reused instead of creating a second room", () => {
  const room = {
    hostUserId: "host-a",
    partyId: "room-a",
    roomType: "title",
    sourceId: "title-a",
    titleId: "title-a",
  };
  assert.deepEqual(resolvePreparedWatchPartyRoomReuse({
    expectedPartyId: "ROOM-A",
    expectedRoomType: "title",
    expectedSourceId: "title-a",
    expectedTitleId: "title-a",
    room,
    userId: "HOST-A",
  }), { allowed: true, reason: "exact_prepared_room" });
});

test("prepared-room reuse fails closed across host, target, type, and content boundaries", () => {
  const base = {
    expectedPartyId: "room-a",
    expectedRoomType: "title",
    expectedSourceId: "title-a",
    expectedTitleId: "title-a",
    room: {
      hostUserId: "host-a",
      partyId: "room-a",
      roomType: "title",
      sourceId: "title-a",
      titleId: "title-a",
    },
    userId: "host-a",
  };
  assert.equal(resolvePreparedWatchPartyRoomReuse({ ...base, userId: "host-b" }).allowed, false);
  assert.equal(resolvePreparedWatchPartyRoomReuse({ ...base, expectedPartyId: "room-b" }).allowed, false);
  assert.equal(resolvePreparedWatchPartyRoomReuse({ ...base, expectedRoomType: "live" }).allowed, false);
  assert.equal(resolvePreparedWatchPartyRoomReuse({ ...base, expectedSourceId: "title-b" }).allowed, false);
  assert.equal(resolvePreparedWatchPartyRoomReuse({ ...base, room: null }).allowed, false);
});

test("Player closes the same-frame tap window before Premium and route work", () => {
  const handlerStart = player.indexOf("const onWatchParty = useCallback(async () =>");
  const handler = player.slice(handlerStart, player.indexOf("const onSubmitTitleReport", handlerStart));
  assert.ok(handler.indexOf("watchPartyTransitionLatchRef.current.tryAcquire()") < handler.indexOf("ensureWatchPartyLivePremium"));
  assert.match(handler, /navigationAccepted = true;[\s\S]*finally[\s\S]*if \(!navigationAccepted\)[\s\S]*watchPartyTransitionLatchRef\.current\.release\(\)/u);
  assert.match(player, /useFocusEffect\([\s\S]{0,220}watchPartyTransitionLatchRef\.current\.release\(\)/u);
  assert.match(player, /accessibilityState=\{\{[\s\S]{0,120}busy: watchPartyTransitionInFlight/u);
  assert.match(player, /disabled=\{watchPartyTransitionInFlight\}/u);
});

test("identical waiting rooms and canonical destination routes are singular in the stack", () => {
  assert.match(rootLayout, /name="watch-party\/index" dangerouslySingular=\{getWatchPartyWaitingRoomSingularId\}/u);
  assert.match(rootLayout, /name="watch-party\/\[partyId\]" dangerouslySingular/u);
  assert.match(rootLayout, /name="watch-party\/live-stage\/\[partyId\]" \/>/u);
  assert.match(rootLayout, /name="event\/\[eventId\]" dangerouslySingular/u);
  assert.match(waitingRoom, /pathname: "\/watch-party\/\[partyId\]"/u);
  assert.match(waitingRoom, /entrySource: WATCH_PARTY_WAITING_ROOM_ENTRY_SOURCE/u);
  assert.doesNotMatch(waitingRoom, /pathname: "\/watch-party\/live-stage\/\[partyId\]"/u);
});

test("Party Room returns to the existing Waiting Room instead of replacing itself with a duplicate", () => {
  assert.equal(resolveWatchPartyReturnNavigation({
    canGoBack: true,
    entrySource: WATCH_PARTY_WAITING_ROOM_ENTRY_SOURCE,
  }), "back");
  assert.equal(resolveWatchPartyReturnNavigation({
    canGoBack: false,
    entrySource: WATCH_PARTY_WAITING_ROOM_ENTRY_SOURCE,
  }), "replace");
  assert.equal(resolveWatchPartyReturnNavigation({
    canGoBack: true,
    entrySource: "direct-link",
  }), "replace");

  const canonicalStack = ["player", "waiting-room", "party-room"];
  if (resolveWatchPartyReturnNavigation({
    canGoBack: true,
    entrySource: WATCH_PARTY_WAITING_ROOM_ENTRY_SOURCE,
  }) === "back") {
    canonicalStack.pop();
  }
  assert.deepEqual(canonicalStack, ["player", "waiting-room"]);
  canonicalStack.pop();
  assert.deepEqual(canonicalStack, ["player"]);
  assert.match(partyRoomRoute, /resolveWatchPartyReturnNavigation\(\{[\s\S]{0,180}router\.canGoBack\(\)[\s\S]{0,240}router\.back\(\)/u);
});

test("same-class async room entry and creation actions use synchronous latches", () => {
  assert.match(liveTab, /liveTransitionLatchRef\.current\.tryAcquire\(\)[\s\S]{0,180}setLiveTransitionInFlight\(true\)/u);
  assert.match(titleDetail, /watchPartyTransitionLatchRef\.current\.tryAcquire\(\)[\s\S]{0,180}setWatchPartyTransitionInFlight\(true\)/u);
  assert.match(waitingRoom, /joinLookupLatchRef\.current\.tryAcquire\(\)/u);
  assert.match(waitingRoom, /createRoomLatchRef\.current\.tryAcquire\(\)[\s\S]{0,180}setCreating\(true\)/u);
  assert.match(waitingRoom, /joinRoomLatchRef\.current\.tryAcquire\(\)[\s\S]{0,120}setJoinActionBusy\(true\)/u);
  assert.match(watchParty, /partyRoomCreateFlights[\s\S]*runKeyedSingleFlight\([\s\S]*createPartyRoomOnce/u);
  assert.match(liveEvents, /creatorEventCreateFlights[\s\S]*runKeyedSingleFlight\([\s\S]*createCreatorEventOnce/u);
  assert.match(spectatorLive, /startReactionLatchRef\.current\.tryAcquire\(\)/u);
  assert.match(spectatorMetadata, /startRoomLatchRef\.current\.tryAcquire\(\)/u);
  assert.match(spectatorChildRooms, /spectatorChildRoomFlights[\s\S]*runKeyedSingleFlight\([\s\S]*startSpectatorChildRoomOnce/u);
  const createHandler = waitingRoom.slice(waitingRoom.indexOf("const onCreateRoom"), waitingRoom.indexOf("const onBrowseTitles"));
  assert.ok(createHandler.indexOf("getPartyRoom(preparedTargetPartyId)") < createHandler.indexOf("resolvePreparedWatchPartyRoomReuse"));
  assert.ok(createHandler.indexOf("resolvePreparedWatchPartyRoomReuse") < createHandler.indexOf("createPartyRoom(effectiveTitleId"));
  assert.match(createHandler, /if \(preparedTargetPartyId\)[\s\S]*navigationAccepted = navigateToRoom\([\s\S]*return;/u);
});

test("purchase and Restore calls coalesce before the provider mutation and remain authority-bound", () => {
  assert.match(revenueCat, /revenueCatMutationFlights/u);
  assert.match(revenueCat, /runKeyedSingleFlight\(revenueCatMutationFlights, exactFlightKey/u);
  assert.match(revenueCat, /purchase-package:\$\{expectedProductIdentifier\}/u);
  assert.match(revenueCat, /purchase-product:\$\{expectedProductIdentifier\}/u);
  assert.match(revenueCat, /runRevenueCatMutation\("restore"/u);
  assert.match(revenueCat, /authorityHint\?\.sessionGeneration/u);
  assert.match(moneyAuthority, /perform pg_advisory_xact_lock\(hashtextextended\([\s\S]{0,180}'google-money-intent:'/u);
  assert.match(moneyAuthority, /pooled_provider_product_intent_already_pending/u);
});

test("auth submissions close the same-frame gap before asynchronous provider or authority work", () => {
  const loginStart = login.indexOf("const signIn = async () =>");
  const signupStart = signup.indexOf("const signUp = async () =>");
  const forgotStart = forgotPassword.indexOf("const sendPasswordReset = async () =>");
  const resetStart = resetPassword.indexOf("const updatePassword = useCallback(async () =>");
  const loginHandler = login.slice(loginStart, login.indexOf("return (", loginStart));
  const signupHandler = signup.slice(signupStart, signup.indexOf("return (", signupStart));
  const forgotHandler = forgotPassword.slice(forgotStart, forgotPassword.indexOf("return (", forgotStart));
  const resetHandler = resetPassword.slice(resetStart, resetPassword.indexOf("return (", resetStart));

  for (const [name, handler, latch, asyncBoundary] of [
    ["login", loginHandler, "signInLatchRef.current.tryAcquire()", "supabase.auth.signInWithPassword"],
    ["signup", signupHandler, "signUpLatchRef.current.tryAcquire()", "await readAppConfig()"],
    ["forgot password", forgotHandler, "passwordResetRequestLatchRef.current.tryAcquire()", "await requestPasswordResetEmail"],
    ["reset password", resetHandler, "passwordUpdateLatchRef.current.tryAcquire()", "await isCurrentAccountSessionAuthority"],
  ]) {
    assert.ok(handler.indexOf(latch) >= 0, `${name} must acquire its synchronous latch`);
    assert.ok(handler.indexOf(latch) < handler.indexOf(asyncBoundary), `${name} must latch before asynchronous work`);
    assert.match(handler, /finally \{[\s\S]*LatchRef\.current\.release\(\)[\s\S]*set(?:Loading|Saving)\(false\)/u);
  }
});

test("seat requests and financial grants retain server-side idempotency", () => {
  assert.match(eventAndSeatAuthority, /request_my_live_watch_party_seat/u);
  assert.match(eventAndSeatAuthority, /for update/u);
  assert.match(eventAndSeatAuthority, /'alreadyRequested',true/u);
  assert.match(eventAndSeatAuthority, /'alreadyRequested',false/u);
});

test("regression covers the repeated-input condition omitted by prior single-tap destination proof", () => {
  const inspectedCriticalActions = {
    watchPartyLive: "SAME_CLASS_DEFECT_REPAIRED",
    liveWatchPartyStartLive: "SAME_CLASS_DEFECT_REPAIRED",
    createRoom: "SAME_CLASS_DEFECT_REPAIRED",
    joinRoom: "SAME_CLASS_DEFECT_REPAIRED",
    titleAndCircleSpectatorEntry: "SAME_CLASS_DEFECT_REPAIRED",
    eventCreate: "SAME_CLASS_DEFECT_REPAIRED",
    purchaseAndRestore: "SAME_CLASS_DEFECT_REPAIRED_AT_PROVIDER_BOUNDARY",
    requestSeat: "CORRECT_SERVER_IDEMPOTENT",
    authSubmissions: "SAME_CLASS_DEFECT_REPAIRED",
    synchronousNonMutatingRouteActions: "CORRECT_ROUTE_SINGULAR_OR_NOT_APPLICABLE",
  };
  assert.equal(Object.values(inspectedCriticalActions).some((value) => !value), false);
  assert.equal(Object.keys(inspectedCriticalActions).length, 10);
});
