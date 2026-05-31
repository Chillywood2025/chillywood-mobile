import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const studio = read("app/channel-settings.tsx");
const clipHelper = read("_lib/clipStudio.ts");
const creatorVideoCard = read("components/creator-media/creator-video-card.tsx");
const creatorVideos = read("_lib/creatorVideos.ts");
const publicCreatorVideoCardsFunction = read("supabase/functions/public-creator-video-cards/index.ts");
const mediaStorageFunction = read("supabase/functions/media-storage/index.ts");
const migration = read("supabase/migrations/202605240008_creator_clip_studio_metadata.sql");
const ownerCastMigration = read("supabase/migrations/202605240009_creator_clip_studio_owner_cast_fix.sql");
const titleTemplateMigration = read("supabase/migrations/202605250001_creator_clip_studio_title_templates.sql");
const publicChannel = read("app/channel/[userId].tsx");
const publicHome = read("app/(tabs)/index.tsx");
const publicProfile = read("app/profile/[userId].tsx");
const player = read("app/player/[id].tsx");
const rightsHelper = read("_lib/contentRights.ts");
const rightsMigration = read("supabase/migrations/202605260007_content_rights_disclosures.sql");
const clipDocs = read("docs/CLIP_STUDIO.md");

const requiredStudioCopy = [
  "Clip Studio",
  "Prepare your video before publishing.",
  "Add videos in Clip Studio",
  "Choose Full Video",
  "type ClipStudioSaveState",
  "readCreatorVideoForOwner",
  "clipSaveInFlightRef",
  "Draft saved and confirmed in Content Library.",
  "Retry Save Draft",
  "View Draft",
  "Preview crop is used for display. Final export editing is coming later.",
  "Trim/export is coming later.",
  "Add a title for this clip.",
  "Public display",
  "Editor preview only",
  "Multi-clip timeline, split clip, transitions, beat sync, auto captions, AI cut, green screen, effects, stickers, and full export rendering are not active in this MVP.",
];

for (const needle of requiredStudioCopy) {
  if (!studio.includes(needle)) {
    throw new Error(`Clip Studio guard failed: missing production copy "${needle}".`);
  }
}

const requiredDormantRightsDisclosureTerms = [
  "Visible Rights Disclosure UI is disabled for now",
  "Clip Studio and creator-video upload/publish do not show visible Rights UI",
  "content_rights_disclosures",
  "record_content_rights_disclosure",
  "Backend disclosure helpers/tables are dormant",
  "does not grant copyright clearance",
];

for (const needle of requiredDormantRightsDisclosureTerms) {
  const surface = `${rightsHelper}\n${rightsMigration}\n${clipDocs}`;
  if (!surface.includes(needle)) {
    throw new Error(`Clip Studio guard failed: dormant rights disclosure support is missing "${needle}".`);
  }
}

for (const forbidden of [
  "RightsDisclosureControl",
  "contentRightsDisclosure",
  "clipRightsDisclosure",
  "recordCreatorVideoRightsDisclosure",
  "recordClipRightsDisclosure",
  "rightsInlineRow",
  "I don’t own this content",
  "I don’t own this music",
  "Use this if your upload includes content or music",
]) {
  if (studio.includes(forbidden)) {
    throw new Error(`Clip Studio guard failed: visible Clip/content Rights UI must be removed from Platform Studio: "${forbidden}".`);
  }
}

for (const forbidden of [
  "CREATOR_UPLOAD_ACKNOWLEDGEMENT",
  "rights_acknowledgement_missing",
  "Confirm creator rights before",
  "Confirm the creator rights acknowledgement",
]) {
  if (studio.includes(forbidden)) {
    throw new Error(`Clip Studio guard failed: main editor must not require the old heavy rights acknowledgement "${forbidden}".`);
  }
}

for (const forbidden of [
  "I don't own rights",
  "This protects you",
  "This makes it legal",
  "Contains third-party content",
  "Contains third-party music",
  "Add a note",
  "Clear disclosure",
]) {
  const userFacingRightsSurface = studio;
  if (userFacingRightsSurface.includes(forbidden)) {
    throw new Error(`Clip Studio guard failed: unsafe rights copy is present: "${forbidden}".`);
  }
}

for (const forbidden of [
  "Classic Upload",
  "Video Upload",
  "VOD ladder:",
  "Free max",
  "Premium max",
]) {
  const productSurface = `${studio}\n${creatorVideoCard}`;
  if (productSurface.includes(forbidden)) {
    throw new Error(`Clip Studio guard failed: old creator-video upload/quality copy must stay removed: "${forbidden}".`);
  }
}

for (const needle of ["Set Featured", "Remove Featured"]) {
  if (!creatorVideoCard.includes(needle)) {
    throw new Error(`Clip Studio guard failed: Content Library featured action is missing "${needle}".`);
  }
}

for (const needle of ["Choose Cover Image", "Change Cover", "Remove Cover"]) {
  if (!studio.includes(needle)) {
    throw new Error(`Clip Studio guard failed: Cover image state action is missing "${needle}".`);
  }
}

const requiredHelperTerms = [
  "getClipStudioCoverValidationMessage",
  "uploadClipStudioCoverImage",
  "uploadFileToMediaStorage",
  "createSignedMediaDownload",
  "deleteStoredMediaObject",
  "Cover upload failed. Try again.",
  "saveClipStudioEdit",
  "readClipStudioEdit",
  "readClipStudioEditsForVideos",
  "getClipStudioTitleOverlayValidationMessage",
  "getClipStudioTemplatePresetConfig",
  "CLIP_STUDIO_TITLE_OVERLAY_MAX_LENGTH",
  "CLIP_STUDIO_SUBTITLE_OVERLAY_MAX_LENGTH",
  "CLIP_STUDIO_COVER_MAX_BYTES",
];

for (const needle of requiredHelperTerms) {
  if (!clipHelper.includes(needle)) {
    throw new Error(`Clip Studio guard failed: helper is missing "${needle}".`);
  }
}

const requiredPublicCoverResolverTerms = [
  "PUBLIC_CREATOR_VIDEO_CARDS_URL",
  "readPublicCreatorVideoCards",
  'action: "list_by_owner"',
  'action: "list_for_owners"',
  'action: "list_latest"',
];

for (const needle of requiredPublicCoverResolverTerms) {
  if (!creatorVideos.includes(needle)) {
    throw new Error(`Clip Studio guard failed: public creator-video card reads must use the safe resolver term "${needle}".`);
  }
}

const requiredMigrationTerms = [
  'create table if not exists public."creator_clip_edits"',
  '"owner_user_id" = auth.uid()::text',
  "'Clip Studio edit must belong to a creator video owned by this account.'",
  "'Clip Studio brand mark must be an approved published Platform asset.'",
  "grant select, insert, update, delete on table public.\"creator_clip_edits\" to authenticated;",
  "until a backed renderer explicitly reads them",
];

for (const needle of requiredMigrationTerms) {
  if (!migration.includes(needle)) {
    throw new Error(`Clip Studio guard failed: migration is missing "${needle}".`);
  }
}

if (!ownerCastMigration.includes('video."owner_id"::text = new."owner_user_id"')) {
  throw new Error("Clip Studio guard failed: owner cast fix must compare videos.owner_id as text.");
}

const requiredTitleTemplateMigrationTerms = [
  '"title_overlay_style" in (\'clean\', \'bold\', \'spotlight\', \'trailer\')',
  '"creator_clip_edits_title_overlay_text_length_check"',
  '"creator_clip_edits_title_overlay_subtitle_length_check"',
  "It does not create transitions, audio sync, timeline effects, or video export.",
];

for (const needle of requiredTitleTemplateMigrationTerms) {
  if (!titleTemplateMigration.includes(needle)) {
    throw new Error(`Clip Studio guard failed: title/template migration is missing "${needle}".`);
  }
}

if (/grant\s+select\s+on\s+table\s+public\."creator_clip_edits"\s+to\s+anon/i.test(migration)) {
  throw new Error("Clip Studio guard failed: creator_clip_edits must not grant anon reads in the MVP.");
}

if (!creatorVideoCard.includes("const ownerClipEdit = ownerMode ? clipEdit ?? null : null;")) {
  throw new Error("Clip Studio guard failed: Content Library title/template display must stay owner-mode only.");
}

if (!creatorVideoCard.includes("const playable = ownerMode ? hasPlayableSource(video) : shareable;")) {
  throw new Error("Clip Studio guard failed: public creator-video cards must not depend on raw storage paths for playability.");
}

const requiredPublicCoverFunctionTerms = [
  ".eq(\"visibility\", \"public\")",
  ".in(\"moderation_status\", PUBLIC_MODERATION_STATUSES)",
  "thumbnailUrl: await createThumbnailUrl",
  "thumb_storage_path",
  "isSafeVideoThumbnailPath",
  "thumbnailPath.startsWith(`${ownerId}/${videoId}/`)",
];

for (const needle of requiredPublicCoverFunctionTerms) {
  if (!publicCreatorVideoCardsFunction.includes(needle)) {
    throw new Error(`Clip Studio guard failed: public cover resolver is missing "${needle}".`);
  }
}

const publicFunctionSelect = publicCreatorVideoCardsFunction.match(/const PUBLIC_CREATOR_VIDEO_SELECT = \[([\s\S]*?)\]\.join/)?.[1] ?? "";
for (const forbidden of ['"playback_url"', '"storage_path"', '"storage_object_key"']) {
  if (publicFunctionSelect.includes(forbidden)) {
    throw new Error(`Clip Studio guard failed: public creator-video card resolver must not return raw ${forbidden}.`);
  }
}

const requiredPublicMetadataResolverTerms = [
  "PUBLIC_CLIP_EDIT_SELECT",
  "readPublicClipMetadata",
  ".from(\"creator_clip_edits\")",
  ".select(PUBLIC_CLIP_EDIT_SELECT)",
  "clip_metadata_public",
  "clip_title_text",
  "clip_subtitle_text",
  "clip_template_preset",
  "clip_title_style",
  "clip_title_position",
  "rows.map((row) => row.id)",
];

for (const needle of requiredPublicMetadataResolverTerms) {
  if (!publicCreatorVideoCardsFunction.includes(needle)) {
    throw new Error(`Clip Studio guard failed: public metadata resolver is missing sanitized term "${needle}".`);
  }
}

const publicClipEditSelect = publicCreatorVideoCardsFunction.match(/const PUBLIC_CLIP_EDIT_SELECT = \[([\s\S]*?)\]\.join/)?.[1] ?? "";
const requiredPublicClipMetadataFields = [
  '"video_id"',
  '"title_overlay_text"',
  '"title_overlay_subtitle"',
  '"title_overlay_position"',
  '"title_overlay_style"',
  '"template_preset"',
];

for (const required of requiredPublicClipMetadataFields) {
  if (!publicClipEditSelect.includes(required)) {
    throw new Error(`Clip Studio guard failed: public metadata resolver must select sanitized field ${required}.`);
  }
}

for (const forbidden of [
  '"owner_user_id"',
  '"cover_storage_path"',
  '"cover_mime_type"',
  '"cover_file_size_bytes"',
  '"cover_source_uri"',
  '"cover_public_url"',
  '"brand_asset_id"',
  '"brand_mark_enabled"',
  '"clip_format"',
  '"fit_mode"',
  '"trim_start_ms"',
  '"trim_end_ms"',
  '"created_at"',
  '"updated_at"',
  '"playback_url"',
  '"storage_path"',
  '"storage_object_key"',
]) {
  if (publicClipEditSelect.includes(forbidden)) {
    throw new Error(`Clip Studio guard failed: public metadata resolver must not select private edit field ${forbidden}.`);
  }
}

const requiredPublicMetadataClientTerms = [
  "publicClipMetadata",
  "parsePublicClipMetadata",
  "clip_metadata_public",
  "clip_title_text",
  "clip_subtitle_text",
  "clip_template_preset",
  "clip_title_style",
  "clip_title_position",
];

for (const needle of requiredPublicMetadataClientTerms) {
  if (!creatorVideos.includes(needle)) {
    throw new Error(`Clip Studio guard failed: public client parser is missing sanitized metadata term "${needle}".`);
  }
}

for (const [path, source] of [
  ["components/creator-media/creator-video-card.tsx", creatorVideoCard],
  ["app/channel/[userId].tsx", publicChannel],
]) {
  if (!source.includes("publicClipMetadata")) {
    throw new Error(`Clip Studio guard failed: public surface ${path} must render only sanitized public Clip Studio metadata.`);
  }
}

for (const requiredCoverMime of ['"image/jpeg"', '"image/png"', '"image/webp"', '"image/gif"']) {
  if (!mediaStorageFunction.includes(requiredCoverMime)) {
    throw new Error(`Clip Studio guard failed: media-storage creator-video uploads must allow Clip Studio cover MIME ${requiredCoverMime}.`);
  }
}

for (const [path, source] of [
  ["app/channel/[userId].tsx", publicChannel],
  ["app/(tabs)/index.tsx", publicHome],
  ["app/profile/[userId].tsx", publicProfile],
  ["app/player/[id].tsx", player],
]) {
  if (source.includes("readClipStudioEdit") || source.includes("readClipStudioEditsForVideos")) {
    throw new Error(`Clip Studio guard failed: public surface ${path} must not read private Clip Studio metadata.`);
  }
}

if (!publicChannel.includes("readCreatorVideos(routeUserId, { includeDrafts: false")) {
  throw new Error("Clip Studio guard failed: public Platform must keep draft creator videos excluded.");
}

const userFacingSources = [
  "app/channel-settings.tsx",
  "components/creator-media/creator-video-card.tsx",
  "_lib/clipStudio.ts",
].map((path) => [path, read(path)]);

for (const [path, source] of userFacingSources) {
  for (const banned of ["Mini Platform", "mini platform", "foundation rows", "not wired"]) {
    if (source.includes(banned)) {
      throw new Error(`Clip Studio guard failed: banned user-facing copy "${banned}" found in ${path}.`);
    }
  }
}

console.log("Clip Studio policy guard passed.");
