# Cloudflare R2 Premium HD Tokenized Playback Proof

Date: 2026-07-10

Status: server-side protected Premium HD delivery Closed; installed app Premium HD proof not run.

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

Installed app Premium HD playback proof was not run in this pass because the app/backend live Premium token issuer and OTA integration were not added here. The next app-facing milestone is token issuance from active Premium entitlement proof, then installed Premium/free fallback proof.

No daemon, cron, scheduler, broad backfill, Premium entitlement change, billing/provider change, app UX change, or production playback fallback removal happened.
