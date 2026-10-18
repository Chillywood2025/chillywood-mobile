# Client image loading audit — October 18, 2026

## Source and scope

Base: `54b36c322796836f8e2d0b6b817a79f978a318d1` (GitHub main, PR567).
The primary local checkout was still at `ee6ef44a` with untracked physical-proof
artifacts. It was preserved. Implementation uses the persistent checkout
`/Users/loverslane/chillywood-client-image-loading-20261018` and branch
`codex/client-image-loading-20261018`.

The last successful implementation workflow was PR567 head `91d18182`, source
run `39060315266`, publisher `39061083345`. Live main rules require the protected
`Chi'llywood / Required Validation` check from app `4707730`; zero approving
reviews are required. The previously recorded Android107/iOS40 builds used
`f600bba0`, a different source. No installed build was inspected or changed here.

This ordinary client task covers Profile, public Platform, creator thumbnails,
Title artwork and the HLS spectator poster transition on Android and iOS. It
changes no dependencies, native capabilities, backend authorization, migrations,
playback format, publication/deployment tooling or release policy. The paused
Studio/backend task and commit `2c7dc0160` were not used. Rollback is a normal
revert of this client PR, with no data or native rollback operation.

## Findings and implementation

| Surface / files | Cause and resulting behavior |
| --- | --- |
| `app/profile/[userId].tsx`, `components/profile/use-profile-presentation.ts` | Rachi's built-in identity has no avatar URL, and the route previously rendered an initial before its profile request completed. Initial loading now has a dedicated skeleton. Only the public official identity has a bounded, session-scoped in-memory metadata snapshot for warm remount; private profiles are not cached across mounts. Fresh null/removal/error results clear prior presentation. Scope changes, unmounts, retries and local replacement retire old responses. Private photo/background display waits for the current privacy result. |
| `components/ui/StableImage.tsx` | The old component hid even native-cache-ready pixels with opacity zero, overlaid a skeleton, and treated `onLoadEnd` as success. The native image is now visible immediately with loading behind it; only `onLoad` marks success. Missing/error states are static, with an accessible retry for failure. Source/identity changes reset synchronously and stale events cannot affect a replacement. Retry does not activate an enclosing media card. |
| `components/ui/ProfileMediaImage.tsx` | Raw image callers default to zero Android fade duration. Exact profile-media URL binding, bearer replacement, authority epoch and `cache: reload` are preserved. Callers can still request a fade explicitly. |
| `app/channel/[userId].tsx`, `components/creator-media/creator-video-card.tsx` | Refocus previously cleared all artwork and content. The completed presentation now remains while the same viewer/session/route/preview scope refreshes; access denial, errors and scope changes hide it. Branding and thumbnail retention keys bind exact owner, asset/storage identity, version and authority. A renewed signed URL is still requested; its predecessor stays visible only until the replacement succeeds or fails. Retry rereads current URLs. No signing parameters are stripped or treated as authorization. |
| `app/spectate-live/[itemId].tsx` | A playback URL previously replaced the poster before native readiness. The poster now remains until `onReadyForDisplay`. Resolver and active-page first-frame timeouts expose retry, and stale callbacks are fenced. Warm row refresh preserves a valid player; source/access/account changes discard it. Inactive pages are not failed for having no first displayed frame. Playback settings and progress tracking remain in place. |
| `app/title/[id].tsx` | Remote poster metadata was ignored when no bundled poster existed. The existing StableImage now receives the remote HTTP(S) source, preserving bundled-art precedence and a real missing state. |

Native backgrounds, theme colors and media sizing remain unchanged. Existing
StableImage consumers also cover Home discovery imagery, Profile feed/card
imagery and both creator-card forms. Raw avatar callers in navigation, Settings,
chat, participant tiles and social feeds receive the default fade improvement.

## Regression evidence

New production-source suites:

- `tests/profile-image-loading-mounted.test.mjs`: actual route hook binding and
  avatar JSX, real React lifecycle, delayed metadata, warm navigation, TTL,
  removal, access/identity transitions, stale/concurrent response, failure,
  timeout and visible retry. Original route/effect can be exercised through
  `PROFILE_IMAGE_SOURCE_ROOT`.
- `tests/stable-image-mounted.test.mjs`: actual StableImage, ProfileMediaImage and
  authority helper; delayed native callbacks, warm mount, signed renewal,
  recycling, bearer/session change, missing/error and retry.
- `tests/platform-image-loading-mounted.test.mjs`: production public route with
  deferred IO, focus/identity/access changes, atomic refresh and exact asset keys.
- `tests/spectate-poster-transitions-mounted.test.mjs`: production page and screen
  expressions, delayed first frame, warm refresh, stale/error/denial/retry and
  active versus inactive timeouts.
- `tests/catalog-image-loading.test.mjs`: actual Title hero JSX/source selection.

Existing Profile audience, profile-media authority, Platform, spectator-entry and
customer-experience checks are retained. The Rachi source-wiring assertion follows
the extracted production hook; the behavior is additionally mounted and tested.

At base `54b36c32`, the initial Profile suite failed 11/12, shared image suite
24/25, Platform suite 11/21, and Title suite 3/4. The spectator pre-fix control
failed the exact poster-retention assertion. These were behavioral assertions,
not accepted setup failures. Later added TTL/concurrency/inactive-page controls
extend the positive suites. Local TAP, baseline snapshots and command results
are retained under the checkout's unstaged `.evidence/` directory.

The inherited shared node_modules lacked the current lockfile's reviewed braces
artifact. Its interrupted broad run is preserved; the task now has an independent
`npm ci --ignore-scripts` installation plus locked ops test dependencies. No
shared dependencies were modified. Hosted exact-head validation remains the
authoritative merge gate and is recorded on the draft PR.

## Limits and separate physical checks

These tests use real production React logic with modeled native hosts and IO.
They cannot establish decoded-bitmap timing, screen-reader traversal, native
layout, installed-device performance or first-frame timing on either platform.
Physical proof must cover cold/slow/offline loads, warm navigation, signed expiry,
account switching, denied/removed media, retry and spectator swiping on both
Android and iOS, against the actual installed source/runtime identity.

Protected profile images intentionally retain network revalidation. Neither a
metadata snapshot nor an `onLoadEnd` callback is claimed to make an uncached
download instantaneous. This task does not add a persistent private bitmap cache.
The existing profile/playback readers sometimes collapse network/HTTP failures
into null or unavailable results; those remain unavailable rather than displaying
old private content. Distinguishing those causes would require separate reader
work.

Raw social-attachment, Explore/My List and spectator-metadata thumbnails still use
their existing native error presentation. No artificial loading-reset defect was
verified there, and they were not broadly rewritten. Home's unused `renderHomeHero`
helper also ignores remote posters; that dormant path is unchanged. No emulator,
simulator, cloud security review, app binary build, OTA, deployment, purchase or
provider/security-setting change was performed. Merge remains with the established
handoff after exact-head validation and diff review.
