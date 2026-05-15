# Profile Channel Product Contract

Date: 2026-05-06

## 1. Profile Purpose

Profile is Chi'llywood's personal and social identity surface.

It should make the user feel human: avatar, display name, handle, bio/tagline, backed official or creator badges, backed social relationships, direct Chi'lly Chat entry, public activity when backed, and honest empty states when personal activity is not backed.

Profile must not become a generic creator feed, a management console, or a place where creator uploads pretend to be normal personal status posts.

## 2. Channel Purpose

Channel is the creator's mini streaming platform inside Chi'llywood.

It should make creators feel like producers: creator uploaded videos, public creator library, creator events, live/watch-party context, backed channel identity/theme controls, and owner upload/manage handoffs.

Public Channel now lives on `/channel/[userId]` as the viewer-facing mini streaming/network home. Profile remains the personal/social identity route at `/profile/[userId]`. Owner controls live in Platform Studio on `/channel-studio`, with `/channel-settings` preserved as compatibility.

## 3. Profile 1-6 Structure

1. Identity header: avatar, cover/header treatment, display name, handle, tagline/bio, official/platform badges where backed, and no fake counts.
2. Quick actions: public viewers get backed Follow/Following, Chi'lly Chat, View Channel, Share Profile, and Report where supported; Profile View Channel routes to `/channel/[userId]`; owners keep Platform Studio, upload, and settings handoffs where backed.
3. Personal posts / updates: Public v1 now supports backed text-only Profile posts/status updates. They are Profile content, not Channel creator videos.
4. Channel preview / entry: creator videos and events appear in the Channel area, not as personal posts.
5. Social proof / community: only backed follower/audience/subscriber or official/creator signals may appear; followers are not friends.
6. Activity highlights: recent upload, live event, watch-party, or latest personal post may appear only when backed.

## 4. Channel Definition

Channel owns creator-uploaded videos, creator video library, backed creator shelves/sections, featured creator upload when backed, creator events, creator live/watch-party context, public creator content discovery, and backed audience/follower relationships.

Channel must not own platform/admin titles, Chi'llywood Originals, personal Profile posts/status updates, admin/moderation controls, a full Friends system, billing/payout controls, platform monetization controls, or normal Chi'lly Chat thread ownership.

Platform Studio owns owner-only channel operations: Home dashboard, Content, Live, Audience, Insights, Brand, creator upload/manage handoffs, backed audience actions, and backed channel defaults. Platform Studio must not be exposed to non-owners.

## 5. Owner Vs Public Behavior

Owners may see edit/profile/channel controls, upload/manage video actions, draft badges, and owner prompts such as Upload your first video.

Public viewers may see identity, backed Follow/Following, Chi'lly Chat, public creator videos only, clean public event context, Share Profile, and Report.

Public viewers must not see owner controls, Platform Studio controls, upload, edit, publish, unpublish, delete, audience management, insights/analytics, drafts, private/hidden/removed videos, or admin controls.

Profile post owners may create and delete their own text-only posts. Public viewers may read public clean Profile posts and report them where backed. Public viewers must not edit/delete posts or see draft/hidden/removed posts.

## 6. Where Creator Uploads Appear

Creator uploads appear in:

- Public Channel route: `/channel/[userId]`
- Profile Channel tab/section
- Platform Studio Content tab and `/channel-settings` compatibility
- Creator-video Player route: `/player/[id]?source=creator-video`
- Creator-video Watch-Party routes only when source eligibility is backed

Creator uploads must not be mixed into the personal Posts tab unless a future backed Profile post explicitly embeds or references that creator upload.

## 7. Where Platform Titles / Originals Belong

Chi'llywood Originals and platform/admin `titles` belong only on Home, Explore, dedicated Originals/platform surfaces, title pages, platform Player, platform Watch-Party, and admin-managed title surfaces.

They must not appear as filler inside user/creator Channels, profile posts, creator video shelves, public channel stats, or creator-owned cards.

## 8. What Is V1

Public v1 includes a clear Profile/Channel/Platform Studio split, owner/public Profile behavior, public `/channel/[userId]`, owner `/channel-studio`, `/channel-settings` compatibility, backed text Profile posts/status updates, backed Profile post comments/replies/likes once the local social migrations are applied remotely, route-safe Profile post share, clickable safe external links in social text, bounded 250 MB social attachments for Profile posts/comments, creator-video comments, and Chi'lly Chat, backed following-based creator upload discovery, backed creator-video comments/replies, backed creator video upload/manage, public creator-video Channel display, explicit creator-video Player routing, backed report/share where implemented, honest event/live context, and premium mobile empty states.

Remote Supabase schema/RLS proof for the original text-only Profile posts, text-only creator-video comments, and `profile_post` / `creator_video_comment` report target types is complete as of 2026-04-29. The Profile post engagement migration for `profile_post_comments`, `profile_post_likes`, and `profile_post_comment` reports is local/pending remote application, and `202604290003_social_replies_links_attachments.sql` is also local/pending remote application for one-level replies, the private `social-attachments` bucket, attachment RLS, and `social_attachment` reports. Android runtime proof remains a separate Public v1 proof lane, including the Profile Post keyboard visibility fix.

## 9. What Is Post-V1

Post-v1 includes deep threaded replies beyond one level, automatic link previews, malware scanning/hardening claims, Live/Watch-Party media comments, movie-size comment/chat uploads, reposts, polls, richer Profile post reactions beyond the single backed like, generated thumbnails, advanced channel shelves, richer creator operations beyond the current Platform Studio shell, full search, push notifications, full Friends system beyond Chi'lly Circle V1, close friends, friend-only privacy, paid creator content, subscriber-only creator media, tips/coins, payouts, ads, and native game streaming.

## 10. What Must Not Be Faked

Do not fake personal posts, likes, comments, shares, followers, engagement counts, VIP/subscriber-only media, friends, paid creator content, payouts, tips, coins, ads, native game streaming, or real Chi'llyfects AR.

Do not show unsupported public Follow, Message, Share, Report, upload, edit, draft, moderation, billing, or owner controls.

Followers are not Chi'lly Circle connections. Chi'lly Circle connections are mutual personal connections. Chat contacts and room participants are not automatically Chi'lly Circle.
