# Clip export and Brand Reel completion

## Scope and current state

This implements server-rendered trim, centered crop/fit and burned-in approved
brand marks. It also adds Gallery and Files Hero Reel/watermark selection and
tap-to-play, muted-by-default Hero Reel playback. No new native dependency is
introduced: expo-video and expo-image-picker already exist in the signed app.
Native compatibility still requires the canonical release comparison.

The server renderer must be deployed and qualified before enabling its database
gate. The migration defaults OFF. Local tests are not evidence that a production
renderer host is available. `scripts/clip-export-worker-cli.mjs --once` does not
change that gate or install a scheduler. An unavailable renderer is reported
truthfully to creators; original upload/publish remains unchanged.

Advanced timeline, captions, transitions, title burn-in and effects are not part
of this change. Existing title/template metadata remains display metadata.

## End-to-end plan and architecture

1. Creator selects/uploads a video using the existing upload/scanner flow, edits
   start/end seconds, frame and brand mark, then saves. Input validation rejects
   negative/non-numeric/reversed ranges. The server checks the actual probed
   duration again. Blank End means the remainder of the source.
2. Export requests use exact current account/session and Premium authority,
   owner-scoped source access, clean scan, allowed moderation and saved edit
   snapshot matching. A stable request UUID reconciles a lost response without
   creating another job. Maximum three pending jobs per creator.
3. One global worker claim at a time, two-minute lease, 30-second heartbeat,
   three abandoned-lease attempts at most. Each attempt has a new lease UUID and
   output video UUID. Cancellation, revoked authority, source changes and stale
   leases cannot finish a draft. Administrative activation remains separate.
4. Download exact server-owned private coordinates with byte-size bounds; no
   caller-supplied URL is accepted. Local ffmpeg sees only files and pipes,
   never network URLs. Demuxer allowlists reject playlists/concat and nested file
   reads even when MIME is mislabeled. Arguments are arrays, not shell commands.
5. Render new H.264/AAC MP4, at most 1080 long edge without upscaling. Original
   bytes are never replaced. Probe dimensions/duration/codec and decode the whole
   result. Optional watermark bytes must come from a clean, approved published
   owner asset; completion rechecks that exact asset snapshot.
6. Begin the shared durable secondary-media producer using the original source
   binding. Reserve the exact output inventory and a unique
   `owner/outputVideoId/lease/export.mp4` key. Stream a create-only PUT to private
   R2, with a write-identity marker. Full GET readback must match size, SHA-256,
   ETag and write identity. A timeout/412 is never retried as an overwrite.
   This renderer does not resume a prior PUT: failed jobs retain their durable
   intents; a new attempt uses a new immutable prefix. Registry reconciliation
   may inspect old writes using GET-only proof, never an overwrite or blind delete.
7. Record the durable receipt and seal the producer. In one database transaction,
   revalidate source/owner/lease/watermark, insert a new draft with pending scan
   and the source's allowed moderation state, attach the output's additional source binding to retention, and
   mark the export ready. Lost completion responses cannot mark a committed
   draft failed or create a second draft. Source deletion cannot cascade away
   export evidence. Neither renderer nor receipt grants public visibility.
8. Creator sees queue/render/failure/cancel/ready status and opens the new draft
   from Content Library. Scanning, review and explicit publish use existing
   guarded video flows. There is no automatic publication.
9. Hero Reel playback uses only resolved assets and clean scan status, no cache,
   no autoplay/background/external playback, account/route-keyed lifetime,
   focus/background pause and safe error fallback. Watermark changes affect new
   exports only, never existing published bytes.

## Failure and regression coverage

- Actual ffmpeg generated media: trim duration, crop dimensions, fit/rotation,
  full decode, watermark pixels, source preservation, existing output refusal,
  canceled work and malformed ranges/probes.
- Actual streamed HTTP create-only upload/readback: complete bytes, immutable
  identity, conflict, altered ETag, disconnected unknown PUT and no retry.
- Full migration-chain SQL fixture: exact owner/session, expired session,
  denied service RPC access, RLS/private grants, unavailable worker, duplicate
  requests, mismatched edit retry, stale leases, cancellation, synthetic sealed
  receipt, atomic private output and original/output retention bindings.
- Production mounted Studio regressions and picker callbacks, including
  replacement sessions, old async completions and repeat taps. These use modeled
  native boundaries, not physical-device proof.

## Deployment and rollback

Apply the secondary producer registry migration before the export migration.
Use the reviewed canonical database process and independently verify history,
definitions/grants and OFF gate. Install the reviewed worker code on an existing
authorized compute host with Node 22+, ffmpeg/ffprobe and adequate private disk.
Do not overwrite the scanner's environment file or recreate its credentials.

Required existing worker configuration: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
MEDIA_ORIGIN_PRIVATE_ONLY=true, MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED=true,
MEDIA_ORIGIN_BUCKET=chillywood-media-origin, MEDIA_ORIGIN_R2_ENDPOINT,
MEDIA_ORIGIN_R2_REGION, MEDIA_ORIGIN_R2_ACCESS_KEY_ID and
MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY. Legacy S3 reads additionally require the
existing S3 configuration. No secrets belong in source or deployment receipts.
Configuring new persistent credential access needs the applicable approval.

Before activation, verify existing credential scope, disk/CPU/memory bounds,
clean synthetic source -> real render -> private create-only readback -> scanner
-> owner-only output proof, interruption/retry, no public asset leakage, and
backlog/error alerts. Then enable only this renderer's worker row and install
the one-job timer. Record immutable deployment/source receipts.

Rollback: disable the renderer gate and stop its timer. Heartbeats fail closed;
no new claims or completion may proceed. Leave originals, durable receipts and
already-created drafts intact. Do not delete unknown/partial provider objects
or undo migration history. Shared retention handles lifecycle after qualification.
