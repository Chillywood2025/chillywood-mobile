import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const studio = read("app/channel-settings.tsx");
const clipHelper = read("_lib/clipStudio.ts");
const migration = read("supabase/migrations/202605240008_creator_clip_studio_metadata.sql");

const requiredStudioCopy = [
  "Clip Studio",
  "Prepare your video before publishing.",
  "Preview crop is used for display. Final export editing is coming later.",
  "Trim/export is coming later.",
  "Title overlay is preview metadata only until a backed public overlay renderer exists.",
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
  "saveClipStudioEdit",
  "readClipStudioEdit",
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

if (/grant\s+select\s+on\s+table\s+public\."creator_clip_edits"\s+to\s+anon/i.test(migration)) {
  throw new Error("Clip Studio guard failed: creator_clip_edits must not grant anon reads in the MVP.");
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
