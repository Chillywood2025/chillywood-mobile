# Chi'llywood Media Delivery Scale Architecture

Last updated: 2026-07-08

Status: architecture and guard only. This document does not deploy a CDN, create a transcoder, change Player UX, change Premium entitlement logic, or change LiveKit/Watch-Party behavior.

## Current-State Report

1. Current storage provider path

- Mobile upload/download code goes through `_lib/mediaStorage.ts`.
- `_lib/mediaStorage.ts` calls the Supabase Edge Function `supabase/functions/media-storage/index.ts`.
- The Edge Function returns S3-compatible signed URLs and currently requires `S3_PROVIDER=hetzner`.
- Creator video rows store `storage_provider`, `storage_bucket`, `storage_object_key`, and `storage_path`.
- Older or non-S3 paths can still fall back to Supabase Storage signing through `createSupabaseSignedUrl`.

2. Current S3/Hetzner assumptions

- `media-storage` reads `S3_PROVIDER`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.
- The launch provider is hard-gated to `hetzner`.
- Signing uses AWS SigV4 against virtual-hosted bucket URLs built as `{bucket}.{endpointHost}`.
- The request bucket must match the configured `S3_BUCKET`.
- Creator video upload size is capped at 5 GB in the Edge Function, with social attachments capped lower.
- Upload and download URLs are direct origin URLs, not CDN URLs.

3. Current upload flow

- `uploadCreatorVideo` creates an owner-prefixed object key like `{ownerId}/{videoId}/source.{ext}`.
- `createSignedMediaUpload` requests a signed PUT URL from `media-storage`.
- The Edge Function authenticates the Supabase user, checks account restriction, validates object key ownership, MIME type, size, creator-tool Premium/staff access, and upload abuse rate limits.
- The mobile client uploads the whole object with a single signed `PUT` using `FileSystem.uploadAsync`, then fetch fallbacks.
- After upload, the client requests a signed GET URL and range-probes one byte to reject empty objects.
- The app inserts the `videos` row, records the original rendition through `record_video_original_rendition` when present, and records upload/storage usage metadata.

4. Current download/playback signing flow

- `/player/[id]?source=creator-video` loads creator media through `readCreatorVideoForPlayer`.
- `readCreatorVideoForPlayer` checks creator-video visibility, paid content access, and then calls `resolveSignedVideoPlaybackSource`.
- `resolveSignedVideoPlaybackSource` calls the database RPC `resolve_video_playback` and signs only the resolver-selected rendition when one exists.
- S3 rendition signing goes back through `media-storage`; Supabase Storage rows use Supabase signed URLs.
- `media-storage` authorizes S3 downloads by matching the object to `videos` or `video_renditions`, checking scan/moderation/public state, owner/staff access, and Premium entitlement for premium renditions.
- If no resolver-selected rendition URL exists, legacy single-file playback can still sign the source object only when the resolver marks legacy fallback as allowed or unavailable.

5. Current VOD quality ladder state

- `_lib/performancePolicy.ts` defines free VOD max height as 480p and Premium VOD max height as 1080p.
- `supabase/migrations/202605140010_vod_quality_ladder_resolver.sql` adds `video_renditions` with `original`, `360p`, `480p`, `720p`, and `1080p`.
- `access_tier` supports `owner`, `free`, `premium`, and `private`.
- The resolver excludes `original` from regular playback options.
- Free viewers receive ready free renditions only. Premium HD requires backend entitlement proof.
- This is a resolver and schema foundation. It does not transcode files.

6. What is live vs only repo foundation

- Live in code: direct signed S3-compatible upload, direct signed S3-compatible download, Supabase fallback signing, upload/storage metadata recording, VOD resolver helpers, and media-storage rendition authorization.
- Foundation only: `video_renditions` metadata, free/Premium quality ladder policy, upload/storage usage tables, provider usage import/reconciliation tables, and admin read models.
- Not live: transcode worker, HLS/ABR rendition generation, CDN playback, signed CDN URL/cookie issuance, per-playback media bandwidth telemetry, resumable/multipart 5 GB upload, and provider-neutral origin switching.

7. Where original files can still be used as playback fallback

- `readCreatorVideoForPlayer` can fall back to `createCreatorVideoPlaybackUrl` for the original/source object when the resolver has no signed rendition and `legacy_playback_allowed` is true or resolver availability fails open for legacy playback.
- The fallback keeps existing creator videos playable while real renditions are absent.
- Original/master files are private processing sources. They are not normal playback renditions and must not become CDN-published ABR variants.

8. Where bandwidth/egress is currently not measured

- `record_creator_video_upload_usage` records upload events and storage bytes, not playback bytes.
- `platform_usage_metering_events` can hold `bandwidth_bytes`, but creator-video S3 GET signing does not write per-playback or per-byte media events.
- Direct S3 signed URL downloads happen outside the app after signing, so the app cannot accurately infer full bytes served.
- There is no CDN log ingestion, edge byte accounting, rendition-byte ledger, or per-creator media egress rollup tied to playback.

9. Where uploads are not resumable/multipart

- The mobile app uploads a whole file to one signed `PUT` URL.
- Retries handle provider `SlowDown` responses, but they retry the object upload path rather than resuming uploaded parts.
- There is no multipart upload session, tus endpoint, direct-upload session table, part manifest, complete-multipart call, or abandoned-part cleanup.

10. Where CDN delivery is missing

- `createPresignedS3Url` returns direct origin URLs.
- Player and Watch-Party creator-video paths receive signed origin URLs, not signed CDN URLs.
- There is no CDN host configuration, CDN signer, signed cookie/key pair, origin shield, cache purge hook, CDN log ingest, or CDN URL resolver in the current playback path.

## Target Architecture

Transcoding status: not live; no worker exists in this repo.

Cloudflare R2 private origin status: enabled for proof only; not configured as app production playback by this repo change.

Cloudflare custom domain/cache status: `media.chillywoodstream.com` is connected only to the separate public-playback proof bucket for harmless text proof delivery; production CDN playback is not live.

R2 CLI/API proof status: private and public-playback proof upload/readback succeeded through authorized Wrangler access; no production R2 CDN playback is live.

R2 proof bucket status: private bucket `chillywood-media-proof` exists, created 2026-07-08T23:26:44.468Z.

R2 proof object status: harmless text object `playback/public/proof/hello.txt` upload/readback succeeded and is kept for proof traceability.

R2 public-playback proof bucket status: separate bucket `chillywood-media-public-playback-proof` exists, created 2026-07-08T23:47:12.035Z, and is distinct from the private proof bucket.

R2 public-playback proof object status: harmless text object `playback/public/proof/hello.txt` upload/readback succeeded through authorized Wrangler access and is kept for proof traceability.

R2 public exposure status: `media.chillywoodstream.com` is connected only to `chillywood-media-public-playback-proof`; r2.dev public access remains disabled on both buckets; the private bucket has no custom domain.

R2 custom-domain/cache proof status: public proof URL `https://media.chillywoodstream.com/playback/public/proof/hello.txt` returns HTTP 200 with the expected harmless text from the public-playback proof bucket.

Media bandwidth telemetry status: foundation only, not live.

Cache proof status: proof object returns `Cache-Control: public, max-age=300` and `cf-cache-status: DYNAMIC`; cache savings are not proved and telemetry/cache proof is required before savings claims.

5 GB resumable upload status: not live; current upload is single signed PUT.

Near-term chosen path: Cloudflare R2 private origin plus Cloudflare custom domain/cache, with Supabase/Edge resolver access control and direct signed R2/S3-compatible fallback.

### Origin Storage

- Cloudflare R2 is the target origin because the owner already has the domain on Cloudflare.
- Keep the R2 bucket private by default.
- Keep current Hetzner/S3-compatible origin support as current/legacy fallback where already used.
- Store originals under a private `source/` or equivalent namespace.
- Store derived HLS renditions under a separate `renditions/{videoId}/{quality}/` namespace.
- Require every stored object to carry provider, bucket, object key, owner, media id, checksum where available, byte size, MIME/container, and scan state.
- Treat origin storage as interchangeable behind a provider adapter, not as a user-facing playback URL source.
- Direct signed R2/S3-compatible URLs remain the fallback/private path for legacy playback, owner/staff operations, and environments where Cloudflare R2 config is absent.

### Cloudflare Custom Domain/Cache

- Cloudflare custom domain/cache is the near-term delivery/cache layer for safe playback assets.
- The planned custom hostname is `media.chillywoodstream.com`.
- The private proof bucket is `chillywood-media-proof`.
- The separate public-playback proof bucket is `chillywood-media-public-playback-proof`.
- The private proof bucket and public-playback proof bucket must remain distinct.
- Allowed public proof prefix: `playback/public/`.
- Private blocked prefixes: `originals/`, `uploads/`, `private/`, `premium/`, `processing/`, `moderation-blocked/`, and `unscanned/`.
- Safe first CDN target is public/demo/ready playback assets only under the allowed public prefix.
- Paid/Premium media needs token/signed CDN access before public CDN delivery.
- MEDIA_CDN_SIGNING_MODE=off is only acceptable for public/safe playback assets.
- Private/Premium CDN delivery requires token/signed access first.
- Do not publish source/original/master objects through Cloudflare cache or any public CDN path.
- Do not connect a Cloudflare R2 custom domain directly to a mixed bucket containing private originals, unscanned uploads, or paid/Premium-only media unless Cloudflare token/WAF/Worker access control is already enforcing the private paths before R2 reads.
- The safest first custom-domain target is a separate proof or public-playback surface that contains only approved `playback/public/` assets.
- Use cache keys that separate video id, rendition quality, manifest/segment path, and authorization token shape.
- Configure Cloudflare to fetch from private R2 origin only after origin access and cache rules are explicitly proved.
- Cache headers: HLS segments and thumbnails may use long TTL plus immutable naming; HLS manifests use short TTL; the proof text object uses short or default TTL; private/original paths use no cache.
- Add purge/invalidation by video id and rendition path for takedowns, moderation changes, and entitlement policy changes.

### Prefix-Limited Public Exposure Decision

- Cloudflare R2 custom domains are a public bucket exposure path, not a bucket-native prefix-limited publish switch.
- The current proof did not identify a safe R2 custom-domain configuration that exposes only `playback/public/` while keeping private prefixes in the same bucket unreachable by configuration alone.
- A direct custom domain on a mixed bucket must be treated as unsafe for Chi'llywood media unless a Worker, WAF token rule, Cloudflare Access policy, or equivalent path/token control is already implemented and proved before bucket reads.
- R2 S3 presigned URLs remain valid for the R2 S3 API endpoint, but they do not protect R2 custom-domain URLs. Custom-domain authentication requires Cloudflare-layer controls such as WAF HMAC/token validation or a Worker gateway.
- Official Cloudflare docs basis: [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/), [Protect an R2 bucket with Cloudflare Access](https://developers.cloudflare.com/r2/tutorials/cloudflare-access/), [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), and [How R2 works with cache](https://developers.cloudflare.com/r2/how-r2-works/).
- Recommended safest next architecture: create a separate public-playback proof bucket or public-playback surface containing only approved `playback/public/` assets, then connect `media.chillywoodstream.com` only to that safe surface after explicit owner approval.
- Alternative safe architecture: keep the R2 bucket private and put `media.chillywoodstream.com` on a Worker route that allowlists `playback/public/`, blocks private prefixes, applies token checks for paid/Premium paths, sets cache headers by asset class, and reads R2 through a private binding.
- Do not connect `media.chillywoodstream.com` directly to `chillywood-media-proof` while that bucket is a mixed private/proof bucket.
- Do not claim cache savings, CDN delivery, or production media delivery until a public proof path is connected, cache headers are observed, and telemetry/log ingestion is in place.

### Public-Playback Proof Bucket

- `chillywood-media-public-playback-proof` is a separate R2 bucket for harmless public-safe proof assets only.
- The bucket currently contains only the harmless text proof object `playback/public/proof/hello.txt`.
- The bucket must not contain `originals/`, `uploads/`, `private/`, `premium/`, `processing/`, `moderation-blocked/`, `unscanned/`, real creator media, original/master media, unscanned uploads, private media, or Premium-only media.
- The bucket is publicly reachable only through `media.chillywoodstream.com` for the harmless proof object; r2.dev public access is disabled.
- Explicit owner approval was limited to connecting `media.chillywoodstream.com` to this public-playback proof bucket. No approval was given for production playback, private media, Premium media, or the private proof bucket.
- r2.dev, if approved later, is temporary proof access only and not the production delivery path.
- `media.chillywoodstream.com` points only at this separate public-playback proof bucket at this checkpoint.
- App production playback must remain on the resolver/direct signed-origin fallback until resolver proof, signed/token CDN access for non-public assets, cache proof, telemetry, takedown purge, and Premium gating are implemented and proved.

### Staged Cloudflare Proof Plan

- CLI/API preflight: Wrangler authentication is available without printing tokens, R2 is enabled, and the private proof bucket exists.
- First bucket target: `chillywood-media-proof`.
- The proof bucket remains private. Public bucket access, the r2.dev public development URL, and custom domains were not enabled during the private-origin proof.
- Proof object target: `playback/public/proof/hello.txt`.
- Private-origin proof used authorized remote Wrangler access to upload the harmless text proof object and read it back byte-for-byte.
- Separate public-playback proof bucket target: `chillywood-media-public-playback-proof`.
- Public-playback proof used authorized remote Wrangler access to upload the harmless text proof object and read it back byte-for-byte.
- Custom-domain proof connected `media.chillywoodstream.com` only to `chillywood-media-public-playback-proof`.
- Public proof fetch returned HTTP 200 and exact body `chillywood r2 public playback proof 2026-07-08T23:47:15Z`.
- Cache proof fetches returned `Cache-Control: public, max-age=300`, `Content-Type: text/plain`, and `cf-cache-status: DYNAMIC`; no cache savings are claimed.
- Forbidden-prefix probes under `originals/`, `uploads/`, `private/`, `premium/`, `processing/`, `moderation-blocked/`, and `unscanned/` returned HTTP 404 through the public proof hostname.
- No production media, private/original media, unscanned upload, or Premium creator media was uploaded.
- No production playback config was switched.
- Read-only custom-domain/cache audit: bucket list shows `chillywood-media-proof`, r2.dev status is disabled, custom-domain list is empty, and the proof object still reads back as harmless text through authorized Wrangler access.
- Public-playback proof audit: bucket list shows `chillywood-media-public-playback-proof`, r2.dev status is disabled, custom-domain list contains `media.chillywoodstream.com`, and the proof object still reads back as harmless text through authorized Wrangler access.
- Public proof, when approved, may expose only `playback/public/` test assets. It must not expose source/original/master, unscanned, private, or Premium-only objects.

### Cloudflare Setup Steps Before Applying Public Delivery

1. Confirm the private proof bucket and harmless proof object remain non-production proof assets only.
2. Keep `media.chillywoodstream.com` scoped to the separate public-playback proof bucket until resolver support exists.
3. Do not add cache rules beyond object metadata until HLS/hashed public assets exist.
4. Add resolver support for safe public playback assets without changing app UX or Premium entitlement logic.
5. Keep production creator-video playback on existing resolver/direct signed-origin fallback until signed/token CDN access, telemetry, takedown purge, and Premium gating are implemented and proved.

### Signed CDN Playback

- Keep the backend resolver as the only quality decision point.
- Supabase/Edge resolver remains the access-control and playback decision layer.
- Replace direct signed origin playback URLs with signed/token Cloudflare custom-domain manifest URLs only after signing and telemetry are implemented and proved.
- Signed/token CDN grants should be short-lived, scoped to one video/rendition set, and tied to the authenticated viewer where possible.
- The client should receive only resolver-approved playback URLs. It should not build CDN paths locally.
- The app must ask the backend resolver for playback; the app must not hard-code R2 or Cloudflare custom-domain decisions.
- Direct origin signing should remain available for owner/staff private operations and bounded legacy fallback during migration.

### Private Original/Master Policy

- Originals are processing inputs and audit sources.
- Originals may be downloaded by the owner, approved staff, or worker service role only through explicit private access paths.
- Originals must not be marked `free` or `premium`.
- Originals must not appear in HLS master manifests, CDN public paths, or regular playback quality lists.
- Do not enable public access for originals/master files.
- Takedown, malware, scan-pending, and moderation-disabled originals must fail closed for public and Premium viewers.

### HLS/ABR Renditions

- HLS/transcoding is a future milestone unless implemented and proved.
- Generate HLS VOD packages for 360p, 480p, 720p, and 1080p only when the source supports that output without fake upscaling claims.
- Store each rendition's manifest path, segment prefix, codec, dimensions, bitrate, duration, checksum or manifest hash, byte size, and status in trusted metadata.
- Prefer a master manifest that lists only resolver-allowed variants or generate per-viewer signed access to a static master where CDN signing prevents unauthorized segment access.
- Keep MP4 fallback only as a legacy compatibility path until HLS coverage is proved.

### Transcode Worker Queue

- Add a backend-owned queue such as `video_transcode_jobs` or an external durable queue.
- Queue one job after a creator-video upload row exists and the source object is scan-safe enough for processing.
- The worker should claim jobs idempotently, download the private source, probe with `ffprobe`, transcode with controlled profiles, upload renditions, write `video_renditions`, and mark failed jobs with safe error codes.
- Workers must use service credentials that are never exposed to the client.
- Retries, dead-letter handling, cleanup of partial renditions, and no-upscale policy must be explicit before claiming transcode closure.

### Free vs Premium Quality Ladder

- Free viewers: 360p and 480p only.
- Premium viewers: 720p and 1080p only when ready renditions exist and backend entitlement proof is active.
- Owners and authorized staff may see status and private operational access, but that must not weaken public/Premium playback policy.
- Missing or stale entitlement proof fails closed to free-only for non-owner viewers.
- The Player must continue to rely on resolver output rather than hardcoded local quality decisions.

### Watch-Party Playback Quality Policy

- Do not change LiveKit room behavior or Watch-Party authority behavior in this architecture lane.
- Creator-video Watch-Party sources must use the same creator-video playback resolver path as standalone Player.
- A host's Premium signed URL must not be forwarded as a shared entitlement to free viewers.
- Future Watch-Party shared playback should use per-viewer resolver/CDN signing or a lowest-common allowed quality policy that never gives HD to a free viewer.
- LiveKit camera, speaker, dynacast, simulcast, and Watch-Party seat behavior stay separate from VOD CDN policy.

### Media Bandwidth Telemetry

- Record signed playback grants with video id, owner id, viewer id where available, quality, CDN/provider, token TTL, and request id.
- Ingest Cloudflare cache/R2 logs or provider usage exports to get bytes served by video id, rendition, owner id, status code, cache hit/miss, and day/hour.
- Reconcile internal grant counts with provider/CDN byte reports.
- Roll up media egress by creator, video, quality, provider, and day.
- Use telemetry for quota, abuse detection, cost controls, and owner/admin read models.
- Do not claim real scaled media delivery proof until playback bytes are measured from CDN/provider logs or equivalent trusted telemetry.
- Bandwidth/minutes-watched telemetry remains required before broad rollout.

### Creator Quota Controls

- Enforce upload count, storage bytes, transcode minutes, rendition bytes, failed-job retry counts, and playback egress quotas by creator.
- Keep creator quota decisions backend-owned.
- Provide owner/admin override and appeal paths with audit logs.
- Separate quota state from Premium entitlement. Premium may allow creator tools, but it should not bypass abuse, malware, or cost controls.

### Abuse And Rate Limits

- Keep the existing upload URL rate limit.
- Add signed playback grant rate limits by user, video, owner, IP/security context, and device where available.
- Add CDN hotlink protection and token scoping so copied URLs expire quickly.
- Rate limit failed entitlement attempts and direct-origin signing attempts.
- Add worker-side abuse controls for repeated failed transcodes, unsupported codecs, oversized duration, and malformed files.

### Migration Plan From Existing Signed S3 URLs

1. Keep current direct signed origin playback as a legacy fallback while foundations are built.
2. Add origin/provider abstraction without changing Player UX.
3. Add Cloudflare R2 config support behind `MEDIA_ORIGIN_PROVIDER=cloudflare_r2`, with no secrets committed.
4. Keep R2 private by default and verify direct signed R2/S3-compatible fallback.
5. Add Cloudflare custom-domain/cache delivery for public/demo/ready playback assets only.
6. Add token/signed CDN access before any paid or Premium media uses the Cloudflare custom-domain/cache path.
7. Add transcode queue and worker behind service credentials.
8. Generate real renditions for new uploads, then backfill existing public/clean creator videos.
9. Add media bandwidth telemetry from Cloudflare/provider logs and reconcile it with signed playback grants.
10. Gradually prefer Cloudflare custom-domain HLS in `resolve_video_playback` while leaving single-file fallback for videos without ready renditions.
11. Disable public legacy fallback only after migration proof shows ready renditions, CDN signing, telemetry, takedown purge, Premium gating, and Watch-Party resolver behavior are all correct.

### Config Contract

Define config names and approved non-secret contract values only. Do not commit provider secrets or account-specific R2 values.

```sh
MEDIA_ORIGIN_PROVIDER=cloudflare_r2
MEDIA_DELIVERY_PROVIDER=origin_signed_direct | cloudflare_r2_custom_domain
MEDIA_CDN_BASE_URL=https://media.chillywoodstream.com
MEDIA_CDN_SIGNING_MODE=off | token
MEDIA_CDN_PUBLIC_PLAYBACK_PREFIX=playback/public/
MEDIA_CDN_PRIVATE_PLAYBACK_DISABLED=true
R2_BUCKET
R2_ACCOUNT_ID
R2_S3_ENDPOINT
```

Config rules:

- If Cloudflare R2 config is absent, current signed origin behavior remains fallback.
- `MEDIA_CDN_SIGNING_MODE=off` is only acceptable for public/safe playback assets.
- Private/Premium CDN delivery requires token/signed access first.
- `MEDIA_CDN_PRIVATE_PLAYBACK_DISABLED=true` is the safe default until token/signed CDN access is implemented and proved.
- Do not commit R2 account ids, S3 endpoints, access keys, secret keys, API tokens, signed URLs, or provider dashboard secrets.

### Provider Abstraction

The app should treat Hetzner, Cloudflare R2, Bunny, and other S3-compatible stores as origin providers behind the same contract:

- `createUploadGrant(surface, objectKey, sizeBytes, mimeType)`
- `completeUploadGrant(uploadId or objectKey, checksum, sizeBytes)`
- `createPrivateOriginDownloadGrant(objectKey, purpose)`
- `createCdnPlaybackGrant(videoId, renditionSet, viewerContext)`
- `deleteObject(objectKey)`
- `readObjectMetadata(objectKey)`
- `listProviderUsage(period)`

Provider adapter fields:

- provider key and display label
- S3 endpoint, region, bucket, path-style or virtual-hosted style
- max object size, multipart support, and part-size rules
- CDN hostname, signer type, token/cookie support, and purge API
- origin access method and private bucket policy
- usage export/log availability and billing dimensions
- egress pricing model and cache behavior

Recommended path:

- Near term: Cloudflare R2 as private origin, Cloudflare custom domain/cache as the delivery/cache layer for safe playback assets, and Supabase/Edge resolver as access-control and playback decision layer.
- Current/legacy fallback: Hetzner Object Storage or any already-configured S3-compatible origin may continue through direct signed origin URLs while migration work is incomplete.
- Optional future managed-video alternative: Cloudflare Stream is optional later and is not required for this R2/custom-domain path.
- Optional future CDN alternative: Bunny CDN remains an alternative only if the team later moves away from Cloudflare custom-domain/cache, after proving entitlement-aware signing, log export, takedown purge, and source privacy.
- Keep direct S3 signing as a migration fallback, not the target playback plane.
