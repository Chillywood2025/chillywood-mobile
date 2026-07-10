# Media Object Storage R2 Migration Runbook

Status: Partial. Cloudflare R2 private origin bucket `chillywood-media-origin` exists and is the target for future source/original media, but Hetzner Object Storage is not ready for shutdown. No media was processed, no media rows were written, no objects were copied, and no Hetzner objects were deleted in this pass.

## Scope

This runbook covers Hetzner Object Storage / S3-compatible media objects only. It does not cover Hetzner LiveKit, `chillywood-prod-01`, TURN, Caddy, Docker, `live.chillywoodstream.com`, heartbeat routing, or any LiveKit server operation. Do not shut down Hetzner LiveKit as part of object-storage cleanup.

## Current Inventory

Read-only production inventory found remaining Hetzner/S3 object-storage references:

- `videos`: 12 rows in bucket `chillywood-media-prod`.
- `social_attachments`: 4 rows in bucket `chillywood-media-prod`.
- `media_scan_jobs`: 9 rows in bucket `chillywood-media-prod`.
- `video_renditions`: 6 legacy rows in bucket `chillywood-media-prod`.
- `media_renditions`: 15 rows already on Cloudflare R2 playback/protected buckets.
- Distinct Hetzner/S3 object references: 22.
- Total Hetzner/S3 reference rows: 31.

Object keys are treated as private migration metadata and are redacted from normal logs and docs.

## R2 Target

Private R2 origin target:

- Provider: `cloudflare_r2`
- Bucket: `chillywood-media-origin`
- Public access: disabled.
- Custom public domain: none.
- r2.dev public exposure: none.
- Allowed private-origin prefixes: `originals/`, `uploads/`, `source/`, `processing/`, and `quarantine/`.

The public playback bucket and `media.chillywoodstream.com` are not valid targets for originals, masters, uploads, source files, private media, or Premium source objects. Free 360p/480p public HLS remains in the separate public playback bucket. Premium HD remains token-protected through the Premium Worker path.

## Runtime Contract

New source/original upload support is source-prepared but not switched on:

- `MEDIA_ORIGIN_PROVIDER=cloudflare_r2`
- `MEDIA_ORIGIN_BUCKET=chillywood-media-origin`
- `MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED=true`
- `MEDIA_ORIGIN_PRIVATE_ONLY=true`
- `MEDIA_ORIGIN_R2_ENDPOINT`
- `MEDIA_ORIGIN_R2_ACCOUNT_ID`
- `MEDIA_ORIGIN_R2_ACCESS_KEY_ID`
- `MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY`
- `LEGACY_HETZNER_S3_READ_FALLBACK=true`
- `LEGACY_HETZNER_S3_WRITE_DISABLED=true` only after migration proof closes

`supabase/functions/media-storage/index.ts` can source private signed upload/download URLs from the R2 origin config when that env is configured. Until then, deployed production behavior may still use the current Hetzner/S3 env. `supabase/functions/media-scan-private-access/index.ts` can read migrated `cloudflare_r2` private-origin rows for public-safe scan/transcode candidates when the same private-origin env is configured.

## Migration Procedure

1. Run a fresh read-only inventory:

```bash
npm run media-object-storage:r2-inventory
```

2. Run a redacted dry-run manifest:

```bash
npm run media-object-storage:r2-dry-run
```

3. Confirm every target is under `chillywood-media-origin` and one of the private-origin prefixes.

4. Confirm no target path starts with `playback/public/`, `playback/protected/`, or `playback/premium/`.

5. Confirm a trusted copier exists for all migration categories, including private and Premium object-storage refs. The scanner gateway is not enough for full migration because it intentionally denies private/Premium scan/transcode access.

6. Copy objects from Hetzner/S3 to R2 private origin only after the trusted copier and R2 write credentials are configured in backend authority.

7. Verify every object by size plus checksum/ETag when available.

8. Take a fresh logical backup of every affected metadata table and restore-drill it.

9. Update DB metadata in small transactions only after all copied objects verify.

10. Keep Hetzner fallback retained through a retention window.

## Shutdown Gate

Hetzner Object Storage may be prepared for owner-controlled shutdown only after all of these are true:

- `0 Hetzner object-storage` media references remain in production tables.
- Every copied object has R2 readback and size/checksum verification.
- DB metadata points to R2 private origin.
- New source/original uploads target R2 private origin.
- Scanner gateway reads migrated R2 private-origin objects.
- Transcode worker reads migrated R2 private-origin objects.
- Free public playback still works.
- Premium HD tokenized playback still works.
- Private/original/Premium source objects are not public.
- Hetzner fallback retention window is complete or explicitly waived by the owner.

Hetzner LiveKit remains separate even after object-storage shutdown readiness.

## Current Blocker

Full migration is blocked before copy/DB update because the local process has no Hetzner/S3 read credential, no R2 origin write credential, and no deployed trusted all-object copier for private/Premium/source refs. The existing scan gateway is intentionally narrower: it can read public-safe scan/transcode candidates, and now has R2 private-origin support for migrated rows, but it denies private and Premium media.

Do not delete Hetzner objects. Do not disable Hetzner Object Storage. Do not remove fallback until the zero-reference audit and retention decision close.
