# Google-Signed v80 Watch-Party Live Source-Truth Real Media Proof

Date: 2026-07-07

Verdict: Partial until installed proof closes.

Source commit: `44d776fe117386d3cd0a3400d488ed82e11c8bf6`.

Android EAS Update production runtime `1.0.0`: group `d4c9fe3a-1f92-4fa6-8252-5920aecc59b4`, Android update `019f3d20-16a3-772b-9b4e-870e4d9deeeb`.

Pre-proof hardening follow-up: validation-clean on July 7, 2026; fresh OTA mapping is recorded below after publishing from aligned `origin/main`.

## Executive Summary

Watch-Party Live sidecar/shared-player source truth is repaired for the remaining app-controlled gaps found after the real Home-route installed proof. The fix does not change Shared Player fullscreen layout. It canonicalizes Party Room and Player Premium access keys, classifies media so fixture/bundled fallback cannot be counted as strict real Home media proof, requires LiveKit token contracts to match desired host/speaker publish authority, versions camera-seat requests, keeps pending approval on one stable host review path, makes participant bubbles identity-safe, and moves proof coverage onto the real helper module.

The pre-proof hardening follow-up wires the media classifier into Player runtime proof/debug logging and makes local request clears request-version aware. Runtime logs include only redacted source-readiness metadata: party id, source type/id, display name/title, playback URL presence, bundled-fallback boolean, and classification. They do not include full playback URLs or signed URLs. Strict installed closure requires `classification=real-media`; `fixture-or-proof`, `bundled-fallback`, and `missing-source` remain honest Partial media classifications.

Installed Google Play proof is still required before closure. R5 read back Play-installed v80 from `com.android.vending` and launched this OTA, but R3 was not visible over USB, `adb mdns services`, or Bonjour `_adb-tls-connect._tcp`, so the required two-phone proof could not start. The next pass must use Play-installed v80 or newer with latest OTA, Premium-active sandbox testers, strict non-fixture Home media, actual Shared Player playback on both devices, host-only playback authority, viewer comments/reactions/camera request, host approval with matching LiveKit authority, identity-safe LiveKit bubbles, unchanged fullscreen rails, and return-to-room behavior.

## Fullscreen/Layout No-Change

The locked fullscreen layout remains:

- left comments rail;
- center shared video/player surface;
- right LiveKit bubble rail reused from the portrait shared-player surface.

No source change in this lane moves, redesigns, or replaces the Shared Player fullscreen rails. `npm run guard:watch-party-livekit` now fails if the fullscreen path stops using the custom three-zone shared-player row, drops the comments/center/right rails, replaces the right rail with the old non-LiveKit participant panel, or routes shared playback through a normal native fullscreen player.

## Source Repair

Changed source areas:

- `_lib/watch-party/watch-party-live-source-truth.ts`
- `_lib/watchParty.ts`
- `app/watch-party/[partyId].tsx`
- `app/player/[id].tsx`
- `scripts/proof-watch-party-seat-request.mjs`
- `scripts/guard-watch-party-livekit-camera.mjs`

Source behavior now covered:

- Party Room handoff and Player entry use `resolvePremiumAccessKeyForRoom(...)` for consistent Watch-Party Live Premium access checks.
- Media source classification distinguishes real remote media from local bundled fallback, proof fixture copy, and missing source fallback.
- Player runtime now logs redacted Watch-Party Live media source classification metadata when resolving shared playback. This makes installed proof able to distinguish `real-media` from `fixture-or-proof`, `bundled-fallback`, and `missing-source` without exposing private playback URLs.
- Watch-Party Live contracts are authority-strict: desired host/speaker publish state is not publish-ready unless the active token contract matches room, identity, role, and canPublish.
- Camera-seat requests carry request versions; duplicate pending events do not reopen an X-closed review for the same request.
- Local camera-request clears are version-aware. Host approval and deny paths pass the captured request version into the local clear before broadcasting the same versioned clear, and legacy unversioned clears cannot erase a newer versioned pending request.
- `Not now` clears the current request, while a new viewer request can surface again.
- Pending approval is one stable host review path. Pending inline approve/dismiss controls and direct seating for non-requesting audience/listener cards are removed.
- Participant-specific LiveKit bubbles only render identity-matched tracks.
- `npm run proof:watch-party-seat-request` imports the real Watch-Party Live helper module instead of duplicating a fake model.

## Proof Boundaries

This source lane does not claim installed playback closure. The earlier installed run remains Partial until rerun with the repaired source and latest OTA. A bundled local video, direct fixture path, or Home item visibly titled as proof fixture cannot be counted as strict real non-fixture Home media proof.

## Safety

No Premium entitlement logic, Google Play / RevenueCat product behavior, Premium bypass, manual entitlement grant, Watch-Party Party Room logic, Android App Links, LiveKit routing, LiveKit heartbeat, server registry, stale heartbeat cutoff, routing policy, Chi'lly Chat/native calls, auth/RLS, billing/provider production settings, live money, payout, cashout, sideload, `adb install`, logout, clear data, uninstall, or reinstall changed.

No LiveKit tokens, Supabase service-role keys, API secrets, auth tokens, TURN credentials, signed URLs, private env values, raw user IDs, or private identifiers are committed in this proof doc.

## Validation

Validation passed for the source/guard/doc/OTA lane:

- `npm run check:livekit-routing-health` with the local proof env loaded: `eligibleServerCount=1`, heartbeat age under the 120-second cutoff, `chillywood-prod-01` healthy, no recent no-eligible-server blocker.
- `npm run guard:livekit-heartbeat-monitor-policy`
- `npm run guard:premium-sandbox-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run proof:watch-party-seat-request`
- `npm run proof:live-stage-seat-approval`
- `npm run validate:runtime`
- `npm run guard:route-contracts --if-present`
- `npx tsc --noEmit`
- `deno check supabase/functions/livekit-token/index.ts`
- `git diff --check`
- `git diff --cached --check`
- changed-file secret scan

No source change was made to `supabase/functions/livekit-token/index.ts`; the Deno check confirms the existing deployed-source lane remains type-valid.

The July 7 pre-proof hardening follow-up reran the same validation set. `npm run check:livekit-routing-health` used the local proof env and returned `eligibleServerCount=1`, `heartbeatAgeSeconds=4`, `chillywood-prod-01.status=active`, `livekitNodeStatus=healthy`, and no rejection reasons. `npm run proof:watch-party-seat-request` now reports `staleLocalClearPreservedNewRequest=true` and `runtimeMediaClassificationWired=true`.

## Remaining Installed Proof

R3 visibility blocker:

- `adb devices -l` showed R5 and a local emulator only.
- `adb mdns services` found no Android wireless debugging endpoint.
- short Bonjour discovery for `_adb-tls-connect._tcp` found no R3 endpoint.
- macOS USB enumeration showed R5 only.
- no sideload, `adb install`, uninstall, clear data, logout, or app reset was performed.

After R3 is recovered, run installed proof last:

1. Confirm backend LiveKit health is green.
2. Confirm both devices are Google Play-installed v80 or newer with latest OTA.
3. Renew both devices through approved Google Play / RevenueCat sandbox Premium.
4. Use strict real non-fixture Home media.
5. Host opens Watch-Party Live and Party Room.
6. Viewer joins the same Party Room.
7. Host and viewer open the Shared Player.
8. Actual playback appears on both devices.
9. Host-only playback authority holds in portrait and fullscreen.
10. Viewer comments/reactions/camera request still work.
11. Host approval yields matching LiveKit authority.
12. Participant bubbles are identity-safe.
13. Fullscreen rails are unchanged.
14. Return to room works.
