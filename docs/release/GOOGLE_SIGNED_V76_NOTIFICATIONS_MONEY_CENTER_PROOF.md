# Google-Signed V76 Notifications Money Center Proof

Date: 2026-07-01

Verdict: Partial overall. Installed Money Center manager visibility is Closed on Google Play v76 plus OTA. The physical completion pass Closed Settings Activity read/dismiss behavior for the visible installed call row, Home/Explore/Live/Saved/Platform Studio bell tray shell behavior, visible call-notification-to-Chat routing without auto-answer, and Android push registration on `R3CXA0DS5JV`. Buyer/creator seeded money route rows, the prepared missed-call fixture, the prepared event-reminder fixture, room/live tray inside active rooms, incoming Chi'lly Chat call while inside a room, and actual push delivery remain Partial.

## Scope

This lane reran the Google Play internal installed proof after the Money Center installed manager visibility fix.

No Play production submission, sideload, `adb install`, uninstall, reinstall, clear data, logout, live money enablement, payouts, cashout, provider mutation, auth/RLS weakening, or fake purchase-generation proof happened.

Seeded notification rows are UI fixtures only. They are not counted as proof that purchases generated notifications. Push delivery is not claimed without an actual delivered push.

## Repo / Origin Alignment

Final source alignment for the physical completion pass:

- `HEAD == origin/main == 785fb77e1b91f549f094f31a0e8ac79df3b7d14e`
- Required installed binary source commit included in v76: `e4f88365d33dcf0655597041800985131c045e40`
- Follow-up OTA source commits included:
  - `47ccdd25ffce11fd6ec3abb0e2a0d8c43ca1dfa9` (`Fix Money Center Seat Pass display title`)
  - `0bb2ba928e05773567b5d3868fbcc502334f7730` (`Fix Platform Studio premium snapshot access`)
- Latest prior documentation commit before this completion pass: `785fb77e1b91f549f094f31a0e8ac79df3b7d14e`

## Build Or OTA Decision

The already-created Google Play internal build included `e4f88365d33dcf0655597041800985131c045e40`, so no rebuild was needed for the original installed-manager fix.

Two JavaScript/runtime-compatible follow-ups were delivered by EAS Update to the existing Google-signed Play binary runtime `1.0.0`:

- Seat Pass wording OTA group: `d05105c3-fa72-46e0-80de-e3b8364f550f`
- Platform Studio premium snapshot OTA group: `1c4834a5-439d-4e86-93b0-1eb0de8d8aac`
- Android update id for the latest OTA: `019f1def-e5bc-70fc-baca-790cdde0ab98`

## Device Binary / OTA Proof

Google Play internal v76 binary:

- EAS build id: `9e4d3f34-6323-4942-b941-faebe558b00a`
- Artifact type: Android AAB / store distribution
- versionCode: `76`
- versionName: `1.0.0`
- runtimeVersion: `1.0.0`
- build commit: `e4f88365d33dcf0655597041800985131c045e40`

Package readback:

- `R5CR120QCBF`: `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `76`, versionName `1.0.0`, lastUpdateTime `2026-07-01 00:55:59`
- `R3CXA0DS5JV`: `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `76`, versionName `1.0.0`, lastUpdateTime `2026-07-01 00:53:55`

Latest OTA proof:

- Both devices logged the Android OTA update id/group as available/downloaded and relaunched on the Google-signed binary.
- Package installer remained `com.android.vending`.
- No sideload, `adb install`, logout, uninstall, reinstall, or clear data happened.

Physical completion package artifacts:

- `/tmp/google-play-internal-v76-notifications-money-center-proof-20260701-0805/physical-notification-completion-20260701-090520/R5CR120QCBF-package-v76-before-physical-proof.txt`
- `/tmp/google-play-internal-v76-notifications-money-center-proof-20260701-0805/physical-notification-completion-20260701-090520/R3CXA0DS5JV-package-v76-before-physical-proof.txt`

## Premium / Subscribe Path

The installed Google Play sandbox Premium path was exercised on `R5CR120QCBF`:

- Premium gate showed Manage Premium.
- Manage Premium exposed the sandbox Premium action.
- Google Play sandbox subscription sheet opened.
- Subscribe was tapped.
- Google Play test-flow completion returned the app to active Premium state.

After Premium activated, Platform Studio initially still showed the Premium gate. Root cause: Platform Studio used only backend Premium entitlement state, while Manage Premium used the local RevenueCat/monetization snapshot. Source now lets Platform Studio trust the same cached/remote monetization snapshot while preserving the existing backend entitlement and owner/operator checks.

## Money Center Manager Visibility Result

Closed on installed Google Play v76 plus OTA.

Proved on `R5CR120QCBF` through normal visible paths:

- Platform Studio opened after Premium snapshot OTA.
- Money Center opened without the Premium gate.
- Open Ways to Earn focused the Ways to Earn panel.
- Tips manager appeared visibly inline after the selected feature card.
- Paid Video manager appeared visibly inline after the selected feature card.
- Watch-Party Seat Pass manager appeared visibly inline after the selected feature card.
- Channel Subscription manager appeared visibly inline after the selected feature card.
- VIP manager appeared visibly inline after the selected feature card.
- Event Pass manager appeared visibly inline after the selected feature card.
- Cashout readiness appeared and stated cashout is not live.

`R3CXA0DS5JV` also proved Money Center / Ways to Earn / Tips / Paid Video / Watch-Party Seat Pass / Cashout readiness visibility before returning to the user's active app.

## Tips Creator Setup Result

Scripted regression proof passed through:

- `npm run proof:creator-monetization-route-button-wiring`
- `npm run guard:creator-monetization-policy`
- `npm run guard:money-center-policy`

Full physical Tips save was not rerun after the Money Center manager proof because the required installed UI blocker was already closed and broader mutation risk was avoided. This remains Partial for installed physical save replay.

## Tips Viewer Sheet Result

Scripted route/button regression passed. Installed physical viewer Tip Sheet replay remains Partial because it was not safely generated in this rerun.

## Notification Activity Result

Scripted notification Activity proof passed:

- `npm run proof:notification-center-money-activity`
- `npm run proof:important-notification-accessibility`
- `npm run guard:notification-action-retention-policy`
- `npm run guard:notification-money-policy`

Physical completion result:

- Closed for the visible installed call notification row on `R3CXA0DS5JV`.
- Settings -> Notifications / Activity showed Important / Action Needed above the activity list.
- The visible row was already `Read` and remained visible, proving read state did not remove it.
- Tapping the row opened the Chi'lly Chat direct thread and showed `No Active Call`, so it did not auto-answer or start camera/mic.
- Dismissing the row from the tray hid it from the active list and left the safe empty state: `No notifications yet` / `No fake counts or records are shown.`
- Buyer/creator seeded money rows were not visible under the currently signed-in `R3CXA0DS5JV` account in this no-logout completion pass, so those physical row-route checks remain Partial.

Artifacts:

- `R3CXA0DS5JV-settings-notifications-expanded.png`
- `R3CXA0DS5JV-call-notification-row-tapped.png`
- `R3CXA0DS5JV-tray-before-dismiss-call-row.png`
- `R3CXA0DS5JV-tray-after-dismiss-call-row.png`

## Important / Action Needed Result

Scripted proof passed that Important / Action Needed rows remain available and dismiss behavior is enforced. Physical completion Closed the visible installed call-row read/dismiss behavior on `R3CXA0DS5JV`; the seeded buyer/creator money rows remain Partial because they were not visible for the active signed-in account without logout or reseeding.

## Buyer / Creator Notification Route Result

Scripted notification-money route/policy validation passed. Seeded notification rows were not counted as purchase-generation proof.

Physical buyer/creator route result: Partial. The prepared seeded buyer and creator money rows exist in the fixture packet, but they were not visible under the currently signed-in `R3CXA0DS5JV` account during the no-logout physical completion pass. No new records were seeded, and no purchase-generation claim was made.

## Missed Call / Event Reminder Result

Scripted room-safe notification/call behavior proof passed.

Physical call/event result:

- Closed for the visible installed incoming-call notification row routing to `/chat/[threadId]` without auto-answer, camera start, or active call state.
- Partial for the prepared missed-call fixture specifically, because that fixture row was not visible under the active signed-in account during this no-logout pass.
- Partial for the prepared event-starts-soon fixture, because the fixture row was not visible under the active signed-in account during this no-logout pass.

## Bell / Tray Result

Scripted notification icon surface wiring passed.

Physical completion result: Closed for the normal reachable surfaces captured on `R3CXA0DS5JV`:

- Platform Studio / Money Center: icon-only bell visible, tray opened, Important / Action Needed row rendered, Activity settings route opened, row dismiss worked.
- Home: icon-only bell visible beside Settings/Profile controls; tray opened to safe empty state after dismiss.
- Explore: icon-only bell visible; tray opened to safe empty state after dismiss.
- Live: icon-only bell visible; tray opened to safe empty state after dismiss.
- Saved: icon-only bell visible; tray opened to safe empty state after dismiss.

The compact headers did not replace Settings or Profile/avatar controls. Tray copy remained notification-specific and did not show fake rows or fake counts after dismiss.

Artifacts:

- `R3CXA0DS5JV-platform-studio-bell-tray-open.png`
- `R3CXA0DS5JV-home-loaded-bell-surface.png`
- `R3CXA0DS5JV-home-bell-tray-open.png`
- `R3CXA0DS5JV-explore-bell-surface.png`
- `R3CXA0DS5JV-explore-bell-tray-open.png`
- `R3CXA0DS5JV-live-bell-surface.png`
- `R3CXA0DS5JV-live-bell-tray-open.png`
- `R3CXA0DS5JV-saved-bell-surface.png`
- `R3CXA0DS5JV-saved-bell-tray-open.png`

## Room / Live Tray Result

Partial. Source/script proof passed for room-safe notification and call behavior, but room-safe tray behavior inside real Watch-Party Waiting Room, Party Room, and Live Stage was not newly generated on physical devices. No auto-answer, auto-room-leave, mic/camera hijack, or room mutation was performed.

## Push Registration / Dispatch Result

Partial overall.

- Android push registration Closed on `R3CXA0DS5JV`: Settings -> Notifications changed from `Not registered` to `Registered`, and the app displayed a backend-safe device fingerprint.
- Actual push dispatch/delivery remains Partial. No actual push was delivered to a device in this completion pass, so push delivery is not claimed.

Artifacts:

- `R3CXA0DS5JV-settings-push-before-register.png`
- `R3CXA0DS5JV-settings-push-after-register.png`

## Seat Pass Wording Result

Closed for this lane. Visible Money Center wording uses:

- `Watch-Party Seat Pass`
- `Seat Pass`
- `Seat Pass ready`
- `Sell Seat Pass access to hosted Watch-Party rooms.`

Visible copy did not say `Watch-Party Ticket`.

The physical completion artifact scan found no visible stale `Watch-Party Ticket`, `ticket sold`, `ticket ready`, or `ticket manager` wording in captured XML/text artifacts.

## Safety Confirmation

`liveMoneyEnabled` remains OFF. Payouts and cashout remain OFF. Cashout readiness explicitly says cashout is not live and no payout will be sent.

No auth/RLS/money permission weakening happened. No provider/live-money mutation happened. No Play production submission happened. No service-role notification fixture was counted as purchase-generation proof. No raw tokens, secrets, private email, phone, provider ids, or signed URLs are included in this public proof document.

## Validation Results

All required validation commands passed. Latest completion logs are under:

- `/tmp/google-play-internal-v76-notifications-money-center-proof-20260701-0805/physical-notification-completion-20260701-090520/validation-20260701-091457/`

Earlier Money Center rerun validation logs are under:

- `/tmp/google-play-internal-v76-notifications-money-center-proof-20260701-0805/validation-20260701-085743/`

Passed commands:

- `npm run proof:creator-monetization-route-button-wiring`
- `npm run proof:notification-center-money-activity`
- `npm run proof:important-notification-accessibility`
- `npm run proof:notification-icon-surface-wiring`
- `npm run proof:room-safe-notification-and-call-behavior`
- `npm run guard:notification-action-retention-policy`
- `npm run guard:notification-money-policy`
- `npm run guard:notification-room-call-policy`
- `npm run guard:chat-call-moderation-notification-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:money-center-policy`
- `npm run guard:route-contracts --if-present`
- `npm run guard:brand-spelling-policy`
- `npm run typecheck`
- `npm run validate:runtime`
- `supabase db push --dry-run`
- `git diff --check`
- `git diff --cached --check`

## Artifact Paths

Main artifact folder:

- `/tmp/google-play-internal-v76-notifications-money-center-proof-20260701-0805/`

Physical notification completion folder:

- `/tmp/google-play-internal-v76-notifications-money-center-proof-20260701-0805/physical-notification-completion-20260701-090520/`

Key installed proof artifacts:

- `R5CR120QCBF-package-after-premium-snapshot-ota.txt`
- `R3CXA0DS5JV-package-after-premium-snapshot-ota.txt`
- `eas-build-list-android-v76.json`
- `eas-update-platform-studio-premium-snapshot.json`
- `R5CR120QCBF-premium-snapshot-ota-summary.txt`
- `R3CXA0DS5JV-premium-snapshot-ota-summary.txt`
- `R5CR120QCBF-125-after-google-play-no-thanks.png`
- `R5CR120QCBF-platform-studio-loaded-after-premium-snapshot-ota.png`
- `R5CR120QCBF-money-center-overview-after-premium-snapshot-ota.png`
- `R5CR120QCBF-ways-to-earn-focused-after-ota.png`
- `R5CR120QCBF-money-manager-channel-subscription-visible-after-ota.png`
- `R5CR120QCBF-money-manager-vip-after-ota.png`
- `R5CR120QCBF-money-manager-event-pass-after-ota.png`
- `R5CR120QCBF-money-cashout-readiness-after-ota.png`
- `R3CXA0DS5JV-money-manager-seat-pass-after-ota.png`
- `R3CXA0DS5JV-money-cashout-readiness-after-ota.png`

Key completion artifacts:

- `R3CXA0DS5JV-settings-notifications-expanded.png`
- `R3CXA0DS5JV-call-notification-row-tapped.png`
- `R3CXA0DS5JV-tray-after-dismiss-call-row.png`
- `R3CXA0DS5JV-settings-push-after-register.png`
- `R3CXA0DS5JV-home-bell-tray-open.png`
- `R3CXA0DS5JV-explore-bell-tray-open.png`
- `R3CXA0DS5JV-live-bell-tray-open.png`
- `R3CXA0DS5JV-saved-bell-tray-open.png`

## Remaining Launch Blockers

- Installed physical Tips creator save replay remains Partial in this rerun.
- Installed physical viewer Tip Sheet replay remains Partial in this rerun.
- Buyer and creator seeded money notification route rows remain Partial because they were not visible under the currently signed-in no-logout account during this completion pass.
- The prepared missed-call fixture row remains Partial; only the visible incoming-call notification row was physically routed to Chat without auto-answer.
- The prepared event-starts-soon fixture row remains Partial because it was not visible under the current no-logout account.
- Room/live tray behavior inside actual active rooms remains Partial.
- Incoming Chi'lly Chat call while the receiver is inside Party Room or Live Stage remains Partial.
- Actual push delivery remains Partial until a real push is delivered and captured.

## Final Classification

Money Center installed manager visibility after `e4f88365d33dcf0655597041800985131c045e40` and the OTA follow-ups is Closed.

The broader Google Play internal notifications / Money Center proof lane remains Partial until the unproved physical notification, room, and push items are generated safely.
