# Cloudflare R2 Premium HD Tokenized Playback Proof

Date: 2026-07-10

Status: server-side protected Premium HD delivery Closed; backend token issuer deployed/proved; installed free/non-Premium fallback proved; installed Premium playback remains Partial pending a Premium-active installed session.

## Result

Protected Premium HD R2/HLS playback is live for the current HD-capable audited public-safe sources through the isolated Worker `chillywood-premium-media-access-proof` at `premium-media-proof.chillywoodstream.com`.

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

Installed app proof is Partial. The available Play-installed device `R5CR120QCBF` was verified as `com.chillywood.mobile` from `com.android.vending`, versionCode `80`, versionName `1.0.0`, and Expo Updates applied the Android update above. An HD-capable creator video opened in the installed app, but the installed session resolved safely to fallback with redacted metadata `provider=origin_signed_direct`, `fallbackUsed=true`, `tokenized=false`, and `protectedPlayback=false`. That proves the installed free/non-Premium fallback/denial path; installed Premium HD playback still needs a Premium-active installed session to prove `tokenized=true` and `protectedPlayback=true`.

Follow-up RCA on 2026-07-09 is recorded in `docs/release/PLAY_SANDBOX_PREMIUM_HD_RCA_20260709.md`. The installed replay matched Supabase user `4b5e7761-5bf1-4e18-9eb7-d6037a0eb32f`; that user's RevenueCat sandbox Premium entitlement had expired on `2026-07-08T17:58:59.352Z`, and `monetization_has_active_premium` returned `false` during the replay. The selected HD source had ready protected 720p/1080p rows, and the deployed token issuer responded safely when probed unauthenticated, so this was not a missing HD row, Worker, token secret, or resolver deployment issue. No code fix or Premium bypass was applied.

No daemon, cron, scheduler, broad backfill, Premium entitlement change, billing/provider change, app UX change, or production playback fallback removal happened.
