# Google-Signed v79 LiveKit Proof Reconciliation Smoke

Date: 2026-07-05

Verdict: Partial for current v79 smoke, Closed for proof-history reconciliation.

Artifact folder: `/tmp/google-play-internal-v79-livekit-proof-reconciliation-smoke-20260705-134945/`.

## July 5 Premium Sandbox Follow-Up

The Premium/access blocker language below is superseded by `docs/release/GOOGLE_SIGNED_V79_PREMIUM_GATED_LIVEKIT_SANDBOX_PROOF.md`.

Follow-up source commit `aa6d01366b400680a2da692f3164c1862ae6c16c` fixed the Premium-required CTA/dead-end behavior and was published by EAS Update production Android runtime `1.0.0`, group `743a7dd8-7233-4fac-b56e-4764f88c160b`, Android update `019f33bf-42d3-7bcd-84bc-8fed01845ab1`.

Both Google Play-installed v79 proof phones completed the approved Google Play / RevenueCat sandbox Premium test flow, read back `Premium is active.` in app, and then proved Premium-active Watch-Party Party Room entry on room `VLLM58` with R5 hosting and R3 joining. No real money was charged and no entitlement was manually granted.

Current remaining smoke gaps are no longer Premium access:

- Watch-Party Live sidecar: after Premium active, `Open Shared Player` showed the safe alert `Live feed unavailable` / `Live video is temporarily unavailable. Try again in a moment.`
- Live Stage: fresh Live Waiting Room surfaces loaded and R3 found R5 room `4D9DSZ`, but current proof did not reach Stage / `2 in room`.

The reconciliation below remains valid for proof-history separation, but any statement that the current v79 LiveKit smoke is blocked by Premium/account access should be read as historical and superseded by the Premium sandbox follow-up.

## July 5 Real Home-Route Sidecar Retest

`docs/release/GOOGLE_SIGNED_V79_REAL_HOME_DEMO_VIDEO_WATCH_PARTY_SIDECAR_PROOF.md` supersedes fixture/stub sidecar evidence for the current Watch-Party Live sidecar lane.

The retest used the installed Home rail video path rather than a direct fixture route. Both proof phones were Google Play-installed v79 and both read back active Premium after approved Google Play / RevenueCat sandbox Premium renewal. R5 launched Watch-Party Live from the visible Home rail player, hosted Party Room `M77N7M`, and R3 joined that same room. The local bundled `Chicago Streets` title was not visible on Home during the installed proof; the visible Home rail/player was `Chi'llywood Original` / `Chi'llywood Originals Proof Fixture`, so this is installed Home-route evidence but not strict non-fixture production-media proof.

R5 tapped `Open Shared Player`, and the app showed `Live feed unavailable` / `Live video is temporarily unavailable. Try again in a moment.` on the initial attempt and a delayed retry. R3 did not see sidecar playback. Current sidecar classification is Partial due LiveKit join-contract/token readiness or room/source handoff, not Premium/provider sandbox.

## July 5 LiveKit Heartbeat Recovery Follow-Up

`docs/release/LIVEKIT_SERVER_HEARTBEAT_RECOVERY_WATCH_PARTY_LIVE_STAGE_PROOF.md` narrows the current sidecar and Live Stage blocker further. Backend readback showed `chillywood-prod-01` is registered as `active`, but its heartbeat is stale beyond the 120-second router cutoff, leaving `eligibleServerCount=0`. The new health-checked `livekit-heartbeat-monitor` returned `livekit_public_endpoint_unreachable` and correctly did not update the heartbeat. Until the LiveKit host/container/network is restored and a health-checked heartbeat succeeds, current Watch-Party Live sidecar and Live Stage proof remain Partial for backend LiveKit liveness.

## Executive Summary

This lane reconciles older LiveKit, Watch-Party, Live Stage, and Chi'lly Chat proof language so current docs no longer imply that every LiveKit-related surface is unproved or that diagnostic proof equals installed actual-user proof.

Current truth:

- Watch-Party Party Room installed UI proof is Closed from prior scoped proof, and a current v79 two-phone Party Room smoke passed in this lane.
- Watch-Party realtime callback and playback readback are Closed from the prior scoped realtime/readback proof.
- The 25-participant LiveKit RTC-node media diagnostic is Closed for media subscription and publish-authority downgrade proof.
- Live Stage has prior installed screenshot-backed evidence and diagnostic/media support, but strict actual-user normal waiting-room/entry proof remains Partial. The original current v79 Live Stage smoke hit Premium/account access; that blocker is superseded by the later approved sandbox Premium proof, but Stage / `2 in room` still has not been proved in the current lane.
- Watch-Party Live camera sidecar is source/guard supported; current v79 installed sidecar smoke is no longer Premium-blocked, but the real Home-route retest still failed before playback with `Live feed unavailable`.
- Chi'lly Chat calls are a separate RTC stack, not LiveKit Room proof. Current v79 native Android CallStyle Answer, Decline, same-thread, normal in-app, and room-safe call/banner behavior are Closed in the call-specific docs.

No source, provider, route, Premium-gate, Money Center, creator-money, auth/RLS, native, LiveKit server, or Supabase token behavior changed in this lane.

## Repo / Origin Alignment

- HEAD at start: `d49f97f10ea10ca82a8ab39bb0c8561e452e363a`
- origin/main at start: `d49f97f10ea10ca82a8ab39bb0c8561e452e363a`
- Tracked tree was clean before edits.
- Pre-existing untracked artifact/temp paths were left untouched.

## Device Readback

Both physical proof phones were visible after the user reattached both devices.

| Device | Package | Installer | versionCode | versionName | Result |
| --- | --- | --- | --- | --- | --- |
| `R5CR120QCBF` | `com.chillywood.mobile` | `com.android.vending` | `79` | `1.0.0` | Google Play-installed v79 |
| `R3CXA0DS5JV` | `com.chillywood.mobile` | `com.android.vending` | `79` | `1.0.0` | Google Play-installed v79 |

`emulator-5554` was also visible but was not used as proof because it is not a physical Google Play proof phone.

## Proof History Reconciliation

| Surface | Proof type | Latest known status | What is proved | What is not proved / not claimed | Closed-testing recommendation |
| --- | --- | --- | --- | --- | --- |
| Watch-Party Party Room | Installed UI route/access | Closed | Prior Play-internal installed clients reached expected Watch-Party UI markers. Current v79 smoke reached Party Room on both phones through a proof-only fixture. | This lane did not run a long media/load traversal. | Acceptable for closed testing with gates/off switches; rerun only if a regression appears. |
| Watch-Party realtime sync callback | Backend realtime callback/readback | Closed | Subscription callback was observed after targeted realtime publication fix; playback readback matched. | Not a substitute for every installed UI branch. | Closed. |
| Watch-Party playback readback | Backend state/readback | Closed | Diagnostic readback matched expected playback state. | Not broad installed UI proof by itself. | Closed as backend/readback support. |
| Watch-Party Live camera sidecar | Source/guard plus installed Home-route smoke | Source/diagnostic supported; current v79 smoke Partial | Route ownership, request/approval contract, simulcast/dynacast policy, and proof guards exist. The latest proof used the installed Home rail path, reached Party Room on both phones, and tapped Open Shared Player after Premium active readback. | The visible Home player was still titled `Chi'llywood Originals Proof Fixture`, so strict non-fixture production-media proof is not claimed. `Open Shared Player` failed with `Live feed unavailable` / `Live video is temporarily unavailable. Try again in a moment.` before R3 saw playback. | Acceptable for closed testers if Premium-gated and monitored; public-ready claim still needs non-fixture Home media sidecar playback proof. |
| Live Stage / Live Room | Diagnostic media plus installed screenshot evidence | Diagnostic/media Closed; strict actual-user path Partial | Prior host/participant screenshots showed Live Stage before/after entry evidence; diagnostic LiveKit media subscriptions passed. | Current v79 Live Stage route showed Premium required on both phones; strict normal waiting-room/entry remains unproved here. | Acceptable for closed testers if Premium-gated and monitored; public production still needs current smoke/load/reconnect hardening. |
| LiveKit token endpoint | Backend token contract/router | Remote activated/proof passed historically | Prior redacted token-shape/routing checks passed historically; endpoint validates Supabase auth and server-side secrets. | Current endpoint smoke was not rerun; tokens were not printed. | Acceptable for closed testing with existing controls; public launch should rerun redacted endpoint/log checks. |
| LiveKit server registry/router | Backend routing/registry/drain | Remote activated/proof passed historically | Server assignment, heartbeat, drain/fail-safe, audit rows, and reactivation proof passed for the single-server setup. | Autoscaling, active-room migration, and broader fleet operations are not implemented. | Closed for single-server closed testing; public production needs monitoring/load/runbook hardening. |
| LiveKit 25-participant media diagnostic | RTC-node media diagnostic | Closed | 25 authenticated viewer sessions connected, host synthetic audio/video published, 50 live media subscriptions observed, cleanup completed. | Not normal installed UI proof. | Diagnostic support only. |
| LiveKit publish-authority downgrade | Security/authority diagnostic | Closed | Unauthorized viewer/admin/moderator/owner speaker publish requests were downgraded; viewer publish count stayed zero. | Does not prove every installed host-control UI branch. | Closed for closed testing; host-control UI smoke remains separate. |
| Chi'lly Chat calls | Separate RTC/call stack | Closed for current v79 requested Android behavior | Native Android CallStyle Answer/Decline, same-thread Accept, normal in-app modal, room-safe banner actions, and cleanup are Closed. | This is not LiveKit Party Room / Live Stage proof. | Closed for Android closed testing; classify separately from LiveKit. |
| Room-safe call/banner behavior | Installed v79 room-safe regression | Closed | Compact banner, Decline, Reply in Chat, Leave room and answer, room preservation, and cleanup proved in Party Waiting Room. | Not a full LiveKit media room traversal. | Closed. |

The artifact matrix is saved at `reconciliation-matrix/livekit-proof-reconciliation-matrix.md`.

## Current v79 Smoke Result

Current v79 smoke was narrow and non-destructive.

- Stale fixture attempts for `V79RM1751100` and `V79-SEAT-202607050940` failed closed with `Room not found`.
- A temporary proof-only title room and live room were created through authenticated proof clients, not service-role. They were marked inactive after smoke. No provider, money, payout, cashout, Premium entitlement, auth/RLS, or production fixture state was changed.
- `R5CR120QCBF` and `R3CXA0DS5JV` both opened the temporary Watch-Party Party Room route and showed Party Room, room code, selected title, Open Shared Player, Invite, Report, Leave, and room/bell controls.
- R5 opened the room notification tray without leaving the Party Room. The tray showed user-facing Activity copy and kept the room stable.
- R5 tapped Open Shared Player in the original reconciliation smoke, but Watch-Party Live / camera sidecar entry was then blocked by Premium/access-unavailable state for that account/title. This blocker is superseded by the later Premium sandbox and real Home-route sidecar retests.
- Both R5 and R3 opened the temporary Live Stage route, but both showed Premium required. No Premium gate was bypassed.

## Safety Confirmation

No source change, build, Play production submission, sideload, `adb install`, logout, clear data, uninstall/reinstall, Money Center change, creator-money change, provider mutation, live-money activation, payout/cashout change, Premium bypass, auth/RLS weakening, LiveKit server restart, secret rotation, token endpoint call, or WebRTC/media rewrite happened.

No LiveKit tokens, Supabase tokens, service-role keys, API keys, TURN credentials, signed URLs, raw IPs, raw user IDs, private messages, or private identifiers were committed or documented.

## Validation

Docs-only validation required:

- `git diff --check`
- `git diff --cached --check`

## Recommendation

Do not reopen broad LiveKit production readiness from stale old Partial language. Keep these lanes separate:

- Watch-Party Party Room installed UI/realtime/readback: Closed for closed testing; current v79 Party Room smoke also passed.
- LiveKit RTC-node media diagnostic and publish-authority downgrade: Closed diagnostic support.
- Live Stage strict normal actual-user installed path: Partial; Premium/account access is no longer the current blocker after approved sandbox Premium proof, but Stage / `2 in room` still needs a narrow current-v79 proof.
- Watch-Party Live camera sidecar: source/guard supported; Premium access is no longer the blocker. Current installed Home-route sidecar smoke remains Partial because `Open Shared Player` shows `Live feed unavailable` before viewer playback, and the visible Home media is still titled as a proof fixture.
- Chi'lly Chat calls: separate v79 call stack, Closed for requested Android call behavior.
