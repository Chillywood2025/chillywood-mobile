# Manual App Live Monetization Checklist

Proof folder: `/tmp/chillywood-browserstack-monetization-e2e-proof-YYYYMMDD-HHMMSS`

Use checkboxes during BrowserStack App Live or physical-device proof.

Google Play purchase confirmation is human-required unless strict sandbox auto-confirm mode proves every safety check. Use BrowserStack App Live or a physical licensed-tester device for any ambiguous purchase sheet. No coordinate taps, no fake purchase completion, and no pass claim without post-purchase app state and backend readback.

Strict sandbox auto-confirm mode is explicit (`--auto-confirm-sandbox-purchase`) and is not the default. It may confirm only when the visible Google Play sheet clearly shows test/sandbox language such as `Test card`, `Test instrument`, `Test purchase`, `This is a test`, or `Google Play test`; the expected tester account and expected product are verified when exposed; the fixture is sandbox/not_payable/no_payout; live money is off; payout authority is false; production purchase intents are zero; payable ledger events are zero; and the confirmation button can be tapped by stable visible text/accessibility label. If any check is absent or ambiguous, stop with `HUMAN_REQUIRED_GOOGLE_PLAY_CONFIRMATION`.

Before manual confirmation, Codex may use the repair-loop policy only for safe QA blockers. Codex must stop for purchase approval, RevenueCat/Google Play production purchase logic, Premium entitlement logic, RLS, service-role handling, live money, payouts, LiveKit authority, Watch-Party shared player, Chi'lly Chat, or broad product refactors.

After every manual or strict sandbox purchase confirmation, save screenshots/video and run readback proving scoped access only, no unrelated unlock, no payable ledger, no payout authority, and no live money.

## Premium

- [ ] Account: viewer/tester
- [ ] Route: `/subscribe`
- [ ] Screenshot: `premium_screen.png`
- [ ] Expected: Chi'llywood Premium only; not creator subscription/VIP
- [ ] Confirm installed runtime exposes `premium-screen` or document stale OTA/cache before proceeding.
- [ ] Pass/fail notes:

## Tip Creator

- [ ] Account: sandbox tester viewer
- [ ] Route: creator Platform
- [ ] Selector: `tester-tip-creator-button`, then `tip-confirm-button`
- [ ] Screenshot: `tip_sheet.png`
- [ ] Manual Google Play confirmation completed by human
- [ ] Or strict sandbox auto-confirm used only after visible test purchase notice and expected tester/product verification
- [ ] Post-purchase app state and backend readback saved
- [ ] Expected: contribution only, no content unlock, no payout
- [ ] Pass/fail notes:

## Paid Video

- [ ] Account: sandbox tester viewer
- [ ] Route: creator Platform or Player
- [ ] Selector: `tester-paid-video-unlock-button`
- [ ] Screenshot: `paid_video_gate.png`, `paid_video_player_ready.png`
- [ ] Manual Google Play confirmation completed by human
- [ ] Or strict sandbox auto-confirm used only after visible test purchase notice and expected tester/product verification
- [ ] Post-purchase app state and backend readback saved
- [ ] Expected: unlock one video only; playable source opens
- [ ] Pass/fail notes:

## Watch-Party Ticket

- [ ] Account: sandbox tester viewer
- [ ] Route: creator Platform or Party Room
- [ ] Selector: `tester-watch-party-ticket-button`, `watch-party-ticket-purchase-button`
- [ ] Screenshot: `watch_party_ticket_gate.png`
- [ ] Manual Google Play confirmation completed by human
- [ ] Or strict sandbox auto-confirm used only after visible test purchase notice and expected tester/product verification
- [ ] Post-purchase app state and backend readback saved
- [ ] Expected: ticket unlocks one Party Room/Watch-Party target only
- [ ] Pass/fail notes:

## Event Pass

- [ ] Account: sandbox tester viewer
- [ ] Route: event route
- [ ] Selector: `event-pass-purchase-button`
- [ ] Screenshot: `event_pass_gate.png`, `event_pass_confirmed.png`
- [ ] Manual Google Play confirmation completed by human
- [ ] Or strict sandbox auto-confirm used only after visible test purchase notice and expected tester/product verification
- [ ] Post-purchase app state and backend readback saved
- [ ] Expected: event pass unlocks one event only
- [ ] Pass/fail notes:

## Platform Subscription

- [ ] Account: sandbox tester viewer
- [ ] Route: creator Platform or Subscriber Area
- [ ] Selector: `tester-channel-subscribe-button`, `subscriber-area-subscribe-button`
- [ ] Screenshot: `subscriber_area.png`
- [ ] Manual Google Play confirmation completed by human
- [ ] Or strict sandbox auto-confirm used only after visible test purchase notice and expected tester/product verification
- [ ] Post-purchase app state and backend readback saved
- [ ] Expected: creator Platform subscription only; not Chi'llywood Premium
- [ ] Pass/fail notes:

## VIP Pass

- [ ] Account: sandbox tester viewer
- [ ] Route: creator Platform or VIP Area
- [ ] Selector: `tester-vip-pass-button`, `vip-area-get-vip-button`
- [ ] Screenshot: `vip_area.png`
- [ ] Manual Google Play confirmation completed by human
- [ ] Or strict sandbox auto-confirm used only after visible test purchase notice and expected tester/product verification
- [ ] Post-purchase app state and backend readback saved
- [ ] Expected: creator-specific VIP only; not Premium/subscription
- [ ] Pass/fail notes:

## Owner Cannot Buy Own Offers

- [ ] Account: owner
- [ ] Route: owner Platform
- [ ] Expected: Creator Offers management, no buyer CTAs
- [ ] Screenshot: `owner_creator_offers.png`
- [ ] Pass/fail notes:

## Separation / Safety

- [ ] Premium separate from creator offers
- [ ] Tips unlock nothing
- [ ] VIP does not unlock subscription
- [ ] Subscription does not unlock VIP
- [ ] Paid video/ticket/event are target scoped
- [ ] Tester revoke hides/blocks sandbox CTAs
- [ ] No crash, no raw internal error, no live money, no payout
- [ ] Fixture setup used local-only `SUPABASE_SERVICE_ROLE_KEY`; if absent, tester grant/readback is blocked and must not be bypassed.
- [ ] If provider ownership blocks rerun, document `PROVIDER_OWNERSHIP_REUSE_BLOCKER` and reset/revoke only dedicated E2E sandbox grants.
