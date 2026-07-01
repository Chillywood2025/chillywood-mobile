# Money Center Human Tap Focus Proof

## Scope

This lane stopped the Google Play/EAS build loop and proved Money Center "Open Ways to Earn" focus behavior against local source before any new installed build.

No EAS build, Google Play internal build, Play submission, sideload, adb install, logout of existing physical devices, clear data, or reinstall was run in this lane.

## Current Commit

- Base remote before local fix: `300a6312b42c9259cd49a69267198d7d589eaf6e`
- Local source fix before final commit: `e6e5323134229bbbd72e18f83635761cea9d23e3`
- Final proof commit: recorded in the lane report after commit.

## Access Blocker

Money Center is protected by the Channel Studio premium/role gate in `app/channel-settings.tsx`.

The route requires:

- a signed-in active account; and
- either an active Premium entitlement from `readCurrentUserEntitlement("premium")`, or active owner/operator Platform Studio role membership.

Earlier local targets failed before Money Center because R5 reached the Play-installed app without loading Metro/local source and hit `Premium required`; the emulator did not load local source and was signed out; the first web E2E creator account also hit `Premium required`.

## E2E Account Method

Local proof used an existing seeded E2E Premium account with a legitimate active Premium entitlement. No production gate was bypassed, no RLS was weakened, no production source code bypass was added, and no fixture mutation was required. This document does not include private credentials.

## Local-Source Target

Local web was used because attached Android targets did not request the Metro/local bundle. This is Partial relative to Android local-device coverage, but it is valid local-source UI proof for the Money Center interaction.

Proof setup:

- Temporarily moved ignored `.env.*.local` proof files out of Metro's scan path so Expo Web would not try to parse them as source.
- Started `npm run web -- --port 8085 --host localhost`.
- Loaded `http://localhost:8085/channel-studio?tab=monetization`.
- Signed in to the local web session with the seeded E2E Premium account.
- Verified Money Center rendered without `Premium required`.
- Restored ignored `.env.*.local` files after proof and stopped the local web server; leaving Expo Web running while restoring those files can re-trigger the Metro env-file scan issue.

## Issues Fixed

- `Open Ways to Earn` no longer relies on hardcoded pixel offsets or timed scroll retries.
- The focused Ways to Earn panel is rendered directly in the Money Center focused area.
- The secondary accordion copy uses suffixed testIDs so primary proof selectors are unique.
- Focused accordion bodies are suppressed while the same section is already open in the focused panel, preventing duplicate actionable controls.
- Paid Video, Watch-Party Seat Pass, and Event Pass CTAs now open their Money Center manager first, even when setup prerequisites are missing; their managers show the next setup action instead of navigating away.
- Web local proof uses a portal-backed manager overlay so the manager sheet is not trapped by the scroll container.
- Long manager content is clipped inside the sheet and scrolls internally instead of rendering offscreen.
- Cashout readiness collapses Ways to Earn when switching to payout focus so the payout panel is the single visible cashout action surface.

## TestID UI Proof

Local UI automation used real UI actions against testIDs on actual tappable controls, then asserted visible result targets.

Passed sequence:

1. `money-center-open-ways-to-earn-button` -> `money-center-ways-to-earn-focused-panel`
2. `money-feature-tips-cta` -> `money-manager-tips`
3. `money-feature-paid_video-cta` -> `money-manager-paid_video`
4. `money-feature-watch_party_ticket-cta` -> `money-manager-watch_party_ticket`
5. `money-feature-channel_subscription-cta` -> `money-manager-channel_subscription`
6. `money-feature-vip-cta` -> `money-manager-vip`
7. `money-feature-event_pass-cta` -> `money-manager-event_pass`
8. `money-center-cashout-readiness-button` -> `money-manager-cashout-readiness`

All result targets were present and visible in the mobile-sized local viewport.

## Human-Like Tap Proof

The human-realism pass used real visible/button controls rather than source string checks.

Passed sequence:

1. Tapped the visible `Open Ways to Earn` button and confirmed `Creator setup mode` was visible.
2. Tapped the real Tips action button and confirmed `Tips Manager` was visible.
3. Tapped the real VIP action button and confirmed `VIP Pass Manager` was visible.
4. Tapped the real `Review cashout readiness` button and confirmed `Cashout not live yet.` was visible.

## Attached Device Result

Attached-device local proof remains blocked:

- R5 did not request the local Metro bundle, so the Play-installed app did not prove this local source.
- The emulator did not request the local Metro bundle and was signed out.
- No sideload, adb install, clear data, logout, or Play build was used to force device state.

## Validation Status

Recorded in the final lane report after running:

- `npm run proof:creator-monetization-route-button-wiring`
- `npm run guard:money-center-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:route-contracts --if-present`
- `npm run guard:brand-spelling-policy`
- `npm run typecheck`
- `npm run validate:runtime`
- `git diff --check`
- `git diff --cached --check`

## Installed Proof Status

Installed Play proof remains Pending. Source/local UI proof is not installed-app proof. A future Google Play internal build is still required for installed closure, but it should happen only after this local human-tap path remains stable.
