# Google-Signed v80 Watch-Party Live Source-Truth Real Media Proof

Date: 2026-07-07

Verdict: Partial. Watch-Party Live real-media playback, regular comments, locked viewer controls, fullscreen rails, return-to-room, and request/approval reachability have supporting installed proof, but the newest installed photos show the approved-state host/viewer roster and LiveKit bubble/feed presentation is still unstable.

Initial source-truth commit: `833520e5ba6fad86160b93df1da45cd510b1c433`.

Android EAS Update production runtime `1.0.0`: group `0d23919f-bedb-40b4-9428-6550bdfd765c`, Android update `019f3da7-dcd6-7732-a757-cb36b1bd7c61`.

Pre-proof hardening follow-up: validation-clean and OTA-published on July 7, 2026 from aligned `origin/main`.

Control reachability follow-up: source commit `7ec03c5e4fc716a65fad633db1a593906c2012c3` is on `origin/main`; Android EAS Update production runtime `1.0.0` published group `d6828e44-5e61-4329-9721-d4106a97909f`, Android update `019f3eea-b092-7f99-9833-723a9ed710a3`, message `Fix Watch-Party Live controls 7ec03c5`.

Request-control follow-up: source commit `ad1611b9810299a2ffb98cfdefc15d193a2869e2` is on `origin/main`; Android EAS Update production runtime `1.0.0` published group `6f83ca92-a7c8-41f5-b4d3-864998e2823e`, Android update `019f3f06-a76b-7dea-8ad7-f5db9374533b`, message `Fix Watch-Party Live request controls ad1611b`.

Approval persistence follow-up: source commit `67494ab9c1496d39d2f58790f2cab1f66d34ffe9` is on `origin/main`; Android EAS Update production runtime `1.0.0` published group `b8e6bce3-ef2d-4b92-ba69-5727017f6902`, Android update `019f3f4a-13be-74ca-824a-28ba49cc8add`, message `Fix Watch-Party Live approval persistence fallback 67494ab`.

Current post-approval roster/bubble source follow-up: source commit `1e3d24401d8b6953ca7b47385925a995b2e09390` is pushed to `origin/main` and OTA-published to Android production runtime `1.0.0` as group `fc45e3b9-69ee-4303-90b8-2d027397f2f3`, Android update `019f3f77-6bb8-7d48-b8f5-74c1fb60d455`, message `Fix Watch-Party Live roster convergence 1e3d244`. Local source now makes durable active room membership the base Shared Player bubble roster. Realtime presence can enrich display name, speaking state, preview/avatar, request state, and LiveKit render identity, but it cannot remove an active member that membership still says is in the room. Role precedence is room host / membership host first, approved speaker membership or `canSpeak` second, and presence only as fallback. The Player resolves current/tapped participants through the merged roster, passes explicit current-device identity aliases into `LiveKitStageMediaSurface`, and logs membership/presence/rendered-bubble identity diagnostics for missing and duplicate bubble states. This follow-up is not installed-proved until a fresh two-phone packet shows stable host/viewer bubbles and identity-safe approved feed/fallback after approval.

## Executive Summary

Watch-Party Live sidecar/shared-player source truth is repaired for the remaining app-controlled gaps found after the real Home-route installed proof. The fix does not change Shared Player fullscreen layout. It canonicalizes Party Room and Player Premium access keys, classifies media so fixture/bundled fallback cannot be counted as strict real Home media proof, requires LiveKit token contracts to match desired host/speaker publish authority, versions camera-seat requests, keeps pending approval on one stable host review path, makes participant bubbles identity-safe, and moves proof coverage onto the real helper module.

The pre-proof hardening follow-up wires the media classifier into Player runtime proof/debug logging and makes local request clears request-version aware. Runtime logs include only redacted source-readiness metadata: party id, source type/id, display name/title, playback URL presence, bundled-fallback boolean, and classification. They do not include full playback URLs or signed URLs. Strict installed closure requires `classification=real-media`; `fixture-or-proof`, `bundled-fallback`, and `missing-source` remain honest Partial media classifications.

Installed Google Play proof remains Partial for the post-approval roster/bubble/feed state. R3 visibility was recovered through the already-paired wireless ADB endpoint `10.0.0.27:44639`, which mapped to the expected R3 device; R5 remained visible over USB. Both devices read back Play-installed v80. Premium was renewed/read back through the approved Google Play / RevenueCat sandbox flow as the short sandbox windows expired. Backend LiveKit health stayed green during the prior packets.

The first installed attempt stopped before starting Watch-Party Live because the available Home media card opened Player as `Chi'llywood Originals Proof Fixture`. The follow-up proof surfaced a safe public/playable Home media item, `Chi'llywood City Lights`, with remote playback URL present and no proof/fixture wording; runtime classification for the candidate is `real-media`. R5 hosted room `K4ADLA` from that Home card, R3 joined the same Party Room, and both devices opened the same Shared Player. R5 started actual real-media playback and showed the Sintel trailer frame at `0:04` / `0:52`. R3 reached `Synced · Playing` in the same Shared Player but the video surface stayed black, then later returned to `Synced · Paused` without rendering video. Strict installed closure remains Partial because actual video playback did not appear on both devices. No `Live feed unavailable` or `Live video is temporarily unavailable. Try again in a moment.` alert appeared in this real-media rerun.

The current source follow-up keeps the fullscreen rails unchanged while addressing the two app-controlled proof blockers found in that real-media run. Regular non-fullscreen Shared Player now mounts visible room comments at the bottom by default instead of making comments menu-only behind `Room Comments`. Android shared playback now has a bounded real-media watchdog: `Synced · Playing` without source load/progress is not counted as playback proof, the app logs redacted source/load/progress/watchdog metadata, remounts the `expo-video` shared surface once, falls back to the stable `expo-av` renderer if needed, and shows a clear render-stalled state if both paths fail.

Installed follow-up proof after OTA group `0d23919f-bedb-40b4-9428-6550bdfd765c` / Android update `019f3da7-dcd6-7732-a757-cb36b1bd7c61` used room `38M7L3` with the same strict real-media Home item, `Chi'llywood City Lights`. R5 hosted and R3 joined the same Party Room. Both devices opened the same Shared Player, and actual video frames appeared on both devices after host playback started; R3 no longer stayed on a black surface with only `Synced · Playing`. Regular Shared Player comments were visible at the bottom (`shared-player-visible-comments` mounted), viewer control taps showed `Synced · Controls locked` without mutating host playback, fullscreen preserved the locked three-zone rails with left comments, center video, and right LiveKit bubble rail, fullscreen actual video frames rendered after host restart, and R3 returned to the Party Room.

The remaining camera request / host approval packet used artifact folder `/tmp/google-play-internal-v80-watch-party-live-camera-request-approval-proof-20260707-171433/`. Both devices were visible, Play-installed v80, backend LiveKit health was green, and both devices renewed/read back Premium active through the approved Google Play / RevenueCat sandbox path after normal sandbox expiry. Stale room `38M7L3` returned `Room not found`, so R5 created fresh room `EJPK7C` from the strict real-media `Chi'llywood City Lights` Player path and R3 joined the same Party Room/Shared Player. The packet remains Partial because tapping the viewer's own audience bubble/card did not send or persist a camera request, did not show a visible `Request pending` state, and R5 never received a request badge/review card/approval surface. Viewer comment/reaction send was also not closed in that packet because the attempted bottom-control interaction escaped to Android share/intent UI and was backed out without sending. No matching speaker/canPublish authority or identity-safe approved viewer camera feed is claimed.

The current narrow source follow-up fixes that installed control reachability gap without changing fullscreen rails or the major Shared Player layout. Regular Shared Player now exposes an explicit viewer `Request Camera` button with pending/error proof states; self-bubble taps use the same versioned request path; the host review card exposes stable installed-proof targets; regular comment input/send controls expose stable proof targets; and a reachable regular Shared Player reaction button broadcasts room reactions. Guard/proof coverage rejects Android Share handling in request, comment, and reaction paths and keeps those controls outside the host-only playback lock. This source follow-up is validation-clean and OTA-published; installed proof on Google Play devices is still required before closure.

The installed rerun after that OTA used fresh real-media room `ZWZ2KP` and proved the latest control targets were visible by testID, including `shared-player-request-camera-button`, `shared-player-reaction-button`, and `shared-player-visible-comments`. It still remained Partial because tapping explicit `Request Camera` or the viewer self bubble did not produce `Request pending`, and the host did not receive a request surface. Source root cause: `onPressSharedPlayerRequestCamera(...)` had the visible participant, but `requestPartySeat()` recomputed requester identity from a separate party-user/ref path that could be stale and silently return before persisting. The always-visible comments dock also showed only the title while input/send were clipped below the screen. Source commit `ad1611b9810299a2ffb98cfdefc15d193a2869e2` fixes both without changing fullscreen rails: the request path now accepts the visible participant id, and the regular Shared Player comments dock uses a compact input/send layout while fullscreen rail comments remain unchanged. This follow-up is validation-clean and OTA-published; installed proof remains required after group `6f83ca92-a7c8-41f5-b4d3-864998e2823e` loads.

Final pre-proof reachability follow-up: a later installed rerun on fresh room `42L39G` showed the regular Shared Player could still render the bubble/social panel while leaving the request/comment/reaction controls unreachable. Source root cause: those controls were still mounted inside an auto-hide animated overlay gated by `effectiveControlsVisible`, opacity, and pointer events, so Android could expose the content surface and social panel without reachable lower-control proof targets. The source now mounts the regular Shared Player controls in a stable `shared-player-regular-controls` deck outside that hidden overlay gate, keeps `Request Camera`, reaction, host review, error, and comment test targets in the approved lower Shared Player structure, and prioritizes the compact comment input/send row over a clipped title/list. Fullscreen remains unchanged: the left comments rail, center video surface, and right LiveKit bubble rail keep their locked custom layout.

Post-approval installed regression: after the approval-persistence OTA, the newest photos show one phone with no remote bubbles or only the local/self bubble, while the other can show confusing `SPEAKER`/`You` plus a host bubble for the same displayed identity. That invalidates any Closed claim for the approved roster/bubble/feed state. Carry forward only the installed basics already proved: room `38M7L3` real-media playback on R5 and R3, visible regular comments, locked viewer playback controls, fullscreen rails unchanged, and return-to-room, plus prior reachability proof for comment/reaction/request/approval. The final closure still requires a fresh two-phone proof after the roster/bubble source follow-up.

Latest source root cause classification: the approved-state bubble deck was still too dependent on realtime presence and local/self fallback after membership and LiveKit authority changed. That allowed device-local presence gaps or identity alias drift to look like missing remote participants, duplicate self, or stale role labels. The fix moves roster construction into helper-backed source truth: active/reconnecting membership is authoritative, presence cannot delete active members, stale presence cannot demote the room host or downgrade an approved speaker, self fallback cannot duplicate membership rows, and the LiveKit bubble surface receives app participant IDs plus LiveKit identity aliases for identity-safe render/tap mapping.

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
- Regular Shared Player comments use a compact dock layout for the always-visible bottom surface so input/send remain reachable without opening Android Share or moving the fullscreen rails.
- Android shared playback is render-proof aware. A real-media shared source showing sync state without load/progress triggers a bounded recovery sequence and cannot close installed playback proof from `Synced · Playing` alone.
- Watch-Party Live contracts are authority-strict: desired host/speaker publish state is not publish-ready unless the active token contract matches room, identity, role, and canPublish.
- Camera-seat requests carry request versions; duplicate pending events do not reopen an X-closed review for the same request.
- Local camera-request clears are version-aware. Host approval and deny paths pass the captured request version into the local clear before broadcasting the same versioned clear, and legacy unversioned clears cannot erase a newer versioned pending request.
- `Not now` clears the current request, while a new viewer request can surface again.
- Pending approval is one stable host review path. Pending inline approve/dismiss controls and direct seating for non-requesting audience/listener cards are removed.
- Participant-specific LiveKit bubbles only render identity-matched tracks.
- `npm run proof:watch-party-seat-request` imports the real Watch-Party Live helper module instead of duplicating a fake model.
- The explicit `Request Camera` path passes the visible Shared Player participant id into the versioned request helper, so it does not depend on a stale party-user/ref identity.
- Regular Shared Player request/comment/reaction controls now mount in a stable lower control deck outside the hidden auto-hide overlay pointer/opacity gate.
- Regular Shared Player compact comments prioritize the input/send composer so installed proof can tap comment controls without falling through to Android Share/intent UI.
- Post-approval roster convergence now uses `mergeWatchPartyLiveRoster(...)` and `resolveWatchPartyLiveParticipantRole(...)` from the source-truth helper. Durable membership is the base roster; presence enriches only; both host and approved viewer remain visible after approval even if one device misses a presence packet; host remains host; approved viewer becomes speaker/seated; and the Player resolves bubble taps/current participant state from that merged roster.
- Player debug/proof logs now include membership identities, presence identities, rendered bubble identities, missing bubble identities, duplicate bubble identities, and merged role maps. Do not commit raw private identifiers in proof artifacts; use the diagnostics only for local installed triage and redact summaries.

## Proof Boundaries

This installed lane does not yet claim app-controlled Watch-Party Live Shared Player closure. A bundled local video, direct fixture path, or Home item visibly titled as proof fixture still cannot be counted as strict real non-fixture Home media proof. Broader public-production hardening such as load, reconnect, cellular, TURN, metrics, and longer-duration approved camera-feed soak remains outside this closure.

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

The post-approval roster convergence follow-up reran the validation set before OTA. `npm run check:livekit-routing-health` used the local proof env and returned `eligibleServerCount=1`, `heartbeatAgeSeconds=30`, `chillywood-prod-01.status=active`, `livekitNodeStatus=healthy`, and no rejection reasons; the local env file still emitted its known parse warning. `npm run proof:watch-party-seat-request` now reports `postApprovalRosterConvergenceGuarded=true`. `npm run guard:watch-party-livekit`, `npx tsc --noEmit`, `deno check supabase/functions/livekit-token/index.ts`, diff checks, and changed-file secret scan passed. Android EAS Update group `fc45e3b9-69ee-4303-90b8-2d027397f2f3`, Android update `019f3f77-6bb8-7d48-b8f5-74c1fb60d455`, runtime `1.0.0`, was published from source commit `1e3d24401d8b6953ca7b47385925a995b2e09390`.

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
- Latest request-control follow-up reroutes explicit request and self-bubble request through the visible participant id and makes the regular comments dock input/send reachable. Installed proof remains required after OTA group `6f83ca92-a7c8-41f5-b4d3-864998e2823e`.
- Final pre-proof reachability follow-up moves the regular Shared Player control deck outside the hidden auto-hide overlay gate and keeps compact comments focused on input/send. Installed proof remains required after the fresh OTA from this source.
- Strict installed proof is Partial: explicit `Request Camera` / approval reachability has supporting proof, but newest installed photos show the approved roster/bubble/feed state can collapse or duplicate identities. The current source follow-up is OTA-published and must be installed-proved before closure.
- The current source proof now rejects the photo failure mode: an approved two-member room may not render only self, may not drop host/viewer on one device because presence is stale, may not duplicate self fallback, and may not let stale presence override host/speaker membership roles. Installed proof remains required after OTA.
- no sideload, `adb install`, uninstall, clear data, logout, app reset, Premium bypass, manual entitlement grant, provider production mutation, source change, or fullscreen layout change was performed.

Next exact proof/fix step:

1. Validate, push, and OTA the current roster/bubble source follow-up.
2. Rerun the focused installed packet with strict real media and Premium-active Play-installed devices: request/approval, matching speaker/canPublish authority, stable bubbles on both phones, no self-only or duplicate host/self collapse, identity-safe approved feed/fallback, locked viewer controls, fullscreen rails unchanged, and return-to-room.
