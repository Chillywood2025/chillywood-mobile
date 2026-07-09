# Media Transcode Worker Runbook

Status: design and local proof only. The production schema for `media_transcode_jobs` and `media_renditions` is applied, but no production transcode worker is deployed, no production queue processor is running, no production media rows are written, and creator-video playback still falls back to signed origin by default.

## Runtime Choice

Preferred runtime: a small container or VM worker with ffmpeg and ffprobe installed. The worker needs predictable CPU, disk, process time, and temporary-file capacity for video processing.

Supabase Edge Functions are not the primary runtime for the heavy transcode loop because ffmpeg binaries, long-running jobs, temporary HLS output trees, and retry cleanup are a poor fit for short-lived edge execution. Edge Functions may still enqueue jobs, claim jobs, or expose controlled worker APIs later, but the video processing host should be a worker/container/VM.

## Inputs

Each worker run starts from a server-owned `media_transcode_jobs` row:

- `source_type` and `source_id`
- `input_provider`, `input_bucket_role`, `input_bucket`, and `input_path`
- `output_provider`, `output_bucket_role`, `output_bucket`, and `output_prefix`
- `requested_renditions`
- `worker_version`
- `source_hash`

The source can be a private origin object fetched by worker credentials or a known safe public proof URL. Production creator uploads must come from private origin storage and must never be downloaded by client-provided public URL metadata alone.

## Required Safety Checks

Before probing or transcoding, the worker must verify:

- the source object exists and is readable by worker authority
- the source belongs to the expected creator/media row
- the source is allowed for processing
- scan state is clean or approved when scan is required
- moderation state is allowed
- the source is not moderation-blocked
- unscanned uploads are not public-CDN eligible
- original/master input remains private
- output prefix starts with `playback/public/` only when the asset is approved for public playback
- output prefix does not contain `originals/`, `uploads/`, `private/`, `premium/`, `processing/`, `moderation-blocked/`, or `unscanned/`
- Premium/private outputs do not use public CDN while `MEDIA_CDN_SIGNING_MODE=off`

## Processing Flow

1. Claim one queued job with service-role or trusted worker authority.
2. Mark the job `probing`.
3. Run ffprobe and record source duration, width, height, codec, and source hash.
4. Verify the requested ladder is allowed for the source and account policy.
5. Mark the job `transcoding`.
6. Run ffmpeg to generate HLS renditions such as 360p and 480p, with future 720p/1080p gated by Premium policy and source dimensions.
7. Validate every output: master manifest, variant playlists, segment existence, segment decode, no private/signed-origin URLs in manifests, and no forbidden output prefix.
8. Mark the job `uploading`.
9. Upload to the public playback bucket only for clean, moderation-allowed, public-safe playback assets.
10. Write `media_renditions` rows with service-role or trusted worker authority after output validation succeeds.
11. Mark the job `ready`.
12. If any required step fails, mark the job `failed` and do not write ready rendition rows.

## Failure Behavior

Retries must be bounded. A failed job records `error_code` and a redacted `error_message`. The worker must not leave partial ready rows. Partial uploads should be cleaned up when cleanup is safe; if cleanup cannot be guaranteed, the resolver must still ignore incomplete jobs and non-ready renditions.

The worker must never mark `is_ready=true` before source probing, HLS generation, upload-path validation, manifest validation, and resolver eligibility checks pass.

## Security

Worker secrets stay only on the worker host. Logs must not include service-role keys, DB URLs, provider credentials, private signed URLs, authorization headers, or raw user identifiers. The app/client path cannot insert or update trusted readiness, public playback path, `is_public_playback_safe`, `worker_version`, or `source_hash`.

Public CDN eligibility comes only from backend-written trusted rows that are ready, public, clean or approved, moderation-allowed, non-original, in the public playback bucket role, under `playback/public/`, and explicitly resolver-allowlisted during staged rollout.

## Rollback

Rollback controls:

- disable the worker process
- stop job claiming
- leave resolver default on signed-origin fallback
- remove or narrow any resolver allowlist
- delete bad public proof objects when safe
- mark affected jobs `failed`
- remove bad `media_renditions` rows with service-role authority if rows were created by mistake

Schema rollback is separate and must follow the database rollback plan. Playback can remain safe without schema rollback because the resolver does not use production rows by default.

## Activation Gates

Production worker activation requires all of these gates:

- PITR or owner-approved backup/restore readiness is in place
- worker secrets are configured outside the repo
- worker host has ffmpeg and ffprobe
- local proof harness passes
- disposable DB worker proof passes
- production schema readback remains healthy
- owner explicitly approves production worker activation
- owner explicitly approves any production writes/backfill
- installed playback proof passes before any production playback switch

Current backup gate: PITR is off, WAL-G is enabled, and no manual backup records were listed in the prior production migration closeout. Treat PITR/backup readiness as a blocker before future production writes, backfill, or worker activation.

## Local Proof Harness

`npm run proof:media-transcode-worker-local` is the current worker proof. It uses only the approved public-safe City Lights demo MP4, builds an in-memory/mock transcode job, simulates claim and status transitions, runs ffprobe, generates local 360p and 480p HLS with ffmpeg, validates manifests and segments, simulates upload object keys under `playback/public/proof-worker/`, builds trusted `media_renditions` rows in memory, validates resolver eligibility, builds sanitized telemetry events, proves failed-job behavior, and runs a disposable PGlite write-policy proof when available.

The local proof harness does not connect to the production database, does not write production rows, does not upload private/original/Premium media, does not deploy a worker, and does not switch production playback.
