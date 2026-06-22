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

Circle-private creator videos are not written into `discovery_feed_items`, public Home, public Explore, or every user Profile feed. They can appear in backed Chi'lly Circle member feed surfaces through `creator_feed_items` Circle rows gated by active Chi'lly Circle membership plus the same creator-video access helper used by Player and Platform.

## Closeout

Circle-private creator-video access is closed as of June 22, 2026 with backend/runtime proof and installed Android release-build proof in `/tmp/chillywood-circle-private-proof-20260622-152746`. Owner and active Chi'lly Circle member direct Player access showed the fixture without the private lock; signed-in non-member direct Player access showed the locked `Private to Chi'lly Circle` state. Backend proof covered owner allowed, Circle member allowed, non-member blocked, public Home/Explore exclusion, paid unlock not bypassing Circle membership, and no storage URL/path/key/bucket leakage to blocked viewers.

Follower-feed and Chi'lly Circle feed fan-out is backed by migration `20260622223300_creator_feed_fanout_v1.sql`. Public creator content can appear in backed follower and Circle feeds; Circle-private creator content can appear only in approved Chi'lly Circle member feeds; drafts remain owner-only; no creator content is posted to every user Profile feed.

## Relationship Feed Fan-Out

Follower-feed and Chi'lly Circle feed fan-out uses source-level `creator_feed_items` rows instead of per-user copied rows. Follower rows are readable only through backed channel follows and source access. Chi'lly Circle rows are readable only through active Chi'lly Circle membership and source access. Blocked viewers, hidden/removed content, inaccessible sources, creator-video drafts, and legacy draft Profile posts do not fan out.

Creator-video fan-out rules:

- Draft: removes follower and Circle feed rows.
- Circle: creates a Circle feed row only.
- Public: creates follower and Circle feed rows.

Profile-post rule:

- Profile posts are posted or not posted. There is no user-facing Profile post Draft state.
- Composer cancel/back creates no post row.
- Posted Profile posts can enter follower and Chi'lly Circle feed rows only where Profile access, block, and moderation rules allow.
- Legacy `visibility = 'draft'` Profile post rows are hidden and never fan out.
- Draft Profile posts must not exist as a normal state and must never fan out.
- No Profile post appears on every user Profile feed.

Profile remains personal/social. Platform remains creator media/business.

## Required Readback Copy

- Save as Draft: `Saved as Draft. Only you can see it in Platform Studio.`
- Make Private for Chi'lly Circle: `Private to your Chi'lly Circle. Circle members can see it where Circle content is backed. It is not public discovery.`
- Make Public: `Public on your Platform. Eligible for followers, Chi'lly Circle members, Explore, and Home only where backed by discovery rules. It is not posted to everybody's Profile feed.`
