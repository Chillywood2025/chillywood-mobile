import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const assertIncludes = (haystack, needle, label) => {
  if (!haystack.includes(needle)) {
    throw new Error(`Rachi official policy guard failed: missing ${label}: ${needle}`);
  }
};

const assertNotIncludes = (haystack, needle, label) => {
  if (haystack.includes(needle)) {
    throw new Error(`Rachi official policy guard failed: forbidden ${label}: ${needle}`);
  }
};

const officialAccounts = read("_lib/officialAccounts.ts");
const officialRachi = read("_lib/officialRachi.ts");
const userData = read("_lib/userData.ts");
const chillyCircle = read("app/chilly-circle.tsx");
const home = read("app/(tabs)/index.tsx");
const admin = read("app/admin.tsx");
const profile = read("app/profile/[userId].tsx");
const channel = read("app/channel/[userId].tsx");
const chatInbox = read("app/chat/index.tsx");
const chatThread = read("app/chat/[threadId].tsx");
const creatorVideoCard = read("components/creator-media/creator-video-card.tsx");
const migration = read("supabase/migrations/202605260008_rachi_official_posts.sql");
const profileImageMigration = read("supabase/migrations/202605260009_rachi_official_profile_image.sql");
const profileMediaStorageMigration = read("supabase/migrations/202605260010_rachi_official_profile_media_storage.sql");
const originalsMigration = read("supabase/migrations/202605260011_rachi_originals_public_video_fixture.sql");
const originalsPlaybackMigration = read("supabase/migrations/202605260012_rachi_originals_fixture_playback_mp4.sql");
const originalsSelectHardeningMigration = read("supabase/migrations/202605260013_rachi_originals_public_link_select_hardening.sql");
const publicCreatorVideoCardsFunction = read("supabase/functions/public-creator-video-cards/index.ts");

const userFacingSource = [
  officialAccounts,
  chillyCircle,
  home,
  admin,
  profile,
  channel,
  chatInbox,
  chatThread,
].join("\n");

assertIncludes(officialAccounts, "Rachi shares Chi'llywood updates, tips, and Chi'llwood Originals.", "official Rachi positioning");
assertIncludes(officialAccounts, "Rachi does not read your private chats.", "privacy trust copy");
assertIncludes(officialAccounts, "Rachi Help is opt-in.", "opt-in Rachi Help copy");
assertIncludes(userData, "profileAvatarUrl ?? normalizeTextValue(officialAccount.avatarUrl)", "official profile image reads backed avatar before fallback");

assertIncludes(chillyCircle, "Official connection", "pinned official Chi'lly Circle section");
assertIncludes(chillyCircle, "Your first Chi'lly Circle connection", "first official Circle copy");
assertIncludes(chillyCircle, "Rachi does not read your private chats.", "Circle privacy copy");

assertIncludes(migration, 'admin_create_official_rachi_post', "official post RPC");
assertIncludes(migration, 'public."admin_content_assert_operator"()', "owner/operator assertion");
assertIncludes(migration, 'public."admin_content_write_audit"', "admin audit write");
assertIncludes(migration, "'platform_rachi_official'", "official account target");
assertIncludes(profileImageMigration, "admin_update_official_rachi_profile_image", "official profile image RPC");
assertIncludes(profileImageMigration, 'public."admin_content_assert_operator"()', "profile image owner/operator assertion");
assertIncludes(profileImageMigration, "official_rachi_profile_image_updated", "profile image audit action");
assertIncludes(profileImageMigration, "lower(safe_avatar_url) not like 'https://%'", "public HTTPS image URL requirement");
assertIncludes(profileMediaStorageMigration, "official/rachi/%", "official Rachi profile-media storage prefix");
assertIncludes(profileMediaStorageMigration, "public.has_platform_role(array['owner'::text, 'operator'::text])", "official Rachi storage owner/operator policy");
assertIncludes(originalsMigration, "official_rachi_original_videos", "official Rachi Originals link table");
assertIncludes(originalsMigration, "'platform_rachi_official'", "official Rachi Originals account guard");
assertIncludes(originalsMigration, '"status" = \'published\'', "public Rachi Originals published-only select policy");
assertIncludes(originalsMigration, '"visibility"', "Rachi Originals fixture has public visibility field");
assertIncludes(originalsMigration, '"moderation_status"', "Rachi Originals fixture has moderation status field");
assertIncludes(originalsMigration, 'video."visibility" = \'public\'', "Rachi Originals public select requires public linked video");
assertIncludes(originalsMigration, "video.\"moderation_status\" in ('clean', 'reported')", "Rachi Originals public select requires moderation-safe linked video");
assertIncludes(originalsMigration, "public.has_platform_role(array['owner'::text, 'operator'::text])", "official Rachi Originals owner/operator manage policy");
assertIncludes(originalsMigration, "Big Buck Bunny by Blender Foundation, CC BY 3.0.", "public-safe Rachi Originals attribution");
assertIncludes(originalsMigration, "rachi_originals_public_video_fixture_20260526", "proof-scoped Rachi Originals fixture");
assertIncludes(originalsPlaybackMigration, "video/mp4", "Rachi Originals fixture direct MP4 playback");
assertIncludes(originalsSelectHardeningMigration, 'video."visibility" = \'public\'', "Rachi Originals hardening keeps public linked-video select");
assertIncludes(originalsSelectHardeningMigration, "video.\"moderation_status\" in ('clean', 'reported')", "Rachi Originals hardening keeps moderation-safe select");
assertIncludes(officialRachi, "createOfficialRachiPost", "client official post helper");
assertIncludes(officialRachi, "updateOfficialRachiProfileImage", "client official profile image helper");
assertIncludes(officialRachi, "chooseOfficialRachiProfileImageFromGallery", "client gallery picker helper");
assertIncludes(admin, "createOfficialRachiPost", "admin Rachi post action");
assertIncludes(admin, "Choose from Gallery", "admin Rachi gallery profile image action");
assertIncludes(admin, "Clear Picture", "admin Rachi profile image clear action");
assertNotIncludes(admin, "Paste a public HTTPS image URL", "visible URL-based Rachi profile image UI");
assertIncludes(admin, "Normal Users", "normal-user Rachi protection copy");
assertIncludes(admin, "Cannot post as Rachi", "normal-user cannot post as Rachi proof copy");
assertIncludes(admin, "Upload Original", "admin Rachi upload-original action");
assertIncludes(admin, "Official upload-as-Rachi remains a separate backend-safe Studio path", "honest Rachi upload limitation");

assertIncludes(home, "readProfilePosts(RACHI_OFFICIAL_ACCOUNT.userId", "Home Rachi posts read");
assertIncludes(home, "readCreatorVideos(RACHI_OFFICIAL_ACCOUNT.userId", "Home Rachi Originals read");
assertIncludes(home, "readUserProfileByUserId(RACHI_OFFICIAL_ACCOUNT.userId", "Home Rachi backed avatar read");
assertIncludes(home, "Chi'llwood Originals", "Home Originals rail");
assertIncludes(home, "Rachi Official Updates", "Home Rachi updates rail");
assertIncludes(home, "rachiIdentityRow", "Home Rachi identity row");
assertIncludes(home, "rachiOfficialAvatarUrl", "Home Rachi avatar or official fallback");
assertIncludes(home, "Official Chi'llwood", "Home Rachi official identity label");
assertIncludes(home, "Public Rachi posts appear here after they are published.", "no fake Rachi posts copy");
assertIncludes(creatorVideoCard, "isOfficialRachiInternalProofFixture", "Rachi public fixture display cleanup");
assertIncludes(creatorVideoCard, "Official Chi'llwood Original from Rachi.", "Rachi public fixture production copy");
assertIncludes(creatorVideoCard, "video.ownerId === RACHI_OFFICIAL_USER_ID", "Rachi fixture cleanup scoped to official Rachi rows");
assertIncludes(publicCreatorVideoCardsFunction, 'RACHI_OFFICIAL_USER_ID = "platform_rachi_official"', "public card resolver official Rachi id");
assertIncludes(publicCreatorVideoCardsFunction, "readPublishedOfficialRachiOriginalVideoIds", "public card resolver official Rachi link read");
assertIncludes(publicCreatorVideoCardsFunction, '.eq("status", "published")', "public card resolver published-only Rachi links");
assertIncludes(publicCreatorVideoCardsFunction, '.eq("visibility", "public")', "public card resolver public-only videos");
assertIncludes(publicCreatorVideoCardsFunction, ".in(\"moderation_status\", PUBLIC_MODERATION_STATUSES)", "public card resolver clean/reported moderation filter");
assertIncludes(publicCreatorVideoCardsFunction, "readOfficialRachiOwnerOverrides", "public card resolver safe Rachi owner override");
assertIncludes(publicCreatorVideoCardsFunction, "ownerId: toText(ownerIdOverride) || toText(row.owner_id)", "public card resolver returns Rachi owner id for linked Originals");
assertNotIncludes(publicCreatorVideoCardsFunction, "playback_url,", "public card resolver does not select raw playback URL");
assertNotIncludes(publicCreatorVideoCardsFunction, "storage_path,", "public card resolver does not select raw storage path");
assertNotIncludes(publicCreatorVideoCardsFunction, "storage_object_key,", "public card resolver does not select raw storage object key");

assertIncludes(profile, "Rachi Help is opt-in", "Profile opt-in Rachi Help copy");
assertIncludes(profile, "Published public-safe Rachi uploads", "Profile Rachi Originals copy");
assertIncludes(channel, "Official Chi'llwood", "Rachi Platform official badge");

for (const forbidden of [
  "Rachi is watching",
  "Rachi watches",
  "Rachi monitors chats",
  "Rachi reads messages",
  "Rachi reads private chats",
  "AI friend watching",
  "system is reading",
  "bot friend",
  "Rachi as your first friend",
  "Your first friend",
]) {
  assertNotIncludes(userFacingSource, forbidden, "chat-surveillance copy");
}

assertNotIncludes(userFacingSource, "fake user activity", "normal creator-facing fake-activity copy");
assertNotIncludes(userFacingSource, "fake Rachi posts", "fake Rachi post copy");

console.log("Rachi official policy guard passed.");
