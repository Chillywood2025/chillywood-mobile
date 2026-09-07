import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const presentation = read("_lib/accessProductPresentation.ts");
const partySetup = read("app/watch-party/index.tsx");
const partyRoom = read("app/watch-party/[partyId].tsx");
const partyContentSources = read("_lib/watchPartyContentSources.ts");
const accessSheet = read("components/monetization/access-sheet.tsx");
const subscribe = read("app/subscribe.tsx");
const partyMoney = read("_lib/paidWatchPartyTickets.ts");
const setupCatalog = read("_lib/creatorMonetizationSetup.ts");
const adminSandbox = read("app/admin-money-sandbox-purchases.tsx");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const liveMoney = read("_lib/liveWatchPartyMoney.ts");
const livePresentation = read("_lib/watch-party/live-stage-presentation.ts");
const eventRoute = read("app/event/[eventId].tsx");
const eventMoney = read("_lib/paidCreatorEvents.ts");
const channelSettings = read("app/channel-settings.tsx");
const channel = read("app/channel/[userId].tsx");
const notifications = read("_lib/notifications.ts");
const webhook = read("supabase/functions/revenuecat-webhook/index.ts");
const liveKit = read("supabase/functions/livekit-token/index.ts");
const migration = read("supabase/migrations/20260902091803_party_room_live_stage_event_ux_rfgc.sql");
const authorityMigration = read("supabase/migrations/20260901010000_watch_party_live_money_rfgc_closure.sql");
const replayFunction = read("supabase/functions/request-save-replay/index.ts");
const spectatorStartRoom = read("supabase/functions/spectator-start-room/index.ts");
const supabaseConfig = read("supabase/config.toml");
const hostBootstrapMigration = read("supabase/migrations/20260907080000_party_room_host_membership_bootstrap_closure.sql");

test("display-layer product names map onto unchanged internal authority identifiers", () => {
  const expected = [
    ["watch_party_live_ticket", "Party Room Pass"],
    ["live_watch_party_access_pass", "Live Stage Pass"],
    ["live_watch_party_seat_pass", "Live Stage Seat Pass"],
    ["event_pass", "Event Pass"],
  ];
  for (const [internalName, publicName] of expected) {
    assert.match(presentation, new RegExp(`${internalName}:[\\s\\S]{0,180}publicName: "${publicName}"`, "u"));
  }
  assert.match(partyMoney, /watch_party_live_ticket_sandbox_099/u);
  assert.match(partyMoney, /cw_watch_party_live_ticket_sandbox_099/u);
  assert.match(liveMoney, /live_watch_party_access_pass_sandbox_099/u);
  assert.match(setupCatalog, /cw_live_watch_party_access_sandbox_099/u);
  assert.match(liveMoney, /live_watch_party_seat_pass_sandbox_099/u);
  assert.match(setupCatalog, /cw_live_watch_party_seat_sandbox_099/u);
  assert.match(eventMoney, /event_pass_sandbox_099/u);
  assert.match(eventMoney, /cw_event_pass_sandbox_099/u);
});

test("Party Room creator setup is contextual Free or Paid entry with an exact viewer preview", () => {
  assert.match(partySetup, /PARTY ROOM ENTRY/u);
  assert.match(partySetup, /: "Free"/u);
  assert.match(partySetup, /Paid · \$0\.99/u);
  assert.match(partySetup, /Charge for Party Room entry/u);
  assert.match(partySetup, /Viewer preview: Join Party Room/u);
  assert.match(partySetup, /never grants Live Stage, speaker, host, moderator, or LiveKit publish authority/u);
  assert.match(partySetup, /status: paid \? "sandbox" : "canceled"/u);
  assert.match(partySetup, /listMyPaidWatchPartyOffers/u);
  assert.match(partySetup, /setPartyRoomEntryPaid\(!!enabledOffer\)/u);
  assert.match(partySetup, /Viewer preview: Free entry to this exact Party Room/u);
  assert.doesNotMatch(partySetup, />watch_party_live_ticket</u);
});

test("paid Party Room viewer copy identifies exact authority before and after checkout", () => {
  assert.match(partyRoom, /Party Room Pass required/u);
  assert.match(partyRoom, /gives you entry to this exact Party Room/u);
  assert.match(partyRoom, /Join Party Room —/u);
  assert.match(partyRoom, /does not include Live Stage, speaking, camera, microphone, host, moderator, LiveKit publish authority/u);
  assert.match(partyMoney, /Party Room Pass active\. You're cleared to enter this Party Room\./u);
  assert.doesNotMatch(partyRoom, /live-stage/u);
});

test("Party Room presents exact public content identity without exposing its internal source id", () => {
  assert.match(partyRoom, />Content<\/Text>/u);
  assert.match(partyRoom, /\{partyRoomTitleContext\}<\/Text>/u);
  assert.doesNotMatch(partyRoom, /\{partyRoomSourceId \|\| "Resolving"\}/u);
  assert.doesNotMatch(partyRoom, /Selected Title/u);
  assert.doesNotMatch(partySetup, /Selected Title/u);

  assert.match(partyContentSources, /\.select\("id,title"\)/u);
  assert.match(partyContentSources, /\.eq\("id", sourceId\)/u);
  assert.match(partyContentSources, /\.eq\("visibility", "public"\)/u);
  assert.match(partyContentSources, /\.in\("moderation_status", \["clean", "pending_review", "reported"\]\)/u);
  assert.match(partyContentSources, /displayName: publicMetadataVideo\?\.title \?\? video\?\.title \?\? null/u);
  assert.match(partyContentSources, /playbackUrl: video\?\.playbackUrl \?\? null/u);
  assert.match(partyContentSources, /isPlayable: !unavailableReason/u);

  assert.match(partySetup, /resolveWatchPartyContentDisplayByParts/u);
  assert.match(partySetup, /resolveWatchPartyContentDisplay\(room\)/u);
  assert.match(partySetup, /contentTitle: nextPreview\.titleName/u);
  assert.match(partySetup, /contentTitle: entryTitleName/u);
  assert.match(partySetup, /rememberWatchPartyContentDisplayHandoff\(/u);
  assert.doesNotMatch(partySetup, /contentTitle: nextContentTitle/u);
  assert.doesNotMatch(partyRoom, /contentTitleParam|routeDisplayHintMatchesExactSource/u);
  assert.match(partyContentSources, /contentDisplayHandoffs = new Map<string, WatchPartyContentDisplayHandoff>/u);
  assert.match(partyContentSources, /DISPLAY_HANDOFF_TTL_MS = 5 \* 60 \* 1000/u);
  assert.match(partyContentSources, /DISPLAY_HANDOFF_MAX_ENTRIES = 20/u);
  assert.match(partyContentSources, /handoff\.sourceType !== input\.sourceType \|\| handoff\.sourceId !== sourceId/u);
  assert.match(partyRoom, /readWatchPartyContentDisplayHandoff\(\{[\s\S]{0,180}partyId: snapshot\.room\.partyId[\s\S]{0,180}sourceId: exactSourceId/u);
  assert.match(partyRoom, /contentDisplay\?\.displayName \?\? exactDisplayHandoff/u);
  assert.match(partyRoom, /setTitleName\(null\);[\s\S]{0,100}\[partyId\]/u);
  assert.match(
    partyRoom,
    /const contentDisplay = snapshot\.room\.roomType === "live"[\s\S]{0,180}await resolveWatchPartyContentDisplay\(snapshot\.room\)\.catch\(\(\) => null\);/u,
  );
  assert.match(partyRoom, /if \(cancelled\) return;[\s\S]{0,620}contentDisplay\?\.displayName/u);
  assert.doesNotMatch(
    partyRoom,
    /resolveWatchPartyContentDisplay\(snapshot\.room\)[\s\S]{0,80}\.then\(/u,
  );
  assert.doesNotMatch(partyRoom, /resolveWatchPartyContentSource\(snapshot\.room\)/u);
  const displayResolverStart = partyContentSources.indexOf("export async function resolveWatchPartyContentDisplayByParts");
  const playbackResolverStart = partyContentSources.indexOf("export async function resolveWatchPartyContentSourceByParts");
  const displayResolver = partyContentSources.slice(displayResolverStart, playbackResolverStart);
  assert.ok(displayResolverStart >= 0 && playbackResolverStart > displayResolverStart);
  assert.match(displayResolver, /readPublicCreatorVideoMetadata\(sourceId\)/u);
  assert.doesNotMatch(displayResolver, /readCreatorVideoForPlayer|resolveSignedVideoPlaybackSource|readSpectatorPlaybackReadout/u);
});

test("Party Room creation atomically persists exact host membership on every producer", () => {
  assert.match(hostBootstrapMigration, /new\."room_type" not in \('live', 'title'\)/u);
  assert.match(hostBootstrapMigration, /whole_app_exact_current_session_authority_internal/u);
  assert.match(hostBootstrapMigration, /auth\.uid\(\) is distinct from new\."host_user_id"/u);
  assert.match(hostBootstrapMigration, /join_watch_party_room_session/u);
  assert.doesNotMatch(hostBootstrapMigration, /grant execute/u);
  assert.match(spectatorStartRoom, /const createActorClient = \(authorization: string\)/u);
  assert.match(spectatorStartRoom, /insertChildRoom\(authResult\.actorClient, action, user\.id, itemId\)/u);
  assert.doesNotMatch(spectatorStartRoom, /insertChildRoom\(adminClient, action, user\.id, itemId\)/u);
});

test("Premium and access-pass gates refresh exact authority after focus, resume, and delayed projection", () => {
  assert.match(accessSheet, /useFocusEffect\(refreshVisibleSheetState\)/u);
  assert.match(accessSheet, /AppState\.addEventListener\("change"/u);
  assert.match(accessSheet, /PREMIUM_GATE_BACKGROUND_CONVERGENCE_ATTEMPTS = 6/u);
  assert.match(accessSheet, /premiumConvergenceAttemptRef\.current \+= 1/u);
  assert.match(accessSheet, /generation === sheetLoadGenerationRef\.current/u);
  assert.match(subscribe, /useFocusEffect\(/u);
  assert.match(subscribe, /AppState\.addEventListener\("change"/u);
  assert.match(subscribe, /refreshSnapshot\(true, activePurchaseMode\)/u);
  assert.doesNotMatch(accessSheet, /setPremium.*true|manual.*premium|owner.*premium.*allow/iu);
});

test("Party Room and Live Stage host ending use an explicitly deployed, self-authenticating exact-room function", () => {
  assert.match(supabaseConfig, /\[functions\.request-save-replay\]\s+verify_jwt = false/u);
  assert.match(replayFunction, /authenticateRequest\(req\)/u);
  assert.match(replayFunction, /toText\(room\.host_user_id\) !== authResult\.user\.id/u);
  assert.match(replayFunction, /\.eq\("party_id", partyId\)\s+\.select\("party_id"\)\s+\.maybeSingle\(\)/u);
  assert.match(replayFunction, /if \(error\) throw new Error\(`party_room_end_failed:/u);
  assert.match(replayFunction, /if \(!data\?\.party_id\) throw new Error\("party_room_end_failed:room_not_found"\)/u);
  assert.match(partyRoom, /action: "end_without_saving"[\s\S]{0,120}sourceType: "watch_party_live"/u);
  assert.match(liveStage, /action: "end_without_saving"[\s\S]{0,120}sourceType: "live_stage"/u);
});

test("Live Stage creator setup separates viewer entry from speaking-seat eligibility", () => {
  assert.match(liveStage, />VIEWER ENTRY</u);
  assert.match(liveStage, />SPEAKING-SEAT ELIGIBILITY</u);
  assert.match(liveStage, /Set Live Stage viewer entry to/u);
  assert.match(liveStage, /Set speaking-seat eligibility to/u);
  assert.match(liveStage, /A Live Stage Seat Pass makes a viewer eligible for a speaking seat\. You still decide who is approved to speak\./u);
  assert.match(liveStage, /Payment never grants host, moderator, speaker, camera, microphone, or LiveKit publish authority/u);
  assert.match(liveStage, /Viewer preview:/u);
});

test("Live Stage entry and seat purchase copy cannot be mistaken for each other", () => {
  assert.match(liveStage, /Live Stage Pass gives you viewer\/listener access to this exact Live Stage/u);
  assert.match(liveStage, /Watch Live —/u);
  assert.match(liveStage, /Live Stage Seat Pass: eligible for a speaking seat on this Live Stage\. Host approval required/u);
  assert.match(liveStage, /Live Stage Seat Pass —/u);
  assert.match(liveStage, /Live Stage Pass active\. You can watch\/listen to this Live Stage\./u);
  assert.match(liveStage, /Live Stage Seat Pass active\. You're eligible for a speaking seat\. Host approval is still required\./u);
  assert.doesNotMatch(liveStage, /You're a speaker/u);
  assert.match(liveStage, /live-stage-buy-seat-eligibility-live-first/u);
  assert.match(liveStage, /live-stage-request-camera-button-live-first/u);
});

test("Live Stage UX preserves the verified Google Play-only provider boundary on every platform", () => {
  assert.match(
    setupCatalog,
    /key: "live_watch_party_access_pass_sandbox_099"[\s\S]{0,420}providerRail: REVENUECAT_GOOGLE_PLAY_PROVIDER/u,
  );
  assert.match(
    setupCatalog,
    /key: "live_watch_party_seat_pass_sandbox_099"[\s\S]{0,420}providerRail: REVENUECAT_GOOGLE_PLAY_PROVIDER/u,
  );
  assert.match(liveMoney, /Platform\.OS !== "android"/u);
  assert.match(liveMoney, /available only in the verified Google Play sandbox/u);
  assert.match(liveStage, /LIVE_STAGE_PASS_PURCHASE_AVAILABLE = Platform\.OS === "android"/u);
  assert.match(liveStage, /Paid Live Stage passes currently use the verified Google Play sandbox/u);
  assert.match(liveStage, /iPhone viewers cannot buy them on this build/u);
  assert.match(liveStage, /live-stage-seat-pass-unavailable-live-first/u);
  assert.match(liveStage, /live-stage-seat-pass-unavailable/u);
  assert.match(adminSandbox, /Live Stage checkout unavailable on iPhone/u);
  assert.match(adminSandbox, /remain bound to the verified Google Play sandbox/u);
});

test("seat checkout is denied before charge when paid Live Stage entry is missing", () => {
  const precheck = liveMoney.indexOf('input.passType === "live_watch_party_seat_pass"');
  const purchaseIntent = liveMoney.indexOf('rpc("create_live_watch_party_purchase_intent"');
  const storeCharge = liveMoney.indexOf("purchaseRevenueCatStoreProduct(storeProduct");
  const finalEntryCheck = liveMoney.lastIndexOf("await readLiveWatchPartyMoneyAccess(input.partyId)", storeCharge);
  assert.ok(precheck >= 0 && purchaseIntent > precheck);
  assert.ok(finalEntryCheck > purchaseIntent && storeCharge > finalEntryCheck);
  assert.match(liveMoney, /A Live Stage Pass is required before a Live Stage Seat Pass can be purchased/u);
  assert.match(migration, /enforce_live_stage_entry_before_seat_intent/u);
  assert.match(migration, /live_stage_entry_required_before_seat_pass/u);
  assert.match(migration, /has_exact_live_watch_party_pass_internal/u);
  assert.match(liveMoney, /isLiveWatchPartyPassConfirmed/u);
  assert.match(liveMoney, /exactText\(row\?\.partyId\) !== exactText\(input\.partyId\)/u);
  assert.match(liveMoney, /access\.accessOfferId === exactOfferId/u);
  assert.match(liveMoney, /access\.seatOfferId === exactOfferId/u);
  assert.match(liveMoney, /resolveSeatReviewState\(pass, access\.seatApproved\)/u);
});

test("seat lifecycle labels distinguish eligibility, request, rejection, approval, and speaker membership", () => {
  for (const label of ["Seat eligible", "Seat requested", "Rejected", "Approved speaker", "Viewer", "Removed"]) {
    assert.match(livePresentation, new RegExp(`"${label}"`, "u"));
  }
  assert.match(liveStage, /requestMyLiveWatchPartySeat\(partyId\)/u);
  assert.match(liveStage, /rejectLiveWatchPartySeatRequest/u);
  assert.match(migration, /request_my_live_watch_party_seat/u);
  assert.match(migration, /review_live_watch_party_seat_request/u);
  assert.match(migration, /list_live_watch_party_seat_states_for_host/u);
  assert.match(liveMoney, /rpc\("list_live_watch_party_seat_states_for_host"/u);
  assert.match(migration, /has_exact_live_watch_party_pass_internal"\(\s*v_party,pass_row\."buyer_id"/u);
  assert.match(migration, /new\."stage_role"='speaker'/u);
  assert.doesNotMatch(migration, /set\s+"stage_role"='speaker'/u);
  assert.match(liveKit, /speakerEligible/u);
});

test("Event Pass stays on the exact Event route and does not inherit generic Live Stage authority", () => {
  assert.match(eventRoute, /Event Pass required/u);
  assert.match(eventRoute, /Join Event —/u);
  assert.match(eventRoute, /An Event Pass gives access to this exact Event only/u);
  assert.match(eventMoney, /Event Pass active\. You have access to this Event\./u);
  assert.match(eventRoute, /This Event is free to enter\. No Event Pass is required/u);
  assert.match(eventRoute, /access\.reason === "event_pass_confirmed"/u);
  assert.match(eventRoute, /access\.reason === "creator_or_admin"/u);
  assert.match(eventRoute, /access\.reason === "free_event"/u);
  assert.doesNotMatch(eventRoute, /watch-party\/live-stage/u);
  assert.doesNotMatch(eventMoney, /live_watch_party_access_pass|live_watch_party_seat_pass/u);
  assert.match(channelSettings, /Choose Free or Paid entry for this exact Event/u);
  assert.match(channelSettings, /status: paid \? "sandbox" : "canceled"/u);
});

test("viewer discovery opens exact Party Room and Event destinations instead of buying from a generic catalog", () => {
  assert.match(channel, /pathname: "\/watch-party\/\[partyId\]"/u);
  assert.match(channel, /button: watchPartyTicketOffer\?\.partyId \? "Open Party Room"/u);
  assert.match(channel, /router\.push\(`\/event\/\$\{firstEvent\.id\}`/u);
  assert.match(channel, /button: firstEvent \? "Open Event"/u);
  assert.doesNotMatch(channel, /purchasePaidWatchPartyTicket/u);
  assert.doesNotMatch(channel, /purchasePaidCreatorEventPass/u);
});

test("notifications and Money Center use public names while retaining exact target routes", () => {
  for (const label of ["Party Room Pass", "Live Stage Pass", "Live Stage Seat Pass", "Event Pass"]) {
    assert.match(channelSettings, new RegExp(label, "u"));
    assert.match(webhook, new RegExp(label, "u"));
  }
  assert.match(notifications, /Enter Party Room/u);
  assert.match(notifications, /Enter Live Stage/u);
  assert.match(notifications, /Open seat request/u);
  assert.match(notifications, /Open Event/u);
  assert.match(webhook, /\.from\("paid_watch_party_offers"\)[\s\S]{0,220}\.eq\("creator_id", creatorId\)/u);
  assert.match(webhook, /chillywoodmobile:\/\/watch-party\/\$\{partyId\}/u);
  assert.match(webhook, /\.from\("paid_live_watch_party_offers"\)[\s\S]{0,260}\.eq\("pass_type", input\.productType\)/u);
  assert.match(webhook, /chillywoodmobile:\/\/watch-party\/live-stage\/\$\{partyId\}/u);
  assert.match(webhook, /\.from\("paid_creator_events"\)[\s\S]{0,220}\.eq\("creator_event_id", sourceId\)/u);
  assert.match(webhook, /chillywoodmobile:\/\/event\/\$\{creatorEventId\}/u);
  assert.match(webhook, /metadataPartyId && metadataPartyId !== partyId/u);
});

test("purchase UI is duplicate-aware, lifecycle-aware, and accessible on narrow layouts", () => {
  assert.match(partyMoney, /alreadyPurchased/u);
  assert.match(liveMoney, /alreadyPurchased/u);
  assert.match(eventMoney, /alreadyPurchased/u);
  assert.match(liveMoney, /LIVE_WATCH_PARTY_PURCHASE_POLL_ATTEMPTS = 10/u);
  assert.match(liveStage, /AppState\.addEventListener/u);
  assert.match(partyRoom, /resolvePaidWatchPartyTicketAccess\(partyId\)/u);
  assert.match(partyRoom, /Party Room Pass required\. Access changed while the app was away\./u);
  assert.match(eventRoute, /AppState\.addEventListener/u);
  assert.match(liveStage, /flexWrap: "wrap"/u);
  assert.match(liveStage, /minWidth: 120/u);
  assert.match(partySetup, /accessibilityState=/u);
  assert.match(liveStage, /accessibilityLabel="Buy Live Stage Seat Pass; host approval required"/u);
  assert.match(eventRoute, /accessibilityLabel=.*Join Event with Event Pass/u);
});

test("Party Room admission resolves contextual paid authority before the free-room Premium prerequisite", () => {
  const attemptJoin = partySetup.indexOf("const attemptJoinRoom");
  const ticketCheck = partySetup.indexOf("resolvePaidWatchPartyTicketAccess(nextPartyId)", attemptJoin);
  const premiumCheck = partySetup.indexOf("await requirePremiumRoomEntry(", ticketCheck);
  const roomAccessCheck = partySetup.indexOf("resolveRoomAccess({", premiumCheck);
  assert.ok(attemptJoin >= 0 && ticketCheck > attemptJoin && premiumCheck > ticketCheck && roomAccessCheck > premiumCheck);
  assert.match(partySetup, /currentPreview\.room\.roomType === "live" \|\| !hasPaidPartyRoomTarget/u);
  assert.match(partySetup, /ticketAccess\.offer\?\.id[\s\S]{0,100}ticketAccess\.ticketId[\s\S]{0,100}ticketAccess\.requiresPurchase/u);

  const directBootstrap = partyRoom.indexOf("const hasTicketedTarget");
  const directTargetBlock = partyRoom.slice(directBootstrap, directBootstrap + 240);
  assert.doesNotMatch(directTargetBlock, /ticketAccess\.allowed/u);
  assert.match(directTargetBlock, /ticketAccess\.requiresPurchase/u);
  assert.match(directTargetBlock, /ticketAccess\.offer\?\.id/u);
  assert.match(directTargetBlock, /ticketAccess\.ticketId/u);
});

test("Party Room resume revalidates exact pass authority before touching membership", () => {
  const resumeStart = partyRoom.indexOf('if (nextState === "active")');
  const ticketRefresh = partyRoom.indexOf("await resolvePaidWatchPartyTicketAccess(partyId)", resumeStart);
  const membershipTouch = partyRoom.indexOf("await touchPartyRoomSession({", ticketRefresh);
  assert.ok(resumeStart >= 0 && ticketRefresh > resumeStart && membershipTouch > ticketRefresh);
  assert.match(partyRoom, /resume_verification_unavailable/u);
  assert.match(partyRoom, /This room stays locked until access is verified/u);
  assert.match(partyRoom, /setJoinRetryToken\(\(value\) => value \+ 1\)/u);
});

test("Realtime role broadcasts are refresh hints and cannot masquerade as persisted speaker authority", () => {
  const partyHandlerStart = partyRoom.indexOf('channel.on("broadcast", { event: "participant:seat-state" }');
  const partyHandlerEnd = partyRoom.indexOf("// Subscribe", partyHandlerStart);
  const partyHandler = partyRoom.slice(partyHandlerStart, partyHandlerEnd);
  assert.match(partyHandler, /refresh hints only/u);
  assert.match(partyHandler, /refreshRoomSnapshot/u);
  assert.doesNotMatch(partyHandler, /setParticipantStateById|payload\?\.role|payload\?\.isMuted|payload\?\.isRemoved/u);

  const liveHandlerStart = liveStage.indexOf('channel.on("broadcast", { event: "participant:seat-state" }');
  const liveHandlerEnd = liveStage.indexOf("channel.subscribe", liveHandlerStart);
  const liveHandler = liveStage.slice(liveHandlerStart, liveHandlerEnd);
  assert.match(liveHandler, /refresh hints only/u);
  assert.match(liveHandler, /refreshStageSnapshot/u);
  assert.doesNotMatch(liveHandler, /setParticipantStateById|payload\?\.role|payload\?\.isMuted|payload\?\.isRemoved/u);
});
