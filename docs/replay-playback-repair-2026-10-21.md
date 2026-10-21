# Replay playback source repair

## Scope and evidence boundary

Base: `3232fa37aad43794c9872691381ff523f6006a34`.
Feature manifests: `protected-media-playback`, `live-stage`, and
`watch-party-live` in `config/assurance/feature-registry-v1.json`.

This repair covers the saved-replay route, its Expo Video player lifecycle and
the `creator-replay-playback` HTTP resource proxy. Both Android and iOS use
these sources. Back navigation and native playback controls are retained;
loading, failure and Retry have accessible visible UI. Replay access, rights,
moderation, owner/Circle/public checks and per-resource authorization remain
server-owned and unchanged. No session, entitlement, provider, schema or
configuration changes are included.

The reported Samsung replay was black without progression. Prior metadata
evidence established a Ready row with a playback-record link, not a playable
origin. This investigation did not read private production media or identify
the precise fixture. The defects below are reproduced source defects, not a
claim that the Samsung fixture's root cause has been identified or repaired
on-device. No build, OTA, Edge deployment or physical test was performed.

## Reproduced defects and fixes

- The proxy rewrote only the top-level playlist. Nested variant playlists were
  returned unchanged, so relative segments resolved at the function endpoint
  instead of their actual media directory. Nested playlists now receive the
  same controlled rewrite with their own base directory.
- Redirected playlists also used the original location as their relative base.
  Redirects are now followed explicitly with a bounded hop count and the
  original approved origin/directory checked before every fetch. Playlist
  references resolve against the verified final location.
- HLS URI attributes, including initialization maps, keys and alternate audio
  renditions, were not rewritten. Those resources now use the controlled
  route and retain the replay token. Resources outside the approved source
  origin/directory fail closed.
- Byte-range requests were discarded and partial upstream responses became
  200 responses. Range and 206/416 metadata now survive the proxy. A partial
  nested playlist is fetched whole before rewriting; CORS supports the range
  headers. RFC reference: https://www.rfc-editor.org/rfc/rfc8216.
- The app treated metadata readiness as native playback readiness. Native
  loading/error never appeared and failures had no Retry. Native status is
  now observed, loading is visible, a 30-second load stall becomes retryable,
  and Retry re-resolves access and recreates the native player even when the
  URL is unchanged. Native errors are not displayed verbatim.
- A stalled metadata read could leave Checking replay forever. Its own
  30-second timeout now cancels the HTTP request, presents Retry and ignores
  late results; leaving the route cancels outstanding reads as well.
- Switching replay IDs left the old source playing while metadata loaded.
  Replay identity now keys the player lifetime, releasing the preceding
  player and suppressing its stale callbacks/results immediately.

## Automated evidence

`tests/creator-replay-playback-http.test.mjs` executes the complete production
Edge handler with synthetic database and upstream responses. It covers nested
and extensionless manifests, URI attributes, paths, range semantics, private
tokens and revoked/deleted/blocked access. It makes no live requests.

`tests/creator-replay-player-mounted.test.mjs` mounts the complete production
screen with React and a source-keyed Expo Video double matching the installed
SDK hook. It covers errors, same-URL retry, load timeout, readiness, route
replacement, stale callbacks and unmount cleanup. Native decoding is mocked.

The focused suites pass 26/26. Against unchanged base source they fail 20/26;
the six remaining cases preserve existing behavior. The combined replay and
neighboring media/library/player suites pass 97/97. Full app lint,
`npm run typecheck`, runtime configuration validation, route/navigation tests,
critical UX and pre-activation guards pass. An additional strict TypeScript
check of the Edge source with synthetic external-module declarations finds no
diagnostics; it is not a Deno/provider integration test. Expo Doctor is not
installed in this local workspace, so its no-install invocation did not run.

The standalone historical `guard-save-replay-content-library-policy.mjs`
fails on an unchanged Studio copy assertion, before reaching replay checks:
it expects an old Content Library sentence absent from base source. This
repair does not change the unrelated Studio text or weaken that guard.

## Remaining qualification and rollback

Required Validation must still pass on the exact published head before merge.
Backend source merge is not Edge deployment. Client source merge is not an
installed update. After separately authorized delivery, qualify both platforms
using known playable HLS plus the original failing fixture, verifying first
frame/progression, seek, end, retry, back navigation and repeated replay
selection. Existing physical evidence is not invalidated or relabeled.

Automated fixtures do not establish source availability or provider delivery.
The live spectator-playback endpoint is outside this focused saved-replay
repair. No general HLS/provider completeness claim is made.

Rollback is reverting this focused source change before delivery, or using the
existing separately authorized client/backend rollback procedures after
delivery. Do not change playback authorization or expose raw provider sources
as a workaround.
