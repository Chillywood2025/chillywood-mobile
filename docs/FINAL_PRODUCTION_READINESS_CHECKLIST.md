# Final Production Readiness Checklist

## Validation blocker cleanup

brand-spelling-policy is now clean. route-contracts guard is now clean. supabase db push --dry-run is now clean.

Root causes were generated legal-site brand anchors with `chi-llywood`, proof-script redaction regex literals with a contiguous lowercase brand token, stale Live Stage route guard expectations, stale paid Watch-Party ticket callback scope, and Supabase migration drift. The cleanup regenerated public legal pages from the safer slugifier, aligned route guards to the locked dynamic Live Stage route, renamed direct-chat migrations to match remote history, applied six older local hardening migrations after a clean include-all dry-run, and verified ordinary `supabase db push --dry-run` reports the remote database is up to date.

No database reset, data drop, migration squash, production Play submission, provider/live-money mutation, Premium change, RLS weakening, auth weakening, chat/account-status permission weakening, logout, uninstall, reinstall, or clear-data happened. Source fixed is not installed-app proof. Google Play internal install is not enough without actual user flow proof. No service-role chat/social proof was counted. liveMoneyEnabled remains OFF.

## Chi’lly Chat delete/hide conversation

Source status: fixed. Installed-app status: Pending until a Google Play internal build and actual user flow proof exercise the long-press hide path.

Delete from my inbox is a per-user hide, not a hard delete. The other participant’s copy is not deleted. Message and call history are preserved. Hidden direct threads must not create duplicate direct threads. Profile/Search → Chi’lly Chat must reopen the existing direct thread. Do not hide identity bugs by deleting rows. Proof Normal / @user230456 is a legitimate separate proof account/thread and may be hidden from the tester inbox without renaming or merging.

Implementation adds `chat_thread_members.hidden_at`, authenticated `hide_chat_thread_from_inbox` and `unhide_chat_thread_for_me`, app-side inbox filtering for the current user, and a long-press inbox action with confirmation copy: `This removes the conversation from your inbox. It does not delete it for the other person.` The shared `chat_threads`, `chat_messages`, call events, call invites, moderation, and other participant inbox state are preserved.

Source fixed is not installed-app proof. Google Play internal install is not enough without actual user flow proof. installerPackageName must be com.android.vending. Sideloaded APK proof is not accepted. No logout, uninstall, reinstall, or clear-data happened. No auth/RLS/chat/account-status permission weakening happened. No service-role chat/social proof was counted. No provider/live-money mutation happened. liveMoneyEnabled remains OFF.

## Direct thread messaging UX restoration

Source status: fixed. Installed-app status: Closed for Play-installed Android versionCode `63`.

Chi’lly Chat direct thread must remain a real messaging thread. Calls live inside the thread, but must not replace the thread. Actual chat content must remain primary. Call event rows must not dominate the direct thread. Thread status UI must not push real chat content out.

The source fix in `app/chat/[threadId].tsx` restores a message-first direct-thread hierarchy while preserving in-thread voice/video calls, call event history, active-call state, composer, and attachments. Google Play internal install is not enough without actual user flow proof; this item has both Google Play install readback and actual thread-flow proof. EAS Build `1c7c497e-805f-4a30-9f67-ff34ed945645` / EAS Submit `7f4bd948-3554-42e7-926f-b3659bde5a5a` delivered versionCode `63` from commit `82364c4dccffa1c60e66a5ee10bbb4ad186fa920`. Both attached phones updated from Google Play internal testing with `installerPackageName=com.android.vending`; the `user230455` direct thread showed fresh header identity, Voice Call / Video Call actions, `MESSAGE THREAD`, `Chat stays primary`, compact `RECENT CALLS IN THIS THREAD`, and the `Write a message` composer. Sideloaded APK proof is not accepted. No logout, uninstall, reinstall, or clear-data happened. No auth/RLS/chat/account-status permission weakening happened. No service-role chat proof was counted. No provider/live-money mutation happened, and `liveMoneyEnabled` remains OFF.

Chi'lly Chat Google-signed v60 Direct Chat + Call proof: Partial in `docs/release/GOOGLE_SIGNED_V60_DIRECT_CHAT_CALL_PROOF.md`. EAS Build `8642fea7-b782-4c18-98c8-5805b6c7c20e` produced Google Play internal Android App Bundle versionCode `60`, versionName `1.0.0`, commit `c08c4bd1d98d3ea6672df5c3441c8d7b232b6b82`, and EAS Submit `7c6dd61c-16e9-4cd8-84b4-db489c19f794` submitted it to Google Play internal only. Both attached phones updated only through Google Play with installer `com.android.vending` and stayed signed in: `R5CR120QCBF` lastUpdateTime `2026-06-28 16:49:54`, `R3CXA0DS5JV` lastUpdateTime `2026-06-28 16:49:28`, both package `com.chillywood.mobile`, versionCode `60`. Settings/Profile/Chat search showed fresh `@user230455`, and visible Chat search -> direct-thread open passed after targeted authenticated Supabase RPC ambiguity/member-upsert migrations. A receiver banner thread-readback migration fixed the installed blocker where tapping the app-wide incoming voice-call banner opened `This Chi'lly Chat thread could not be found.`; after the fix, R5 tapped the real banner and both phones showed `2 in call`. Source now adds a shared responsive layout foundation and fixes the video layout issue where the bottom feed could be cut off by controls and participant metadata covered too much video. Video tiles must adapt to phone size instead of hard-coded device hacks, but fullscreen video fit is not Closed until proved on installed app and iOS/tablet/foldable proof remains Pending unless tested. Actual-user call closure remains Partial because installed v60 recorded a false `Missed voice call` after the joined call ended, the cleanup/responsive video layout source fixes are not installed in a Google Play build yet, and video, background push/ringing, receiver same-thread rerun, decline/missed, and full call cleanup are not Closed. Existing Chat inbox row metadata can still show stale `@user230456`. No logout, uninstall, reinstall, clear-data, sideload, Play production submission, auth/RLS/chat/account-status permission weakening, service-role chat proof, provider/live-money mutation, or `liveMoneyEnabled` activation happened.

Chi'lly Chat Google-signed v61 responsive video proof: Closed for Android two-phone installed responsive layout and Partial for broader call/cross-platform closure in `docs/release/GOOGLE_SIGNED_V60_DIRECT_CHAT_CALL_PROOF.md`. EAS Build `bc2e9532-6a1e-4174-a153-679345c6ef20` produced Google Play internal Android App Bundle versionCode `61`, versionName `1.0.0`, commit `70b276c336b1164a674a8ae51b421e0a039d0d35`, and EAS Submit `36c7bae7-4181-4c67-ac46-75070f76142f` submitted it to Google Play internal only. Both attached phones updated only through Google Play with installer `com.android.vending`: `R3CXA0DS5JV` lastUpdateTime `2026-06-28 19:05:47`, `R5CR120QCBF` lastUpdateTime `2026-06-28 19:06:13`, both package `com.chillywood.mobile`, versionCode `61`. Owner -> user Direct Chat video proof passed with receiver banner tap, readable thread/call surface, `2 in call`, local/remote video on both phones, no bottom feed cutoff, no bottom control overlap, compact participant metadata, Back to Thread, End Call, no visible false missed-call text after joined video calls, and repeated call after end using a new room. iOS/tablet/foldable proof remains Pending unless tested; background push/ringing, decline/missed/background cleanup, user -> owner direction, and stale existing inbox metadata remain Partial. No logout, uninstall, reinstall, clear-data, sideload, Play production submission, auth/RLS/chat/account-status permission weakening, service-role chat proof, provider/live-money mutation, or `liveMoneyEnabled` activation happened.

Cross-surface stale identity metadata fix: Classified after Play-installed versionCode `63` proof and sanitized DB readback. One user identity must render consistently across profile, chat, search, circle, followers, and following. Fresh remote profile must win over stale AsyncStorage and stale participant snapshots where the same user is involved. Settings/Profile/Chat must agree on the current handle. Circle/Followers/Following must not keep stale handle metadata as primary identity. Existing inbox rows must not show stale participant metadata as primary identity. Platform/owner/admin/moderator/creator surfaces now prefer the same fresh profile identity source where available, while role badges remain separate from handle/name/avatar identity. Fresh Profile, fresh Chat inbox/filter row, and fresh direct-thread header showed `user230455` / `@user230455`. The old `Proof Normal` / `@user230456` row was reproduced and read back safely; it is a legitimate separate proof account/thread with a different redacted user hash from `user230455`, no duplicate thread for that pair, and no stale member/profile disagreement for that stale member. Do not hide or delete stale rows just to pass proof. Source commit `8938356` updates existing-thread People copy to `Already in your threads. Open the matching thread below.`, but source fixed is not installed-app proof.

Chi'lly Chat handle freshness/direct-thread open blocker: after v59, Owner/Admin -> normal-user Chat People search finds `user230455 @user230455` with visible `Chi'lly Chat`, `Voice Call`, and `Video Call`, but installed v59 fails before direct-thread open/create with safe copy: `Unable to open Chi'lly Chat with this person right now.` Owner evidence also showed Settings current handle `@user230455` while normal Profile and the existing Chat thread still showed stale `@user230456`. Source now fixes profile cache freshness and direct-thread open/create repair, but this requires a new Google Play internal build and actual-user proof before Chat call closure can proceed.

Chi'lly Chat Google Play internal actual-user call proof: Partial in `docs/release/CHILLY_CHAT_GOOGLE_PLAY_INTERNAL_CALL_CLOSURE.md`. EAS Build `7cf16ebe-a3de-4efb-8170-63a5e9799653` produced Android App Bundle versionCode `59`, and EAS Submit `0c9b2162-c259-4934-a0e8-5679f524b609` submitted it to Google Play `internal` only. Both physical phones updated through Google Play internal testing (`R5CR120QCBF`, `R3CXA0DS5JV`, package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `59`, versionName `1.0.0`) and stayed signed in. Actual-user call proof is not Closed: no fresh v59 end-to-end Voice/Video Call completed through normal visible paths with receiver-visible incoming state, background push/ringing, local/remote video, fullscreen fit, and call end/decline/missed cleanup proof. Same-thread proof is not enough. Google Play internal install is not enough without actual user flow proof. No logout, uninstall, reinstall, clear-data, sideload, Play production submission, auth/RLS/chat/account-status permission weakening, service-role chat proof, provider/live-money mutation, or liveMoneyEnabled activation happened.

Chi'lly Chat Play v58 actual-user call proof: Partial in `docs/release/CHILLY_CHAT_PLAY_V58_ACTUAL_USER_CALL_PROOF.md`. Source commit `0a22ab3e2612d4f888b4f56eac03c0639cac26ae` was pushed and aligned with `origin/main`, and both attached phones were verified Play-installed v58 (`R5CR120QCBF`, `R3CXA0DS5JV`, package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `58`, versionName `1.0.0`). Actual-user call proof is not Closed: the owner said the search problem was fixed separately and not to use the v58 search box until v59, receiver elsewhere-in-app did not visibly show the app-wide incoming call banner on R5, background push/ringing was not proved, and video local/remote proof on both phones was not captured. Same-thread proof is not enough. Source fixed is not installed-app proof. v58 installed is not enough without actual user flow proof. No auth/RLS/chat/account-status permission weakening happened, no service-role chat proof was counted, no provider/live-money mutation happened, and liveMoneyEnabled remains OFF.

Play internal v58 binary delivery: Closed for build and submit to Google Play internal track in `docs/release/PLAY_INTERNAL_V58_BINARY_DELIVERY.md`. EAS Build `b6bbe9d0-5e32-4ef8-b611-f68acec0bd2e` produced Android App Bundle versionCode `58`, runtime `1.0.0`, commit `f6869be8ed37890b564b7d6f2c818283dde923fc`, and EAS Submit `cb94e585-4330-4ed5-999c-a240b68b1f28` submitted to Google Play `internal` track only. This is not a Play production submission and not a provider mutation. Testers must update from Play internal before actual-user Chat/Live proof can close. No physical phone sideload, uninstall/reinstall/clear-data, live money activation, payout/refund execution, auth/RLS/Premium/chat/account-status/staff weakening, First Owner touch, or secrets exposure happened.

Play-internal two-phone Chat/Live proof: Partial in `docs/release/PLAY_INTERNAL_TWO_PHONE_CHAT_LIVE_PROOF.md`. Commit `873bb515e73930ef1b1cb6fb047293e18ce84449` was published by EAS Update to `production`, runtime `1.0.0`, update group `ccf8ee01-efa6-4792-bd4a-bf7e015bcd36`, Android update `019f0c20-a752-7fd2-a61e-c9fa1a27a734`, but installed-app update pickup was not confirmed because both physical Play-internal v57 phones logged `CheckCompleteUnavailable` and the release app is not debuggable for local update DB readback. Both phones were attached and launched from Play internal: `R5CR120QCBF` and `R3CXA0DS5JV`, package `com.chillywood.mobile`, installer `com.android.vending`, version `1.0.0`, versionCode `57`. Supporting automation showed Chat profile-to-chat blocked by visible `Profile unavailable`, and Live blocked by active Premium-required/status gates on both phones. Source fixed and EAS Update published are not installed-app Closed. Actual-user Chat video, fullscreen RTC fit, Live remote video, and Live host controls remain Partial until Robert/testers reproduce them in the Play-internal installed app. No sideload, destructive device action, provider/live-money mutation, auth/RLS/Premium/chat/account-status/staff weakening, or secrets exposure happened.

Cross-lane actual-user product QA sweep: Partial for actual-user installed-app closure. `docs/release/CROSS_LANE_ACTUAL_USER_PRODUCT_QA_SWEEP.md` reviewed recent screenshots, XML, logs, artifacts, release docs, proof scripts, user-facing realtime surfaces, Owner/Admin/Moderator surfaces, and proof-label claims. Small safe visible issues were fixed: Chi'lly Chat remote video now renders from actual stream URL presence instead of stale `cameraOn`, call/room count copy no longer says every peer is `connected`, and Live Stage remote video renders from stream URL presence. Actual-user installed-app proof remains Partial until both physical Play-internal phones pick up this code and reproduce the normal visible Chat Call and Live waiting-room paths. Proof scripts passing is not enough, diagnostic/backend proof is not actual-user proof, and if Robert/testers cannot reproduce it in the Play-internal installed app, it is not actual-user Closed. No auth/RLS/Premium/chat/account-status/staff permission weakening happened, no provider/live-money mutation happened, and liveMoneyEnabled remains OFF.

Chat Call remote-video / Live action UX sweep: Partial for actual-user proof. `docs/release/CHAT_CALL_REMOTE_VIDEO_LIVE_ACTION_UX_SWEEP.md` records source fixes for remote video not appearing, direct Chat fullscreen video layout/control overlap, compact participant metadata, a shared responsive foundation for Direct Chat video, and Live Watch-Party host action controls staying open/stuck after seat update failure. Actual-user installed-app proof remains Partial until both physical Play-internal phones run the updated code and reproduce the normal visible Chat Call and Live waiting-room paths; cross-platform responsive support is not Closed without tested device/simulator coverage. No physical phone sideload, provider mutation, live money activation, payout/refund execution, RLS/Premium/auth weakening, or secrets exposure happened.

Actual-user Chat Call and Live correction: `docs/release/ACTUAL_USER_CHAT_CALL_AND_LIVE_CLOSURE.md` is the current governing realtime result. Diagnostic media and backend readback remain Closed, Watch-Party installed UI remains Closed, but actual-user Chat Call proof is Partial and actual-user Live UI proof is Partial until the EAS update group `bc66e544-d7b8-44d7-8236-9957f378b95a` is confirmed active on the Play-internal phones or shipped in the next Play internal build, then manually rerun through the normal visible app paths. Pre-created thread/call state was not counted as actual-user Closed. `chat_threads` RLS was not weakened. Premium gates were not bypassed or weakened. No service-role chat permission proof was used. No provider mutation happened. liveMoneyEnabled remains OFF.

25 seeded participants realtime proof: Partial in `docs/release/TWENTY_FIVE_SEEDED_PARTICIPANTS_REALTIME_PROOF.md` because diagnostic realtime media/callback proof is Closed while installed-app UI closeout remains Partial. Targeted Watch-Party realtime migration apply: Closed in `docs/release/TARGETED_WATCH_PARTY_REALTIME_MIGRATION_APPLY.md`. Watch-Party realtime callback fix: Closed in `docs/release/WATCH_PARTY_REALTIME_CALLBACK_FIX.md`. Two-client installed-app realtime UI proof: Partial in `docs/release/TWO_CLIENT_INSTALLED_APP_REALTIME_UI_PROOF.md`, with final blocker details in `docs/release/FINAL_INSTALLED_REALTIME_UI_BLOCKERS.md`. The 25 proof-only participant identity pack is Closed. The latest authenticated RLS plus LiveKit RTC-node diagnostic at `/tmp/app-25-seeded-participants-realtime-proof-20260627123814/` proved 25 seeded participant sessions, 25 LiveKit viewer connections, 50 live media subscriptions, chat-call media with 2 subscriptions, Owner/Admin/Moderator publish-authority downgrade to viewer/no-publish, restricted fail-closed behavior, and cleanup. Only `supabase/migrations/20260627131501_watch_party_realtime_publication.sql` was applied to add `watch_party_rooms`, `watch_party_room_memberships`, `watch_party_room_messages`, and `watch_party_sync_events` to `supabase_realtime`; no unrelated pending migrations were applied, no broad `supabase db push` was run, RLS remained enabled, and no money/provider/payout tables changed. Focused Watch-Party artifact `/tmp/app-watch-party-realtime-callback-fix-20260627145327/` shows `SUBSCRIBED`, event emitted after subscription readiness, `watch_party_sync_events` callback observed, and playback readback matched. Two physical Play-internal v57 clients, `R3CXA0DS5JV` and `R5CR120QCBF`, were used in installed-app UI proof and affected reruns; matrix totals are 6 Closed, 3 Partial, 0 Blocked, 0 Failed. Watch-Party installed UI markers are Closed on both phones. Remaining installed-app UI blockers are direct chat-call setup through `chat_threads` RLS after app-safe setup-order repair, and Live participant UI Premium-required/status gates requiring a second Premium-capable seeded client or safe existing proof entitlement path. Premium gates were not bypassed or weakened, `chat_threads` RLS was not weakened, and no auth/account-status/chat permission bypass was added. The owner-approved emulator-only v57 sideload is diagnostic only, not tester delivery or Play proof. No physical tester phone sideload, install/uninstall/reinstall/clear-data, Play production submission, provider mutation, service-role authority proof, First Owner touch, purchase, refund, payout, live money activation, or secret/token/private-data exposure happened.

Stable seeded proof account pack: Closed in `docs/release/STABLE_SEEDED_PROOF_ACCOUNT_PACK.md`. All ten proof-only `@chillywood.test` accounts are created/reused/repaired and proved usable for repeat local proof use, with all credential pairs stored only in ignored `.env.browserstack-monetization.local`. Service-role bootstrap was used only for proof-only account creation/repair and proof-only fixtures; service-role bootstrap is not role/permission authority proof. Owner RPC staff grant path remains the authority proof and was used for Moderator/Admin role/scopes where possible. Seeded account installed login bridge is Closed for every non-restricted seeded proof account in `docs/release/SEEDED_ACCOUNT_INSTALLED_LOGIN_BRIDGE.md`; `proof_restricted_001` fails closed by backed account state as expected. One attached device full app automation proof is Closed for one-device route/control traversal after affected-only closure in `docs/release/FIVE_REMAINING_ONE_DEVICE_TRAVERSAL_BLOCKERS.md`: Play-installed v57 package/launch/readback and seeded UI login passed on `R5CR120QCBF`, with updated status counts Pass `80`, Human review `28`, Blocked `0`, Two-device required `4`, Fail `0`. Prior route-marker/control-proof blockers for normal `/chat`, normal `/admin`, creator `/channel-studio`, creator `/creator-monetization-setup`, and creator `/payouts` are Closed; two-device live/watch-party/chat-call proof remains required. Current First Owner was not touched, no real users were modified, no credentials were printed or committed, no auth bypass/RLS/account-status weakening happened, no provider mutation happened, and live money/payout/provider systems remain OFF/manual/external.

Play internal/closed testing AAB upload + tester smoke: Closed for Play internal v57 install and launch smoke in `docs/release/PLAY_INTERNAL_TEST_AAB_UPLOAD_TESTER_SMOKE.md`. The approved tester delivery path is Google Play internal/closed testing. The sideload v56 APK path was not owner-approved for tester delivery and must not be used for testers. The first Play update failed because a sideloaded v56 APK was installed on device `R5CR120QCBF`; the sideloaded package was removed so the approved Play internal v57 build could be installed. Play internal v57 installed successfully from Google Play with installer `com.android.vending`, package `com.chillywood.mobile`, version `1.0.0`, versionCode `57`, and launched as `com.chillywood.mobile/.MainActivity` with no fatal crash in the captured launch log window. This is install/launch smoke only, not full tester QA; testers still need to run current non-money flows. Future tester delivery must use Google Play internal/closed testing only unless the owner explicitly approves sideload in writing. Play production submission/promotion did not happen. No Google Play product/base-plan mutation, RevenueCat mapping change, Stripe mutation, purchases, provider refunds, Premium public purchase, live money, creator-money, payouts, Stripe Connect, or merch behavior changed.

Android tester binary build / install smoke: Partial in `docs/release/ANDROID_TESTER_BINARY_BUILD_INSTALL_SMOKE.md`. EAS internal Android APK build profile `production-apk` produced build ID `9e31b4b1-bd02-405c-8eeb-7aae3550d598`, package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `56`, runtimeVersion `1.0.0`, and APK SHA-256 `5ab5390291a1556c85b1eda0fb66290181c035f17711d9f316b68070af0ace16`. Install-over-existing attached-device installs failed safely with signature mismatch; no uninstall was performed. Because prior successful tester install was Play/closed-testing, EAS store AAB profile `production` also produced build ID `d7cec74d-95f5-4cf5-be0e-eb53571efc18`, versionCode `57`, runtimeVersion `1.0.0`, and AAB SHA-256 `a71b8a9b8e35a284e62b7843df5c7f16ba94c54487ca63bcf67aba04598c9efa` for Play internal/closed testing upload outside this lane. After install attempts, the owner instructed no use attached device, so no further attached-device install/smoke actions are part of this lane. No production Play submission, provider mutation, purchase, refund, Premium activation, live money, creator-money, payout, Stripe, or merch behavior changed.

Tester build / current runtime delivery: Partial in `docs/release/TESTER_BUILD_CURRENT_RUNTIME_DELIVERY.md`. EAS Update was sufficient and published to branch `production` with update group `4a21c89b-35ca-4997-8c62-28bb20f90469`, runtimeVersion `1.0.0`, and commit `25ecf6d55180144b7202c901c163f9e28e469609`. Installed Android device `R5CR120QCBF` launched package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `55`, installer `com.android.vending`; update uptake was not observed during the short smoke window, so testers should restart on a validated network. This lane did not submit the app to production and did not mutate Google Play, RevenueCat, Stripe, payouts, purchases, refunds, or provider dashboards. Safe public non-money systems remain enabled. Premium public purchase remains OFF. `live_money_enabled` remains OFF. Creator-money remains OFF. Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF. Provider refunds remain manual/external.

Final store/release readiness and Play submission packet alignment: Partial in `docs/release/FINAL_STORE_RELEASE_READINESS_PLAY_SUBMISSION_PACKET.md`. This lane did not submit the app to production. This lane did not mutate Google Play, RevenueCat, Stripe, payouts, purchases, refunds, or provider dashboards. Safe public non-money systems remain enabled. `live_money_enabled` remains OFF. Creator-money remains OFF. Premium public purchase remains OFF. Premium monthly public purchase remains a separate owner-approved proof lane. Premium annual remains Google Play base-plan provider-blocked. Creator Channel Subscription remains Google Play base-plan provider-blocked. Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF. Provider refunds remain manual/external. Data Safety evidence map matches actual app behavior; account deletion is documented and reachable; legal/support/DMCA/privacy/terms surfaces are documented; UGC/reporting/moderation policy is documented; App Access/reviewer packet is sanitized and does not commit credentials; provider dashboard private proof remains owner-confirmation-required; final Play Console acceptance remains owner/store external; final release build/smoke remains a release operation unless explicitly run in this lane.

Provider dashboard ownership and access governance: Partial for actual dashboard proof and Closed for repo-side governance in `docs/ops/PROVIDER_DASHBOARD_OWNERSHIP_ACCESS_GOVERNANCE.md`. First Owner / Owner owns provider dashboard accountability; each provider has a primary owner and backup owner requirement; company-controlled email is required where available; personal accounts are avoided for production ownership; provider roles must be least-privilege; MFA/2FA is required where supported; shared provider dashboard accounts are forbidden where individual access is supported; service accounts are not human staff accounts; API keys and provider secrets must live in secret managers/provider dashboards/EAS/Supabase/GitHub secrets, not repo; provider webhooks must be protected with signature/shared-secret validation where supported; credential rotation calendar and provider offboarding checklist exist; provider support tickets are tracked with sanitized references; provider decisions are mirrored into repo docs with sanitized facts; dashboard access proof remains owner-confirmation-required where repo cannot verify it. This lane did not mutate provider dashboards or activate money/provider/payout systems.

Moderation queue, case management, and escalation governance: Closed for repo-side queue separation, severity/SLA policy, notice templates, exact-scope action governance, proof, and guard coverage in `docs/legal/MODERATION_QUEUE_CASE_MANAGEMENT_ESCALATION_GOVERNANCE.md`. Moderation case operations completion is Closed in `docs/legal/MODERATION_CASE_OPERATIONS_COMPLETION.md`: case assignment is exact-scope/case-bound/audited where backed, internal notes are private/scoped/sanitized/audited where backed and never user-facing, canned reasons are templates only with human review, coordinated-report detection is signals only, repeated-offender aggregation is review/risk flags only, malicious reporting does not expose reporter identity, urgent SLA owner/escalation is documented, and no auto-punishment was added. Reports route to separated queues where appropriate; live safety reports are urgent; DMCA/legal reports are separate from general moderation; payment disputes are support/money cases, not general moderation; appeals are separate from initial moderation review; reporter identity and private evidence are not exposed; safe public non-money systems remain enabled; `live_money_enabled`, creator-money, Premium public purchase, payouts, Stripe Connect, merch checkout, and provider mutation remain OFF/not performed.

Staff access lifecycle, onboarding, and offboarding governance: Closed for repo-side governance in `docs/admin/STAFF_ACCESS_LIFECYCLE_ONBOARDING_OFFBOARDING_GOVERNANCE.md`. Support is not a backend role; support-workflow access is exact-scope permission work; shared staff accounts are forbidden; proof/test accounts are separate from staff accounts; service accounts are not human staff accounts; staff actions must be attributable to one human account; staff access requires Owner/First Owner approval where backed; staff permissions are least-privilege; staff access should be temporary or reviewable by default; staff MFA is required where the identity/provider supports it; monthly staff access review is required; staff removal revokes app roles and scopes where backed; staff removal invalidates sessions where backed and documents manual/future full Auth logout if not backed; offboarding is audited; emergency staff removal is supported or documented as manual/future; provider dashboard offboarding is documented as manual checklist in this lane; no provider dashboard access was changed.

Audit log integrity and privileged action evidence governance: Closed for current repo-side privileged-action evidence governance. Every privileged action must create an audit log where backed; failed or denied privileged attempts are audited where supported; audit logs are append-only from app/admin paths; audit logs cannot be edited or deleted through normal app/admin flows; audit readback requires exact scope; Moderator/support-workflow users cannot browse broad audit history by default; audit logs are privacy-safe and minimized; final proof artifacts include only sanitized audit evidence. Safe public non-money systems remain enabled, `live_money_enabled` remains OFF, creator-money remains OFF, payouts/Stripe/merch remain OFF, and no provider mutation happened.

Public non-money feature enablement: Closed for app-controlled public switchboard, route/copy cleanup, and proof/guard coverage in `docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md`. Safe public app systems are enabled or verified behind existing auth, runtime, Premium, reporting, blocking, account restriction, LiveKit, scan, legal/support, monitoring, and staff-scope gates. `live_money_enabled`, creator-money, payouts/payable balances/withdrawals/cash-out/transfers, Stripe Connect, merch checkout, payout movement, automatic/provider refunds, Premium annual, Creator Channel Subscription, and public Premium monthly purchase remain OFF, blocked, or pending separate owner-approved proof. No provider mutation happened.

Admin search privacy and export governance: Closed for repo-side Admin Search governance, support readback minimization, and export-default denial. Admin search requires exact scope; non-admin and unscoped attempts are denied; searches are audited with masked query preview; failed/denied searches are audited where supported; search results are minimized and bounded/paginated or safely limited; support-workflow readbacks are masked/minimized by default; Moderator does not see full email by default; Admin can see full email only with exact scope; phone/device search is disabled by default unless future case-scoped privacy review approves it; private chat/content evidence search requires exact scope and case/report/legal context; payment/provider search is masked/scoped summary only; deleted/de-identified users are not available in ordinary search; exports are disabled by default and require future Owner-approved audited lane.

Money admin authority and activation governance: Closed for repo-side governance. This lane does not activate money. First Owner / Owner controls activation authority; Premium monthly activation requires a separate owner-approved purchase proof lane; Premium annual remains provider-blocked; creator-money remains OFF; `live_money_enabled` remains OFF; payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF; provider refunds remain manual/external; manual refund support status can be recorded only with exact scope and audit; Admin can view/manage only exact money-support scopes; Moderator cannot activate money; provider transaction/customer/order data is masked/scoped; access grant revoke/removal requires exact scope, reason, target, and audit; dual approval is required for future payout activation and future `live_money_enabled`; emergency money kill switch is First Owner/Owner-controlled and audited; no Google Play, RevenueCat, Stripe, payout, purchase, refund, or product mutation happened.

Emergency controls, incident response, and kill-switch governance: Closed for repo-side governance in `docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md`. Safe public non-money systems remain enabled; emergency actions require exact scope, reason, and audit where backed; First Owner / Owner owns emergency control authority; Admin can operate only exact-scope emergency controls where explicitly allowed; Moderator cannot operate broad emergency controls; post-incident audit review is required; no refunds, purchases, payouts, transfers, or provider mutations are executed by emergency disable.

Date: 2026-06-25

Verdict: Partial / conditional go for the current launch mode.

This checklist excludes the known Google Play subscription base-plan provider blocker from app-controlled launch blocker classification. It does not activate Premium, creator-money, live money, payouts, Stripe, merch, withdrawals, cash-out, transfers, payable balances, provider refunds, or provider product changes.

## Current Launch Mode

- Broad app readiness: Conditional go, with no remaining app-controlled launch blocker found in this audit.
- Premium monthly: Verified at `$9.99/month`; may move to an owner-approved licensed/internal purchase proof lane before public activation.
- Premium annual: External/provider-blocked at `$99.99/year` pending Google Play support response and saved annual base plan.
- Creator-money: OFF. Five one-time products are Draft/readback verified; Creator Channel Subscription is provider-blocked by the same Google Play base-plan issue.
- Payouts, Stripe payouts, merch checkout, withdrawals, cash-out, transfers, payable balances, and refund automation: OFF/manual.
- Role terminology: Locked. Admin is the product-facing role backed by internal `operator`; Support is a work area, not a staff role; Moderator is separate from Admin/operator and can receive support duties through scoped permissions. Moderator role scope: Closed.

## Production Readiness Matrix

| Area | Status | Evidence | Blocker? | Next action |
| --- | --- | --- | --- | --- |
| Store/release | Partial | Package `com.chillywood.mobile`, Android `versionCode 55`, `versionName 1.0.0`; Play/internal installed proof exists in prior launch docs; Google Play support ticket submitted for subscription base plans. | No app-controlled blocker; external provider blocker remains for annual/channel subscription. | Keep release notes, app access instructions, store listing, Data Safety, content rating, target audience/ads disclosure, and Play review materials aligned before production rollout. |
| Auth/account lifecycle | Closed for current launch scope | Final go/no-go and closeout docs record sign-in, sign-out, reset, account deletion, disabled/deactivated denial, purge/de-identification, support/admin audit, and invalid/expired reset safety. | No. | Keep support/admin audit readback in final release smoke. |
| Public/private route safety | Closed for current launch scope | Production guards cover Profile, creator visibility, feed fanout, security context, route/deep-link safety, blocked/private fail-closed behavior, and no raw token/signed URL leakage. | No. | Rerun route/security guards before release cut. |
| Profile/Platform/Brand Studio | Closed | Profile production, Platform Brand Studio, creator video Circle visibility, and creator feed fanout guards are closed; public Platform excludes drafts and Circle-only/private creator content. | No. | Preserve Profile/Platform separation and owner-only draft controls in future work. |
| Creator media/VOD/uploads | Partial but launch-safe with gates | Upload, scan-pending hidden, clean scanned visible, malware/blocked hidden, safe playback resolver, and no raw storage path exposure are guarded; real rendition ladder and some installed attachment-heavy proof remain qualified future proof. | No current launch blocker if claims stay qualified. | Keep malware/content guards passing; finish real rendition/large attachment proof before marketing advanced media quality. |
| LiveKit/watch-party | Closed for current launch scope | `docs/live/LIVE_ROOM_MODERATION_INCIDENT_RESPONSE.md`, Watch-Party LiveKit guard, old-room handling, refresh policy, Live Stage contracts, 4 active camera/mic cap, token authority, live-room incident response, and no unauthorized publish authority are enforced. | No. | Live-room moderation is closed for current backed host controls/token authority. Real-device passive/TURN/cellular scale proof remains a future capacity lane, not a current active-seat launch blocker. |
| Chat/calls/notifications | Closed after validation | `docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md` and Chi'lly Chat/call/push policies cover exact chat-message reports, dedicated `chat_thread` conversation reports, report-linked chat-message hide/remove/restore, staff evidence scope/case context, blocked/restricted denial, chat-send rate limiting, call/ring dispatch dedupe, notification privacy, safe call metadata, no call content/recording, and scan-gated attachments. | No. | Include message/call/push sanity in release smoke. |
| Monetization/Premium/creator-money | Partial | Premium monthly verified; Premium annual provider-blocked; creator-money switchboard OFF; five one-time creator products Draft/readback verified; Creator Channel Subscription provider-blocked; no creator product maps to Premium. | Premium-first blocker until licensed/internal purchase proof and owner approval; creator-money future blocker. | Do not activate. Wait for owner-approved Premium monthly proof and Google response for annual/channel base plans. |
| Support/refund/dispute | Partial but policy-ready | Final operations runbook covers Premium support, creator-money support, manual/external provider refunds, disputes, paid-content unavailable states, event/room no-show handling, account deletion support, reporting/moderation support handoffs, content takedown access/refund support paths, DMCA/support privacy, and scoped support workflows. Support is not a staff role; Moderator or Admin may receive support scopes. | No for non-money or Premium proof preparation; money launch needs staffed support ownership. | Assign support workflow owner before Premium activation; keep refund execution manual/external. |
| Security/privacy/abuse | Closed for current launch scope | RLS posture, service-role boundary, admin/operator controls, reporting/moderation workflow, DMCA/support privacy, abuse/report/upload/chat/call/room throttles, trusted-network/security context proof, and no secret exposure are guarded. | No. | Keep guard and secret scans in every release lane. |
| Role operations | Closed for current launch scope | First Owner authority, Admin role scope, role terminology lock, Moderator role scope, and staff role hierarchy proof are closed. `operator` is only the internal/backend Admin alias; Support is a work area, not a role; Moderator support duties require exact scopes and backend enforcement. Owner/Admin Command Center UI is closed for current launch scope: `/admin` is the single entry point, production-labeled, fail-closed, privacy-safe, and money/provider/payout-disabled. | No. | Continue the final production readiness checklist with the next unresolved app-controlled launch area. |
| Staff access lifecycle | Closed repo-side / monthly review owner action pending | `docs/admin/STAFF_ACCESS_LIFECYCLE_ONBOARDING_OFFBOARDING_GOVERNANCE.md` documents onboarding approval, least privilege, temporary/reviewable access, MFA where supported, monthly review, app role/scope removal, partial session invalidation, emergency removal, proof/test account separation, service-account separation, shared-account prohibition, and provider-dashboard offboarding manual checklist. | No app-controlled blocker found; provider dashboard offboarding remains manual/future. | Assign monthly reviewer and provider-dashboard owners before broader launch. |
| First Owner authority | Enabled after validation | First Owner authority: Closed / Partial / Blocked. Only First Owner can grant or revoke Owner. First Owner cannot remove himself as the last active Owner. First Owner self-step-down requires successor, password re-auth, generated single-use passcode, typed confirmation, reason, and audit. Normal Owner dashboard viewing is not Break Glass. Break Glass is documented and audited when used. | No app-controlled blocker after migration apply; blocked only if production cannot seed exactly one First Owner marker from existing active Owner state. | Run `proof:first-owner-authority` and `guard:first-owner-authority-policy`; apply migration before production use. |
| Monitoring/analytics/crash | Closed repo-side / external SDK confirmation pending | `docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md` documents Firebase Analytics/Crashlytics/Performance status, Sentry/PostHog disabled status, sanitized runtime diagnostics, scoped support/admin diagnostics, and incident/health checklist. Runtime error analytics avoid exception message text and root-boundary support feedback avoids raw error text. | No app-controlled blocker found. | Owner confirms final Firebase SDK/provider collection settings, runs release log audit, and monitors Crashlytics/analytics after rollout. |
| Legal/privacy/Data Safety | Closed repo-side / external legal-store acceptance pending | `docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md` aligns Terms, Privacy, DMCA, Support, Account Deletion, Data Safety evidence, Play reviewer packet, Premium/refund posture, reporting/moderation, takedown, live, chat, account restriction, and purge/de-identification truth. This is product/legal-readiness documentation alignment, not attorney legal advice. | No app-controlled blocker found; owner/legal and Play Console acceptance remain external. | Owner/legal final review, SDK/provider disclosure confirmation, Play Console Data Safety/account deletion/content-rating/App Access acceptance, support/account deletion SLA, and public-site redeploy. |
| UX polish/copy | Closed for guarded scope | Critical UX polish guard is passing; docs require no proof/dev/debug copy, no fake readiness claims, clear Premium and creator-money OFF copy, safe unavailable states, empty states, labels/test IDs. | No. | Keep copy guard passing and do not advertise annual/creator-money readiness before provider proof. |
| Build/validation/release gates | Pending this lane validation | Required proof scripts, production guards, typecheck, runtime validation, old-room, refresh, LiveKit, and diff checks are the release gate. Existing `proof:launch-candidate-installed` and `guard:big-app-qa-coverage` are available optional release gates. | Pending validation. | Run the full validation set and commit only if clean. |

## Detailed Checklist

### 1. Store / Release Readiness

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Play internal/closed track status | Partial | Owner decision needed | Prior Play-installed/internal v55 proof exists; final track/rollout decision remains owner-controlled. |
| Package/versionCode | Closed | Already closed | `com.chillywood.mobile`, `versionCode 55`, `versionName 1.0.0`. |
| Installer/readback proof | Closed for current proof | Already closed | Prior Play-installed proof recorded in final go/no-go and Premium proof docs. |
| Release notes | Needs final owner review | Owner decision needed | Prepare final non-provider-claiming release notes before production rollout. |
| Store listing basics | Needs final owner review | Owner decision needed | Confirm listing copy does not claim annual Premium or creator-money launch readiness. |
| Data Safety/privacy consistency | Closed repo-side / external acceptance pending | Owner decision needed | `docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md` reconciles Data Safety with actual app behavior; owner/legal must confirm final SDK/provider settings before Play submission. |
| App access instructions | Needs final owner review | Owner decision needed | Keep reviewer credentials and app access instructions current outside repo secrets. |
| Content rating alignment | Needs final owner review | Owner decision needed | No app-controlled mismatch found; owner must confirm Play Console rating. |
| Target audience/ads disclosure | Needs final owner review | Owner decision needed | No in-lane change; confirm store answers match runtime. |
| Google Play policy blockers | Partial | External/provider blocker | Base-plan support ticket submitted; annual/channel subscription remain blocked. |

### 2. Auth / Account Lifecycle

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Sign in / sign out / sign up | Closed | Already closed | Covered by final readiness and account guard history. |
| Password reset | Closed | Already closed | Provider reset proof and invalid/expired reset safety documented. |
| Account deletion / restore / controlled purge | Closed | Already closed | Account purge/de-identification and deletion restore lanes documented. |
| Disabled/deactivated account denial | Closed | Already closed | Disabled/admin denial proof recorded in final readiness docs. |
| Support/admin audit readback | Closed | Already closed | Admin/support audit boundaries documented and guarded. |

### 3. Public / Private Route Safety

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Signed-out public/private routes | Closed | Already closed | Public/private route safety and Profile production guard are closed. |
| Deep-link / notification handoff safety | Closed | Already closed | Route contracts and final readiness docs cover fail-closed handoffs. |
| Blocked/deleted/scheduled-deletion denial | Closed | Already closed | Block/private/deleted content fail-closed behavior is guarded. |
| Token/signed URL leakage | Closed | Already closed | Security context and creator media guards forbid raw token/storage URL exposure. |

### 4. Profile / Platform / Brand Studio

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Profile vs Platform separation | Closed | Already closed | `guard:profile-production-policy` and Platform Brand Studio guard closed. |
| Public Platform draft exclusion | Closed | Already closed | Creator visibility and feed fanout guards closed. |
| Profile privacy/blocked behavior | Closed | Already closed | Profile production guard closed. |
| Profile media safety | Closed | Already closed | Guarded raw-path and private-safe rendering contracts. |
| Brand Studio draft/publish/readback | Closed | Already closed | Platform Brand Studio guard closed. |

### 5. Creator Media / VOD / Uploads

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Upload path and non-zero media proof | Partial | Post-launch polish | Current gates are launch-safe; broader installed media proof remains qualified. |
| Draft/private/public visibility | Closed | Already closed | Creator Circle visibility and feed fanout guards closed. |
| Scan-pending/clean/malware behavior | Closed for current launch scope | Already closed | Scan gates hide pending/blocked and allow clean scanned media. |
| Deletion/cleanup | Closed for current launch scope | Already closed | Final closeout docs cover deletion/cleanup posture. |
| Playback resolver / raw path safety | Closed | Already closed | Public resolver must not return raw playback URL, storage path, or object key. |
| Rendition/quality and heavy attachments | Partial | Post-launch polish | Do not overclaim quality ladder or attachment-heavy readiness until final installed proof. |

### 6. Watch-Party Live / LiveKit

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Route ownership and Live Stage flow | Closed | Already closed | Watch-Party LiveKit and Live Stage guards cover route ownership. |
| Shared player / old room handling | Closed | Already closed | Old-room handling guard required in validation. |
| Seat request/approval and 4 active cap | Closed | Already closed | Live Stage seat approval and active camera/mic cap are guarded. |
| Token authority / metrics | Closed | Already closed | LiveKit authority and metrics guards are part of proof history. |
| Passive viewer proof | Partial | Post-launch polish | Synthetic/passive proof closed; larger real-device capacity proof remains future. |

### 7. Chi'lly Chat / Calls / Notifications

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Inbox/thread/direct message basics | Closed | Already closed | Final readiness docs, `docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md`, and chat/call/push guard history. |
| Blocked chat denial | Closed | Already closed | Block enforcement remains required and guarded. |
| Call/ring dispatch and dedupe | Closed | Already closed | Call/push policy guard history covers dispatch/dedupe. |
| Disabled/deactivated denial and push safety | Closed | Already closed | Disabled user denial and private-data-safe push posture documented. |
| Chat/call moderation and notification abuse controls | Closed after validation | Already closed | Exact chat-message reporting is wired; dedicated `chat_thread` reporting is wired; report-linked `chat_message` hide/remove/restore is backed with exact scope, reason, case/report context, audit, and evidence preservation; staff private chat evidence is exact-scope and case/report scoped; blocked/disabled/deleted users fail closed; call/ring notifications are deduped/rate-limited; call content/recording is absent; attachments remain scan-gated. |

### 8. Monetization / Premium / Creator-Money

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Premium monthly | Verified | Already closed | Google Play `premium_subscription:monthly`, United States, USD 9.99; RevenueCat `$rc_monthly` maps to `premium`. |
| Premium annual | Provider-blocked | External/provider blocker | Google Play base-plan save/ID validation issue; support packet submitted, case ID pending. |
| Premium purchase proof | Pending | Premium-first blocker | Requires owner-approved licensed/internal purchase proof before public activation. |
| Creator-money switchboard | OFF | Already closed | All creator-money switches OFF; `live_money_enabled` OFF. |
| Five one-time creator products | Draft/readback verified | Creator-money future blocker | Products remain Draft; RevenueCat Draft consumables; no Premium mapping. |
| Creator Channel Subscription | Provider-blocked | External/provider blocker | Product exists; monthly base plan missing; RevenueCat mapping blocked. |
| Payouts/refunds/Stripe | OFF/manual | Already closed | Payouts and Stripe future-only; provider refunds manual/external. |

### 9. Refund / Support / Dispute Operations

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Premium support/restore/manage/cancel | Policy-ready | Premium-first blocker | Must be staffed and smoke-tested during licensed/internal purchase proof. |
| Creator-money support | Future-ready only | Creator-money future blocker | Do not activate creator-money until support/refund/dispute proof is run. |
| Manual/external refunds | Closed | Already closed | No provider refund execution or automation enabled. |
| Paid content unavailable / event no-show | Policy-ready | Creator-money future blocker | Keep manual support review until future activation lanes. |
| DMCA/support privacy | Closed | Already closed | Support privacy and DMCA posture documented. |

### 10. Security / Privacy / Abuse

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| RLS/service-role/admin boundaries | Closed | Already closed | No weakening in this lane; guards and docs require strict boundaries. |
| Abuse/report/upload/chat/call/room throttles | Closed | Already closed | No throttle removal; final guards cover abuse posture. |
| Trusted-network/security context | Closed | Already closed | Security context proxy proof guard closed. |
| No public raw IP/security context leakage | Closed | Already closed | Security context guard closed. |
| No committed secrets | Pending validation | Build/release gate | Secret scan artifact and diff review required before commit. |

### 11. Monitoring / Analytics / Crash

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Firebase Analytics / Crashlytics / Performance | Closed repo-side / external SDK confirmation pending | Owner decision needed | Firebase packages/helpers/bootstrap are documented; final production dashboard owner review and provider collection confirmation remain external. |
| PII-safe diagnostics | Closed | Already closed | Runtime unavailable and root error copy stay sanitized; runtime error analytics do not carry exception message text. |
| Production health checklist | Closed repo-side | Owner decision needed | Run immediately before and after any rollout using `docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md`. |

### 12. Legal / Policy / Content Moderation

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Terms / Privacy / DMCA / Support | Closed repo-side / external legal review pending | Owner decision needed | Public legal surfaces stay free of proof/debug/internal public copy; owner/legal final review required. |
| Legal/privacy/Data Safety final alignment | Closed repo-side | Already closed | Legal/privacy/Data Safety final alignment: Closed for repo-side documentation alignment. This is product/legal-readiness documentation alignment, not attorney legal advice. Account deletion uses scheduled deletion, restore window where supported, and controlled purge/de-identification; evidence retention exceptions are preserved; Premium annual remains provider-blocked; creator-money remains OFF; provider refunds remain manual/external; no payouts/Stripe/merch/money movement are live. |
| Account deletion policy | Closed for current launch scope | Already closed | Account lifecycle proof recorded. |
| Account restriction and appeals | Closed after validation | Already closed | Account restriction and appeals operations: Closed for current production policy and existing backed enforcement. Reports do not auto-suspend or auto-ban. Suspension/deactivation/restore require exact scope, reason, target, and audit. First Owner cannot be suspended, deactivated, deleted, restored, or restricted by Admin/Moderator. Moderator cannot perform account-wide suspension/restoration by default. Restricted users fail closed for private app features where backed, Premium entitlement may remain provider-side while app access fails closed, paid-access/payment history is preserved, provider refunds remain manual/external, payouts and money movement remain disabled, and appeals use support/escalation workflow in V1 without exposing reporter identity or private evidence. |
| Content rights and creator upload disclosure | Partial | Owner decision needed | Keep rights posture and moderation copy aligned before public creator expansion. |
| Moderation/reporting | Closed after validation | Already closed | Users can report profiles, Profile media, Platform content, videos, paid videos, live rooms, exact chat messages, whole chat conversations, comments, replies, specific events, and VIP/subscriber content where the surface exists. Dedicated event report affordance: Closed after validation. Exact chat-message report affordance: Closed after validation. Dedicated chat_thread report target: Closed after validation. Chat-message hide/remove/restore: Closed after validation. Content takedown decisions: Closed for production decision policy and current backed enforcement after validation. Live-room moderation and incident response: Closed for production policy, current backed host controls, LiveKit token authority, and incident-response proof after validation. Chat/call moderation and notification abuse controls: Closed after validation. Normal reports, DMCA/legal, support, money/refund/access support, security incidents, live safety incidents, notification-abuse incidents, and appeals are separated. Reporter identity stays private by default, duplicate/false reports are deduped and rate-limited, reports do not auto-delete content, evidence/access history are preserved, and staff access requires exact scopes plus case/report context. |

### 13. UX Polish / Production Copy

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| No proof/dev/debug copy | Closed for guarded scope | Already closed | Critical UX polish guard closed. |
| No user-facing entity leaks | Closed for guarded scope | Already closed | Critical UX polish guard closed. |
| No fake readiness claims | Closed for current docs after this lane | Already closed | Stale support-packet wording corrected from prepared to submitted. |
| Premium UI clarity | Partial | Premium-first blocker | Do not advertise annual until provider-backed; run licensed/internal proof before launch. |
| Creator-money OFF clarity | Closed | Already closed | Creator-money remains OFF and future-only in docs. |

### 14. Build / Validation / Release Gates

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Proof scripts | Pending validation | Build/release gate | Run required final proof commands in this lane. |
| Production guards | Pending validation | Build/release gate | Run required production guards in this lane. |
| Typecheck/runtime validation | Pending validation | Build/release gate | `npm run typecheck` and `npm run validate:runtime`. |
| Old-room/refresh/LiveKit guards | Pending validation | Build/release gate | Run requested guard set. |
| Diff checks | Pending validation | Build/release gate | `git diff --check` and `git diff --cached --check`. |
| Clean tracked tree / push status | Pending commit | Build/release gate | Commit only intended files if validation is clean. |

## Launch Blocker Matrix

| Blocker | Severity | Owner | App-controlled? | External/provider? | Recommended action |
| --- | --- | --- | --- | --- | --- |
| Premium annual base plan does not save | External/provider blocker | Owner / Google Play Support | No | Yes | Track submitted support ticket, capture case ID, retry only in a separate approved provider lane. |
| Creator Channel Subscription base plan does not save | External/provider blocker / creator-money future blocker | Owner / Google Play Support | No | Yes | Keep creator-money OFF; resolve with Google before channel subscription activation. |
| Premium licensed/internal purchase proof not yet run for launch | Premium-first blocker | Owner / app operator | Yes, after owner approval | Provider involved | Run bounded licensed/internal Premium monthly proof; do not public activate before proof. |
| Premium public activation decision | Owner decision needed | Owner | Yes | No | Owner approves rollout window, switch scope, support owner, monitoring owner, rollback owner. |
| Creator-money activation | Creator-money future blocker | Owner | Yes | Provider involved | Keep OFF until products are verified/active, mapped, smoke-tested, and owner-approved. |
| Payouts / Stripe / merch | Future blocker only | Owner | Yes | Provider involved | Keep OFF; run separate payout/merch lanes later. |
| Final legal/store review | Owner decision needed | Owner/legal | No | Store/legal involved | Owner/legal review store listing, Data Safety, legal surfaces, app access instructions. |
| Media quality/large attachment and passive-scale proof | Post-launch polish | App operator | Yes | Device/provider involved | Finish before marketing advanced media/scale claims; not a blocker for current gated launch mode. |

## Premium-First Recommendation

Do not publicly activate Premium in this lane. Premium monthly is provider-ready at `$9.99/month`, but Premium-first launch still needs an owner-approved licensed/internal purchase proof covering product load, purchase sheet, licensed tester purchase, RevenueCat entitlement readback, restore/manage/cancel, gated feature unlock, revoke/expiration denial where possible, rollback, monitoring, and support ownership.

Premium annual remains external/provider-blocked. A monthly-only Premium launch can be considered only if the owner explicitly accepts launching without annual and the app does not advertise annual availability.

## Creator-Money Recommendation

Do not activate creator-money. Tips, Paid Video, Watch-Party Ticket, VIP, and Event Pass remain Draft/readback verified but OFF. Creator Channel Subscription cannot activate until Google Play creates the `monthly` base plan and RevenueCat imports/maps `cw_channel_subscription_monthly_499:monthly` without Premium mapping. Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and provider refund automation remain OFF/manual.

## Owner Decision List

1. Track the Google Play support ticket and record the case ID when provided.
2. Decide whether Premium monthly may move to licensed/internal proof while annual remains blocked, or whether Premium launch must wait for annual.
3. Approve the bounded Premium monthly licensed/internal proof lane, including tester account, rollout scope, support owner, monitoring owner, and rollback owner.
4. Complete final store/legal review: release notes, app access, Data Safety/privacy, content rating, target audience/ads answers, Terms, Privacy, DMCA, Support, and account deletion surfaces.
5. Keep creator-money, payouts, Stripe payouts, merch, and refund automation in future owner-approved lanes.

## Fixes Applied

- Added this final production readiness checklist.
- Corrected stale docs that said the Google Play support packet was only prepared; it was submitted through Google Play Console Help on 2026-06-25 at 12:25 CDT, with case ID pending.

## Safety Confirmation

- No provider dashboard mutation.
- No Premium public activation.
- No creator-money switches enabled.
- No `live_money_enabled`.
- No payouts, payable balances, withdrawals, cash-out, transfers, payout batches, Stripe Connect, or merch checkout.
- No provider refunds.
- No RevenueCat mapping change.
- No Premium product, pricing, entitlement, or offering change.
- No RLS weakening.
- No LiveKit authority loosening.
- No auth/reset weakening.
- No scan-gate weakening.
- No abuse-throttle removal.
- No block-enforcement weakening.
- No secrets committed.
- First Owner controls are enabled for authenticated First Owner after validation.
- No plaintext passcodes stored.
- No raw IP/token/signed URL exposure added.

## Admin Role Scope Closeout

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Admin role scope | Closed | Already closed | Admin is a real production role backed by `platform_role_memberships.role = 'operator'` and scoped grants. |
| Admin permissions | Closed | Already closed | Admin permissions are scoped and granted by Owner/First Owner through `platform_staff_permission_grants`. |
| Backend denial | Closed | Already closed | Backend denies non-admin and unscoped-admin attempts even if UI is bypassed. |
| Owner/First Owner boundary | Closed | Already closed | Admin cannot grant or revoke Owner, cannot alter First Owner succession, and cannot remove, demote, delete, or deactivate First Owner. |
| Money/provider boundary | Closed | Already closed | Admin cannot enable money/provider/payout systems and cannot execute provider refunds. |
| Refund status boundary | Closed | Already closed | Admin can record manual/external refund status only with permission; provider refunds remain manual/external. |
| Destructive actions | Closed | Already closed | Admin destructive actions require permission, reason, confirmation, and audit. |
| Admin UI buttons | Closed | Already closed | Broken Admin buttons are wired or open active access/status/resolution flows. |
| Private data safety | Closed | Already closed | No secrets, tokens, signed URLs, raw IPs, tax IDs, bank details, or provider secrets are exposed. |

## Every Visible Surface Active Wiring

Every visible surface active wiring audit: Closed. No visible clickable dead buttons are allowed. Nothing visible should be hidden or disabled. Every visible control works, routes correctly, opens a setup/status/resolution flow, opens a support/review flow, or starts a tester-safe flow. Permission scopes must unlock backed behavior.

Tester-visible monetization UX is separate from live money settlement. Premium monthly tester flow is reachable where Play internal/licensed tester/provider setup supports it. Premium annual opens an active provider-blocked status/resolution flow. Creator Channel Subscription opens an active provider-blocked status/resolution flow. liveMoneyEnabled remains OFF. Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF. No Google Play, RevenueCat, Stripe, payout, refund, purchase, or provider mutation happened.

## Visible Surface Tester Delivery

Visible-surface active wiring tester delivery: Closed. Commit 7138dd2 was pushed to origin/main before delivery. Delivery classification was EAS Update eligible, and EAS Update group `d7aac53c-65bb-4bf7-ae69-04bfea248e0a` / Android update `019f0533-920e-7fca-8f45-74b1f538040a` was published to branch `production` for runtime `1.0.0`.

Play internal/closed testing remains the approved tester path. Sideload is not an approved tester delivery path. No APK sideload was used. No app uninstall/reinstall/clear-data happened unless explicitly owner-approved. Testers must verify visible controls in the installed tester build. No Play production submission happened. No provider mutation happened. liveMoneyEnabled remains OFF. Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF. Premium annual remains provider-blocked. Creator Channel Subscription remains provider-blocked.
