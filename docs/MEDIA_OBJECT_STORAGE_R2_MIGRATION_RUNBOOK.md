# Media Object Storage R2 Migration Runbook

Status: Partial. Cloudflare R2 private origin bucket `chillywood-media-origin` exists and is the target for future source/original media, and trusted backend copier Edge Function `media-object-storage-migration` is deployed. The missing R2 private-origin write config was added through a bucket-scoped R2 S3 credential stored as Supabase function secrets without printing values. Full reconciliation now HEAD/checks exact, normalized-key, path-style, and alternate-key candidates for all `22` distinct legacy refs: `16` exist and were copied/readback verified in R2 private origin, `5` are `missing_404`, `1` is `unsupported_provider`, `9` duplicate row refs were detected, and `permission_denied_403=0`. The copier skips and reports missing/unsupported refs rather than treating them as migrated, and still stops on permission/public-exposure errors. No DB metadata was migrated because the fresh affected storage-metadata backup/restore gate was not closed in this pass, no Hetzner objects were deleted, and Hetzner fallback remains retained.

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

The live trusted copier inventory also found `31` Hetzner/S3 reference rows and `22` distinct object refs. Missing/invalid copier operator tokens returned `401`, and a valid proof-session operator token returned redacted inventory without object keys, signed URLs, or secrets. The reconciliation/copy pass copied and verified the `16` existing distinct refs, skipped `5` `missing_404` refs plus `1` unsupported ref, and left production DB metadata unchanged.

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

The trusted migration copier uses backend authority only:

- Function: `media-object-storage-migration`
- Auth header: `x-media-object-migration-token`
- Stored server-side secret: `MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN_SHA256`
- CLI backend source: `node ./scripts/media-object-storage-r2-migration.mjs --source=backend`
- Required R2 write config before live copy: `MEDIA_ORIGIN_PRIVATE_ONLY=true`, `MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED=true`, `MEDIA_ORIGIN_BUCKET=chillywood-media-origin`, `MEDIA_ORIGIN_R2_ENDPOINT`, `MEDIA_ORIGIN_R2_ACCESS_KEY_ID`, and `MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY` or the equivalent `R2_ORIGIN_*` names.

The copier never returns raw signed source URLs or storage credentials. It denies target buckets/prefixes that would put source/original objects into public playback, protected Premium playback, or `media.chillywoodstream.com`.

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

5. Confirm the trusted copier is deployed and token-gated:

```bash
npm run media-object-storage:r2-backend-inventory
```

This requires `MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN` or an ignored local token file. The token value must never be printed.

6. Reconcile every distinct legacy object before copy:

```bash
npm run media-object-storage:r2-reconcile
```

`missing_404` refs are unresolved/stale candidates, not migrated objects. `permission_denied_403` is a credential/permission blocker and must stop the migration before copy.

7. Copy existing objects from Hetzner/S3 to R2 private origin only after R2 write credentials are configured in backend authority:

```bash
npm run media-object-storage:r2-copy-batch
```

The copier copies refs classified as existing, skips missing/unsupported refs, and keeps Hetzner fallback retained. It must not update DB metadata for skipped refs.

8. Verify every copied object by size plus checksum/ETag when available.

9. Take a fresh logical backup of every affected metadata table and restore-drill it. The existing media-worker backup covers `media_transcode_jobs` plus `media_renditions`; storage metadata updates also require affected-row backup coverage for `videos`, `social_attachments`, `media_scan_jobs`, and legacy `video_renditions` before production metadata mutation.

10. Update DB metadata in small transactions only after copied objects verify and the affected-table backup gate closes.

11. Keep Hetzner fallback retained through a retention window.

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

The previous `r2_origin_write_config_missing` blocker is cleared. The backend now has `MEDIA_ORIGIN_PRIVATE_ONLY=true`, `MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED=true`, `MEDIA_ORIGIN_BUCKET=chillywood-media-origin`, `MEDIA_ORIGIN_R2_ENDPOINT`, `MEDIA_ORIGIN_R2_REGION=auto`, `MEDIA_ORIGIN_R2_ACCESS_KEY_ID`, and `MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY` stored as Supabase function secrets.

Full migration is still blocked before DB metadata update because `5` distinct legacy refs are `missing_404`, `1` distinct ref is `unsupported_provider`, and the fresh affected storage-metadata backup/restore gate was not closed in this pass. The next step is to identify whether the missing refs are active media, private/Premium media, old proof/test media, replaced sources, or orphaned broken refs; restore or correct any active source metadata; then close the affected-table backup gate before updating metadata for copied+verified rows. Do not switch new uploads, claim zero Hetzner object-storage refs, or shut down Hetzner Object Storage until unresolved refs are cleared and zero-ref audit passes.

The existing scan gateway remains intentionally narrower: it can read public-safe scan/transcode candidates and has R2 private-origin support for migrated rows, but it denies private and Premium media. It is not the all-object migration copier.

Do not delete Hetzner objects. Do not disable Hetzner Object Storage. Do not remove fallback until the zero-reference audit and retention decision close.
