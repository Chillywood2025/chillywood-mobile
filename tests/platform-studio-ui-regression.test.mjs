import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { loadStudioFunctions } from "./helpers/studio-source-harness.mjs";

// Narrow failure/race probes execute exact production closures and JSX. Native
// drawing and network IO are modeled here. The companion mounted suite covers
// full-screen hook lifecycles and visible event wiring; these are not device QA.
const require = createRequire(import.meta.url);
const file = "app/channel-settings.tsx";
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const noop = () => {};
const { sameAccountSessionAuthority } = loadStudioFunctions('_lib/accountSessionAuthority.ts', ['sameAccountSessionAuthority'], {});
function fixture(initial, bindings = {}) {
  const state = { ...initial };
  const authority = { userId: 'owner', accountId: 'owner', state: 'ACTIVE', restoreOnly: false, sessionGeneration: 'fixture-session' };
  const context = { React, Promise, Date, Map, Set, console, useCallback: callback => callback,
    getCurrentAccountSessionAuthoritySnapshot: () => authority, sameAccountSessionAuthority,
    replayActionsMountedRef: { current: true }, clipUploadAttemptRef: { current: null }, brandDraftOwnershipRef: { current: { revision: 0, dirty: false } },
    ...bindings };
  for (const name of Object.keys(initial)) {
    Object.defineProperty(context, name, { get: () => state[name], configurable: true });
    context[`set${name[0].toUpperCase()}${name.slice(1)}`] = value => { state[name] = typeof value === "function" ? value(state[name]) : value; };
  }
  return { state, context, load: names => loadStudioFunctions(file, names, context) };
}
const host = Object.fromEntries(["View", "Text", "TextInput", "ScrollView", "TouchableOpacity", "ActivityIndicator", "Image", "AppActionButton", "AppEmptyState", "CreatorVideoCard", "ChillywoodPrimaryActionFill"].map(name => [name, name]));
host.styles = new Proxy({}, { get: (_, name) => ({ name }) });
function descend(node, predicate, found = []) {
  if (Array.isArray(node)) node.forEach(child => descend(child, predicate, found));
  else if (node && typeof node === "object") { if (predicate(node)) found.push(node); descend(node.props?.children, predicate, found); }
  return found;
}
const video = (id, visibility = "draft") => ({ id, ownerId: "owner", title: `Video ${id}`, description: "", visibility, createdAt: "2026-10-01T00:00:00Z", moderationStatus: "clean", renditionStatuses: [], playbackUrl: `preview:${id}`, thumbnailUrl: "", thumbStoragePath: null });
const metadata = id => ({ clipFormat: "vertical_9_16", fitMode: "fill", trimStartMs: null, trimEndMs: null, titleOverlayText: `Overlay ${id}`, titleOverlaySubtitle: "", titleOverlayPosition: "bottom", titleOverlayStyle: "clean", templatePreset: "clean", brandMarkEnabled: false, brandAssetId: null });
function clipFixture() {
  const requests = new Map();
  const h = fixture({ clipEditor: {}, clipLoading: false, clipLoadError: null, clipSaveState: "idle", clipSavedVideoId: null, clipNotice: null, selectedClipVideoFile: null, selectedClipCoverFile: null, selectedVideoFile: null }, {
    clipEditorGenerationRef: { current: 0 }, clipSaveInFlightRef: { current: false }, videoEditor: { title: "old paid editor", description: "" }, openStudioTab: noop,
    readClipStudioEdit: id => { const gate = deferred(); requests.set(id, gate); return gate.promise; }, readCreatorVideoForPlayer: async id => ({ playbackUrl: `loaded:${id}` }),
  });
  return { ...h, requests, api: h.load(["createEmptyClipStudioEditorState", "openClipStudioForVideo", "openClipStudioForNew", "updateClipEditor", "markClipStudioDirty", "saveClipStudio"]) };
}

test("Clip A then B late metadata cannot overwrite B; new clip is empty", async () => {
  const h = clipFixture();
  h.api.openClipStudioForVideo(video("A")); h.api.openClipStudioForVideo(video("B"));
  h.requests.get("B").resolve(metadata("B")); await settle();
  h.requests.get("A").resolve(metadata("A")); await settle();
  assert.equal(h.state.clipEditor.editingVideoId, "B");
  assert.equal(h.state.clipEditor.titleOverlayText, "Overlay B");
  assert.equal(h.state.clipEditor.videoPreviewUrl, "loaded:B");
  h.api.openClipStudioForVideo(video("C")); h.api.openClipStudioForNew();
  h.requests.get("C").resolve(metadata("C")); await settle();
  assert.equal(h.state.clipEditor.editingVideoId, null);
  assert.equal(h.state.clipEditor.title, "");
  assert.equal(h.state.clipEditor.titleOverlayText, "");
});

test("Clip failed read blocks save; successful missing metadata is distinct; in-flight save locks edits", async () => {
  const h = clipFixture();
  h.api.openClipStudioForVideo(video("A"));
  h.api.updateClipEditor({ title: "must not apply while loading" });
  assert.equal(h.state.clipEditor.title, "Video A");
  h.requests.get("A").reject(new Error("offline")); await settle();
  assert.equal(h.state.clipLoading, false); assert.ok(h.state.clipLoadError);
  await h.api.saveClipStudio("draft");
  assert.match(h.state.clipNotice, /load|retry/i);
  h.api.openClipStudioForVideo(video("A")); h.requests.get("A").resolve(null); await settle();
  assert.equal(h.state.clipLoadError, null); assert.equal(h.state.clipEditor.title, "Video A");
  h.context.clipSaveInFlightRef.current = true;
  h.api.updateClipEditor({ title: "must not replace committed snapshot" }); h.api.openClipStudioForNew();
  assert.equal(h.state.clipEditor.title, "Video A");
});

function contentFixture(extra = {}) {
  return fixture({ contentSearchQuery: "", contentStatusFilter: "drafts", contentSort: "newest", contentSearchVideos: [], contentSearchLoading: false, contentSearchHasMore: false, contentSearchOffset: 0, contentSearchError: null, creatorVideos: [video("draft"), video("public", "public")], creatorVideosOffset: 0, creatorVideosHasMore: false, creatorReplays: [], contentLoadingMore: false, videosLoading: false, videosLoadError: null, creatorVideoClipEdits: {}, ...extra }, {
    ...host, contentUsesQuery: false, contentVisibility: undefined, CONTENT_PAGE_SIZE: 50, user: { id: "owner" }, contentQueryGenerationRef: { current: 1 }, contentPageInFlightRef: { current: false }, creatorEvents: [], activeBrandProfile: null, paidVideoOfferByVideoId: new Map(), getCreatorVideoCreatedTimestamp: entry => Date.parse(entry.createdAt), videoSaving: false, brandSaving: false, router: { push: noop }, routeParams: {}, openClipStudioForVideo: noop, publishSpotlightVideo: noop, onToggleVideoVisibility: noop, onDeleteVideo: noop, setSelectedContentActionVideo: noop, openClipStudioForNew: noop, videoNotice: null, publishedVideoCount: 1, draftVideoCount: 1, circleVideoCount: 0, replayCount: 0, setContentSearchRetry: noop, readClipStudioEditsForVideos: async () => new Map(), readCreatorReplayLibraryItems: async () => [], formatCreatorVideoUiError: (_, fallback) => fallback,
  });
}

test("Content production JSX honors Drafts, preserves visible retry on failure and loaded-page empty scope", () => {
  const h = contentFixture(); const api = h.load(["CONTENT_STATUS_FILTERS", "CONTENT_SORT_OPTIONS", "renderContentPanel"]);
  let rows = descend(api.renderContentPanel(), node => node.type === "CreatorVideoCard");
  assert.ok(rows.some(row => row.props.video.id === "draft")); assert.ok(rows.every(row => row.props.video.id !== "public"));
  h.state.videosLoadError = "Unavailable";
  assert.ok(descend(api.renderContentPanel(), node => node.type === "AppEmptyState" && node.props.title === "Content couldn't refresh").length);
  h.state.videosLoadError = null; h.state.creatorVideos = []; h.state.creatorVideosHasMore = true;
  const tree = api.renderContentPanel();
  assert.match(descend(tree, node => node.type === "AppEmptyState")[0].props.body, /loaded so far/);
  assert.ok(descend(tree, node => node.props?.label === "Load more videos").length);
});

test("Content page cursor counts server rows, not pinned out-of-page saved video; same-frame paging coalesces", async () => {
  const h = contentFixture({ contentStatusFilter: "all" });
  const all = Array.from({ length: 80 }, (_, index) => video(String(index), "public")); const offsets = [];
  h.context.readCreatorVideos = async (_owner, options) => { offsets.push(options.offset ?? 0); return all.slice(options.offset ?? 0, (options.offset ?? 0) + options.limit); };
  const api = h.load(["loadCreatorVideos", "loadMoreContentVideos"]);
  await api.loadCreatorVideos(video("pinned-99"));
  assert.equal(h.state.creatorVideos.length, 51); assert.equal(h.state.creatorVideosOffset, 50);
  await Promise.all([api.loadMoreContentVideos(), api.loadMoreContentVideos()]);
  assert.deepEqual(offsets, [0, 50]);
  assert.equal(h.state.creatorVideos.filter(row => row.id === "50").length, 1);
  assert.equal(h.state.creatorVideos.length, 81); assert.equal(h.state.creatorVideosHasMore, false);
});

test("Event durable create survives failed refresh; retry updates the same event and double tap does not insert twice", async () => {
  let creates = 0, updates = 0; const gate = deferred();
  const h = fixture({ eventEditor: { eventTitle: "Launch", eventType: "live_first", editingEventId: null, startsAt: "2026-11-01", endsAt: "", replayPolicy: "none" }, eventSaving: false, eventNotice: null, liveReplayAccepted: false }, {
    eventSaveInFlightRef: { current: false }, user: { id: "owner" }, creatorPostingEnabled: true, liveReplayAcknowledgementRequired: false, fromDatetimeLocalValue: value => value, createCreatorEvent: async () => { creates++; await gate.promise; return { id: "event-1" }; }, updateCreatorEvent: async id => { assert.equal(id, "event-1"); updates++; return { id }; }, loadCreatorEvents: async () => { throw new Error("refresh offline"); }, resetEventEditor: noop, getUserFacingErrorMessage: (_, fallback) => fallback,
  });
  const api = h.load(["onSaveEvent"]);
  const first = api.onSaveEvent(); const second = api.onSaveEvent(); gate.resolve(); await Promise.all([first, second]);
  assert.equal(creates, 1); assert.equal(h.state.eventEditor.editingEventId, "event-1"); assert.match(h.state.eventNotice, /^Event saved/);
  await api.onSaveEvent(); assert.equal(creates, 1); assert.equal(updates, 1);
});

test("installed Android Alert retains Cancel and Cancel cannot mutate an audience request", () => {
  const babel = require("@babel/core"); const alertPath = require.resolve("react-native/Libraries/Alert/Alert.js");
  const compiled = babel.transformSync(fs.readFileSync(alertPath, "utf8"), { babelrc: false, configFile: false, plugins: [require("@babel/plugin-transform-flow-strip-types"), require("@babel/plugin-transform-modules-commonjs")] }).code;
  let config, nativeCallback, mutations = 0;
  const context = { exports: {}, require: name => {
    if (name === "../Utilities/Platform") return { default: { OS: "android" }, __esModule: true };
    if (name === "./RCTAlertManager") return {};
    if (name === "../NativeModules/specs/NativeDialogManagerAndroid") return { default: { getConstants: () => ({ buttonClicked: "buttonClicked", buttonPositive: -1 }), showAlert: (value, _error, callback) => { config = value; nativeCallback = callback; } } };
    throw Error(`Unexpected dependency ${name}`);
  } };
  vm.runInNewContext(compiled, context);
  const h = fixture({}, { Alert: context.exports.default, runAudienceMemberAction: () => { mutations++; } });
  h.load(["openAudienceMemberActions"]).openAudienceMemberActions({ kind: "pending_request", displayName: "Requester" });
  assert.equal(config.buttonPositive, "Cancel"); assert.equal(config.buttonNeutral, "Approve");
  nativeCallback("buttonClicked", -1); assert.equal(mutations, 0);
});

test("focus measures against the outer content root and rejects stale measurement callbacks", () => {
  const root = {}; const offsets = []; let callback;
  const h = fixture({}, { studioContentRootRef: { current: root }, studioSectionRefs: { current: { "event-editor": { measureLayout: (relative, success) => { assert.equal(relative, root); callback = success; } } } }, pendingStudioFocusRef: { current: "event-editor" }, studioScrollRef: { current: { scrollTo: value => offsets.push(value.y) } } });
  const api = h.load(["recordStudioSection"]); api.recordStudioSection("event-editor"); callback(0, 812); assert.deepEqual(offsets, [800]);
  h.context.pendingStudioFocusRef.current = "event-editor"; api.recordStudioSection("event-editor"); h.context.pendingStudioFocusRef.current = "tab-content"; callback(0, 900); assert.deepEqual(offsets, [800]);
});

test("rejected Brand publication cannot acknowledge previous live media or a media-free draft; edits remain retryable", async () => {
  for (const selectedAssets of [[], ["previously-live"]]) {
    const draft = { accentColor: "new-color", selectedAssets };
    const h = fixture({ brandSaving: false, saving: false, brandNotice: null, notice: null, brandDraft: draft }, { brandProfileSaveInFlightRef: { current: false }, user: { id: "owner" }, getCurrentBrandDraft: () => draft, getBrandSelectedAssetIds: () => selectedAssets, persistBrandPublish: async () => { throw new Error("Some selected media is not ready to publish. Your public Platform has not changed."); }, resolveBrandPublishReadbackStatus: async () => ({ selectedCount: selectedAssets.length, publicReturnedCount: selectedAssets.length }), getUserFacingErrorMessage: (error, fallback) => error.message || fallback });
    const source = fs.readFileSync(`${process.env.STUDIO_SOURCE_ROOT || process.cwd()}/${file}`, "utf8");
    // Include the old real failure formatter in baseline runs so this control
    // fails on its false success message, rather than an undefined test binding.
    const names = source.includes("const getBrandPublishFailureNotice")
      ? ["getBrandPublishNotice", "getBrandPublishFailureNotice", "publishBrandStudioAndProfile"]
      : ["publishBrandStudioAndProfile"];
    const api = h.load(names); await api.publishBrandStudioAndProfile();
    assert.match(h.state.brandNotice, /not changed/); assert.equal(h.state.brandDraft, draft); assert.equal(h.context.brandProfileSaveInFlightRef.current, false);
  }
});

test("extracted Brand rejection cannot release replacement-session lock or replace its notice", async () => {
  const gate = deferred();
  const first = { userId: 'owner', accountId: 'owner', state: 'ACTIVE', restoreOnly: false, sessionGeneration: 'first' };
  let authority = first, writes = 0;
  const h = fixture({ brandSaving: false, saving: false, brandNotice: null, notice: null }, {
    brandProfileSaveInFlightRef: { current: false },
    getCurrentAccountSessionAuthoritySnapshot: () => authority,
    persistBrandPublish: async () => { writes++; await gate.promise; },
  });
  const api = h.load(['publishBrandStudioAndProfile']);
  const pending = api.publishBrandStudioAndProfile();
  assert.equal(writes, 1);
  authority = { ...first, sessionGeneration: 'replacement' };
  h.state.brandNotice = 'Replacement operation';
  gate.reject(Error('old rejection')); await pending;
  assert.equal(h.state.brandNotice, 'Replacement operation');
  assert.equal(h.state.brandSaving, true); assert.equal(h.context.brandProfileSaveInFlightRef.current, true);
  h.context.replayActionsMountedRef.current = false;
  h.context.brandProfileSaveInFlightRef.current = false;
  await api.publishBrandStudioAndProfile();
  assert.equal(writes, 1, 'detached callback cannot begin another write');
});

test("Paid setup rejects mismatched readback and acknowledges only the exact creator/video/price", async () => {
  let writes = 0; let readback = [{ videoId: "wrong-video", creatorId: "owner", isPaid: true, priceCents: 99, status: "sandbox" }];
  const h = fixture({ selectedPaidVideo: video("selected-77", "public"), videoEditor: { editingVideoId: "selected-77", accessMode: "paid", priceDollars: "0.99" }, videoSaving: false, videoNotice: null, creatorPaidVideoOffers: [] }, { user: { id: "owner" }, paidVideoSaveInFlightRef: { current: false }, parseDollarInputToCents: () => 99, savePaidVideoOffer: async input => { assert.equal(input.videoId, "selected-77"); writes++; return { status: "saved", id: "offer-77" }; }, saveCreatorSetupConfig: async () => {}, listMyPaidVideoOffers: async options => { assert.equal(options.throwOnUnavailable, true); return readback; }, formatCreatorSetupError: (error, fallback) => error.message || fallback });
  const api = h.load(["hasPlayableCreatorVideoSource", "getPaidVideoSetupUnavailableReason", "savePaidVideoSetup"]); await api.savePaidVideoSetup();
  assert.match(h.state.videoNotice, /could not be verified/); assert.equal(h.state.videoEditor.editingVideoId, "selected-77");
  readback = [{ ...readback[0], videoId: "selected-77" }]; await api.savePaidVideoSetup();
  assert.equal(writes, 2); assert.match(h.state.videoNotice, /setup saved/); assert.equal(h.state.creatorPaidVideoOffers[0].videoId, "selected-77");
});
