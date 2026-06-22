# Creator Content Circle Visibility Backing

## Current Contract

Creator videos now use one app/database visibility value set:

- `draft`: owner-only. Draft videos are visible only in creator-owned Platform Studio / Content surfaces and direct owner playback.
- `circle`: private to the creator and approved Chi'lly Circle members. This uses active `user_friendships` rows as the Chi'lly Circle source of truth and excludes channel-audience blocks.
- `public`: visible on the creator public Platform and eligible for public discovery only through existing public-safe filters.

`Make Private for Chi'lly Circle` is a live creator action. It writes `visibility = 'circle'`; it does not map to draft and it is not disabled as unbacked UI.

## Backing

- Migration `20260622193918_creator_video_circle_visibility.sql` extends the `videos_visibility_check` constraint to `draft | circle | public`.
- `videos_select_visibility_access` reads allow the owner, public safe/playable videos, and Circle-private safe/playable videos for active Chi'lly Circle members only.
- `creator_videos_storage_select_visibility_access` uses the same access helper before signing creator-video storage objects.
- `resolve_creator_video_visibility_access(video_id)` returns a safe access shell for direct links, including locked/private reasons without playback URLs.
- `readCreatorVideos(ownerId, { includeDrafts })` uses the backed row policy: owner Studio reads drafts/Circle/public, non-owner Platform reads public plus Circle only where RLS allows it.
- `readCreatorVideoForPlayer(videoId)` resolves visibility before paid-video access, so purchase cannot bypass Circle membership.

## Distribution Truth

Public discovery remains public-only. `_lib/discoveryFeed.ts` still requires `visibility = public`, `is_publicly_discoverable = true`, clean moderation, and rights-safe status.

Circle-private creator videos are not written into `discovery_feed_items`, public Home, public Explore, or every user Profile feed. They can appear in backed Circle member surfaces by reading creator videos through the Circle-aware RLS path. Dedicated follower-feed and Circle-feed fan-out tables are still a separate backend lane; no fake feed rows are created here.

## Required Readback Copy

- Save as Draft: `Saved as Draft. Only you can see it in Platform Studio.`
- Make Private for Chi'lly Circle: `Private to your Chi'lly Circle. Circle members can see it where Circle content is backed. It is not public discovery.`
- Make Public: `Public on your Platform. Eligible for followers, Chi'lly Circle members, Explore, and Home only where backed by discovery rules. It is not posted to everybody's Profile feed.`
