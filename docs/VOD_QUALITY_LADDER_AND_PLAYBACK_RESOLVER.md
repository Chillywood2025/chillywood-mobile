# Chi'llywood VOD Quality Ladder And Playback Resolver

Last updated: 2026-05-14

This document records the repo-side foundation for VOD quality enforcement. It does not claim transcoding is live.

## Product Policy

- Free VOD playback target: 360p / 480p max.
- Premium VOD playback target: 720p / 1080p max when those renditions actually exist.
- Original/master uploads are private processing sources. They are not regular playback renditions.
- Player must ask the backend resolver which qualities are allowed. The client must not guess Premium access or HD access locally.
- Missing or unavailable Premium entitlement proof fails closed to free-only for non-owner viewers.

## Repo Foundation

Migration:

- `supabase/migrations/202605140010_vod_quality_ladder_resolver.sql`

Backed model:

- `video_renditions` stores rendition metadata for `original`, `360p`, `480p`, `720p`, and `1080p`.
- `access_tier` separates `owner`, `free`, `premium`, and `private` renditions.
- `status` supports `queued`, `processing`, `ready`, `failed`, and `archived`.
- Direct client writes are blocked. Owner upload can record the original through `record_video_original_rendition`; future transcode workers/service role can create derived renditions.
- RLS lets video owners and platform Owner/Admin see rendition status. Regular users cannot list rendition rows or premium/private paths directly.

Resolver:

- `resolve_video_playback(video_id uuid)` returns only allowed playback options for the current viewer.
- Free viewers receive ready free renditions only.
- Premium viewers receive ready premium HD renditions only when `user_entitlements` proves active `premium`.
- Owners/platform Owner/Admin can inspect status for their own/platform operations.
- Original/master paths are excluded from regular playback options.
- If no ready renditions exist, the resolver marks legacy single-file playback as `pending_renditions` so the current app can keep existing creator video playback while truthfully showing that quality enforcement is not complete.

Client integration:

- `_lib/vodQuality.ts` normalizes resolver output and signs only the resolver-selected rendition where possible.
- `_lib/creatorVideos.ts` uses the resolver for Player playback and records an original rendition after new uploads when the migration is present.
- `components/creator-media/creator-video-card.tsx` shows creator-facing rendition status in Channel Studio Content cards.
- `supabase/functions/media-storage` now authorizes rendition downloads by checking `video_renditions`, video public/moderation state, ownership/staff role, and Premium entitlement before signing S3 rendition paths.

## Current Limits

- This lane does not create a transcoder.
- This lane does not create fake 360p/480p/720p/1080p files.
- Existing single-file creator videos can still play through legacy fallback until real renditions exist.
- Full live enforcement of Free/Premium VOD quality remains blocked until:
  - real rendition files are generated,
  - rendition rows are inserted by a trusted worker/service,
  - delivery/signing is proved for those rendition paths,
  - Premium entitlement proof is live for the target account.

## Guard

Run:

```sh
npm run guard:vod-quality-policy
```

The guard checks the VOD constants, migration, resolver helper, Player integration path, media-storage rendition authorization, and absence of hardcoded HD access in Player.
