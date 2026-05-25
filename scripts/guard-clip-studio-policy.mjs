import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const studio = read("app/channel-settings.tsx");
const clipHelper = read("_lib/clipStudio.ts");
const creatorVideoCard = read("components/creator-media/creator-video-card.tsx");
const migration = read("supabase/migrations/202605240008_creator_clip_studio_metadata.sql");
const ownerCastMigration = read("supabase/migrations/202605240009_creator_clip_studio_owner_cast_fix.sql");
const titleTemplateMigration = read("supabase/migrations/202605250001_creator_clip_studio_title_templates.sql");
const publicChannel = read("app/channel/[userId].tsx");
const publicHome = read("app/(tabs)/index.tsx");
const player = read("app/player/[id].tsx");

const requiredStudioCopy = [
  "Clip Studio",
  "Prepare your video before publishing.",
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

for (const [path, source] of [
  ["app/channel/[userId].tsx", publicChannel],
  ["app/(tabs)/index.tsx", publicHome],
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
