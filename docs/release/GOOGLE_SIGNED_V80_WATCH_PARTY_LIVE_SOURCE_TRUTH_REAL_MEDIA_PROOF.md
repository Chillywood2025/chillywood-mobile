# Google-Signed v80 Watch-Party Live Source-Truth Real Media Proof

Date: 2026-07-07

Verdict: Partial. Real-media Shared Player playback and fullscreen rails are installed-proved after the source follow-up; viewer camera request / host approval remains unproved in the installed packet.

Source commit: `833520e5ba6fad86160b93df1da45cd510b1c433`.

Android EAS Update production runtime `1.0.0`: group `0d23919f-bedb-40b4-9428-6550bdfd765c`, Android update `019f3da7-dcd6-7732-a757-cb36b1bd7c61`.

Pre-proof hardening follow-up: validation-clean and OTA-published on July 7, 2026 from aligned `origin/main`.

## Executive Summary

Watch-Party Live sidecar/shared-player source truth is repaired for the remaining app-controlled gaps found after the real Home-route installed proof. The fix does not change Shared Player fullscreen layout. It canonicalizes Party Room and Player Premium access keys, classifies media so fixture/bundled fallback cannot be counted as strict real Home media proof, requires LiveKit token contracts to match desired host/speaker publish authority, versions camera-seat requests, keeps pending approval on one stable host review path, makes participant bubbles identity-safe, and moves proof coverage onto the real helper module.

The pre-proof hardening follow-up wires the media classifier into Player runtime proof/debug logging and makes local request clears request-version aware. Runtime logs include only redacted source-readiness metadata: party id, source type/id, display name/title, playback URL presence, bundled-fallback boolean, and classification. They do not include full playback URLs or signed URLs. Strict installed closure requires `classification=real-media`; `fixture-or-proof`, `bundled-fallback`, and `missing-source` remain honest Partial media classifications.

Installed Google Play proof is still Partial. R3 visibility was recovered through the already-paired wireless ADB endpoint `10.0.0.27:44639`, which mapped to the expected R3 device; R5 remained visible over USB. Both devices read back Play-installed v80. R5 was Premium active, and R3 renewed Premium through the approved Google Play / RevenueCat sandbox flow and read back Premium active. Backend LiveKit health was green.

The first installed attempt stopped before starting Watch-Party Live because the available Home media card opened Player as `Chi'llywood Originals Proof Fixture`. The follow-up proof surfaced a safe public/playable Home media item, `Chi'llywood City Lights`, with remote playback URL present and no proof/fixture wording; runtime classification for the candidate is `real-media`. R5 hosted room `K4ADLA` from that Home card, R3 joined the same Party Room, and both devices opened the same Shared Player. R5 started actual real-media playback and showed the Sintel trailer frame at `0:04` / `0:52`. R3 reached `Synced · Playing` in the same Shared Player but the video surface stayed black, then later returned to `Synced · Paused` without rendering video. Strict installed closure remains Partial because actual video playback did not appear on both devices. No `Live feed unavailable` or `Live video is temporarily unavailable. Try again in a moment.` alert appeared in this real-media rerun.

The current source follow-up keeps the fullscreen rails unchanged while addressing the two app-controlled proof blockers found in that real-media run. Regular non-fullscreen Shared Player now mounts visible room comments at the bottom by default instead of making comments menu-only behind `Room Comments`. Android shared playback now has a bounded real-media watchdog: `Synced · Playing` without source load/progress is not counted as playback proof, the app logs redacted source/load/progress/watchdog metadata, remounts the `expo-video` shared surface once, falls back to the stable `expo-av` renderer if needed, and shows a clear render-stalled state if both paths fail.

Installed follow-up proof after OTA group `0d23919f-bedb-40b4-9428-6550bdfd765c` / Android update `019f3da7-dcd6-7732-a757-cb36b1bd7c61` used room `38M7L3` with the same strict real-media Home item, `Chi'llywood City Lights`. R5 hosted and R3 joined the same Party Room. Both devices opened the same Shared Player, and actual video frames appeared on both devices after host playback started; R3 no longer stayed on a black surface with only `Synced · Playing`. Regular Shared Player comments were visible at the bottom (`shared-player-visible-comments` mounted), viewer control taps showed `Synced · Controls locked` without mutating host playback, fullscreen preserved the locked three-zone rails with left comments, center video, and right LiveKit bubble rail, fullscreen actual video frames rendered after host restart, and R3 returned to the Party Room.

The remaining camera request / host approval packet used artifact folder `/tmp/google-play-internal-v80-watch-party-live-camera-request-approval-proof-20260707-171433/`. Both devices were visible, Play-installed v80, backend LiveKit health was green, and both devices renewed/read back Premium active through the approved Google Play / RevenueCat sandbox path after normal sandbox expiry. Stale room `38M7L3` returned `Room not found`, so R5 created fresh room `EJPK7C` from the strict real-media `Chi'llywood City Lights` Player path and R3 joined the same Party Room/Shared Player. The packet remains Partial because tapping the viewer's own audience bubble/card did not send or persist a camera request, did not show a visible `Request pending` state, and R5 never received a request badge/review card/approval surface. Viewer comment/reaction send was also not closed in that packet because the attempted bottom-control interaction escaped to Android share/intent UI and was backed out without sending. No matching speaker/canPublish authority or identity-safe approved viewer camera feed is claimed.

The current narrow source follow-up fixes that installed control reachability gap without changing fullscreen rails or the major Shared Player layout. Regular Shared Player now exposes an explicit viewer `Request Camera` button with pending/error proof states; self-bubble taps use the same versioned request path; the host review card exposes stable installed-proof targets; regular comment input/send controls expose stable proof targets; and a reachable regular Shared Player reaction button broadcasts room reactions. Guard/proof coverage rejects Android Share handling in request, comment, and reaction paths and keeps those controls outside the host-only playback lock. This source follow-up is validation-clean and still requires a fresh aligned OTA plus installed proof before closure.

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
- Regular Shared Player comments are visible in the approved lower/bottom placement when `isSharedPartyPlayback && !isPlayerFullscreen`; the button may still focus/toggle controls, but comments are no longer menu-only.
- Android shared playback is render-proof aware. A real-media shared source showing sync state without load/progress triggers a bounded recovery sequence and cannot close installed playback proof from `Synced · Playing` alone.
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

Current installed-proof status:

- R3 is now visible over wireless ADB as `10.0.0.27:44639`; device readback maps to the expected R3 handset.
- R5 and R3 both read back package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `80`, versionName `1.0.0`.
- R5 read back `Premium is active.`.
- R3 completed the approved Google Play / RevenueCat sandbox Premium renewal and read back `Premium is active.`.
- A safe real Home media card was surfaced: `Chi'llywood City Lights`, `sourceType=creator_video`, `sourceId=c28e3838-7d2e-4f48-a8ad-73e3100f8cf1`, `playbackUrlPresent=true`, `usedBundledFallback=false`, `classification=real-media`.
- Room `K4ADLA` documented the earlier R3 black shared-video surface blocker, and the source follow-up now rejects `Synced · Playing` as playback proof unless source load/progress and visible playback are observed.
- Room `38M7L3` on the fresh OTA superseded that black-surface blocker: R5 and R3 both opened the same Shared Player and actual real-media frames rendered on both devices after host playback started.
- Regular Shared Player comments were visible at the bottom, viewer locked-control copy appeared without mutating host playback, fullscreen rails stayed unchanged and rendered actual video after host restart, and R3 returned to Party Room.
- Fresh room `EJPK7C` narrowed the remaining blocker to camera request / host approval: R3's visible self audience bubble/card did not send or persist a request, no pending request state appeared, and R5 never received a request review/approval surface.
- Viewer comment/reaction send remains unproved in the latest packet because the attempted interaction escaped to Android share/intent UI and was backed out without sending.
- Current source follow-up adds explicit regular Shared Player proof targets for `Request Camera`, request pending/error states, host review approve/deny/close, comment input/send, and reaction send. It also routes bubble taps through the same request path and broadcasts regular Shared Player reactions to the room. Installed proof remains required after OTA.
- Strict installed proof remains Partial until the Shared Player viewer camera request is reachable and persistent, host approval succeeds, viewer speaker/canPublish authority matches, and an approved identity-safe viewer camera bubble/feed is visible.
- no sideload, `adb install`, uninstall, clear data, logout, app reset, Premium bypass, manual entitlement grant, provider production mutation, source change, or fullscreen layout change was performed.

Next exact proof/fix step:

1. Commit/push the validation-clean Shared Player reachability source fix and publish a fresh Android OTA from aligned source.
2. Rerun installed proof only after the OTA loads on Google Play-installed devices; carry forward the already-proved real-media playback, regular comments visibility, locked viewer playback controls, fullscreen rails, and return-to-room results unless a fresh regression appears.
3. Close the remaining packet only if viewer comment/reaction works, explicit `Request Camera` sends/persists and shows pending feedback, host review/approve works, the viewer receives matching speaker/canPublish authority, and the approved viewer camera bubble/feed is identity-safe.
