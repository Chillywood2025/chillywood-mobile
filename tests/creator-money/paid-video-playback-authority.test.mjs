import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const CREATOR_ID = "11111111-1111-4111-8111-111111111111";
const VIEWER_ID = "22222222-2222-4222-8222-222222222222";
const VIDEO_ID = "33333333-3333-4333-8333-333333333333";

const compile = (path) => ts.transpileModule(readFileSync(path, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
}).outputText;

let inert;
inert = new Proxy(() => undefined, {
  get: (_target, key) => key === "then" ? undefined : inert,
  apply: () => undefined,
});

const loadCreatorMonetization = (rpc) => {
  const module = { exports: {} };
  new Function("exports", "module", "require", compile("_lib/creatorMonetization.ts"))(
    module.exports,
    module,
    (id) => id === "./supabase" ? { supabase: { rpc, from: inert } } : inert,
  );
  return module.exports;
};

const creatorVideoRow = {
  id: VIDEO_ID,
  owner_id: CREATOR_ID,
  title: "Authority proof video",
  description: "",
  playback_url: "legacy/video.mp4",
  thumb_url: "",
  created_at: "2026-08-24T00:00:00.000Z",
  visibility: "public",
  moderation_status: "clean",
  moderation_reason: null,
  moderated_at: null,
  moderated_by: null,
  storage_provider: "supabase",
  storage_bucket: "creator-videos",
  storage_object_key: "creator/video.mp4",
  storage_path: "creator/video.mp4",
  thumb_storage_path: "",
  mime_type: "video/mp4",
  file_size_bytes: 1024,
  updated_at: "2026-08-24T00:00:00.000Z",
};

const loadCreatorVideoRuntime = (paidContentAccess) => {
  let fullVideoRowReads = 0;
  let signedResolutionReads = 0;
  let legacySignedReads = 0;

  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    returns: () => query,
    maybeSingle: async () => {
      fullVideoRowReads += 1;
      return { data: creatorVideoRow, error: null };
    },
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: VIEWER_ID } } }) },
    from: () => query,
    rpc: async (name) => name === "resolve_creator_video_visibility_access"
      ? {
        data: {
          allowed: true,
          visibility: "public",
          reason: "public_allowed",
          is_owner: false,
          is_blocked: false,
          is_circle_member: false,
          has_playable_source: true,
          viewer_user_id: VIEWER_ID,
          owner_user_id: CREATOR_ID,
        },
        error: null,
      }
      : { data: null, error: new Error("unexpected_rpc") },
    storage: {
      from: () => ({
        createSignedUrl: async () => {
          legacySignedReads += 1;
          return { data: { signedUrl: "https://legacy.invalid/video" }, error: null };
        },
      }),
    },
  };
  const mocks = {
    "./appConfig": {
      DEFAULT_APP_CONFIG: { runtimeControls: { max_upload_size_mb: 5120 } },
      readAppConfig: inert,
    },
    "./mediaStorage": {
      createSignedMediaDownload: async () => {
        legacySignedReads += 1;
        return "https://legacy.invalid/video";
      },
      deleteStoredMediaObject: inert,
      getMediaStorageProviderBucket: ({ bucket, fallbackBucket }) => bucket || fallbackBucket,
      normalizeMediaStorageProvider: () => "supabase",
      uploadFileToMediaStorage: inert,
    },
    "./platformUsage": { recordCreatorVideoUploadUsage: inert },
    "./supabase": {
      SUPABASE_ANON_KEY: "anon-test-key",
      SUPABASE_FUNCTIONS_URL: "https://supabase.invalid",
      supabase,
    },
    "./creatorMonetization": {
      resolveCreatorContentAccess: async () => paidContentAccess,
    },
    "./vodQuality": {
      createUnavailableVodPlaybackResolution: (videoId, reason) => ({ videoId, reason, renditionStatuses: [] }),
      readVideoRenditionStatuses: inert,
      recordOriginalVideoRendition: inert,
      resolveSignedVideoPlaybackSource: async () => {
        signedResolutionReads += 1;
        return {
          defaultPlaybackUrl: "https://signed.invalid/video",
          defaultPlaybackQuality: "1080p",
          deliveryMetadata: null,
          renditionStatuses: [],
          legacyPlaybackAllowed: false,
          legacyQualityEnforcement: "strict",
        };
      },
    },
  };

  const module = { exports: {} };
  new Function("exports", "module", "require", "__DEV__", compile("_lib/creatorVideos.ts"))(
    module.exports,
    module,
    (id) => Object.hasOwn(mocks, id) ? mocks[id] : inert,
    false,
  );
  return {
    api: module.exports,
    getFullVideoRowReads: () => fullVideoRowReads,
    getSignedResolutionReads: () => signedResolutionReads,
    getLegacySignedReads: () => legacySignedReads,
  };
};

test("RPC failure and malformed paid-content results fail closed", async () => {
  const failed = loadCreatorMonetization(async () => ({ data: null, error: new Error("timeout") }));
  assert.deepEqual(
    await failed.resolveCreatorContentAccess({ contentType: "creator_video", contentId: VIDEO_ID }),
    {
      allowed: false,
      reason: "resolver_unavailable",
      requiresPurchase: false,
      priceCents: null,
      currency: null,
      creatorId: null,
      resolverStatus: "unavailable",
    },
  );

  for (const payload of [
    null,
    {},
    { allowed: true, reason: "free_content" },
    { allowed: "true", reason: "free_content", requiresPurchase: false },
    { allowed: true, reason: "unknown_grant", requiresPurchase: false },
    { allowed: false, reason: "purchase_required", requiresPurchase: true, priceCents: 0, currency: "usd", creatorId: CREATOR_ID },
    { allowed: false, reason: "purchase_required", requiresPurchase: true, priceCents: 499, currency: "USD", creatorId: CREATOR_ID },
    { allowed: false, reason: "purchase_required", requiresPurchase: true, priceCents: 499, currency: "usd", creatorId: "not-a-uuid" },
  ]) {
    const malformed = loadCreatorMonetization(async () => ({ data: payload, error: null }));
    const result = await malformed.resolveCreatorContentAccess({ contentType: "creator_video", contentId: VIDEO_ID });
    assert.equal(result.allowed, false);
    assert.equal(result.resolverStatus, "unavailable");
    assert.equal(result.reason, "resolver_malformed");
  }
});

test("only structurally exact owner, free, and purchase-required results are resolved", async () => {
  for (const reason of ["owner", "free_content"]) {
    const runtime = loadCreatorMonetization(async () => ({
      data: { allowed: true, reason, requiresPurchase: false },
      error: null,
    }));
    assert.deepEqual(
      await runtime.resolveCreatorContentAccess({ contentType: "creator_video", contentId: VIDEO_ID }),
      {
        allowed: true,
        reason,
        requiresPurchase: false,
        priceCents: null,
        currency: null,
        creatorId: null,
        resolverStatus: "resolved",
      },
    );
  }

  const purchaseRuntime = loadCreatorMonetization(async () => ({
    data: {
      allowed: false,
      reason: "purchase_required",
      requiresPurchase: true,
      priceCents: 499,
      currency: "usd",
      creatorId: CREATOR_ID,
      provider: "revenuecat_app_store",
      providerProductId: "com.chillywood.paid-video.499",
      providerProductKey: "paid_content_access_sandbox_099",
      offerStatus: "sandbox",
    },
    error: null,
  }));
  assert.deepEqual(
    await purchaseRuntime.resolveCreatorContentAccess({ contentType: "creator_video", contentId: VIDEO_ID }),
    {
      allowed: false,
      reason: "purchase_required",
      requiresPurchase: true,
      priceCents: 499,
      currency: "usd",
      creatorId: CREATOR_ID,
      resolverStatus: "resolved",
    },
  );
});

test("unavailable, malformed, and purchase-required authority never reach any playback URL resolver", async () => {
  for (const access of [
    {
      allowed: false,
      reason: "resolver_unavailable",
      requiresPurchase: false,
      priceCents: null,
      currency: null,
      creatorId: null,
      resolverStatus: "unavailable",
    },
    {
      allowed: false,
      reason: "resolver_malformed",
      requiresPurchase: false,
      priceCents: null,
      currency: null,
      creatorId: null,
      resolverStatus: "unavailable",
    },
    {
      allowed: false,
      reason: "purchase_required",
      requiresPurchase: true,
      priceCents: 499,
      currency: "usd",
      creatorId: CREATOR_ID,
      resolverStatus: "resolved",
    },
  ]) {
    const runtime = loadCreatorVideoRuntime(access);
    const video = await runtime.api.readCreatorVideoForPlayer(VIDEO_ID);
    assert.equal(video.playbackUrl, "");
    assert.equal(video.paidContentAccess.reason, access.reason);
    assert.equal(runtime.getFullVideoRowReads(), 0);
    assert.equal(runtime.getSignedResolutionReads(), 0);
    assert.equal(runtime.getLegacySignedReads(), 0);
    if (access.reason === "purchase_required") {
      assert.equal(video.ownerId, CREATOR_ID);
      assert.equal(video.title, "Paid creator video");
      assert.equal(video.visibilityAccess, null);
    }
  }
});

test("resolved owner and free authority may reach signed playback resolution", async () => {
  for (const reason of ["owner", "free_content"]) {
    const runtime = loadCreatorVideoRuntime({
      allowed: true,
      reason,
      requiresPurchase: false,
      priceCents: null,
      currency: null,
      creatorId: null,
      resolverStatus: "resolved",
    });
    const video = await runtime.api.readCreatorVideoForPlayer(VIDEO_ID);
    assert.equal(video.playbackUrl, "https://signed.invalid/video");
    assert.equal(runtime.getFullVideoRowReads(), 1);
    assert.equal(runtime.getSignedResolutionReads(), 1);
    assert.equal(runtime.getLegacySignedReads(), 0);
  }
});

test("player sink locks unresolved authority and offers checkout only for exact purchase-required state", () => {
  const player = readFileSync("app/player/[id].tsx", "utf8");
  assert.match(
    player,
    /creatorVideo\.paidContentAccess\?\.resolverStatus !== "resolved"[\s\S]+creatorVideo\.paidContentAccess\?\.allowed !== true/u,
  );
  assert.match(
    player,
    /creatorVideoPaidContentPurchaseRequired[\s\S]+reason === "purchase_required"[\s\S]+requiresPurchase === true/u,
  );
  assert.match(player, /\{creatorVideoPaidContentPurchaseRequired \? \([\s\S]+tester-paid-video-unlock-button/u);
  assert.match(player, /Playback remains blocked until paid-content access can be verified\./u);

  const creatorVideos = readFileSync("_lib/creatorVideos.ts", "utf8");
  const authorityGate = creatorVideos.indexOf('paidContentAccess.resolverStatus !== "resolved"');
  const fullVideoRowRead = creatorVideos.indexOf('.from("videos")', authorityGate);
  const signedResolver = creatorVideos.indexOf("const playbackResolution = await resolveSignedVideoPlaybackSource", authorityGate);
  const legacyResolver = creatorVideos.indexOf("? await createCreatorVideoPlaybackUrl", signedResolver);
  assert.ok(authorityGate >= 0);
  assert.ok(fullVideoRowRead > authorityGate);
  assert.ok(signedResolver > authorityGate);
  assert.ok(legacyResolver > signedResolver);
});

test("database row, playback, and creator-video storage sinks all require canonical per-item authority", () => {
  const closeout = readFileSync(
    "supabase/migrations/20260824034109_creator_money_authority_integrity_closeout.sql",
    "utf8",
  );
  assert.match(
    closeout,
    /create or replace function public\."resolve_video_playback"\(target_video_id uuid\)[\s\S]+resolve_creator_content_access"\('creator_video',target_video_id\)[\s\S]+if not coalesce\(\(v_access->>'allowed'\)::boolean,false\)[\s\S]+legacy_playback_allowed',false/u,
  );
  assert.match(
    closeout,
    /create or replace function public\."can_read_creator_video_row"[\s\S]+v_access:=public\."resolve_creator_content_access"\('creator_video',v_video_ids\[1\]\)[\s\S]+return coalesce\(\(v_access->>'allowed'\)::boolean,false\)/u,
  );
  assert.match(
    closeout,
    /create policy "creator_videos_storage_select_visibility_access"[\s\S]+public\."can_read_creator_video_row"[\s\S]+drop policy if exists "creator_videos_storage_select_premium_renditions"[\s\S]+public\."premium_subject_has_finite_authority_internal"[\s\S]+public\."can_read_creator_video_row"/u,
  );
  assert.match(
    closeout,
    /revoke all on function public\."resolve_video_playback_pre_paid_authority_closeout"\(uuid\)[\s\S]+from public,anon,authenticated,service_role/u,
  );
});
