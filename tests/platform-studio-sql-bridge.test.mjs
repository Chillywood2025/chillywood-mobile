import assert from "node:assert/strict";
import test from "node:test";
import { makeFixture, ids, read } from "./helpers/studio-authority-fixture.mjs";
import { loadStudioFunctions } from "./helpers/studio-source-harness.mjs";
import { loadStubbed } from "./customer-experience-adversarial-helpers.mjs";

const migration = "supabase/migrations/20261015073423_platform_studio_publication_and_audience_authority.sql";
const text = (value) => String(value ?? "").trim();
const { UserFacingError } = loadStubbed("_lib/userFacingErrors.ts");

test("production Studio helpers cross the actual publication, identity, count and review SQL authority", async (t) => {
  const { db, as, user } = await makeFixture();
  t.after(() => db.close());
  let viewer = ids.owner;
  const rpc = async (name, args) => {
    try {
      const keys = Object.keys(args);
      const result = await as(viewer ? "authenticated" : "anon", viewer,
        `select public.${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(",")}) result`, Object.values(args));
      return { data: result.rows[0]?.result ?? null, error: null };
    } catch (error) { return { data: null, error }; }
  };
  const brand = loadStudioFunctions("_lib/platformBranding.ts", ["createDefaultPlatformBrandProfile", "toProfileUpsert", "savePlatformBrandProfileDraft", "publishPlatformBrandProfile"], {
    toText: text, PLATFORM_BRAND_PROFILE_SELECT: "*", parseProfile: (row) => row, UserFacingError,
    getCurrentAccountSessionAuthoritySnapshot: () => ({ userId: viewer, state: "ACTIVE", restoreOnly: false }),
    sameAccountSessionAuthority: (a, b) => a?.userId === b?.userId,
    captureAccountBoundSupabaseMutationSubject: async (expectedOwner) => {
      assert.equal(expectedOwner, viewer); return { accessToken: "fixture-token", authority: { userId: viewer } };
    },
    invokeAccountBoundSupabaseMutationRpc: async (subject, name, args) => {
      assert.equal(subject.authority.userId, viewer); assert.equal(name, "read_public_platform_identity");
      try {
        const result = await user(viewer, "select * from public.read_public_platform_identity(profile_user_id => $1)", [args.profile_user_id]);
        return { data: result.rows, error: null };
      } catch (error) { return { data: null, error }; }
    },
    runCurrentAccountBoundSupabaseMutationRpc: async (name, args, expectedOwner) => {
      assert.equal(expectedOwner, viewer, "Client binds the initiating owner"); return rpc(name, args);
    },
    supabase: { from: (table) => ({ upsert: (payload) => ({
      setHeader(name, value) { assert.equal(name, "Authorization"); assert.equal(value, "Bearer fixture-token"); return this; },
      select: () => ({ returns: () => ({ single: async () => {
      assert.equal(table, "platform_brand_profiles");
      const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
      const names = entries.map(([key]) => key);
      try {
        const result = await user(viewer, `insert into public.platform_brand_profiles(${names.join(",")})
          values(${names.map((_, index) => `$${index + 1}`).join(",")}) on conflict(owner_user_id) do update set
          ${names.filter((name) => name !== "owner_user_id").map((name) => `${name}=excluded.${name}`).join(",")} returning *`, entries.map(([, value]) => value));
        return { data: result.rows[0], error: null };
      } catch (error) { return { data: null, error }; }
    } }) }) }) }) },
  });
  const profile = brand.createDefaultPlatformBrandProfile(ids.owner);
  await db.query("insert into public.platform_brand_profiles(owner_user_id,published_at) values($1,now())", [ids.owner]);

  await t.test("new draft helper refuses old SQL while the legacy direct-write control still leaks", async () => {
    const before = (await db.query("select to_jsonb(profile) row from public.platform_brand_profiles profile where owner_user_id=$1", [ids.owner])).rows[0].row;
    await assert.rejects(brand.savePlatformBrandProfileDraft(ids.owner, { accentColor: "#ABCDEF", themePreset: "studio_red" }), /temporarily unavailable/);
    assert.deepEqual((await db.query("select to_jsonb(profile) row from public.platform_brand_profiles profile where owner_user_id=$1", [ids.owner])).rows[0].row, before, "Missing Studio contract cannot mutate even a previously published row");
    // This is the actual old database path, intentionally bypassing the new
    // client guard as an old-client negative control. It remains unsafe.
    await user(ids.owner, "update public.platform_brand_profiles set accent_color='#123456',theme_preset='studio_red' where owner_user_id=$1", [ids.owner]);
    await user(ids.owner, "update public.platform_brand_profiles set published_at='2099-01-01T00:00:00Z' where owner_user_id=$1", [ids.owner]);
    assert.equal((await db.query("select published_at='2099-01-01T00:00:00Z'::timestamptz as forged_timestamp_accepted from public.platform_brand_profiles where owner_user_id=$1", [ids.owner])).rows[0].forged_timestamp_accepted, true, "Old metadata authority accepts a client-authored publication timestamp");
    const oldPublic = await as("anon", null, "select accent_color from public.read_public_platform_brand_profile($1)", [ids.owner]);
    assert.equal(oldPublic.rows[0].accent_color, "#123456");
  });

  await db.exec(read(migration));
  await t.test("migrated private Platform owner can save a draft without exposing it publicly", async () => {
    await db.query("update public.user_profiles set platform_access_visibility='private' where user_id=$1", [ids.owner]);
    await brand.savePlatformBrandProfileDraft(ids.owner, { accentColor: "#112233" });
    assert.equal((await db.query("select accent_color from public.platform_brand_profiles where owner_user_id=$1", [ids.owner])).rows[0].accent_color, "#112233");
    assert.equal((await as("anon", null, "select * from public.read_public_platform_brand_profile($1)", [ids.owner])).rows.length, 0);
    assert.equal((await db.query("select accent_color from public.platform_brand_publications where owner_user_id=$1", [ids.owner])).rows[0].accent_color, "#123456");
    await db.query("update public.user_profiles set platform_access_visibility='public' where user_id=$1", [ids.owner]);
  });
  await t.test("obsolete direct publication upsert fails closed while unchanged draft metadata remains accepted", async () => {
    const before = (await db.query("select to_jsonb(profile) row from public.platform_brand_profiles profile where owner_user_id=$1", [ids.owner])).rows[0].row;
    await assert.rejects(user(ids.owner, `insert into public.platform_brand_profiles(owner_user_id,accent_color,published_at)
      values($1,'#000000',clock_timestamp()) on conflict(owner_user_id) do update
      set accent_color=excluded.accent_color,published_at=excluded.published_at`, [ids.owner]),
    (error) => error.code === "42501" && error.message.includes("brand_publish_rpc_required"));
    assert.deepEqual((await db.query("select to_jsonb(profile) row from public.platform_brand_profiles profile where owner_user_id=$1", [ids.owner])).rows[0].row, before, "Rejected second-phase publication rolls back its entire write");
    await user(ids.owner, `insert into public.platform_brand_profiles(owner_user_id,accent_color,published_at)
      select owner_user_id,'#AABBCC',published_at from public.platform_brand_profiles where owner_user_id=$1
      on conflict(owner_user_id) do update set accent_color=excluded.accent_color,published_at=excluded.published_at`, [ids.owner]);
    assert.equal((await as("anon", null, "select accent_color from public.read_public_platform_brand_profile($1)", [ids.owner])).rows[0].accent_color, "#123456");
  });
  await t.test("draft edits preserve live snapshot, publish atomically replaces it, forged timestamp does not publish", async () => {
    const beforeDraft = (await db.query("select published_at from public.platform_brand_profiles where owner_user_id=$1", [ids.owner])).rows[0].published_at;
    await brand.savePlatformBrandProfileDraft(ids.owner, { accentColor: "#ABCDEF", themePreset: "classic", publishedAt: "2099-01-01T00:00:00Z" });
    assert.deepEqual((await db.query("select published_at from public.platform_brand_profiles where owner_user_id=$1", [ids.owner])).rows[0].published_at, beforeDraft, "New draft helper never rewrites publication metadata");
    const publicAfterDraft = await as("anon", null, "select accent_color from public.read_public_platform_brand_profile($1)", [ids.owner]);
    assert.equal(publicAfterDraft.rows[0].accent_color, "#123456");
    const saved = await brand.publishPlatformBrandProfile(ids.owner, { ...profile, accentColor: "#654321", publishedAt: "2099-01-01T00:00:00Z" });
    assert.equal(saved.accent_color, "#654321");
    assert.notEqual(String(saved.published_at).slice(0, 4), "2099");
    assert.equal((await as("anon", null, "select accent_color from public.read_public_platform_brand_profile($1)", [ids.owner])).rows[0].accent_color, "#654321");
    await assert.rejects(user(ids.owner, "update public.platform_brand_publications set accent_color='#000000' where owner_user_id=$1", [ids.owner]), /permission denied/);
  });

  await t.test("unsafe selected media rolls back draft, publication and review state together", async () => {
    const assetId = "70000000-0000-4000-8000-000000000007";
    await db.query(`insert into public.platform_brand_assets(id,owner_user_id,asset_type,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,scan_status)
      values($1,$2,'hero_image','supabase','platform-brand-assets',$3,$3,'image/png','pending_scan')`, [assetId, ids.owner, `${ids.owner}/hero.png`]);
    const before = (await db.query("select to_jsonb(profile) row from public.platform_brand_profiles profile where owner_user_id=$1", [ids.owner])).rows[0].row;
    await assert.rejects(brand.publishPlatformBrandProfile(ids.owner, { ...profile, heroImageAssetId: assetId, accentColor: "#000000" }), /not ready to publish/);
    const after = (await db.query("select to_jsonb(profile) row from public.platform_brand_profiles profile where owner_user_id=$1", [ids.owner])).rows[0].row;
    assert.deepEqual(after, before);
    assert.equal((await db.query("select count(*)::int n from public.platform_brand_asset_review_events")).rows[0].n, 0);
    assert.equal((await as("anon", null, "select accent_color from public.read_public_platform_brand_profile($1)", [ids.owner])).rows[0].accent_color, "#654321");
  });

  await t.test("private Profile/public Platform identity uses minimal projection and respects independent visibility", async () => {
    viewer = ids.outsider;
    assert.equal((await user(viewer, "select user_id from public.read_public_channel_profile($1)", [ids.owner])).rows.length, 0, "old Profile gate still denies private identity");
    const api = loadStudioFunctions("_lib/userData.ts", ["readPublicPlatformIdentity"], {
      toIdString: text, captureUserDataAccountBinding: () => viewer,
      assertUserDataAccountBindingIsCurrent: (binding) => assert.equal(binding, viewer),
      parseRemoteUserProfile: (row) => row,
      supabase: { rpc: (name, args) => ({ maybeSingle: async () => {
        assert.equal(name, "read_public_platform_identity");
        try {
          const result = await user(viewer, "select * from public.read_public_platform_identity(profile_user_id => $1)", [args.profile_user_id]);
          return { data: result.rows[0] ?? null, error: null };
        } catch (error) { return { data: null, error }; }
      } }) },
    });
    const identity = await api.readPublicPlatformIdentity(ids.owner);
    assert.equal(identity.display_name, "Public Name");
    assert.deepEqual(Object.keys(identity).sort(), ["user_id", "username", "display_name", "tagline", "channel_layout_preset", "channel_role", "follower_surface_enabled", "subscriber_surface_enabled", "platform_access_visibility"].sort());
    await db.query("update public.user_profiles set platform_access_visibility='private' where user_id=$1", [ids.owner]);
    assert.equal(await api.readPublicPlatformIdentity(ids.owner), null);
    await db.query("update public.user_profiles set platform_access_visibility='public' where user_id=$1", [ids.owner]);
  });

  await t.test("count helper returns viewer-independent count without roster grant; disabled surface returns null", async () => {
    await db.query("insert into public.channel_followers(channel_user_id,follower_user_id) values($1,$2),($1,$3)", [ids.owner, ids.follower, ids.requester]);
    viewer = null;
    const api = loadStudioFunctions("_lib/channelAudience.ts", ["readPublicChannelAudienceState"], {
      readAudienceActorContext: async () => ({ channelUserId: ids.owner, viewerUserId: viewer }),
      supabase: { rpc },
    });
    assert.equal((await api.readPublicChannelAudienceState(ids.owner)).followerCount, 2);
    assert.equal((await as("anon", null, "select * from public.channel_followers")).rows.length, 0, "old direct-count control still sees an empty RLS roster");
    viewer = ids.owner;
    assert.equal((await api.readPublicChannelAudienceState(ids.owner)).followerCount, 2);
    await db.query("update public.user_profiles set follower_surface_enabled=false where user_id=$1", [ids.owner]);
    assert.equal((await api.readPublicChannelAudienceState(ids.owner)).followerCount, null);
    await db.query("update public.user_profiles set follower_surface_enabled=true where user_id=$1", [ids.owner]);
  });

  await t.test("actual review helper approves transactionally while general self-follow restriction remains", async () => {
    viewer = ids.owner;
    const requestId = (await db.query("insert into public.channel_audience_requests(channel_user_id,requester_user_id,request_kind) values($1,$2,'follow') returning id", [ids.owner, ids.outsider])).rows[0].id;
    await assert.rejects(user(viewer, "insert into public.channel_followers(channel_user_id,follower_user_id) values($1,$2)", [ids.owner, ids.outsider]), /row-level security/, "old direct approval control remains denied");
    const api = loadStudioFunctions("_lib/channelAudience.ts", ["reviewChannelAudienceRequest", "approveChannelAudienceRequest", "normalizeRequestKind", "normalizeRequestStatus", "normalizeText", "buildActionResult"], {
      readRequestRowById: async (id) => (await user(viewer, "select * from public.channel_audience_requests where id=$1", [id])).rows[0] ?? null,
      readAudienceActorContext: async () => ({ channelUserId: ids.owner, viewerUserId: viewer, isOwner: viewer === ids.owner, actorScope: "owner", canOperateAcrossChannels: false }),
      runCurrentAccountBoundSupabaseMutationRpc: async (name, args, expectedOwner) => { assert.equal(expectedOwner, viewer); return rpc(name, args); },
    });
    const outcome = await api.approveChannelAudienceRequest(Number(requestId));
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.requestStatus, "approved");
    assert.equal((await db.query("select count(*)::int n from public.channel_followers where channel_user_id=$1 and follower_user_id=$2", [ids.owner, ids.outsider])).rows[0].n, 1);
    const repeated = await rpc("review_channel_audience_request", { p_request_id: requestId, p_status: "approved" });
    assert.equal(repeated.error, null);
    assert.equal(repeated.data.status, "approved");
    assert.ok((await rpc("review_channel_audience_request", { p_request_id: requestId, p_status: "declined" })).error);
    await assert.rejects(user(viewer, "update public.channel_audience_requests set status='pending' where id=$1", [requestId]), /permission denied/);
  });
});
