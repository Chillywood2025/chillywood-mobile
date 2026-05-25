# Chi'llwood Clip Studio

Updated: 2026-05-24

Clip Studio is the creator-facing video preparation area inside Platform Studio. It helps creators choose a source video, preview framing, stage a cover image, add title/template metadata, and save or publish through the existing creator-video flow.

## Implemented

- Platform Studio `Clip` tab.
- `Create Clip` entry from Platform Studio header, Home Create and Manage, and Content.
- `Edit Clip` action on owner creator-video cards.
- Safe document-picker video selection for MP4, MOV, WebM, and M4V.
- Local selected-video preview using native controls with muted playback.
- Format metadata: Vertical 9:16, Square 1:1, and Landscape 16:9.
- Fit metadata: Fill, Fit, and Center.
- Cover image picker for JPG, PNG, and WebP with a 20 MB limit.
- Simple title card metadata: title, subtitle, placement, and style.
- Template metadata: Trailer, Highlight, Promo, Event, Reaction, and Platform Intro.
- Optional Platform brand mark preview only when a published approved Brand Studio avatar/logo/watermark asset exists.
- Hardened Save Draft and Publish Clip actions using `uploadCreatorVideo`, `updateCreatorVideoMetadata`, `creator_clip_edits`, owner read-back, and Content Library refresh confirmation.
- Existing public Player remains the playback owner for published videos.

## Data Model

Remote-applied migration:

- `202605240008_creator_clip_studio_metadata.sql`: adds private owner-only `creator_clip_edits`, updates the private `creator-videos` bucket to also allow cover image MIME types, and keeps Clip Studio metadata out of anon/public reads.
- `202605240009_creator_clip_studio_owner_cast_fix.sql`: fixes the Clip Studio metadata trigger for older `videos.owner_id` UUID schemas by comparing `videos.owner_id::text` to `creator_clip_edits.owner_user_id`. This was the real backend blocker found during Save Draft proof.

`creator_clip_edits` stores display/edit metadata only:

- `clip_format`
- `fit_mode`
- reserved trim fields
- cover metadata
- title overlay metadata
- template preset
- optional brand mark reference

The table is owner-only. Public routes do not read it in the MVP, so title overlays, templates, trim fields, and brand mark settings are not presented as public rendering promises.

## Save Draft Contract

Save Draft uses an explicit state model:

- idle
- selecting_video
- video_selected
- selecting_cover
- ready_to_save
- saving
- saved
- save_failed
- retrying

The Save Draft button is disabled until a video, title, rights acknowledgement, upload availability, file-size check, and Brand mark requirement are satisfied. While saving, duplicate taps are blocked by an in-flight ref. A successful new-video save must complete all of these steps before the UI says saved:

- create or update a real `videos` row
- upload the optional cover and attach it to the owned video when selected
- upsert the `creator_clip_edits` row
- read back the owned video row with `readCreatorVideoForOwner`
- read back the Clip Studio edit row with `readClipStudioEdit`
- refresh the Content Library query and confirm the saved id appears with the target visibility

If video upload succeeds but metadata or refresh confirmation fails, Clip Studio keeps the saved video id and selected media state where useful, shows `Retry Save Draft`, and retries against the existing draft instead of creating a duplicate blank row. `View Draft` appears only after read-back and Content Library confirmation.

## Cover Images

Cover images upload only after a real `videos` row exists. The upload uses the existing private `creator-videos` bucket under the owner/video prefix, then updates `videos.thumb_storage_path`.

Public cover access remains governed by existing creator-video visibility and moderation policies:

- drafts stay owner-only
- public covers require the video to be public
- moderation-hidden/removed/banned videos do not become public through Clip Studio

Deleting a creator video now also attempts to remove its Supabase cover path when the video source itself uses S3 storage.

## Metadata-Only Decisions

The following are metadata/preview only in this MVP:

- format/crop mode
- fit mode
- title card overlay
- template preset
- brand mark setting

The app intentionally says: "Preview crop is used for display. Final export editing is coming later."

## Deferred

- real trim/export
- permanent rendered crop
- multi-clip timeline
- split clip
- transitions
- music beat sync
- auto captions
- AI cut
- green screen
- beauty/effects
- stickers
- full export renderer
- poster-frame extraction from video
- public title-overlay rendering
- global video watermark rendering

Do not claim any of these are active until a backed renderer/export path exists and Android release proof passes.

## Proof Status

MVP implementation commit: `40c6fea9554fbb6ce084241daaa7c35b5792eecb`.

Save Draft hardening implementation commit: `a716ee1ed5a880922b8d6dc49896655392fc9b25`.

Android release proof on `R5CR120QCBF` captured screenshots under `/tmp/chillywood-clip-studio-proof-20260524/` for:

- Platform Studio `Create Clip`
- Clip Studio empty state
- Android video picker
- selected-video preview
- Format/Fit controls
- cover picker and selected-cover state
- Title Card, Template, Platform Brand, and Coming Later sections
- Save Draft controls and rights acknowledgement
- Content Library draft card with `Edit Clip`

The Save Draft hardening lane found the real failed-save blocker: the `creator_clip_edits` trigger compared `videos.owner_id` UUID directly to `owner_user_id` text, producing `operator does not exist: uuid = text` after the video draft row had already been created. Migration `202605240009` is remote-applied and fixes that trigger comparison.

Android/device and backend proof for the hardening lane is stored outside the repo under `/tmp/chillywood-clip-save-draft-proof-20260524/`:

- `74-save-draft-started.png`: Save Draft entered the real saving state after selected video and rights acknowledgement.
- `75-save-draft-after-wait.png`: the old build did not fake success; it showed retry after metadata confirmation failed.
- backend proof confirmed draft video `14af2be6-57ee-473b-aabd-f0225746a680` exists as `draft`, belongs to the signed-in proof creator, and has a matching `creator_clip_edits` row after the trigger fix.
- `78-content-draft-list-visible.png`: Content Library shows the saved draft as Draft / Media Ready.
- `79-public-preview-no-draft.png`: public Platform preview shows only public-safe content and does not show the saved draft title.

The same proof query returned `publicRowCount: 0` for the saved draft id, and source proof remains `readCreatorVideos(routeUserId, { includeDrafts: false })` plus `showOwnerControls = isOwner && !publicPreviewMode` on the public Platform route.

## Brand Studio Integration

Clip Studio can preview a Platform brand mark only if Brand Studio already has a published, moderation-safe avatar, logo, or watermark asset. Pending, rejected, archived, deleted, and draft brand assets are not eligible.

The brand mark is not burned into video and does not change Player behavior.

## Failure States

Creator-facing failure copy covers:

- no video selected
- unsupported video type
- oversized video
- picker unavailable
- no cover selected
- unsupported cover type
- oversized cover
- upload paused by runtime config
- save failure
- read-back failure
- Content Library refresh failure
- publish failure
- missing approved Platform brand mark
- trim/export unavailable

Raw storage paths, signed URL internals, RLS messages, backend wording, and debug/proof copy are not shown in normal Clip Studio UI.

## Guardrails

- Do not fake trim/export.
- Do not fake public title-overlay rendering.
- Do not fake cover upload success.
- Do not show Save Draft success until the video row, Clip Studio edit row, and Content Library read-back are confirmed.
- Do not expose draft/private videos publicly.
- Do not expose private Brand Studio assets publicly.
- Do not change Premium gates, RevenueCat, LiveKit, Watch-Party Live, Live Watch-Party, payout, revenue, or creator monetization logic from Clip Studio work.
- Do not use legacy diminutive Platform copy.

## Validation

Latest Save Draft hardening validation used:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:refresh-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:stripe-connect-policy`
- `npm run guard:vod-quality-policy`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:clip-studio-policy`
- existing Watch-Party/LiveKit and old-room guards
- `supabase db push`
- `supabase migration list`
- `supabase db lint --linked`
- `supabase db push --dry-run`
- targeted no-Mini-Platform/no-debug-copy/no-fake-export grep
- backend proof that the saved draft has a real video row, real Clip Studio edit row, owner match, `draft` visibility, and zero public rows
- source proof that public Platform reads creator videos with `includeDrafts: false` and hides owner controls in public-preview mode
- Android proof on `R5CR120QCBF`
- `git diff --check`
- `git diff --cached --check`

`supabase/database.types.ts` did not change in the Save Draft hardening lane because `202605240009` replaces a function body only and adds no table, column, enum, or RPC signature.
