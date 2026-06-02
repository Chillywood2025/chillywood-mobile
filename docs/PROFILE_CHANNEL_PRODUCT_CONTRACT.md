# Profile / Platform Product Contract

Date: 2026-05-06
Updated: 2026-05-25 for Profile production UI, user-facing Platform terminology, Chi'lly Chat access, and Platform Studio upload separation.
Updated: 2026-05-25 for Profile viewer-state Android proof closeout.
Updated: 2026-05-25 for social attachment UX consistency and Profile social interaction proof notes.
Updated: 2026-05-25 for the social attachment correction: no Platform Studio sheet option and native phone-gallery Photos picking.
Updated: 2026-05-26 for Profile avatar/background management, Profile Actions, migration application, and Android startup proof.
Updated: 2026-05-26 for owner-controlled Profile media status, public rendering masks, and profile-media reports.
Updated: 2026-05-29 for Public V1 burn-down proof status: owner Profile route and avatar edit trigger rendered on current Android dev-client proof, but the edit sheet did not open from tap/long-press and no safe non-private gallery asset/backend read-back proof was available, so avatar/background save/remove proof remains open.
Updated: 2026-05-29 for Profile Photo picker correction: the first avatar edit sheet is compact, `Change Photo` is primary, `Remove Photo` is conditional on an existing photo, and Fit/Fill/Center moved out of the first Profile Photo sheet.
Updated: 2026-05-29 for Home/Profile cleanup: normal main tabs expose top Profile/Settings controls, Profile bottom nav remains hidden, and Profile feed empty states no longer show the old ready-card or random feed-level Platform CTA.
Updated: 2026-05-26 for Profile Platform navigation cleanup and lightweight Rights Disclosure.

This contract inherits `docs/APP_UI_UX_RULES.md`. Profile and Platform work must feel like a modern premium mobile social/streaming product by default: media-forward, adaptive, fast to scan, honest about backed state, and never a generic stacked-card or admin-style layout on public surfaces.

## 1. Profile Purpose

Profile is Chi'llywood's personal and social identity surface.

It should make the user feel human: avatar, display name, handle, bio/tagline, backed official or creator badges, backed social relationships, direct Chi'lly Chat entry, public activity when backed, and honest empty states when personal activity is not backed.

As of June 2, 2026, the handle is the canonical public username from `user_profiles.username`, displayed as `@username`, stored lowercase without `@`, unique case-insensitively, reserved-name protected, blocked-word protected, and separate from email. Profile and Platform identity may show display name plus `@username`; they must not expose user email or derive a handle from email. Existing `/profile/[userId]` and `/channel/[userId]` routes remain canonical until a separate username-route lane is approved. Android local attached-device proof is captured at `/tmp/chillywood-username-local-device-proof-20260601/`: Profile shows display name plus `@chillywood92` with no public email/raw id, while the captured Platform route opens cleanly with no email but does not visibly show `@chillywood92`; Platform handle visibility remains an honest runtime proof gap if product expects it in that view. Backend/profile source proof remains current in `docs/USERNAME_HANDLE_SYSTEM.md`.

Profile must not become a generic creator feed, a management console, or a place where creator uploads pretend to be normal personal status posts.

## 2. Platform Purpose

Platform is the creator's public channel surface inside Chi'llywood.

It should make creators feel like producers: creator uploaded videos, public creator library, creator events, live/watch-party context, backed Platform identity/theme controls, and owner upload/manage handoffs through Platform Studio.

Public Platform currently lives on the internal `/channel/[userId]` route as the viewer-facing creator home. Profile remains the personal/social identity route at `/profile/[userId]`. Owner controls live in Platform Studio on `/channel-studio`, with `/channel-settings` preserved as compatibility.

## 3. Profile 1-6 Structure

1. Identity header: avatar, cover/header treatment, display name, handle, tagline/bio, official/platform badges where backed, and no fake counts.
2. Quick actions: public viewers get backed Follow/Following, Chi'lly Chat, View Platform, Share Profile, and Report where supported; Profile View Platform routes to `/channel/[userId]`; owners keep Platform Studio, Platform, Chi'lly Chat, Chi'lly Circle, and Settings where backed.
3. Personal posts / updates: Public v1 now supports backed text-only Profile posts/status updates. They are Profile content, not Channel creator videos.
4. Platform preview / entry: creator videos and events appear in the Platform area, not as personal posts.
5. Social proof / community: only backed follower/audience/subscriber or official/creator signals may appear; followers are not friends.
6. Activity highlights: recent upload, live event, watch-party, or latest personal post may appear only when backed.

## 4. Platform Definition

Platform owns creator-uploaded videos, creator video library, backed creator shelves/sections, featured creator upload when backed, creator events, creator live/watch-party context, public creator content discovery, and backed audience/follower relationships.

Platform must not own platform/admin titles, Chi'llywood Originals, personal Profile posts/status updates, admin/moderation controls, a full Friends system, billing/payout controls outside Platform Studio, platform monetization controls, or normal Chi'lly Chat thread ownership.

Platform Studio owns owner-only channel operations: Home dashboard, Content, Live, Audience, Insights, Brand, creator upload/manage handoffs, backed audience actions, and backed channel defaults. Platform Studio must not be exposed to non-owners.

## 5. Owner Vs Public Behavior

Owners may see profile controls, Platform Studio, Platform, Settings, Chi'lly Circle, Chi'lly Chat, Platform Studio upload/manage video actions, and backed draft badges.

Public viewers may see identity, backed Follow/Following, Chi'lly Chat, View Platform, public creator videos only, clean public event context, Share Profile, and Report.

Public viewers must not see owner controls, Platform Studio controls, upload, edit, publish, unpublish, delete, audience management, insights/analytics, drafts, private/hidden/removed videos, or admin controls.

Profile post owners may create and delete their own text-only posts. Public viewers may read public clean Profile posts and report them where backed. Public viewers must not edit/delete posts or see draft/hidden/removed posts.

Android `R5CR120QCBF` proof on 2026-05-25 confirmed the available runtime states: signed-out public Profile shows no owner controls/composer/Attach/delete/draft badges, signed-out Follow and Chi'lly Chat show sign-in-required handoffs, signed-out View Platform opens public Platform, signed-in non-owner official Profile proof shows no owner controls and routes Chi'lly Chat/View Platform safely, and owner regression keeps Platform Studio, Preview Platform public view, Chi'lly Chat inbox, Chi'lly Circle, Settings, composer, Attach, owner delete, and owner draft markers. The May 26 navigation cleanup renames the owner top action to `Platform` and removes the duplicate bottom Profile `Platform` tab/pill; the bottom tab row is Posts, Live, Community, About, while Platform content remains available through Profile cards/sections and the top Platform action. True second-account and blocked/private runtime fixtures were not available and must remain explicit follow-up work rather than faked proof; static guards cover the current privacy/block path until that fixture lane runs.

The follow-up Profile social interaction/attachment pivot on 2026-05-25 keeps the same owner/viewer contract and modernizes attachment entry consistently across backed social surfaces. Profile posts/comments, Chi'lly Chat, creator-video comments, Watch-Party room comments, and Live Stage comments now open a shared Photos/Files attachment sheet while keeping the existing storage, validation, runtime controls, RLS/privacy, and moderation status behavior. The social sheet must not offer Platform Studio; creator-video/public Platform work belongs in Platform Studio through the Profile owner actions and creator-content copy, not through Attach. Photos opens the phone's native gallery through `expo-image-picker`; Files keeps the existing document picker. Android proof captured the shared Profile and Chi'lly Chat sheets at `/tmp/chillywood-profile-social-interaction-proof-20260525/`, and the operator checked Player/Watch-Party/Live Stage sheet behavior after the shared-sheet pass. Legal evidence attachment pickers and Platform Studio creator/brand media pickers are intentionally separate and must not be collapsed into the social sheet.

The Profile avatar/background lane keeps personalization in Profile, separate from Platform and Brand Studio. Owner avatar tap and long-press open a compact `Profile Photo` bottom action sheet. With no photo it shows only `Change Photo` and `Cancel`; with a real photo it may add `Remove Photo`. It must not show an empty preview card, disabled `View Photo`, disabled remove action, Fit/Fill/Center controls, crop explanation copy, or disabled save action before image selection. Profile Settings owns `Profile Appearance` rows for Profile Photo, Profile Background, and Preview Profile. Profile photo/background uploads use the phone gallery, safe native edit/crop level, owner-only `user_profiles` updates, and the Profile-only `profile-media` bucket from remote-applied migration `202605260001_profile_appearance_media.sql`. Profile Photo uses the backed native picker/edit step; true custom drag/pinch repositioning is future work unless explicitly built and proved. Profile Background remains separate and may expose Fit/Fill/Center positioning only after a real background image exists, under Adjust Background. Viewers tap or long-press an avatar to open `Profile Actions`, not edit controls: View Profile Photo, Chi'lly Chat, View Platform, Block User, Report User, Report Profile Photo, Report Profile Background, and Share Profile where backed. Block User requires sign-in plus confirmation, cannot target self, uses existing backed block rows, and Chi'lly Chat must refuse direct-thread creation while a block exists. Profile media is owner-controlled: valid uploads publish immediately as `active`, owner removals become `user_removed`, and the remote-applied follow-up migration `202605260002_profile_media_status_policy.sql` adds `flagged` and `admin_removed` states for report/admin safety actions without creating a default manual approval queue. Public rendering may show only active/public-safe Profile avatar/background media and must never show raw storage paths, private media, flagged/admin-removed/user-removed media, Platform Studio, or Brand Studio controls. Profile media reports use `profile_media` with `profileMediaKind` context and no raw media URL; admin target actions can hide, remove, or restore reported Profile media by status while preserving storage evidence. Android `R5CR120QCBF` startup proof after lazy image-picker loading is stored outside the repo at `/tmp/chillywood-profile-avatar-actions-proof-20260526/`; compact-picker screenshot proof is stored at `/tmp/chillywood-profile-photo-picker-proof-20260529/` and covers owner Profile, tap sheet, long-press sheet, DocumentsUI picker focus without private gallery screenshots, Settings Profile Appearance, and separate Profile Background sheet. Current limitation: safe-asset save/read-back/removal proof, advanced profile-media moderation UI/queue, custom in-app crop/reposition, and cleanup automation remain follow-up work; do not claim automated approval or manual review for every upload.

May 31 Profile media reliability and Brand draft preview work keeps that separation intact. Profile media saves now use Android-safe `content://` staging, Supabase Storage REST upload with SDK fallback, and signed read-back verification before `user_profiles` is updated. The native picker stays gallery-first with editing enabled; Profile Photo uses a square/oval native crop, while Profile Background uses a wide 4:1 banner crop that matches the Profile header better than a generic video crop. Settings/Profile sheets close before picker and remove flows so stale modals do not sit over the native UI. Brand Studio now has an owner-only `Preview Brand Draft` path for saved Brand Studio media that is still waiting for review; public `Preview Platform` continues to hide draft/pending/unsafe Brand Studio assets.

May 30 Brand Studio upload/UI work did not merge Profile media into Brand Studio. Platform avatar/logo/background/hero assets remain Brand Studio assets in `platform-brand-assets`; Profile photo/background remain Profile Appearance assets in `profile-media`.

The Home/Profile cleanup keeps Profile reachable from top Profile/avatar entries on Home, Explore, Live, and Library plus Settings/direct routes, while the visible bottom nav remains Home / Explore / Live / Library. Own Profile, public Profile/Platform, Platform Studio, Admin, Player/detail screens, and room screens should keep route-local controls instead of duplicating global Profile/Settings buttons. The Profile feed empty state is role-aware and production-facing: owners see `No posts yet`, `Share an update or attach a photo to start your Profile feed.`, and optional `Create Post` that focuses the existing composer; viewers see `No public posts yet` and `Public updates will appear here when available.` The feed empty state must not show `Your feed is ready when you are`, a generic unfinished card, a Profile creator-video Upload CTA, or a random Platform CTA because Platform is already available through Profile top actions. Android proof for the cleanup lives at `/tmp/chillywood-home-profile-cleanup-proof-20260529/` and captures the cleaned owner empty state, Settings reachability, and Platform route reachability.

## 6. Where Creator Uploads Appear

Creator uploads appear in:

- Public Platform route: `/channel/[userId]`
- Profile Platform section/card and top Platform handoff
- Platform Studio Content tab and `/channel-settings` compatibility
- Creator-video Player route: `/player/[id]?source=creator-video`
- Creator-video Watch-Party routes only when source eligibility is backed

Creator uploads must not be mixed into the personal Posts tab unless a future backed Profile post explicitly embeds or references that creator upload.

## 7. Where Platform Titles / Originals Belong

Chi'llywood Originals and platform/admin `titles` belong only on Home, Explore, dedicated Originals/platform surfaces, title pages, platform Player, platform Watch-Party, and admin-managed title surfaces.

They must not appear as filler inside user/creator Platforms, profile posts, creator video shelves, public Platform stats, or creator-owned cards.

## 8. What Is V1

Public v1 includes a clear Profile/Platform/Platform Studio split, owner/public Profile behavior, public `/channel/[userId]`, owner `/channel-studio`, `/channel-settings` compatibility, backed text Profile posts/status updates, backed Profile post comments/replies/likes once the local social migrations are applied remotely, route-safe Profile post share, clickable safe external links in social text, bounded 250 MB social attachments for Profile posts/comments, creator-video comments, Chi'lly Chat, and room comments where the current room attachment path is already backed, backed following-based creator upload discovery, backed creator-video comments/replies, backed creator video upload/manage through Platform Studio, public creator-video Platform display, explicit creator-video Player routing, backed report/share where implemented, honest event/live context, and premium mobile empty states.

Remote Supabase schema/RLS proof for the original text-only Profile posts, text-only creator-video comments, and `profile_post` / `creator_video_comment` report target types is complete as of 2026-04-29. The Profile post engagement migration for `profile_post_comments`, `profile_post_likes`, and `profile_post_comment` reports is local/pending remote application, and `202604290003_social_replies_links_attachments.sql` is also local/pending remote application for one-level replies, the private `social-attachments` bucket, attachment RLS, and `social_attachment` reports. Android runtime proof remains a separate Public v1 proof lane, including the Profile Post keyboard visibility fix.

## 9. What Is Post-V1

Post-v1 includes deep threaded replies beyond one level, automatic link previews, malware scanning/hardening claims, Live/Watch-Party media comments, movie-size comment/chat uploads, reposts, polls, richer Profile post reactions beyond the single backed like, generated thumbnails, advanced channel shelves, richer creator operations beyond the current Platform Studio shell, full search, push notifications, full Friends system beyond Chi'lly Circle V1, close friends, friend-only privacy, paid creator content, subscriber-only creator media, tips/coins, payouts, ads, and native game streaming.

## 10. What Must Not Be Faked

Do not fake personal posts, likes, comments, shares, followers, engagement counts, VIP/subscriber-only media, friends, paid creator content, payouts, tips, coins, ads, native game streaming, or real Chi'llyfects AR.

Do not show unsupported public Follow, Message, Share, Report, upload, edit, draft, moderation, billing, or owner controls.

Followers are not Chi'lly Circle connections. Chi'lly Circle connections are mutual personal connections. Chat contacts and room participants are not automatically Chi'lly Circle.
