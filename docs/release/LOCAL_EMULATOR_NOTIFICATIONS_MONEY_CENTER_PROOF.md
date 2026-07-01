# Local Emulator Notifications Money Center Proof

## Scope

This lane ran local-source proof before any new Google Play internal build so small tap, route, query-param, manager, notification, Activity, and wording issues could be found without wasting Play builds.

No EAS build, Google Play internal build, Play production submission, sideload, physical-device adb install, physical-device clear data, physical-device logout, live money, payouts, cashout, auth/RLS weakening, or broad feature work happened.

## Source Baseline

- Required source/backend-ready baseline: `713acff42c97aa03438bf3bbecd1e0f2c2b47bf8`
- Repo alignment at lane start: `HEAD == origin/main == 713acff42c97aa03438bf3bbecd1e0f2c2b47bf8`
- Final commit: recorded in the lane report after commit.

## Local Target Used

Android emulator/dev-client proof was attempted first but remained blocked because the available emulator app did not request the Metro/local bundle. A Play-installed physical app was not used as local-source proof because it did not load local Metro source.

Local web fallback was used for the real UI proof. The local browser loaded Metro source at `localhost`, the current source rendered, and a legitimate E2E owner/operator account reached Platform Studio / Money Center through the existing app gate. Credentials are not documented here.

## Issues Found And Fixed

Local proof found two real local-source blockers:

- Money Center manager focus was still not reliable after a first manager opened because the old portal/modal manager surface could sit above the Ways to Earn cards. The fix renders the selected manager inline inside the focused Ways to Earn panel and keeps the duplicate accordion copy from rendering a second manager panel.
- Home local web rendering hit App Recovery because `StableImage` assumed one `Image.resolveAssetSource` export shape. The fix keeps native behavior and adds a safe web-compatible resolver fallback.

Local proof also found a Metro local-source blocker: ignored `.env*.local` proof files could be parsed as source by Expo Web. `metro.config.js` now blocks `.env*.local` files from Metro's resolver so local credential/fixture files are not bundled or parsed.

## Money Center Tap Proof

Local UI proof used real clicks and visible-result assertions.

TestID tap proof passed:

- `money-center-open-ways-to-earn-button` -> `money-center-ways-to-earn-focused-panel`
- `money-feature-tips-cta` -> `money-manager-tips`
- `money-feature-paid_video-cta` -> `money-manager-paid_video`
- `money-feature-watch_party_ticket-cta` -> `money-manager-watch_party_ticket`
- `money-feature-channel_subscription-cta` -> `money-manager-channel_subscription`
- `money-feature-vip-cta` -> `money-manager-vip`
- `money-feature-event_pass-cta` -> `money-manager-event_pass`
- `money-center-cashout-readiness-button` -> `money-manager-cashout-readiness`

Visible/manual-realism proof passed:

- visible `Open Ways to Earn` opened the focused Ways to Earn panel
- visible `Manage Tips` opened Tips Manager
- visible `Manage VIP Passes` opened VIP Manager
- visible `Review cashout readiness` opened Cashout / Payout readiness

Cashout readiness remained clear that cashout is not live.

## Route Proof

Local route-shell proof passed without Not Found or App Recovery for:

- `/channel-studio?tab=monetization&focus=transactions`
- `/channel-studio?tab=monetization&focus=offers`
- `/channel-studio?tab=monetization&focus=payouts`
- `/creator-monetization-setup`
- `/monetize`
- `/revenue`
- `/payouts`
- `/settings`
- `/chat`
- `/channel/[userId]`
- `/channel-subscription/[creatorId]`
- `/vip-pass/[creatorId]`

Source-specific buyer routes `/player/[id]`, `/watch-party/[partyId]`, and `/event/[eventId]` rendered safe route shells with placeholder local ids and did not go Not Found. Actual source/content/access proof for those routes remains fixture-limited until safe real fixture ids are provided in the local target.

## Notification Activity Proof

Settings -> Notifications / Activity loaded from real notification records. Important / Action Needed rows were visible, read important rows remained visible, dismiss controls were present, and a dismissed row reduced the unread count. A missed Chi'lly Chat call notification opened the Chat thread route and did not auto-answer.

Recent Activity was fixture-limited in this local account because existing records were dominated by Important / Action Needed call rows.

## Bell And Tray Proof

Normal surface bell proof passed on local web for Home, Explore, Live, Saved, and Platform Studio:

- bell icon is visible and icon-only
- badge is backed by the real unread count
- no visible `Notifications` word appears in compact headers
- Settings and Profile/avatar controls remain present where those headers support them
- tapping the Home bell opened the Activity tray with Important / Action Needed rows and an Activity Settings action

## Room-Safe Proof

Watch-Party Waiting Room rendered the room-safe notification bell and did not show the full normal tab header. The route stayed in place.

The local account hit the Premium Watch-Party gate before real room entry, and placeholder Party Room / Live Stage ids rendered safe unavailable states. Therefore tray-open behavior inside an actual room, LiveKit mute/camera preservation, and real Live Stage room behavior remain fixture/account-limited and physical-device-required for installed proof.

## Chi'lly Chat Call Behavior Proof

Local Activity proof verified a missed Chi'lly Chat call notification routed to Chat without auto-answer. Source proof remains the coverage for room-safe incoming call banner actions: Decline, Reply in Chat, Leave room and answer, no auto-answer, no auto-leave, no mic/camera hijack, and host disruption warning.

Actual two-device incoming-call proof in a live room remains physical-device-required.

## Seat Pass Wording

Visible UI uses Seat Pass wording:

- Watch-Party Seat Pass
- Paid Watch-Party Seats
- Seat Pass
- Seat Pass ready
- Seat Pass sold

Remaining `Watch-Party ticket` / `ticket` strings are internal compatibility, provider/database/migration history, or forward migration cleanup references. Internal keys such as `watch_party_ticket` remain unchanged.

## Artifacts

Local proof artifacts:

- `/tmp/local-emulator-notifications-money-center-proof-20260630-220716/`

Artifacts include local route state, Money Center tap proof, notification Activity proof, bell/tray proof, room-safe route proof, and wording/search notes. Private emails and UUIDs must not be copied into public reports.

## Installed-App Status

Physical/Play proof is still required. Source/local-web proof is not installed-app proof. A future Google Play internal build is still required for Google-signed visible device closure, Play Billing / RevenueCat behavior, Android push/device behavior, room camera/mic behavior, and two-device incoming call proof.
