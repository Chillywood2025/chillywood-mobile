#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Profile production policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const profile = read("app/profile/[userId].tsx");
const settings = read("app/settings.tsx");
const profileFeedCard = read("components/ProfileSocialFeedCard.tsx");
const profileMedia = read("_lib/profileMedia.ts");
const profileMediaSheets = read("components/profile/profile-media-sheets.tsx");
const socialAttachments = read("_lib/socialAttachments.ts");
const socialAttachmentPicker = read("_lib/socialAttachmentPicker.ts");
const socialAttachmentSheet = read("components/social/social-attachment-action-sheet.tsx");
const chatInbox = read("app/chat/index.tsx");
const chatThread = read("app/chat/[threadId].tsx");
const player = read("app/player/[id].tsx");
const watchParty = read("app/watch-party/[partyId].tsx");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const publicPlatform = read("app/channel/[userId].tsx");
const platformStudio = read("app/channel-settings.tsx");
const packageJson = read("package.json");
const profileAppearanceMigration = read("supabase/migrations/202605260001_profile_appearance_media.sql");
const profileMediaStatusMigration = read("supabase/migrations/202605260002_profile_media_status_policy.sql");
const userData = read("_lib/userData.ts");
const usernameHelper = read("_lib/usernameHandles.ts");

assertIncludes(profile, `label: "Platform"`, "Profile tab labels");
assertIncludes(profile, `profile-preview-platform-button`, "owner public Platform action");
assertIncludes(profile, `<Text style={styles.actionBtnText}>Platform</Text>`, "owner public Platform action copy");
assertNotIncludes(profile, `{ key: "content", label: "Platform" }`, "duplicate bottom Platform tab");
assertIncludes(profile, `params: { userId, preview: "public" }`, "owner public Platform preview route");
assertIncludes(profile, `Platform Studio`, "owner Platform Studio action");
assertIncludes(profile, `Chi'lly Chat`, "Profile Chi'lly Chat action");
assertIncludes(profile, `getOrCreateDirectThread`, "viewer Profile-to-Chi'lly Chat route");
assertIncludes(profile, `!appConfig.runtimeControls.chat_enabled`, "Chi'lly Chat runtime-control guard");
assertIncludes(profile, `const isChatAuthFailure = error instanceof Error`, "signed-out Chi'lly Chat auth handoff");
assertIncludes(profile, `viewerFollowState === "signed_out"`, "signed-out Profile follow handoff");
assertIncludes(profile, `accessibilityLabel="Attach to profile post"`, "Profile post attachment control");
assertIncludes(profile, `SocialAttachmentActionSheet`, "Profile shared attachment sheet");
assertIncludes(profile, `kicker="PROFILE ATTACHMENT"`, "modern Profile attachment sheet");
assertIncludes(profile, `onSelect={onSelectProfileAttachment}`, "Profile shared attachment sheet action");
assertIncludes(profile, `Creator videos belong in Platform Studio.`, "Profile composer creator-video handoff copy");
assertIncludes(profile, `resolveProfilePrivacyAccess`, "Profile privacy resolver");
assertIncludes(profile, `if (!canViewFullProfile)`, "Profile private/blocked content gate");
assertIncludes(profile, `shouldShowLockedShell ? null : isSelfProfile ? (`, "owner/viewer action split");
assertIncludes(profile, `isSelfProfile && post.visibility === "draft"`, "owner-only draft marker");
assertIncludes(profile, `isSelfProfile && post.moderationStatus === "reported"`, "owner-only reported marker");
assertIncludes(profile, `const canDeletePost = isSelfProfile && post.userId === currentUserId`, "owner-only post delete control");
assertIncludes(profile, `? "No posts yet"`, "owner Profile feed empty state");
assertIncludes(profile, `: "No public posts yet"`, "viewer Profile feed empty state");
assertIncludes(profile, `Share an update or attach a photo to start your Profile feed.`, "owner Profile feed empty copy");
assertIncludes(profile, `Public updates will appear here when available.`, "viewer Profile feed empty copy");
assertIncludes(profile, `onPress={focusProfilePostComposer}`, "Profile empty Create Post focuses composer");
assertNotIncludes(profile, `Your feed is ready when you are.`, "old Profile feed empty state");
assertNotIncludes(profile, `<Text style={styles.feedEmptyButtonText}>{isSelfProfile ? "Platform" : "View Platform"}</Text>`, "random Profile feed Platform CTA");
assertIncludes(profile, `friendState?.availability === "blocked"`, "blocked Chi'lly Circle action guard");
assertIncludes(profile, `ProfileAppearanceSheet`, "owner Profile appearance sheet");
assertIncludes(profile, `ProfileMediaReviewSheet`, "owner Profile media review sheet");
assertIncludes(profile, `ProfileActionsSheet`, "viewer Profile actions sheet");
assertIncludes(profile, `styles.fullBackgroundOverlayWithImage`, "Profile background full-page skin overlay");
assertIncludes(profile, `onPressProfileAvatar`, "Profile avatar tap action");
assertIncludes(profile, `styles.avatarPressable`, "Profile avatar edit hit target");
assertIncludes(profile, `onLongPress={onPressProfileAvatar}`, "Profile avatar long-press action");
assertIncludes(profile, `visible={profilePhotoSheetVisible && isSelfProfile}`, "Profile photo edit owner guard");
assertIncludes(profile, `visible={profileActionsSheetVisible && !isSelfProfile}`, "viewer Profile actions guard");
assertIncludes(profile, `blockChannelAudienceMember({`, "Profile actions block helper");
assertIncludes(profile, `channelUserId: currentUserId`, "viewer-owned block route");
assertIncludes(profile, `blockedUserId: userId`, "Profile block target guard");
assertIncludes(profile, `"Block this user?"`, "Profile block confirmation");
assertIncludes(profile, `Sign in to block this user.`, "signed-out block handoff");
assertIncludes(profile, `You cannot block your own Profile.`, "owner self-block guard");
assertIncludes(profile, `reason: "blocked_relationship"`, "Chi'lly Chat blocked relationship guard");
assertIncludes(profile, `visibleProfileAvatarUrl`, "private-safe Profile avatar rendering");
assertIncludes(profile, `visibleProfileBackgroundUrl`, "private-safe Profile background rendering");
assertIncludes(profile, `targetType: "profile_media"`, "Profile media safety reporting");
assertIncludes(profile, `profileMediaKind: mediaTarget`, "Profile media report kind context");
assertIncludes(profile, `profileMediaPublicState: isProfileMediaActive(mediaStatus) ? "active" : "hidden"`, "Profile media report public-state context");
assertIncludes(settings, `title="Profile Appearance"`, "Settings Profile Appearance section");
assertIncludes(settings, `title="Username"`, "Settings username section");
assertIncludes(settings, `This is how people find you.`, "Settings username helper copy");
assertIncludes(settings, `checkUsernameAvailability`, "Settings username availability check");
assertIncludes(settings, `updateMyUsername`, "Settings username update RPC helper");
assertIncludes(settings, `formatUsernameHandle`, "Settings public handle formatter");
assertIncludes(settings, `title="Profile Photo"`, "Settings Profile Photo control");
assertIncludes(settings, `title="Profile Background"`, "Settings Profile Background control");
assertIncludes(settings, `ProfileMediaReviewSheet`, "Settings Profile media review sheet");
assertIncludes(settings, `Platform branding stays in Brand Studio.`, "Profile/Platform branding separation copy");
assertIncludes(profileMedia, `PROFILE_MEDIA_BUCKET = "profile-media"`, "Profile media bucket");
assertIncludes(profileMedia, `ImagePicker.launchImageLibraryAsync`, "Profile media phone gallery picker");
assertIncludes(profileMedia, `allowsEditing: false`, "Profile media avoids broken native cropper");
assertIncludes(profileMedia, `defaultTab: "photos"`, "Profile media gallery tab");
assertIncludes(profileMedia, `legacy: false`, "Profile media modern photo-library picker");
assertIncludes(profileMedia, `options: ProfileMediaUploadOptions = {}`, "Profile media in-app review fit options");
assertIncludes(profileMedia, `prepareProfileMediaUploadUri`, "Profile media Android content URI staging");
assertIncludes(profileMedia, `FileSystem.uploadAsync`, "Profile media robust Android upload");
assertIncludes(profileMedia, `assertProfileMediaUploadReadable`, "Profile media upload read-back verification");
assertIncludes(profileMedia, `PROFILE_MEDIA_ALLOWED_MIME_TYPES`, "Profile media MIME validation");
assertIncludes(profileMedia, `deleteOwnedProfileMediaObject`, "Profile media remove cleanup");
assertIncludes(profileMedia, `profile_avatar_media_status: "active"`, "Profile avatar immediate publish status");
assertIncludes(profileMedia, `profile_background_media_status: "active"`, "Profile background immediate publish status");
assertIncludes(profileMedia, `profile_avatar_media_status: "user_removed"`, "Profile avatar owner removal status");
assertIncludes(profileMedia, `profile_background_media_status: "user_removed"`, "Profile background owner removal status");
assertNotIncludes(profileMedia, `pending_review`, "Profile media owner-controlled upload path");
assertIncludes(profileMediaSheets, `testID="profile-photo-action-sheet"`, "compact Profile Photo action sheet");
assertIncludes(profileMediaSheets, `"Change Photo"`, "Profile Photo primary change action");
assertIncludes(profileMediaSheets, `testID="profile-avatar-choose-action"`, "Profile Photo choose action");
assertIncludes(profileMediaSheets, `testID="profile-avatar-remove-action"`, "Profile Photo conditional remove action");
assertIncludes(profileMediaSheets, `hasImage ? (`, "Profile Photo remove gating");
assertIncludes(profileMediaSheets, `testID="profile-background-action-sheet"`, "compact Profile Background action sheet");
assertIncludes(profileMediaSheets, `testID="profile-background-adjust-fit-controls"`, "Profile Background adjust controls");
assertIncludes(profileMediaSheets, `testID="profile-media-review-sheet"`, "Profile media in-app review sheet");
assertIncludes(profileMediaSheets, `Review Profile Photo`, "Profile media review photo title");
assertIncludes(profileMediaSheets, `Review Profile Background`, "Profile media review background title");
assertNotIncludes(profileMediaSheets, `Edit Profile Photo`, "Profile Photo sheet title");
assertNotIncludes(profileMediaSheets, `No image yet`, "Profile Photo empty-state copy");
assertNotIncludes(profileMediaSheets, `Add an image first.`, "Profile Photo disabled preview copy");
assertNotIncludes(profileMediaSheets, `Nothing to remove yet.`, "Profile Photo disabled remove copy");
assertNotIncludes(profileMediaSheets, `Square crop is used for Profile photo.`, "Profile Photo first sheet crop copy");
assertNotIncludes(profileMediaSheets, `profile-avatar-fit-controls`, "Profile Photo first sheet fit controls");
assertIncludes(profileMediaSheets, `View Profile Photo`, "viewer Profile photo preview action");
assertIncludes(profileMediaSheets, `Chi'lly Chat`, "viewer Profile actions chat");
assertIncludes(profileMediaSheets, `View Platform`, "viewer Profile actions public Platform route");
assertIncludes(profileMediaSheets, `Block User`, "viewer Profile actions block");
assertIncludes(profileMediaSheets, `Report User`, "viewer Profile actions report");
assertIncludes(profileMediaSheets, `Report Profile Photo`, "viewer Profile photo report action");
assertIncludes(profileMediaSheets, `Report Profile Background`, "viewer Profile background report action");
assertIncludes(profileMediaSheets, `Share Profile`, "viewer Profile actions share");
assertIncludes(profileAppearanceMigration, `'profile-media'`, "Profile-only media bucket migration");
assertIncludes(profileAppearanceMigration, `"profile_background_url"`, "Profile background field migration");
assertIncludes(profileAppearanceMigration, `Separate from Platform Brand Studio`, "Profile media Platform separation comment");
assertIncludes(profileMediaStatusMigration, `"profile_avatar_media_status"`, "Profile media status migration");
assertIncludes(profileMediaStatusMigration, `'active'::text, 'user_removed'::text, 'flagged'::text, 'admin_removed'::text`, "Profile media status values");
assertIncludes(profileMediaStatusMigration, `when coalesce(profile.profile_avatar_media_status, 'active') = 'active' then profile.avatar_url`, "public Profile avatar status mask");
assertIncludes(profileMediaStatusMigration, `when coalesce(profile.profile_background_media_status, 'active') = 'active' then profile.profile_background_url`, "public Profile background status mask");
assertIncludes(profileMediaStatusMigration, `'profile_media'`, "Profile media safety report target type");
assertIncludes(profileMediaStatusMigration, `v_next_profile_media_status := 'flagged'`, "Profile media admin hide status");
assertIncludes(profileMediaStatusMigration, `v_next_profile_media_status := 'admin_removed'`, "Profile media admin remove status");
assertNotIncludes(profileMediaStatusMigration, `pending_review`, "Profile media owner-controlled status policy");
assertIncludes(profile, `isSelfProfile ? onPressPreviewPlatform : onPressViewChannel`, "Platform stat/empty-state owner preview split");
assertIncludes(publicPlatform, `const showOwnerControls = isOwner && !publicPreviewMode`, "public Platform owner-control preview guard");
assertIncludes(publicPlatform, `testID="platform-public-handle"`, "public Platform handle render");
assertIncludes(publicPlatform, `{channel.handle}`, "public Platform canonical handle value");
assertIncludes(publicPlatform, `if (nextAudienceState?.isViewerBlocked)`, "public Platform blocked-viewer guard");
assertIncludes(publicPlatform, `readCreatorVideos(routeUserId, { includeDrafts: false, limit:`, "public Platform draft exclusion");
assertIncludes(platformStudio, `router.push({ pathname: "/channel/[userId]", params: { userId: previewUserId, preview: "public" } })`, "Platform Studio public preview route");
assertIncludes(socialAttachments, `export type SocialAttachmentPickerScope = "images" | "files"`, "shared attachment picker scope");
assertIncludes(socialAttachments, `getSocialAttachmentPickerTypes`, "shared attachment picker type helper");
assertIncludes(socialAttachmentPicker, `ImagePicker.launchImageLibraryAsync`, "shared photo gallery picker");
assertIncludes(socialAttachmentPicker, `defaultTab: "photos"`, "shared photo picker gallery tab");
assertIncludes(socialAttachmentPicker, `DocumentPicker.getDocumentAsync`, "shared file picker");
assertIncludes(packageJson, `"expo-image-picker"`, "native photo gallery picker dependency");
assertIncludes(socialAttachmentSheet, `onSelect("images")`, "shared photo attachment sheet action");
assertIncludes(socialAttachmentSheet, `onSelect("files")`, "shared file attachment sheet action");
assertIncludes(socialAttachmentSheet, `Open your phone gallery.`, "shared photo attachment gallery copy");
assertNotIncludes(socialAttachmentSheet, `Platform Studio`, "shared attachment sheet creator tools");
assertNotIncludes(profile, `showPlatformStudio`, "Profile attachment sheet creator-tool option");
assertNotIncludes(profile, `onOpenPlatformStudio`, "Profile attachment sheet creator-tool callback");
assertNotIncludes(profileMedia, `platform_brand_assets`, "Profile media helper must stay separate from Brand Studio assets");
assertNotIncludes(profileMedia, `platform-brand-assets`, "Profile media helper must stay separate from Brand Studio storage");
assertNotIncludes(profileMediaSheets, `storage_path`, "Profile media sheets must not render raw storage paths");
assertNotIncludes(profileMediaSheets, `objectKey`, "Profile media sheets must not render raw object keys");
assertIncludes(userData, `handle: officialAccount?.handle ?? formatUsernameHandle(profile?.username ?? options.username)`, "Profile/Platform backed @username handle");
assertIncludes(userData, `const generatedUsername = normalizeUsernameHandle(\`user`, "Profile fallback does not use email local-part");
assertNotIncludes(userData, `split("@")`, "Profile fallback must not derive username from email");
assertIncludes(usernameHelper, `RESERVED_USERNAMES`, "shared reserved username list");
assertIncludes(usernameHelper, `checkUsernameAvailability`, "shared username availability helper");
assertIncludes(chatInbox, `formatUsernameHandle(other?.username)`, "Chi'lly Chat inbox canonical @username formatter");
assertIncludes(chatInbox, `testID="chat-inbox-thread-handle"`, "Chi'lly Chat inbox handle render");
assertIncludes(chatThread, `formatUsernameHandle(otherMember?.username)`, "Chi'lly Chat thread canonical @username formatter");
assertIncludes(chatThread, `testID="chat-thread-header-handle"`, "Chi'lly Chat thread header handle render");
assertIncludes(chatThread, `SocialAttachmentActionSheet`, "Chi'lly Chat shared attachment sheet");
assertIncludes(player, `SocialAttachmentActionSheet`, "creator-video comments shared attachment sheet");
assertIncludes(watchParty, `SocialAttachmentActionSheet`, "Watch-Party room comments shared attachment sheet");
assertIncludes(liveStage, `SocialAttachmentActionSheet`, "Live Stage comments shared attachment sheet");

[
  "Upload a creator video",
  "Upload Video",
  ">Upload<",
  "onPressUploadVideo",
  "uploadCreatorVideo",
  "Creator videos stay in Channel",
  "View Channel",
  "News Feed",
  "Mini Platform",
  "foundation rows",
  "not wired",
  "RPC",
  "backend not connected",
].forEach((forbidden) => {
  assertNotIncludes(profile, forbidden, "Profile route user-facing policy");
});

[
  ">Channel<",
  "View Channel",
  "YOUR CHANNEL",
  "PUBLIC CHANNEL",
].forEach((forbidden) => {
  assertNotIncludes(profileFeedCard, forbidden, "Profile social feed card user-facing policy");
});

if (process.exitCode) {
  process.exit();
}

console.log("Profile production policy guard passed.");
