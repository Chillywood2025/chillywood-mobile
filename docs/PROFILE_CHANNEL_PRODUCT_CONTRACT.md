# Profile Channel Product Contract

Date: 2026-04-29

## 1. Profile Purpose

Profile is Chi'llywood's personal and social identity surface.

It should make the user feel human: avatar, display name, handle, bio/tagline, backed official or creator badges, backed social relationships, direct Chi'lly Chat entry, public activity when backed, and honest empty states when personal activity is not backed.

Profile must not become a generic creator feed, a management console, or a place where creator uploads pretend to be normal personal status posts.

## 2. Channel Purpose

Channel is the creator's mini streaming platform inside Chi'llywood.

It should make creators feel like producers: creator uploaded videos, public creator library, creator events, live/watch-party context, backed channel identity/theme controls, and owner upload/manage handoffs.

Public v1 keeps Channel on the canonical `/profile/[userId]` route as a distinct tab/section, with deeper owner controls in `/channel-settings`.

## 3. Profile 1-6 Structure

1. Identity header: avatar, cover/header treatment, display name, handle, tagline/bio, official/platform badges where backed, and no fake counts.
2. Quick actions: public viewers get backed Follow/Following, Chi'lly Chat, View Channel, Share Profile, and Report where supported; owners get Edit Profile, Manage Channel, Upload Video, and Settings.
3. Personal posts / updates: Public v1 now supports backed text-only Profile posts/status updates. They are Profile content, not Channel creator videos.
4. Channel preview / entry: creator videos and events appear in the Channel area, not as personal posts.
5. Social proof / community: only backed follower/audience/subscriber or official/creator signals may appear; followers are not friends.
6. Activity highlights: recent upload, live event, watch-party, or latest personal post may appear only when backed.

## 4. Channel Definition

Channel owns creator-uploaded videos, creator video library, backed creator shelves/sections, featured creator upload when backed, creator events, creator live/watch-party context, public creator content discovery, and backed audience/follower relationships.

Channel must not own platform/admin titles, Chi'llywood Originals, personal Profile posts/status updates, admin/moderation controls, a full Friends system, billing/payout controls, platform monetization controls, or normal Chi'lly Chat thread ownership.

## 5. Owner Vs Public Behavior

Owners may see edit/profile/channel controls, upload/manage video actions, draft badges, and owner prompts such as Upload your first video.

Public viewers may see identity, backed Follow/Following, Chi'lly Chat, public creator videos only, clean public event context, Share Profile, and Report.

Public viewers must not see owner controls, drafts, private/hidden/removed videos, or admin controls.

Profile post owners may create and delete their own text-only posts. Public viewers may read public clean Profile posts and report them where backed. Public viewers must not edit/delete posts or see draft/hidden/removed posts.

## 6. Where Creator Uploads Appear

Creator uploads appear in:

- Profile Channel tab/section
- Channel Settings Content panel
- Creator-video Player route: `/player/[id]?source=creator-video`
- Creator-video Watch-Party routes only when source eligibility is backed

Creator uploads must not be mixed into the personal Posts tab unless a future backed Profile post explicitly embeds or references that creator upload.

## 7. Where Platform Titles / Originals Belong

Chi'llywood Originals and platform/admin `titles` belong only on Home, Explore, dedicated Originals/platform surfaces, title pages, platform Player, platform Watch-Party, and admin-managed title surfaces.

They must not appear as filler inside user/creator Channels, profile posts, creator video shelves, public channel stats, or creator-owned cards.

## 8. What Is V1

Public v1 includes a clear Profile/Channel split, owner/public Profile behavior, backed text-only Profile posts/status updates, backed following-based creator upload discovery, backed text-only creator-video comments, backed creator video upload/manage, public creator-video Channel display, explicit creator-video Player routing, backed report/share where implemented, honest event/live context, and premium mobile empty states.

## 9. What Is Post-V1

Post-v1 includes photos/videos in Profile posts, media comments, nested replies, reposts, polls, full comments/reactions on Profile posts, generated thumbnails, advanced channel shelves, a richer creator dashboard, full search, push notifications, full Friends system, close friends, friend-only privacy, paid creator content, subscriber-only creator media, tips/coins, payouts, ads, and native game streaming.

## 10. What Must Not Be Faked

Do not fake personal posts, likes, comments, shares, followers, engagement counts, VIP/subscriber-only media, friends, paid creator content, payouts, tips, coins, ads, native game streaming, or real Chi'llyfects AR.

Do not show unsupported public Follow, Message, Share, Report, upload, edit, draft, moderation, billing, or owner controls.

Followers are not Friends. Chat contacts and room participants are not automatically Friends.
