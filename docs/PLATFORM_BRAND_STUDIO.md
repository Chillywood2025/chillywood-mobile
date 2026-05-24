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
- Owner/operator/moderation review RPC for approve, reject, and archive actions.
- Reviewer-only Brand Studio queue access for pending/rejected assets without exposing review controls to normal creators.
- Public profile RPC now nulls any asset id that is not currently published and moderation-safe.

## Data Model

Remote-applied migrations:

- `202605240001_platform_brand_studio_assets.sql`: private storage bucket `platform-brand-assets`, `platform_brand_assets`, `platform_brand_profiles`, owner/private draft RLS, public-safe published asset reads, owner-prefixed storage policies, profile reference guards, and `read_public_platform_brand_profile(text)`.
- `202605240002_platform_brand_studio_review_workflow.sql`: append-only `platform_brand_asset_review_events`, `review_platform_brand_asset(uuid,text,text)`, admin audit writes, and public RPC sanitization for unsafe asset references.
- `202605240003_platform_brand_studio_reference_casts.sql`: fixes Spotlight video reference validation to avoid UUID/text comparison failures.
- `202605240004_platform_brand_studio_review_queue_access.sql`: lets authorized owner/operator/moderation reviewers read pending brand assets and private storage objects for review while public reads remain limited to published moderation-safe assets.

Uploads start as `draft` assets with `pending_review` moderation. Public reads require published state, moderation-safe status, and not-deleted assets.

`supabase/database.types.ts` was regenerated from the linked schema on May 24, 2026 after `202605240001` and `202605240002` applied. The later `202605240003` and `202605240004` migrations do not add new type signatures.

## Review Workflow

- Normal creators upload Brand Studio assets as draft/pending review.
- Authorized reviewers can approve, reject with a reason, or archive through `review_platform_brand_asset`.
- Approval changes moderation status to `clean`; it does not publish by itself.
- Publish still requires the creator/profile publish path, and public rendering still requires both `asset_state='published'` and moderation `clean` or `reported`.
- Rejected, pending, hidden, removed, archived, deleted, and draft assets do not render publicly.
- Review actions write `platform_brand_asset_review_events` and `platform_admin_audit_logs` when the audit table is present.

## Failure States

Backed/source-checked friendly states:

- Permission denied: review RPC returns `brand_review_forbidden`; normal UI hides review controls when the account lacks owner/operator/moderation access.
- Unsupported file type: Brand Studio file validation accepts JPG, PNG, and WebP for images and returns creator-facing copy for unsupported files.
- Oversize image/file: image uploads are capped at 20 MB and Hero Reel helper validation is capped at 250 MB, but Hero Reel remains unavailable in normal UI.
- Upload failure/no network/storage failure: UI shows "Unable to choose or save that Platform media right now."
- Pending review: asset cards say the asset is waiting for review before public display.
- Rejected/hidden/removed: asset cards say changes are needed before public display.
- Public fallback: public Platform uses the Chi'llwood city fallback when no approved published hero/background/avatar/logo exists.

## Deferred

- Gesture crop/reposition editor.
- Public Hero Reel playback. Hero video fields exist for future support, but the normal UI keeps Hero Reel unavailable until reviewed video processing, muted autoplay, poster fallback, and public rendering are backed.
- Video watermark rendering. Brand Mark stays unavailable and does not change Player behavior.
- Full cross-platform gesture cropper proof.
- Automated cleanup job for old/rejected/orphaned brand storage objects.

## Cropper Level

Current support is Level 1:

- Fit / Fill / Center.
- Hero overlay strength.
- Background blur/dim.
- Safe-area preview.
- Metadata fields for focal point and crop scale.

Next levels:

- Level 2: focal-point drag/reposition with backed Android gesture proof.
- Level 3: true crop box with a gesture editor.
- Level 4: server-side image transform/export.

Do not claim drag crop or destructive crop export until Android proof exists.

## Storage Cleanup Policy

Cleanup must be service-role/admin-only and must never delete currently published assets or assets still referenced by profile rows.

Recommended future runbook:

- Find archived/deleted assets older than the retention window.
- Find rejected assets older than the retention window.
- Find orphaned draft assets not referenced by `platform_brand_profiles` and older than the retention window.
- Exclude any asset id referenced by hero, poster, background, avatar, logo, watermark, or Spotlight fields.
- Delete storage objects first only after row eligibility is confirmed, then mark or remove database rows according to the retention policy.

No automatic deletion job is implemented in this lane.

## Guardrails

- Do not expose draft, pending-review, rejected, or deleted brand assets on public Platform pages.
- Do not expose raw object internals in normal creator UI.
- Do not fake uploaded media, moderation approval, crop results, Premium state, hero video readiness, or public preview.
- Do not change Premium gates, RevenueCat logic, LiveKit, Watch-Party behavior, creator-video upload/delete behavior, auth/session behavior, or admin role boundaries from Brand Studio work.
