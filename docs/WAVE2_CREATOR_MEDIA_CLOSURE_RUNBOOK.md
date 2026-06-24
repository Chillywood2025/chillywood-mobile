# Wave 2 Creator Media Closure Runbook

This runbook tracks the remaining Creator Media Pipeline proof rows after the
owner picker UX, automated owner upload, and scan-safe backend leak fixes.

## Scope

Wave 2 covers:

- creator upload-to-playback;
- VOD/rendition access proof;
- attachment-heavy comments;
- malware scan gates.

Do not use this lane to change LiveKit, notifications, calls, payments,
Premium entitlement behavior, payouts, auth/reset routing, or route ownership.

## Safety Rules

- Use proof-only accounts from `docs/SEEDED_PROOF_HARNESS.md`.
- Do not commit credentials, service-role keys, signed URLs, storage secrets,
  LiveKit tokens, push tokens, provider keys, or proof passwords.
- Do not fake media rows, scan results, malware results, or VOD renditions.
- Do not mark pending scanner or rendition states as production-closed without
  real files/operator proof.
- Clean up proof comments, attachments, and storage objects unless a controlled
  proof run explicitly uses `--keep-proof-rows`.

## Current Closure Script

Run dry-run preflight:

```sh
node scripts/proof-wave2-final-creator-media-closure.mjs
```

Run the safe mutation proof with ignored local proof credentials:

```sh
PROOF_DIR="/tmp/chillywood-wave2-final-closure-setup-proof-$(date +%Y%m%d-%H%M%S)"
node scripts/proof-wave2-final-creator-media-closure.mjs --run --proof-dir="$PROOF_DIR"
```

The script:

- signs in owner and viewer proof users from ignored local env;
- checks `resolve_video_playback` for the clean public creator video fixture;
- verifies regular VOD playback does not expose `original` as a quality;
- verifies direct client `video_renditions` read is not public;
- creates and reads a creator-video comment and reply;
- uploads a small real text attachment through `media-storage`;
- proves pending-scan attachment is not public/non-owner readable;
- proves unsupported and oversized attachment uploads are blocked;
- cleans up proof rows and storage objects by default.

## Required Local Env

At minimum:

- `CHILLYWOOD_E2E_OWNER_EMAIL`
- `CHILLYWOOD_E2E_OWNER_PASSWORD`
- `CHILLYWOOD_E2E_VIEWER_EMAIL`
- `CHILLYWOOD_E2E_VIEWER_PASSWORD`

Optional:

- `CHILLYWOOD_E2E_PREMIUM_VIEWER_EMAIL`
- `CHILLYWOOD_E2E_PREMIUM_VIEWER_PASSWORD`
- `CHILLYWOOD_E2E_CLEAN_PUBLIC_CREATOR_VIDEO_ID`

These values must stay in ignored local env files or a local keychain. Never
commit them.

## Real VOD Ladder Closure

Wave 2 VOD can be marked closed only when a safe creator video has real ready
rendition files and resolver readback proves:

- `360p` / `480p` free rows are ready, scan-safe, and playable;
- `720p` / `1080p` Premium rows are ready, scan-safe, and Premium-gated;
- `original` remains owner/private and is not returned as normal playback;
- direct client access to raw rendition rows/storage signing is denied where
  expected;
- no signed storage URL or raw storage path appears in proof artifacts.

If no real rendition ladder exists, keep the row Pending. Do not insert fake
`ready` rows.

## Android Attachment-Heavy Closure

The backend/API proof can verify comment/reply/link/attachment storage safety,
but Android closure still requires installed-device proof for:

- comment composer keyboard behavior;
- attachment picker UX;
- supported attachment selection where automation can complete it;
- report/hide/delete UI behavior.

If native Android picker automation blocks selection, keep the installed
attachment row Pending and use the backend/API proof as partial coverage.

## Scanner-Down / Operator Closure

Pending, clean, failed, and malware scan gates must fail safe. The repo already
has production scanner proof in `docs/security/MALWARE_SCANNING_READINESS_PLAN.md`,
but scanner-down/operator failure proof should only run during a controlled
operator window. Do not stop or manipulate production scanner infrastructure
from a normal app proof shell.

To close this row later, use an approved operator path and record:

- scanner service status before/during/after;
- disposable benign and blocked fixtures;
- sanitized admin readout;
- public read model denial;
- `media-storage` denial;
- cleanup.

## Play/Internal Installed Proof

Wave 2 Play/internal proof remains external unless the attached device has an
installer readback of `com.android.vending`. Direct APK proof must not be
reported as Play/internal proof.
