# Chi'llwood Clip Studio

Updated: 2026-05-25

Clip Studio is the creator-facing video preparation area inside Platform Studio. It lets creators choose a source video, stage a cover image, add title/template metadata, preview the result, and save or publish through the existing creator-video flow. It is not a timeline editor and it does not export a new video file.

## Implemented

- Platform Studio `Clip` tab.
- `Create Clip` entry from Platform Studio header, Home Create and Manage, and Content.
- `Edit Clip` action on owner creator-video cards.
- Safe document-picker video selection for MP4, MOV, WebM, and M4V.
- Local selected-video preview using native controls when a selected/saved video URL is available.
- Cover image picker/upload for JPG, PNG, and WebP with a 20 MB limit, hardened through the existing media-storage signed upload path and readable-byte verification.
- Format metadata: Vertical 9:16, Square 1:1, and Landscape 16:9.
- Fit metadata: Fill, Fit, and Center.
- Title Card metadata: optional title text, optional subtitle text, Top/Center/Bottom placement, and Clean/Bold/Spotlight/Trailer style.
- Template metadata presets: Trailer, Highlight, Promo, Event, Reaction, and Platform Intro.
- Preview overlay drawn over selected video when available, cover/poster when available, or a neutral placeholder.
- Optional Platform brand mark preview when a published approved Brand Studio avatar/logo/watermark asset exists.
- Hardened Save Draft and Publish Clip actions using `uploadCreatorVideo`, `updateCreatorVideoMetadata`, `creator_clip_edits`, owner read-back, and Content Library refresh confirmation.
- Owner-only Content Library cards can show title/template preview metadata for drafts and owned videos.
- Public creator-video cards can show safe cover/poster images for published, moderation-safe videos through the `public-creator-video-cards` resolver.
- Existing public Player remains the playback owner for published videos.

Title Card text can be empty. The normal clip/video title is still required for saving a creator video, but a creator does not have to add overlay text.

## Data Model

Remote-applied migrations:

- `202605240008_creator_clip_studio_metadata.sql`: adds private owner-only `creator_clip_edits`, updates the private `creator-videos` bucket to also allow cover image MIME types, and keeps Clip Studio metadata out of anon/public reads.
- `202605240009_creator_clip_studio_owner_cast_fix.sql`: fixes the Clip Studio metadata trigger for older `videos.owner_id` UUID schemas by comparing `videos.owner_id::text` to `creator_clip_edits.owner_user_id`.
- `202605250001_creator_clip_studio_title_templates.sql`: allows the `trailer` title overlay style, adds title/subtitle length checks, and documents that template metadata does not create transitions, audio sync, timeline effects, or export rendering.

The public cover/poster card lane adds no migration. It adds the `public-creator-video-cards` Edge Function and registers it in `supabase/config.toml`.

`creator_clip_edits` stores display/edit metadata only:

- `clip_format`
- `fit_mode`
- reserved trim fields
- cover metadata
- `title_overlay_text`
- `title_overlay_subtitle`
- `title_overlay_position`
- `title_overlay_style`
- `template_preset`
- optional brand mark reference

The table is owner-only. Public routes do not read it in this lane.

## Title Cards

The Title Card section uses creator-facing copy:

- "Title Card"
- "Add a title for this clip."
- "Preview"
- "Public display"
- "Editor preview only"

Length limits:

- title overlay text: 80 characters
- subtitle overlay text: 140 characters

Placement presets:

- Top
- Center
- Bottom

Style presets:

- Clean
- Bold
- Spotlight
- Trailer

The visibility decision for this lane is "Editor preview only" plus owner-only Content Library preview. Title cards are not presented as public video edits.

## Templates

Template presets set metadata recommendations only:

| Template | Recommendation |
| --- | --- |
| Trailer | Trailer style, centered title, Landscape 16:9, Fill |
| Highlight | Clean style, bottom title, Vertical 9:16, Fill |
| Promo | Bold style, bottom title, Vertical 9:16, Fill |
| Event | Spotlight style, top title, Landscape 16:9, Fit |
| Reaction | Clean style, bottom title, Vertical 9:16, Fit |
| Platform Intro | Spotlight style, centered title, Square 1:1, Center |

Templates do not add transitions, audio sync, AI edits, timeline effects, or export rendering.

## Preview Behavior

Clip Studio preview chooses the safest available visual source:

1. selected/signed video preview
2. cover/poster preview
3. neutral preview placeholder

The preview reflects title/subtitle text, placement, style, selected template, format, fit, and safe brand styling where already available. Missing video or cover media must not crash the editor.

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

The Save Draft button is disabled until a video, normal clip title, rights acknowledgement, upload availability, file-size check, and brand mark requirement are satisfied. While saving, duplicate taps are blocked by an in-flight ref. A successful save must complete all of these steps before the UI says saved:

- create or update a real `videos` row
- upload the optional cover and attach it to the owned video when selected
- upsert the `creator_clip_edits` row
- read back the owned video row with `readCreatorVideoForOwner`
- read back the Clip Studio edit row with `readClipStudioEdit`
- confirm persisted metadata matches the intended edit patch
- refresh the Content Library query and confirm the saved id appears with the target visibility

Save Draft persists:

- `title_overlay_text`
- `title_overlay_subtitle`
- `title_overlay_position`
- `title_overlay_style`
- `template_preset`
- existing `clip_format`
- existing `fit_mode`
- cover metadata when selected

If video upload succeeds but metadata or refresh confirmation fails, Clip Studio keeps the saved video id and selected media state where useful, shows `Retry Save Draft`, and retries against the existing draft instead of creating a duplicate blank row. `View Draft` appears only after read-back and Content Library confirmation.

Reopening a draft loads the saved `creator_clip_edits` row, restores title/template/format/fit/cover state, and uses a signed owned video or thumbnail preview when available.

## Content Library

Owner Content Library cards may show:

- the normal creator-video title
- draft/public status
- media readiness
- template badge
- owner-only title/subtitle overlay preview on the card image/placeholder
- `Clip Studio: Title Card` or `Clip Studio: No Title Card` summary

This is owner-only. Public users do not receive draft/private cards and public routes do not read Clip Studio edit rows.

## Renderer Decision

| Field | Current status |
| --- | --- |
| `cover_storage_path` / poster | Owner Content Library plus safe public card cover/poster display for published, moderation-safe videos. Draft covers stay owner-only. |
| `clip_format` | Editor-preview-only; saved to draft/edit state. Public renderer deferred. |
| `fit_mode` | Editor-preview-only; saved to draft/edit state. Public renderer deferred. |
| `title_overlay_text` | Editor-preview-only plus Content Library owner-only. Public renderer deferred. |
| `title_overlay_subtitle` | Editor-preview-only plus Content Library owner-only. Public renderer deferred. |
| `title_overlay_position` | Editor-preview-only plus Content Library owner-only. Public renderer deferred. |
| `title_overlay_style` | Editor-preview-only plus Content Library owner-only. Public renderer deferred. |
| `template_preset` | Editor-preview-only plus Content Library owner-only badge/summary. Public renderer deferred. |
| `brand_mark_enabled` | Editor-preview-only. Public watermark renderer deferred. |
| `brand_asset_id` | Editor-preview-only. Public watermark renderer deferred. |
| `trim_start_ms` | Deferred; no real trim/export is active. |
| `trim_end_ms` | Deferred; no real trim/export is active. |

Public title/template rendering is deferred because the current public Channel, Home, and Player surfaces do not have a dedicated published-video overlay renderer and should not read private edit rows by default. If a later lane enables public rendering, it must apply only to published public-safe videos and must prove drafts/private videos do not expose metadata.

## Cover Images

Cover images upload only after a real `videos` row exists. The upload uses the same hardened media-storage path as creator video media, stores the private object under the owner/video prefix, verifies the uploaded object has readable bytes, then updates `videos.thumb_storage_path`.

The Clip Studio edit row stores the same cover path in `creator_clip_edits.cover_storage_path`. Save Draft is not allowed to report cover success unless the video row and edit row can be read back and the cover path matches.

Public cover access remains governed by existing creator-video visibility and moderation policies:

- drafts stay owner-only
- public covers require the video to be public
- moderation-hidden/removed/banned videos do not become public through Clip Studio

Creator-video thumbnail resolution signs the cover/poster through the video's real storage provider. S3-backed videos use media-storage signed downloads for their cover path; Supabase-backed legacy cover paths keep the existing Supabase signed URL path.

Public card surfaces now use a separate safe resolver:

- `readCreatorVideos`, `readCreatorVideosForOwners`, and `readLatestPublicCreatorVideos` route public-card reads through `public-creator-video-cards`.
- The resolver uses service-role reads internally, but returns only sanitized public card fields.
- It filters to `visibility='public'` and `moderation_status` `clean` or `reported`.
- It signs `thumb_storage_path` only when the cover path is under the matching owner/video prefix.
- It returns `thumbnailUrl` but does not return raw storage paths, object keys, playback URLs, or Clip Studio edit metadata.
- Public cards fall back to the existing thumbnail/default card state if no safe cover/poster is available.

Current public cover/card surfaces:

- public Channel Featured card
- public Channel Latest Uploads cards
- Home creator-video rails
- public Profile creator-video cards

Deleting a creator video best-effort removes its cover path according to the associated storage provider.

## Deferred

- real trim/export
- permanent rendered crop
- permanent rendered title/subtitle overlay
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

Cover/poster hardening implementation commit: `84a9109b2ccd939da85ed3595301d5a578bc6165`.

Title Card and Template Preview implementation: May 25, 2026 closeout commit for this lane.

Public Cover Poster Card Renderer implementation: May 25, 2026 closeout commit for this lane.

Backend persistence proof for title/templates used draft video `3804dbca-e1f7-4251-b5fa-8603014c66bf`:

- saved title overlay: `Trailer Night Proof`
- saved subtitle overlay: `Template metadata read-back`
- saved placement/style/template: `center` / `trailer` / `trailer`
- saved format/fit: `landscape_16_9` / `fill`
- owned read-back matched every saved metadata field
- owner Content Library saw the draft
- public unauthenticated video query returned zero rows for the draft
- unauthenticated `creator_clip_edits` read returned zero rows with table permission denial

Android current-bundle proof on `R5CR120QCBF` is outside the repo under `/tmp/chillywood-proof-2026-05-25T12-44-56-358Z-clip-studio-title-template-preview/screenshots/`:

- current dev build loaded after temporarily moving ignored `.env.brand-review-proof.local` out of Metro's file scan, then restoring it
- Clip Studio current UI
- Title Card section with length counters, placement, styles, and editor-preview copy
- Templates section with selected preset and all MVP presets
- owner Content Library draft cards with Clip Studio summary

Android Save Draft/reopen visual proof for this layer is closed on `R5CR120QCBF`. Screenshots are outside the repo under `/tmp/chillywood-proof-2026-05-25T13-47-05-881Z-clip-studio-android-reopen-proof/screenshots/`:

- `03-content-library-list-top.png` and `15-content-library-draft-section-after-save.png` show the owner-only Content Library card with the Trailer badge, title/subtitle overlay preview, and `Clip Studio: Title Card · Trailer`.
- `04-reopened-draft-preview.png` shows the existing saved draft opened in Clip Studio with the overlay preview restored.
- `05-reopened-title-card-controls.png` shows title `Trailer Night Proof`, subtitle `Template metadata read-back`, Center placement, Trailer style, and editor-preview-only public display state restored.
- `06-reopened-template-controls.png` shows the Trailer template selected with the full MVP preset list still available.
- `08-save-draft-confirmed.png` shows Save Draft returning to confirmed saved state after read-back on the existing draft.
- `16-public-platform-preview-no-draft.png` and `17-public-platform-videos-no-draft.png` show public-preview mode with viewer state, no owner controls, and no draft/title-template card exposure.

Keyboard/back behavior did not require a code fix in this closeout. Source inspection found no Clip Studio-specific `BackHandler` override, and the clean proof avoided relying on hardware Back for keyboard dismissal; the previous Home return is documented as a proof-flow navigation issue, not a confirmed Save Draft or reopen route bug.

Backend confirmation for the Android closeout used the same draft and returned `visibility: draft`, restored title/template metadata, owner library visibility, zero public video rows, and anonymous denial for `creator_clip_edits`.

Android public cover/poster card proof on `R5CR120QCBF` is outside the repo under `/tmp/chillywood-proof-2026-05-25T15-17-45-3NZ-clip-studio-public-cover-cards/screenshots/`:

- `10-public-featured-cover-card-rendered.png` shows a published public card rendering the saved cover image on the public Channel Featured card, with the same cover also visible in Latest Uploads.
- `12-owner-content-library-drafts-section.png` shows the owner-only Content Library draft card still rendering the Trailer badge and title/subtitle overlay preview only to the creator.
- `02-public-platform-preview-no-owner-controls.png` and `09-public-cover-proof-channel-loaded.png` show public viewer state with no owner controls.

Backend public-cover proof is stored in the same `/tmp` proof directory:

- seeded published video `4c0b42c4-fe11-44ce-8c31-d6a1fd41821b` uses real media-storage uploads and a real public video row
- `public-creator-video-cards` returned a cover URL for that published, moderation-safe video
- the cover range probe returned `206` and `image/png`
- returned public card keys did not include raw storage/path/object/playback fields
- returned public card keys did not include title/template/overlay fields
- draft `3804dbca-e1f7-4251-b5fa-8603014c66bf` was not returned by the public resolver
- public video rows for that draft remained `0`
- unauthenticated `creator_clip_edits` read returned permission denial

No public title/template display was enabled in the public cover/poster lane.

## Brand Studio Integration

Clip Studio can preview a Platform brand mark only if Brand Studio already has a published, moderation-safe avatar, logo, or watermark asset. Pending, rejected, archived, deleted, and draft brand assets are not eligible.

The brand mark remains preview metadata and does not change Player behavior.

## Failure States

Creator-facing failure copy covers:

- no video selected
- unsupported video type
- oversized video
- picker unavailable
- no cover selected
- unsupported cover type
- oversized cover
- title overlay too long
- subtitle overlay too long
- upload paused by runtime config
- save failure
- read-back failure
- Content Library refresh failure
- publish failure
- missing approved Platform brand mark
- trim/export unavailable
- session expired through the existing signed-in Platform Studio boundary

Raw storage paths, signed URL internals, RLS messages, backend wording, and debug/proof copy are not shown in normal Clip Studio UI.

## Guardrails

- Do not fake trim/export.
- Do not fake public title-overlay rendering.
- Do not fake cover upload success.
- Do not show Save Draft success until the video row, Clip Studio edit row, metadata read-back, and Content Library read-back are confirmed.
- Do not expose draft/private videos publicly.
- Do not expose draft/private cover images publicly.
- Do not expose owner-only title/template metadata publicly.
- Do not change Premium gates, RevenueCat, LiveKit, Watch-Party Live, Live Watch-Party, payout, revenue, or creator monetization logic from Clip Studio work.
- Do not use legacy diminutive Platform copy.

## Validation

Latest Public Cover Poster Card Renderer validation used:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:refresh-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:stripe-connect-policy`
- `npm run guard:vod-quality-policy`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `supabase migration list`
- `supabase db lint --linked`
- `supabase db push --dry-run`
- targeted grep proof that no public title/template display claim was added
- targeted grep proof that no fake export claim was added
- targeted grep proof that no user-facing Mini Platform/debug copy was added
- backend proof that public cards only receive safe published cover/poster URLs
- backend proof that draft/private cover and title/template metadata do not render publicly
- backend proof that unauthenticated `creator_clip_edits` direct read remains denied
- Android public-cover proof on `R5CR120QCBF`
- Android owner Content Library proof that owner-only title/template preview remains owner-only
- `git diff --check`
- `git diff --cached --check`

`supabase/database.types.ts` did not change in this lane because no schema migration was added.
