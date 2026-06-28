# 25 Seeded Participants Realtime Proof

25 seeded participants realtime proof: Closed / Partial / Blocked.

Final verdict: Partial under `docs/release/ACTUAL_USER_PROOF_STANDARD.md`.

Closed: the 25 proof-only participant identity pack is ready, stored locally, and usable for proof.

Closed: the authenticated RLS plus LiveKit RTC-node diagnostic used 25 seeded participant sessions and proved Live video media subscription, chat-call media subscription, Owner/Admin/Moderator LiveKit publish-authority downgrade, restricted fail-closed behavior, and safe cleanup.

Closed: Watch-Party state readback matched and the subscribed `watch_party_sync_events` realtime callback was observed after the targeted Watch-Party realtime publication migration was applied. Follow-up investigation classified the original callback gap as a Supabase Realtime publication/config issue plus a Node proof-runner Realtime auth bridge issue. `supabase/migrations/20260627131501_watch_party_realtime_publication.sql` was applied without running a broad `supabase db push` and without applying unrelated pending migrations. Watch-Party installed UI is Closed. At least two active clients are required for realtime proof. Seeded accounts are identities; active clients prove simultaneous behavior.

Partial: full installed-app two-phone UI traversal was run with `R5CR120QCBF` and `R3CXA0DS5JV`, but under the actual-user proof standard only Watch-Party installed UI remains Closed. Chat Call installed UI and Live installed UI remain Partial until the EAS update is confirmed active on the installed phones and the normal manual call/ring path plus normal Live waiting-room path are rerun without pre-created state.

The latest 25-participant diagnostic artifact is `/tmp/app-25-seeded-participants-realtime-proof-20260627123814/`. The focused Watch-Party callback rerun artifact after targeted migration apply is `/tmp/app-watch-party-realtime-callback-fix-20260627145327/`. The two-phone installed-app UI artifact is `/tmp/app-two-client-installed-app-realtime-ui-proof-20260627152317/`. The actual-user Chat/Live closure doc is `docs/release/ACTUAL_USER_CHAT_CALL_AND_LIVE_CLOSURE.md`. The 25-participant run signed in 25 participant identities, connected 25 LiveKit viewer sessions, observed 50 live media track subscriptions, connected a two-party chat call with 2 media track subscriptions, verified Moderator/Admin/operator/Owner speaker requests were downgraded to viewer/no-publish, and ended the proof rooms. The focused Watch-Party callback rerun subscribed before emitting a unique event, observed the callback, and verified playback readback matched. Actual-user Chat Call and Live UI remain Partial because active update uptake and manual installed-app reruns were not proven after the code fix. Neither run printed passwords, service-role keys, LiveKit tokens, push tokens, signed URLs, raw IPs, provider secrets, private messages, private evidence, tax IDs, bank details, or provider transaction/customer/order records.

The attached physical device `R5CR120QCBF` remains the approved Google Play internal/closed testing client: package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `57`, and EAS update group `d7aac53c-65bb-4bf7-ae69-04bfea248e0a`.

The emulator was repaired only after owner approval for emulator-only sideload diagnostics. `emulator-5554` previously had package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `55`, installer `null`, no Play Store market handler for `market://details?id=com.chillywood.mobile`, and an incompatible signature. The stale emulator-only v55 package was removed, and the v57 AAB from EAS build `d7cec74d-95f5-4cf5-be0e-eb53571efc18` was converted to a universal APK with bundletool, debug-signed locally, sideloaded only onto `emulator-5554`, and launched successfully. The emulator now reports versionName `1.0.0`, versionCode `57`, installer `null`. This is an emulator diagnostic client, not a Play internal tester delivery proof.

No sideload was used on the physical tester phone. No APK install was used as tester proof. No uninstall/reinstall/clear-data happened on the physical tester phone. The only sideload/uninstall action was the owner-approved emulator-only replacement of stale `emulator-5554` v55 with the debug-signed v57 emulator diagnostic APK. No Play production submission happened. No provider mutation happened. No service-role was used as role/permission authority proof. Current First Owner was not touched. liveMoneyEnabled remains OFF. Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF. No LiveKit tokens, push tokens, signed URLs, raw IPs, secrets, private messages, or private evidence were exposed.

Service-role bootstrap is proof-only account creation/repair and is not role/permission authority proof. It was used only to create or repair proof-only `proof_participant_001` through `proof_participant_025` identities and write their credentials to ignored `.env.browserstack-monetization.local`. Owner RPC remains the authority proof for staff roles and scoped permissions.

## Participant Pack

| Account | Status | Credential storage |
| --- | --- | --- |
| `proof_participant_001@chillywood.test` | Ready | ignored local env only |
| `proof_participant_002@chillywood.test` | Ready | ignored local env only |
| `proof_participant_003@chillywood.test` | Ready | ignored local env only |
| `proof_participant_004@chillywood.test` | Ready | ignored local env only |
| `proof_participant_005@chillywood.test` | Ready | ignored local env only |
| `proof_participant_006@chillywood.test` | Ready | ignored local env only |
| `proof_participant_007@chillywood.test` | Ready | ignored local env only |
| `proof_participant_008@chillywood.test` | Ready | ignored local env only |
| `proof_participant_009@chillywood.test` | Ready | ignored local env only |
| `proof_participant_010@chillywood.test` | Ready | ignored local env only |
| `proof_participant_011@chillywood.test` | Ready | ignored local env only |
| `proof_participant_012@chillywood.test` | Ready | ignored local env only |
| `proof_participant_013@chillywood.test` | Ready | ignored local env only |
| `proof_participant_014@chillywood.test` | Ready | ignored local env only |
| `proof_participant_015@chillywood.test` | Ready | ignored local env only |
| `proof_participant_016@chillywood.test` | Ready | ignored local env only |
| `proof_participant_017@chillywood.test` | Ready | ignored local env only |
| `proof_participant_018@chillywood.test` | Ready | ignored local env only |
| `proof_participant_019@chillywood.test` | Ready | ignored local env only |
| `proof_participant_020@chillywood.test` | Ready | ignored local env only |
| `proof_participant_021@chillywood.test` | Ready | ignored local env only |
| `proof_participant_022@chillywood.test` | Ready | ignored local env only |
| `proof_participant_023@chillywood.test` | Ready | ignored local env only |
| `proof_participant_024@chillywood.test` | Ready | ignored local env only |
| `proof_participant_025@chillywood.test` | Ready | ignored local env only |

Existing role accounts included in the realtime proof pack:

| Account | Purpose | Status |
| --- | --- | --- |
| `proof_creator_001@chillywood.test` | Creator/host and creator-money status surfaces | Ready |
| `proof_moderator_001@chillywood.test` | Scoped Moderator controls | Ready |
| `proof_admin_operator_001@chillywood.test` | Scoped Admin/operator controls | Ready |
| `proof_owner_001@chillywood.test` | Owner proof surfaces, not current First Owner | Ready |
| `proof_premium_001@chillywood.test` | Premium-entitled proof state | Ready |
| `proof_nonpremium_001@chillywood.test` | non-Premium gates/status state | Ready |
| `proof_blocked_a_001@chillywood.test` | blocked pair A | Ready |
| `proof_blocked_b_001@chillywood.test` | blocked pair B | Ready |
| `proof_restricted_001@chillywood.test` | restricted fail-closed behavior | Ready |

Bootstrap artifact: `/tmp/app-25-seeded-participants-bootstrap-20260627121415/`.
Readiness proof artifact: `/tmp/app-25-seeded-participants-proof-20260627121436/`.

## Devices / Active Clients

| Client | Source | Package | Version | versionCode | Installer | Realtime proof role |
| --- | --- | --- | --- | --- | --- | --- |
| `R5CR120QCBF` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` | Physical Play-internal v57 UI client |
| `R3CXA0DS5JV` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` | Physical Play-internal v57 UI client |
| `emulator-5554` | owner-approved emulator-only sideload from v57 AAB | `com.chillywood.mobile` | `1.0.0` | `57` | `null` | Diagnostic v57 client; not Play-installed |
| RTC-node seeded sessions | authenticated proof clients | LiveKit/Supabase clients | n/a | n/a | n/a | 25 active participant media sessions |

Active clients used by the realtime diagnostic: 25 seeded RTC-node participant sessions, plus creator/callee role sessions for setup and role-control checks. Play-installed v57 app clients used for installed UI proof: `R5CR120QCBF` and `R3CXA0DS5JV`.

The emulator fix requested first was completed as an owner-approved emulator-only diagnostic sideload of a debug-signed v57 universal APK generated from the v57 AAB. A new or repaired Play-enabled emulator with Google Play internal tester access is still required before the emulator can act as a second Play-installed v57 active client. Sideload remains not approved for tester delivery or Play proof; this emulator sideload is diagnostic only.

## Live Video Proof

| Item | Result | Evidence |
| --- | --- | --- |
| Creator/host identity ready | Pass | `proof_creator_001@chillywood.test` present in local proof env |
| 25 participant identities ready | Pass | `proof_participant_001@chillywood.test` through `proof_participant_025@chillywood.test` present and read back |
| 25 authenticated LiveKit viewer sessions | Pass | latest artifact shows `viewerTokens: 25`, `livekitConnected: 25`, `disconnectedEarly: 0` |
| Host synthetic audio/video publish | Pass | latest artifact shows `hostPublishedAudio: true`, `hostPublishedVideo: true` |
| Viewer media subscription | Pass | latest artifact shows `trackSubscriptionsObserved: 50` |
| Unauthorized viewer speaker request | Pass | latest artifact shows `unauthorizedSpeakerDowngraded: true`, `viewerCanPublishCount: 0` |
| Installed app two-client UI tile visibility | Partial | two physical Play-internal v57 clients were used, but actual-user Live UI still needs rerun through the normal waiting-room path after the update is active |

Live video media behavior is Closed for authenticated RTC-node diagnostic proof. Actual-user Live installed UI proof is Partial.

## Chat Call Media Proof

| Item | Result | Evidence |
| --- | --- | --- |
| Caller/callee seeded identities ready | Pass | participant credentials present in ignored local env |
| Chat thread setup follows app-safe RLS order | Pass | thread insert does not request row return before memberships exist |
| Two active LiveKit call clients | Pass | latest artifact shows `hostConnected: true`, `participantConnected: true` |
| Host synthetic audio/video publish | Pass | latest artifact shows `hostPublishedAudio: true`, `hostPublishedVideo: true` |
| Participant media subscription | Pass | latest artifact shows `participantTrackSubscriptionsObserved: 2` |
| Cleanup/end-call state | Pass | latest artifact shows `callRoomEnded: true` |
| Installed app two-client call UI/media proof | Partial | the previous proof used a narrower same-thread/prepared path; actual-user manual call initiation/ringing remains Partial until rerun after update uptake |

Chat call media is Closed for authenticated RTC-node diagnostic proof. Actual-user Chat Call installed UI proof is Partial.

## Watch-Party Sync Proof

| Item | Result | Evidence |
| --- | --- | --- |
| Host/participant seeded identities ready | Pass | participant pack present |
| Title Watch-Party source contract | Pass | diagnostic creates title rooms with `source_type: platform_title` and source/title id |
| Sync event insert contract | Pass | diagnostic emits canonical `kind: play` event |
| Room playback readback | Pass | latest artifact shows `readbackStateMatched: true` |
| Realtime sync callback | Pass | focused artifact shows `channelStatuses: [SUBSCRIBED, CLOSED]`, `subscribedBeforeEmit: true`, `callbackObserved: true`, `playbackReadbackMatched: true`; targeted migration `20260627131501_watch_party_realtime_publication.sql` applied |
| Installed app two-client player sync UI proof | Pass | focused final installed UI blocker reruns exposed expected Watch-Party UI markers on both physical clients |

Watch-Party database state/readback is Closed for the diagnostic path. Watch-Party realtime callback proof is Closed because the subscribed `watch_party_sync_events` insert was observed and playback readback matched. Root cause classification was realtime publication/config issue plus proof-runner Realtime auth bridge.

## Simultaneous Multi-User State Proof

| Item | Result | Evidence |
| --- | --- | --- |
| 25 seeded identities | Pass | participant pack proof passed |
| 25 concurrent authenticated LiveKit viewer sessions | Pass | latest diagnostic connected 25 seeded viewer sessions |
| Simultaneous media subscription state | Pass | latest diagnostic observed 50 live subscriptions and 2 chat-call subscriptions |
| Watch-Party state readback | Pass | latest diagnostic readback matched the expected playback state |
| Watch-Party realtime event callback | Pass | callback observed after targeted migration apply and Realtime auth bridge fix |
| Full installed app simultaneous UI state | Partial | two physical Play-internal v57 clients were used; Watch-Party installed UI is Closed while actual-user Chat Call and Live UI remain Partial |

Real simultaneous media state is Closed for RTC-node diagnostic clients. Full installed-app simultaneous UI proof is Partial under the actual-user standard.

## Owner/Admin/Moderator Realtime Controls

| Role | Result | Evidence |
| --- | --- | --- |
| Moderator | Pass | latest artifact shows Moderator speaker request downgraded to viewer/no-publish |
| Admin/operator | Pass | latest artifact shows Admin/operator speaker request downgraded to viewer/no-publish |
| Owner proof | Pass | latest artifact shows Owner speaker request downgraded to viewer/no-publish |

Owner/Admin/Moderator route and authority proof remains Closed in existing one-device and seeded authority lanes. Realtime LiveKit publish-authority control is Closed for the diagnostic path. Same-lane installed UI staff artifact reached scoped Moderator/Admin/Owner surfaces without unauthorized escalation.

## Blocked / Restricted Behavior

| Item | Result | Evidence |
| --- | --- | --- |
| Restricted seeded account identity | Pass | `proof_restricted_001@chillywood.test` exists and previous installed role traversal proved fail-closed behavior |
| Restricted realtime private feature denial | Pass | latest artifact shows `restrictedDenied: true` |
| Blocked pair identities | Pass | `proof_blocked_a_001@chillywood.test` and `proof_blocked_b_001@chillywood.test` exist |
| Blocked-pair realtime denial | Human review | latest diagnostic records `blockedPairDeniedOrUnavailable: false`; pair-specific simultaneous room behavior still needs UI/client proof |

## Proof Results

| Command | Result |
| --- | --- |
| `npm run bootstrap:25-seeded-participants` | Pass |
| `npm run proof:25-seeded-participants` | Pass |
| `npm run guard:25-seeded-participants-policy` | Pass |
| `npm run local-run:25-seeded-participants-realtime-diagnostic` | Pass for hard media diagnostics; full installed-app two-phone UI traversal remains separate |
| `node scripts/local-run-watch-party-realtime-callback-proof.mjs` | Pass: callback observed, playback readback matched |
| `npm run proof:watch-party-realtime-callback-fix` | Pending validation after this doc update |
| `npm run guard:watch-party-realtime-callback-policy` | Pending validation after this doc update |
| `npm run proof:25-seeded-participants-realtime` | Pending validation after this doc update |
| `npm run guard:25-seeded-participants-realtime-policy` | Pending validation after this doc update |

## Guard Results

The realtime guard must continue to fail any false claim that one-device sequential proof is full realtime proof, that 25 identities are 25 active clients without evidence, that service-role is role/permission authority proof, or that sideload/destructive device/provider/money actions happened.

## Remaining Blockers

Actual-user Chat Call and Live UI remain open as Partial. Watch-Party installed UI remains Closed.

## Owner Action Items

1. Keep participant and role credentials only in ignored local env files.
2. Do not treat the emulator sideload diagnostic as tester delivery or Play proof.
3. Use the available Play-internal v57 Android clients `R3CXA0DS5JV` and `R5CR120QCBF` for regression realtime UI proof if needed.

## Safety Confirmation

- No sideload was used on the physical tester phone.
- No APK install was used as tester proof.
- No uninstall/reinstall/clear-data happened on the physical tester phone.
- The only sideload/uninstall action was owner-approved emulator-only replacement of stale `emulator-5554` v55 with a debug-signed v57 diagnostic APK.
- No Play production submission happened.
- No provider dashboard mutation happened.
- No Google Play product/base-plan mutation happened.
- No RevenueCat mapping change happened.
- No Stripe mutation happened.
- No purchases were executed.
- No provider refunds were executed.
- No payouts/cashout/withdrawals/transfers happened.
- No Stripe Connect production happened.
- No payable balances were enabled.
- No service-role was used as role/permission authority proof.
- Current First Owner was not touched.
- liveMoneyEnabled remains OFF.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.
- No LiveKit tokens, push tokens, signed URLs, raw IPs, secrets, private messages, or private evidence were exposed.

## Release Recommendation

Full installed-app realtime UI proof is Partial under the actual-user standard. Recommended next lane: confirm update uptake or ship the fix in the next Play internal build, then rerun only actual-user Chat Call and Live UI paths.
