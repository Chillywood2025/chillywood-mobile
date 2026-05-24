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
- Save Draft and Publish Clip actions using `uploadCreatorVideo` and `updateCreatorVideoMetadata`.
- Existing public Player remains the playback owner for published videos.

## Data Model

Remote-applied migration:

- `202605240008_creator_clip_studio_metadata.sql`: adds private owner-only `creator_clip_edits`, updates the private `creator-videos` bucket to also allow cover image MIME types, and keeps Clip Studio metadata out of anon/public reads.

`creator_clip_edits` stores display/edit metadata only:

- `clip_format`
- `fit_mode`
- reserved trim fields
- cover metadata
- title overlay metadata
- template preset
- optional brand mark reference

The table is owner-only. Public routes do not read it in the MVP, so title overlays, templates, trim fields, and brand mark settings are not presented as public rendering promises.

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

Implementation commit: `40c6fea9554fbb6ce084241daaa7c35b5792eecb`.

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

The proof also attempted a real new-video Save Draft after selecting a video and cover. That attempt did not produce a new visible draft in Content Library during the session, so the project must not claim full new-import Save Draft proof yet. The next Clip Studio lane should fix or prove that path with visible draft/public-private evidence.

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
- publish failure
- missing approved Platform brand mark
- trim/export unavailable

Raw storage paths, signed URL internals, RLS messages, backend wording, and debug/proof copy are not shown in normal Clip Studio UI.

## Guardrails

- Do not fake trim/export.
- Do not fake public title-overlay rendering.
- Do not fake cover upload success.
- Do not expose draft/private videos publicly.
- Do not expose private Brand Studio assets publicly.
- Do not change Premium gates, RevenueCat, LiveKit, Watch-Party Live, Live Watch-Party, payout, revenue, or creator monetization logic from Clip Studio work.
- Do not use legacy diminutive Platform copy.

## Validation

Latest closeout validation used:

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
- Supabase linked dry-run, lint, migration list, and linked typegen proof
- targeted no-Mini-Platform/no-debug-copy/no-fake-export grep
- Android proof on `R5CR120QCBF`
