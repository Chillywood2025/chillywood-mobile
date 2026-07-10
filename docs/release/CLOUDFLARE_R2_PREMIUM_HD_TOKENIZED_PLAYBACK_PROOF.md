# Cloudflare R2 Premium HD Tokenized Playback Proof

Date: 2026-07-10

Status: Closed. Server-side protected Premium HD delivery, backend token issuance, resolver integration, free/non-Premium denial, and Play-installed Premium HD playback are proved end to end.

## Result

Protected Premium HD R2/HLS playback is live for the current HD-capable audited public-safe sources through the isolated Worker `chillywood-premium-media-access-proof`. Preferred production host is `premium-media.chillywoodstream.com`; the old `premium-media-proof.chillywoodstream.com` proof host remains attached as a temporary fallback during hostname migration.

The pass generated only source-supported HD:

- City Lights stayed SD-only because the source is 854x480.
- Three 1280x720 sources received 720p only.
- One 720x1280 source received 720p plus 1080p.

Final media-worker row counts:

- `media_transcode_jobs=10`
- `media_renditions=15`
- `premium_hd_renditions=5`
- `active_unfinished_jobs=0`
- `unsafe_cdn_rows=0`
- `unsafe_public_hd_rows=0`

## Protected Delivery

HD HLS outputs are stored only under protected Premium prefixes:

```text
playback/protected/premium/
```

The protected Worker verifies short-lived Premium tokens before serving HD objects. The live proof confirmed:

- valid Premium proof token + matching HD master/variant/segment: allowed
- missing token: denied
- free/non-Premium token: denied
- wrong path token: denied
- private/original/unsafe paths: denied by source proof
- HLS child playlists and media segments are rewritten with root-relative scoped token URLs so native HLS clients do not resolve protected children under the wrong parent path.

Token values, signed URLs, DB URLs, service-role keys, and provider credentials were not printed or committed.

## Row Policy

Protected HD `media_renditions` rows use:

- `delivery_provider=cloudflare_r2_premium_token`
- `bucket_role=protected_premium`
- `visibility=premium`
- `is_public_playback_safe=false`
- `is_protected_playback_safe=true`
- protected manifest paths under `playback/protected/premium/`

Rows were inserted pending/audit-gated, then promoted only after output validation, Worker allow/deny proof, and decode proof passed.

## Playback Scope

Free 360p/480p public HLS remains unchanged. Premium HD is not exposed from `playback/public/`.

The live backend token issuer is now deployed as Supabase Edge Function `premium-media-playback-token`. It authenticates the signed-in Supabase user, checks the existing `monetization_has_active_premium` entitlement path, verifies protected `media_renditions` rows, and issues short-lived Worker-compatible playback tokens only for 720p/1080p protected Premium HLS rows. Missing auth, invalid auth, non-Premium proof cases, wrong source/path/rendition, and missing issuer env fail closed in source/deployed proofs.

Android EAS Update was published for the app resolver integration:

- source commit `f6f6bd9d2ce3ed7179876c7c7c9cdbaab1374198`
- runtime `1.0.0`
- update group `22916970-0161-4411-930a-3570eb5625fb`
- Android update `019f4a0b-efff-71c9-bae5-9198bb001160`

Installed app Premium HD proof is Closed. The Play-installed device `R5CR120QCBF` was verified as `com.chillywood.mobile` from `com.android.vending`, versionCode `80`, versionName `1.0.0`, and Expo Updates applied the Android update above. The installed session matched Supabase user `4b5e7761-5bf1-4e18-9eb7-d6037a0eb32f`; a Google Play / RevenueCat sandbox Premium purchase renewed during the proof window; RevenueCat webhook rows granted Premium; and `monetization_has_active_premium` returned `true` for that user before playback.

Installed Premium resolver proof:

- 1080p source `3de36e39-67e6-45ca-a12f-d5b1560473cb` previously resolved with redacted metadata `playbackHost=premium-media-proof.chillywoodstream.com`, `provider=cloudflare_r2_premium_token`, `deliveryFormat=hls`, `rolloutMode=trusted_public`, `cdnEligible=true`, `fallbackUsed=false`, `auditPassed=true`, `backupGatePassed=true`, `renditionLabel=1080p`, `premiumTokenRequired=true`, `tokenized=true`, `protectedPlayback=true`, and `rawUrlRedacted=true`. Hostname migration now makes `premium-media.chillywoodstream.com` the preferred issuer/Worker host while retaining the proof hostname fallback.
- 720p-only source `4999b741-8854-4bc8-a2f0-45907b870db3` resolved with the same protected metadata and `renditionLabel=720p`.
- Android playback proof showed ExoPlayer initialization, AVC/AAC decoder activity, and active Android media playback for the protected HD streams.
- No playback-token value, signed URL, DB URL, service-role key, Cloudflare credential, or private provider value was printed or committed.

Follow-up RCA on 2026-07-09 is recorded in `docs/release/PLAY_SANDBOX_PREMIUM_HD_RCA_20260709.md`. The installed replay matched Supabase user `4b5e7761-5bf1-4e18-9eb7-d6037a0eb32f`; that user's RevenueCat sandbox Premium entitlement had expired on `2026-07-08T17:58:59.352Z`, and `monetization_has_active_premium` returned `false` during the replay. The selected HD source had ready protected 720p/1080p rows, and the deployed token issuer responded safely when probed unauthenticated, so this was not a missing HD row, Worker, token secret, or resolver deployment issue. No code fix or Premium bypass was applied.

Final closeout RCA on 2026-07-10 found one real production bug after the sandbox Premium renewal: the protected Worker rewrote HLS child playlist/segment URIs as relative paths, so native HLS clients resolved them beneath the parent manifest directory and received protected Worker `403` responses. The fix is limited to `workers/premium-media-access/worker.mjs`: child playlist and segment URIs are now root-relative protected paths with scoped child tokens. The Worker was redeployed, the Edge Function and Worker signer secret were aligned without printing the secret, and live Worker proof then returned HTTP 200 for valid protected proof access while denying missing/expired/wrong/non-Premium/private/original cases.

Hostname migration on 2026-07-10 moved the preferred protected Premium host from `premium-media-proof.chillywoodstream.com` to `premium-media.chillywoodstream.com`. Worker `chillywood-premium-media-access-proof` keeps both custom domains attached during migration; version `2b717ab2-e1fc-47ef-a9c4-378f09292fe4` added the clean host route, active version `6c0ec125-332e-414d-9fef-b7a3afaf0ee8` aligned the signer secret, and live proof passed on both hostnames. The Supabase token issuer secret `PREMIUM_MEDIA_WORKER_BASE_URL` now points to `https://premium-media.chillywoodstream.com`. No token value, signer secret, signed URL, Cloudflare credential, DB URL, or service-role key was printed or committed.

No daemon, cron, scheduler, broad backfill, Premium entitlement change, billing/provider change, app UX change, or production playback fallback removal happened.
