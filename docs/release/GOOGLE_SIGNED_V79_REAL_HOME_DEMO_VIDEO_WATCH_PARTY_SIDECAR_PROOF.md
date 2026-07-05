# Google-Signed v79 Real Home Demo Video Watch-Party Sidecar Proof

Date: 2026-07-05

Verdict: Partial.

Artifact folder: `/tmp/google-play-internal-v79-real-home-demo-video-watch-party-sidecar-proof-20260705-151231/`.

## Executive Summary

Premium remains Closed for this lane, and the earlier fixture-route caveat was addressed by retesting through the installed Home video rail instead of launching a direct fixture route. Both Google Play-installed v79 proof phones re-read active Premium after approved Google Play / RevenueCat sandbox Premium renewal. R5 then launched Watch-Party Live from the visible Home rail video path and R3 joined the same Party Room. The sidecar still did not close because `Open Shared Player` failed before playback with `Live feed unavailable` / `Live video is temporarily unavailable. Try again in a moment.` R3 did not see actual sidecar video playback. The remaining blocker is best classified as Watch-Party Live sidecar LiveKit join-contract/token readiness or room/media handoff, not Premium/provider sandbox.

## July 5 Heartbeat Recovery Follow-Up

The follow-up LiveKit backend investigation in `docs/release/LIVEKIT_SERVER_HEARTBEAT_RECOVERY_WATCH_PARTY_LIVE_STAGE_PROOF.md` narrowed this failure further. Premium remains Closed and Party Room remains Closed. The current backend readback shows the router has zero eligible LiveKit servers because `chillywood-prod-01` has a stale heartbeat beyond the 120-second cutoff. The new health-checked `livekit-heartbeat-monitor` correctly failed closed with `livekit_public_endpoint_unreachable` and did not write a fake heartbeat. Until the real LiveKit host/container/network is restored and a health-checked heartbeat succeeds, this sidecar proof remains Partial for LiveKit infra/runtime liveness rather than Premium or mobile entitlement.

## Repo / Origin Alignment

- Start and proof baseline: `HEAD == origin/main == 97a615a29ab69724f369f913c2e84a13497d9e3e`.
- Source fix commit already in baseline: `aa6d01366b400680a2da692f3164c1862ae6c16c`.
- Tracked tree was clean before proof.
- Pre-existing untracked local artifact/temp paths were left untouched.

## Device / OTA Proof

Both physical proof devices were used from the existing Google Play-installed app:

| Device | Role | Package | Installer | versionCode | versionName |
| --- | --- | --- | --- | --- | --- |
| `R5CR120QCBF` | Host | `com.chillywood.mobile` | `com.android.vending` | `79` | `1.0.0` |
| `R3CXA0DS5JV` | Joiner/viewer | `com.chillywood.mobile` | `com.android.vending` | `79` | `1.0.0` |

No sideload, `adb install`, logout, clear data, uninstall, or reinstall happened.

No new source OTA was published in this lane. The installed app was already on the v79 / runtime `1.0.0` line containing the Premium-gate source fix from commit `aa6d01366b400680a2da692f3164c1862ae6c16c`.

## Premium Status

Both Google Play sandbox Premium subscriptions had expired by normal sandbox cycle timing at the start of this proof. This was not treated as a gate regression.

- R3 opened `/subscribe`, saw the compact sandbox state, completed the approved Google Play sandbox Premium test subscription with the test card, and read back `Premium is active.` in app.
- R5 initially saw a transient unavailable provider/readback state, then after a safe app restart opened the Google Play sandbox Premium sheet, completed the approved sandbox subscription, and read back `Premium is active.` in app.

This was Google Play / RevenueCat sandbox Premium only. No entitlement was manually granted, no service-role write was used, and no live money or provider production setting changed.

## Real Home Demo Video Identification

The installed Home surface was opened on R5. The local bundled `Chicago Streets` title from `_data/titles.ts` was not visible on the current installed Home screen during this proof.

The visible Home rail video used for the proof was the installed Home Rachi Originals card:

- Home card: `Chi'llywood Original`
- Rail/context copy: `Chi'llywood Originals`, `Published Originals from Rachi's official Platform.`, `Ready`, `Public`, `Media Ready`
- Player route after tapping `Watch`: `Chi'llywood Originals Proof Fixture`
- Player metadata: `Chi'llywood · CREATOR VIDEO`, `Creator Video`, playback timing visible as `2:19` / `9:56`
- Source path shown in Party Room: `Creator video`
- Source id shown in Party Room proof: redacted in public docs; raw IDs are not committed here.

Important classification: this run used the real installed Home rail path, not the previous direct fixture/stub sidecar route. However, the visible Home player title still includes `Proof Fixture`, so this proof does not satisfy a strict non-fixture production-media claim. It is valid installed Home-route evidence, but not a final real-user non-fixture media proof.

## Sidecar Host Path Result

R5 host path:

1. Opened Home.
2. Tapped the visible Home rail `Watch` action for the Rachi Originals video.
3. Confirmed the Player opened with playable timing.
4. Tapped `Watch-Party Live`.
5. Reached Party Waiting Room and created Party Room `M77N7M`.
6. Reached Party Room host UI showing the same creator-video context and `Open Shared Player`.
7. Tapped `Open Shared Player`.

Result: Partial. The host did not enter the shared-player sidecar. The app showed:

- `Live feed unavailable`
- `Live video is temporarily unavailable. Try again in a moment.`

A delayed retry after waiting also produced the same alert.

## Sidecar Joiner Path Result

R3 joiner path:

1. Opened Watch-Party entry.
2. Entered room code `M77N7M`.
3. Saw the same creator-video room preview.
4. Tapped `Join Now`.
5. Reached the Party Room viewer UI with the same room/source context and `Open Shared Player`.

Result: Partial. R3 joined the same Party Room successfully, but R3 did not see actual sidecar video playback because the host sidecar handoff failed before shared-player navigation.

## Actual Playback Result

Actual Watch-Party Live sidecar video playback was not seen on R3.

The Player before Watch-Party showed real playback timing for the Home rail video, and both devices reached the Party Room with the same creator-video context. The sidecar itself failed before viewer playback could be observed.

## Error Copy

Exact installed error copy:

- `Live feed unavailable`
- `Live video is temporarily unavailable. Try again in a moment.`

No `Live feed unavailable` closure should be counted as sidecar success.

## Best-Supported Classification

Partial. Premium remains Closed and the installed Home rail path was exercised, but the remaining failure is in Watch-Party Live sidecar readiness after Party Room entry.

The failure happens before Player sidecar playback and before R3 can subscribe to sidecar media. Source inspection shows the `Open Shared Player` path prepares a LiveKit join boundary for `surface=watch-party-live`; when the token/join contract is not ready, the Party Room route shows the alert above. The most likely bucket is LiveKit token/join-contract readiness, room assignment/routing, membership/cost guard response, or source handoff mismatch. The installed proof does not support classifying this as Premium/provider sandbox, viewer playback rendering, or a normal Home Player media-source failure.

The delayed retry still failed, so this was not closed by simply waiting for viewer readiness.

## Source Inspection Notes

- Home's local bundled title `Chicago Streets` is defined in `_data/titles.ts` with bundled `assets/videos/sample.mp4`, but it was not visible on Home during the installed proof.
- The visible installed Home video came from the Home Rachi Originals rail in `app/(tabs)/index.tsx`, which reads creator videos.
- Player source resolution uses `_lib/mediaSources.ts` and `app/player/[id].tsx`.
- Creator-video Watch-Party creation passes a creator-video source through `app/player/[id].tsx` into the Watch-Party room metadata.
- Party Room `Open Shared Player` prepares the `watch-party-live` LiveKit join boundary in `app/watch-party/[partyId].tsx`.
- The unavailable copy comes from the LiveKit token/join contract failure path and is shown before navigation to the shared-player sidecar.

No source change was made in this lane because the installed proof did not identify a small source-only fix that would safely close the sidecar without broader LiveKit/token investigation.

## Docs Updated

This proof supersedes any statement that the latest Watch-Party Live sidecar smoke is blocked by Premium. It also supersedes fixture/stub sidecar evidence as a valid proof claim for the real Home-video lane.

Current status separation:

- Premium-gated access: Closed.
- Watch-Party Party Room: Closed.
- Watch-Party Live sidecar with fixture/stub/direct fixture media: invalid or superseded for this lane.
- Watch-Party Live sidecar through installed Home rail video: Partial with the exact unavailable alert above.
- Live Stage: still Partial unless separately proved to Stage / `2 in room`.

## Safety Confirmation

No Premium bypass, manual entitlement grant, service-role entitlement mutation, sideload, `adb install`, logout, clear data, uninstall/reinstall, provider production mutation, live money, payout, cashout, payable balance, auth/RLS change, native call stack change, LiveKit server restart, secret rotation, or broad WebRTC/LiveKit refactor happened.

No LiveKit tokens, Supabase tokens, service-role keys, API keys, TURN credentials, signed URLs, raw IPs, raw user IDs, private messages, provider secrets, or private identifiers are committed in this doc.

## Validation

Validation artifacts are under `validation/` in the artifact folder.

This lane was proof/docs-only. Relevant source guards and runtime checks were rerun after docs were updated:

- `npm run guard:premium-sandbox-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run proof:watch-party-seat-request`
- `npm run proof:live-stage-seat-approval`
- `npx tsc --noEmit`
- `npm run validate:runtime`
- `npm run guard:route-contracts --if-present`
- `npm run guard:brand-spelling-policy`
- `git diff --check`
- `git diff --cached --check`

## Issues Fixed

- The proof classification is corrected so fixture/stub/direct fixture sidecar evidence is not counted as real Home demo video proof.
- Premium status is kept separate from the current sidecar failure.
- The installed Home rail path, host route, joiner route, and exact sidecar unavailable copy are documented.

## Issues Still Open

- Watch-Party Live sidecar does not yet prove actual R3 playback from the installed Home rail video.
- The visible Home rail video currently carries a `Proof Fixture` title, so a strict non-fixture production-media sidecar proof remains unclosed.
- The sidecar/token join-contract path needs narrow investigation without exposing tokens or secrets.
- Live Stage remains Partial until separately proved to Stage / `2 in room`.
