# Platform Brand Studio

Updated: 2026-05-24

Brand Studio is the creator-facing Stage Design area inside Platform Studio. It customizes the public look of a creator's Platform while keeping Profile settings separate.

## Implemented

- Platform Studio Brand tab with compact sections for Hero Media, Background, Avatar and Logo, Theme, Scene Presets, Public Preview, and Platform Defaults.
- Hero image, background image, avatar, and logo draft uploads through `expo-document-picker`.
- Fit modes: Fill, Fit, and Center.
- Hero overlay and background blur/dim metadata.
- Safe-area previews for phone rendering.
- Theme presets: City Night, Studio Red, Clean Dark, Spotlight, and Classic.
- Public Platform fallback to the Chi'llwood city look when no published brand media exists.
- Public Platform rendering through `readPublicPlatformBranding`, which only resolves published moderation-safe assets.

## Data Model

Migration `supabase/migrations/202605240001_platform_brand_studio_assets.sql` adds:

- private storage bucket `platform-brand-assets`
- `platform_brand_assets`
- `platform_brand_profiles`
- RPC `read_public_platform_brand_profile(text)`

Uploads start as `draft` assets with `pending_review` moderation. Public reads require published state, moderation-safe status, and not-deleted assets.

`supabase/database.types.ts` was manually updated in the lane to match the new tables and RPC. Linked type generation was not run.

## Deferred

- Remote migration application and linked lint after Supabase CLI credentials are healthy.
- Admin/owner review workflow for approving brand assets.
- Gesture crop/reposition editor.
- Public Hero Reel playback. Hero video fields exist for future support, but the normal UI keeps Hero Reel unavailable until reviewed video processing, muted autoplay, poster fallback, and public rendering are backed.
- Video watermark rendering. Brand Mark stays unavailable and does not change Player behavior.

## Guardrails

- Do not expose draft, pending-review, rejected, or deleted brand assets on public Platform pages.
- Do not expose raw object internals in normal creator UI.
- Do not fake uploaded media, moderation approval, crop results, Premium state, hero video readiness, or public preview.
- Do not change Premium gates, RevenueCat logic, LiveKit, Watch-Party behavior, creator-video upload/delete behavior, auth/session behavior, or admin role boundaries from Brand Studio work.
