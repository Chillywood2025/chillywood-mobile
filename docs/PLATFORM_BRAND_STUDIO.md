# Platform Brand Studio

Updated: 2026-05-31

## May 31, 2026 Public Preview Clarification

The public Platform still renders only Brand Studio assets that are published, moderation-safe, scan-safe, and not deleted. A saved asset marked `Needs review` is not supposed to appear on the visitor-facing Platform yet.

To make that product boundary clear, Platform Studio now separates the two preview actions:

- `Preview Platform` opens the reviewed public view that visitors see. Draft and pending-review assets stay hidden.
- `Preview Brand Draft` opens an owner-only draft preview route with `preview=brand-draft`. It can show saved Brand Studio media before review to the signed-in owner, but it hides normal owner controls and never changes public viewer access.

Draft preview is for visual checking only. It does not approve media, publish draft creator videos, bypass malware scan blocks, weaken the public RPC, or expose Brand Studio assets to non-owners.

## May 31, 2026 Featured Platform Video Selection

Creators can now choose which published Platform video appears as the public Platform spotlight. This is not a new upload path and it does not expose drafts.

Implementation truth:

- Platform Studio Content owner cards show `Set Featured` and `Remove Featured` for public videos.
- The selected video id is stored on the Brand Studio profile as `spotlight_video_id`.
- `publishPlatformBrandProfile` can now intentionally clear `spotlight_video_id` with `null`; `undefined` still means leave the field unchanged.
- Public Platform prefers the selected spotlight video for the `Featured` surface and keeps Latest Uploads chronological.
- The public RPC validates the spotlight video against the same owner, public visibility, and moderation-safe rules before returning it.
- Draft/private/unsafe creator videos do not become public through the spotlight field.

This spotlight choice is Platform presentation metadata. It does not modify Profile media, Brand Studio hero/background/avatar/logo review policy, Clip Studio editing metadata, Player playback rules, Premium gates, Money, or LiveKit.

Android proof for the spotlight selection pass lives at `/tmp/chillywood-platform-content-clip-featured-proof-20260531/`. It uses a fresh release APK on `R5CR120QCBF`, proves `Set Featured` changes the owner card to `Featured` / `Remove Featured`, and proves reviewed public Platform loads the Featured surface without exposing owner controls.

## May 30, 2026 Modern Asset Manager Upload Fix

Brand Studio is now treated as the Platform branding workspace, not Profile media editing. Profile photo/background remain in Profile Appearance and continue to use the separate `profile-media` bucket and Profile Appearance sheets.

Upload blocker root cause: Brand Studio used `expo-document-picker` and passed the returned Android URI directly into Supabase Storage as an Expo `File`, then trusted the write without a byte read-back. That path was brittle for Android `content://`/cache URIs and could fail before a usable draft/read-back existed.

Upload fix: Brand Studio now stages Android `content://` picks into cache when needed, uploads through a Supabase Storage REST binary path with the signed-in user's bearer token and anon API key, falls back to the existing SDK upload path when needed, probes a short signed read-back range after upload, then creates the draft `platform_brand_assets` row. Errors stay creator-safe and do not expose buckets, object keys, raw paths, signed URLs, or service-role details.

Modern layout: the Brand tab opens as a compact asset manager overview unless a deep-link focus opens a section editor. Sections are compact glassy asset cards with thumbnails, status pills, short summaries, and one-handed action rows: Hero Media, Background, Avatar and Logo, Theme, Scene Presets, and Review & Publish. Tapping a card opens a modal bottom sheet. Hero/background Fit / Fill / Center and overlay/blur controls render only inside the bottom sheet after media exists. Empty states no longer show giant blank preview editors or remove actions for missing media.

Review/public rules remain unchanged: uploads are draft assets with `pending_review` moderation and `pending_scan` malware status; public Platform rendering requires published state, moderation-safe status, not deleted, and scan-public-safe status through the existing public-safe database gates. Pending, rejected, removed, scan-failed, quarantined, or malware-detected assets must not render publicly.

Asset model mapping for the current schema:

- `hero_image` maps to Hero Image.
- `hero_video` is the future Hero Reel field and remains disabled in normal UI until reviewed video processing/public playback is backed.
- `background_image` maps to Platform background.
- `avatar` maps to Platform avatar.
- `logo` maps to Platform logo.
- `watermark` maps to future Brand Mark/watermark and remains unavailable for public video rendering.
- Theme and scene presets are saved as profile presentation metadata; scene presets only apply backed theme/overlay draft metadata and do not fake a live scene renderer.

Status model:

- Current database state uses `asset_state` values `draft`, `published`, and `archived`, plus moderation values `pending_review`, `clean`, `reported`, `hidden`, `removed`, and `rejected`.
- User-facing Brand Studio groups these into Draft, Needs review, Approved, Live, Needs changes, and Removed.
- Malware scanning adds `scan_status` values including `pending_scan`, `scanning`, `clean`, `malware_detected`, `scan_failed`, `manual_review`, and `quarantined`; the UI summarizes them as Safety pending/checking/clear/reviewed/blocked/failed.

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
- Creator-owned Brand Studio publish repair: `Publish Changes` now approves the currently selected owned Brand Studio assets before publishing them, so creator uploads no longer stay stuck in `Needs review` after the creator publishes. A creator can review only assets they own; non-owners still receive `brand_review_forbidden`.
- Reviewer-only Brand Studio queue access for pending/rejected assets without exposing review controls to normal creators.
- Public profile RPC now nulls any asset id that is not currently published and moderation-safe.

## Data Model

Remote-applied migrations:

- `202605240001_platform_brand_studio_assets.sql`: private storage bucket `platform-brand-assets`, `platform_brand_assets`, `platform_brand_profiles`, owner/private draft RLS, public-safe published asset reads, owner-prefixed storage policies, profile reference guards, and `read_public_platform_brand_profile(text)`.
- `202605240002_platform_brand_studio_review_workflow.sql`: append-only `platform_brand_asset_review_events`, `review_platform_brand_asset(uuid,text,text)`, admin audit writes, and public RPC sanitization for unsafe asset references.
- `202605240003_platform_brand_studio_reference_casts.sql`: fixes Spotlight video reference validation to avoid UUID/text comparison failures.
- `202605240004_platform_brand_studio_review_queue_access.sql`: lets authorized owner/operator/moderation reviewers read pending brand assets and private storage objects for review while public reads remain limited to published moderation-safe assets.
- `202605240005_platform_brand_asset_cleanup_candidates.sql`: service-role-only cleanup candidate helper for archived, terminal moderation, deleted, and old orphaned draft assets. It lists candidates only and never returns published or still-referenced assets.
- `202605240006_platform_brand_cleanup_service_role_guard.sql`: hardens the cleanup helper with an explicit runtime service-role check so normal authenticated clients cannot call it.
- `202605240007_platform_brand_review_rpc_trigger_context.sql`: lets the authorized `review_platform_brand_asset` RPC pass the safety-field trigger through a transaction-local review context while normal authenticated clients remain blocked from changing moderation fields directly.
- `20260603033000_platform_brand_owner_publish_review_repair.sql`: updates `review_platform_brand_asset` so creators may approve/reject/archive only their own Brand Studio assets, while Owner/Operator/moderation reviewers keep queue review access. Owner self-approval is blocked for malware-detected, scan-failed, or quarantined assets, and audit metadata marks self-review explicitly.

Uploads start as `draft` assets with `pending_review` moderation. Public reads require published state, moderation-safe status, and not-deleted assets.

`supabase/database.types.ts` was regenerated from the linked schema on May 24, 2026 after `202605240007` applied. Generated types include `platform_brand_asset_review_events`, `platform_brand_asset_public_safe`, `review_platform_brand_asset`, `platform_brand_asset_cleanup_candidates`, and the linked `graphql_public` schema block.

## Review Workflow

- Normal creators upload Brand Studio assets as draft/pending review.
- Authorized reviewers can approve, reject with a reason, or archive through `review_platform_brand_asset`.
- Approval changes moderation status to `clean`; it does not publish by itself.
- Publish still requires the creator/profile publish path, and public rendering still requires both `asset_state='published'` and moderation `clean` or `reported`.
- Rejected, pending, hidden, removed, archived, deleted, and draft assets do not render publicly.
- Review actions write `platform_brand_asset_review_events` and `platform_admin_audit_logs` when the audit table is present.

## Proof Reviewer Bootstrap

Use `npm run proof:brand-review-account` only with a local `SUPABASE_SERVICE_ROLE_KEY`. The script creates or updates one temporary Brand Studio review proof account, grants the required `moderator` staff role plus scoped `content_moderation` by default, writes staff/admin audit rows for the role and permission grants, verifies sign-in through the anon client, and writes the generated password to `.env.brand-review-proof.local`. It does not grant Owner, Operator/Admin, or broad admin permissions. That local credential file is ignored by git through `.env*.local`.

Optional environment:

- `BRAND_REVIEW_PROOF_EMAIL`: proof account email. Defaults to a generated `brand-review-proof-...@chillywood.test` address.
- `BRAND_REVIEW_PROOF_PASSWORD`: fixed password if rotation is needed. Defaults to a generated strong password.
- `BRAND_REVIEW_PROOF_TTL_HOURS`: grant TTL from 1 to 168 hours. Defaults to 24.
- `BRAND_REVIEW_PROOF_PERMISSIONS`: comma-separated scoped permissions. Only `content_moderation` and `reports_review` are allowed.
- `BRAND_REVIEW_PROOF_ENV_FILE`: local credential output path. Defaults to `.env.brand-review-proof.local`.

Do not commit proof credentials or service-role keys. Revoke the proof `moderator` role after approve/reject/archive proof is complete; the scoped permission grant also expires automatically. Use `npm run proof:brand-review-account:revoke` with the local service-role key to revoke the temporary moderator membership and scoped permission grants while writing role/permission/admin audit rows.

## May 24, 2026 Happy-Path Proof

Implementation commit: `4fc475d78ab4384c72939c276f7b9f988e1cbf54`.

The Supabase CLI listed the existing project API keys for project `bmkkhihfbmsnnmcqkoly`; the service-role key was used only as a local shell variable and was not printed or committed.

Backend proof passed with real repo image assets:

- uploaded hero image, background image, avatar, and logo as draft/pending-review assets;
- approved those four assets through the temporary scoped reviewer;
- published the four approved assets through the creator path;
- rejected one control hero asset, archived one control background asset, and left one control logo pending review;
- verified `read_public_platform_brand_profile` returned exactly the four approved/published assets;
- verified public table reads returned zero rejected, archived, or pending-control assets;
- verified review events and immutable admin audit rows were written for approve, reject, and archive;
- verified cleanup candidates include rejected/archived assets and exclude approved/published assets;
- verified unsupported text upload was rejected by storage MIME policy;
- revoked the temporary proof reviewer role/grant and verified review RPC access then fails with `brand_review_forbidden`.

Proof summary was written outside the repo at `/tmp/chillywood-brand-review-happy-path-proof.json`. Android screenshots were captured on `R5CR120QCBF` outside the repo at `/tmp/chillywood-brand-review-closeout-20260524/`: Platform Studio launch, Brand Studio first view, public Platform preview with approved media, Hero Media published state, and grouped Brand Studio sections.

## Failure States

Backed/source-checked friendly states:

- Permission denied: review RPC returns `brand_review_forbidden`; normal UI hides review controls when the account lacks owner/operator/moderation access.
- Wrong-account asset review: a signed-in user who does not own the asset and does not hold Owner/Operator/moderation permission still receives `brand_review_forbidden`.
- Owner publish repair: `Publish Changes` first approves the selected owned assets, then publishes the profile and selected safe assets. If an asset is scan-blocked or the update cannot complete, the app shows safe retry copy and does not claim publish success.
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
- Automatic deletion job for old/rejected/orphaned brand storage objects. The service-role cleanup candidate helper exists, but deletion remains a manual ops decision until retention and storage-deletion automation are separately approved.

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

Decision for launch closeout: stay at Level 1. Level 2 is the next safe product step only after choosing a lightweight Android-proved gesture pattern. Do not jump to Level 3 or Level 4 until the app has cross-device proof and a rollback path.

Do not claim drag crop or destructive crop export until Android proof exists.

## Storage Cleanup Policy

Cleanup must be service-role/admin-only and must never delete currently published assets or assets still referenced by profile rows.

Implemented helper:

- `platform_brand_asset_cleanup_candidates(retention_days integer default 30, limit integer default 100)` is executable by `service_role` only.
- It raises `platform_brand_cleanup_service_role_required` for anon/authenticated callers.
- It lists archived/deleted assets, rejected/removed/hidden assets, and old orphaned draft/pending-review assets.
- It excludes every asset still referenced by `platform_brand_profiles`.
- It excludes every asset whose `asset_state` is `published`.
- It returns raw storage bucket/path values only to service-role callers so normal creator/public UI never sees object internals.

Manual cleanup runbook:

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

## Clip Studio Touchpoint

Clip Studio may preview a Platform brand mark only from an approved, published, not-deleted Brand Studio avatar, logo, or watermark asset. Pending, rejected, archived, deleted, and draft brand assets remain ineligible. Clip Studio does not burn the mark into video, does not enable watermark rendering globally, and does not change Player behavior.
