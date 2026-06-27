# 25 Seeded Participants Realtime Proof

25 seeded participants realtime proof: Closed / Partial / Blocked.

Final verdict: Partial.

Closed: the 25 proof-only participant identity pack is ready, stored locally, and usable for proof.

Closed: the authenticated RLS plus LiveKit RTC-node diagnostic used 25 seeded participant sessions and proved Live video media subscription, chat-call media subscription, Owner/Admin/Moderator LiveKit publish-authority downgrade, restricted fail-closed behavior, and safe cleanup.

Partial: Watch-Party state readback matched, but the subscribed `watch_party_sync_events` realtime callback was not observed during the diagnostic window. The full Play-internal installed-app realtime UI proof also still needs a second Play-internal v57 active client. At least two active clients are required for realtime proof. Seeded accounts are identities; active clients prove simultaneous behavior.

Partial: second Play-internal v57 active client is still required.

The latest diagnostic artifact is `/tmp/app-25-seeded-participants-realtime-proof-20260627123814/`. The run signed in 25 participant identities, connected 25 LiveKit viewer sessions, observed 50 live media track subscriptions, connected a two-party chat call with 2 media track subscriptions, verified Moderator/Admin/operator/Owner speaker requests were downgraded to viewer/no-publish, and ended the proof rooms. It did not print passwords, service-role keys, LiveKit tokens, push tokens, signed URLs, raw IPs, provider secrets, private messages, private evidence, tax IDs, bank details, or provider transaction/customer/order records.

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
| `R5CR120QCBF` | Google Play internal/closed testing | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` | Valid installed v57 client metadata |
| `emulator-5554` | owner-approved emulator-only sideload from v57 AAB | `com.chillywood.mobile` | `1.0.0` | `57` | `null` | Diagnostic v57 client; not Play-installed |
| RTC-node seeded sessions | authenticated proof clients | LiveKit/Supabase clients | n/a | n/a | n/a | 25 active participant media sessions |

Active clients used by the realtime diagnostic: 25 seeded RTC-node participant sessions, plus creator/callee role sessions for setup and role-control checks. Play-installed v57 app clients currently available: 1.

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
| Installed app two-client UI tile visibility | Partial | needs second Play-internal v57 active UI client |

Live video media behavior is Closed for authenticated RTC-node diagnostic proof. Full installed-app UI tile proof remains Partial until two Play-internal v57 app clients are active in the same room.

## Chat Call Media Proof

| Item | Result | Evidence |
| --- | --- | --- |
| Caller/callee seeded identities ready | Pass | participant credentials present in ignored local env |
| Chat thread setup follows app-safe RLS order | Pass | thread insert does not request row return before memberships exist |
| Two active LiveKit call clients | Pass | latest artifact shows `hostConnected: true`, `participantConnected: true` |
| Host synthetic audio/video publish | Pass | latest artifact shows `hostPublishedAudio: true`, `hostPublishedVideo: true` |
| Participant media subscription | Pass | latest artifact shows `participantTrackSubscriptionsObserved: 2` |
| Cleanup/end-call state | Pass | latest artifact shows `callRoomEnded: true` |
| Installed app two-client call UI/media proof | Partial | needs second Play-internal v57 active UI client |

Chat call media is Closed for authenticated RTC-node diagnostic proof. Full installed-app call UI proof remains Partial until two Play-internal v57 app clients are active in the same call.

## Watch-Party Sync Proof

| Item | Result | Evidence |
| --- | --- | --- |
| Host/participant seeded identities ready | Pass | participant pack present |
| Title Watch-Party source contract | Pass | diagnostic creates title rooms with `source_type: platform_title` and source/title id |
| Sync event insert contract | Pass | diagnostic emits canonical `kind: play` event |
| Room playback readback | Pass | latest artifact shows `readbackStateMatched: true` |
| Realtime sync callback | Partial | latest artifact shows `channelStatuses: [SUBSCRIBED, CLOSED]` but `realtimeEventObserved: false` |
| Installed app two-client player sync UI proof | Partial | needs second Play-internal v57 active UI client |

Watch-Party database state/readback is Closed for the diagnostic path. Watch-Party realtime callback proof remains Partial because the subscribed `watch_party_sync_events` insert was not observed. This is not called fully Closed.

## Simultaneous Multi-User State Proof

| Item | Result | Evidence |
| --- | --- | --- |
| 25 seeded identities | Pass | participant pack proof passed |
| 25 concurrent authenticated LiveKit viewer sessions | Pass | latest diagnostic connected 25 seeded viewer sessions |
| Simultaneous media subscription state | Pass | latest diagnostic observed 50 live subscriptions and 2 chat-call subscriptions |
| Watch-Party state readback | Pass | latest diagnostic readback matched the expected playback state |
| Watch-Party realtime event callback | Partial | callback not observed before channel close |
| Full installed app simultaneous UI state | Partial | needs second Play-internal v57 active UI client |

Real simultaneous media state is Closed for RTC-node diagnostic clients. Full installed-app simultaneous UI proof remains Partial.

## Owner/Admin/Moderator Realtime Controls

| Role | Result | Evidence |
| --- | --- | --- |
| Moderator | Pass | latest artifact shows Moderator speaker request downgraded to viewer/no-publish |
| Admin/operator | Pass | latest artifact shows Admin/operator speaker request downgraded to viewer/no-publish |
| Owner proof | Pass | latest artifact shows Owner speaker request downgraded to viewer/no-publish |

Owner/Admin/Moderator route and authority proof remains Closed in existing one-device and seeded authority lanes. Realtime LiveKit publish-authority control is Closed for the diagnostic path; full installed-app UI control proof remains tied to the second Play-internal v57 client.

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
| `npm run local-run:25-seeded-participants-realtime-diagnostic` | Partial overall after status logic update; latest executed artifact passed hard media checks but left Watch-Party realtime callback Partial |
| `npm run proof:25-seeded-participants-realtime` | Pending validation after this doc update |
| `npm run guard:25-seeded-participants-realtime-policy` | Pending validation after this doc update |

## Guard Results

The realtime guard must continue to fail any false claim that one-device sequential proof is full realtime proof, that 25 identities are 25 active clients without evidence, that service-role is role/permission authority proof, or that sideload/destructive device/provider/money actions happened.

## Remaining Blockers

1. Watch-Party realtime callback did not fire in the RTC-node diagnostic even though the channel reached `SUBSCRIBED` and readback matched. Investigate Supabase realtime publication/filter/client behavior for `watch_party_sync_events`, then rerun only Watch-Party sync.
2. For official Play-internal installed-app realtime UI proof, create or repair a Play-enabled emulator that can install/update `com.chillywood.mobile` from Google Play internal/closed testing to versionCode `57`, or use a second physical Android device enrolled in the same Google Play internal/closed testing track.
3. Rerun installed-app UI proof with at least two active Play-internal v57 clients in the same Live, chat call, and Watch-Party flows.

## Owner Action Items

1. Keep participant and role credentials only in ignored local env files.
2. Do not treat the emulator sideload diagnostic as tester delivery or Play proof.
3. Provide a second Play-internal v57 Android client when full installed-app realtime UI proof is required.

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

Do not mark full realtime proof Closed until the Watch-Party realtime callback is observed and at least two active Play-internal v57 app clients prove installed-app Live video participant visibility, chat call media, Watch-Party sync, and real simultaneous multi-user UI state. The next lane should be a narrow Watch-Party realtime callback investigation or a Play-enabled second-client setup lane, followed by a rerun of only affected realtime flows.
