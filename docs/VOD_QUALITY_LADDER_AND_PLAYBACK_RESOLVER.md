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

## Live Proof Status

As of 2026-05-14, live VOD enforcement is not closed, but the schema/function deployment blocker is cleared. The linked Supabase project was confirmed as `bmkkhihfbmsnnmcqkoly` / Chillywood2025's Project. Linked migration list and linked schema lint passed, dry-run showed only `202605140010_vod_quality_ladder_resolver.sql`, migration `202605140010` was applied remotely, post-apply migration list shows local/remote alignment through `202605140010`, and post-apply dry-run says the remote database is up to date. `media-storage` was deployed as ACTIVE version 37, OPTIONS returned `200`, and a no-auth signing request returned `401 missing_auth`.

The remaining blocker is real playback proof data and real auth contexts. No trusted `video_renditions` rows were inserted, no real rendition files were created or proved, and no backed Premium entitlement was proved in this lane. Do not claim live Free/Premium VOD enforcement until real files exist, trusted rows reference only those files, and resolver/media-storage proof passes for free viewer, Premium viewer or fail-closed entitlement blocking, owner status, original/master privacy, direct-path denial, and processing/failed denial.

## Existing Player Test Video Attempt

The next live proof pass selected existing standalone Player creator-video proof row `84c486e9-a62e-4121-8e70-ee79e17b1bf0`, safe label `S3 Runtime Proof 2026-04-30T21-46-14-025Z`. Prior artifacts show it opened through `/player/84c486e9-a62e-4121-8e70-ee79e17b1bf0?source=creator-video`, and public metadata shows it is public/clean S3 media in `chillywood-media-prod`.

That pass did not create rendition rows because the proof environment had no real owner/free/Premium auth sessions and no local S3 signing credentials. Anonymous resolver proof returns `pending_renditions` with no allowed qualities, anonymous direct `video_renditions` read/write is denied, and anonymous `media-storage` signing returns `401 missing_auth`. The next proof needs a safe authenticated owner/test session or server-side operator proof path to download the real source, generate real non-upscaled renditions, upload actual files, and insert trusted rows only for those files.

The Free VOD rendition enforcement proof was retried against the same selected video and stopped before source download. `ffmpeg` and `ffprobe` are installed locally, but this shell has no owner/test auth session for owner `4b5e7761-5bf1-4e18-9eb7-d6037a0eb32f`, no safe service-role/operator source-download path, no S3 storage credentials, and no usable linked database password. Because an allowed actor could not sign/download the source, no ffprobe metadata proof, 360p/480p file generation, storage upload, trusted `video_renditions` insert, or processing/failed proof rows were created. Free signed-in resolver/signing proof remains blocked; the existing anonymous proof remains fail-closed with `pending_renditions`, direct `video_renditions` denial, and `401 missing_auth` from `media-storage`.

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
