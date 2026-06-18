# Manual App Live Monetization Checklist

Proof folder: `/tmp/chillywood-browserstack-monetization-e2e-proof-YYYYMMDD-HHMMSS`

Use checkboxes during BrowserStack App Live or physical-device proof.

## Premium

- [ ] Account: viewer/tester
- [ ] Route: `/subscribe`
- [ ] Screenshot: `premium_screen.png`
- [ ] Expected: Chi'llywood Premium only; not creator subscription/VIP
- [ ] Pass/fail notes:

## Tip Creator

- [ ] Account: sandbox tester viewer
- [ ] Route: creator Platform
- [ ] Selector: `tester-tip-creator-button`, then `tip-confirm-button`
- [ ] Screenshot: `tip_sheet.png`
- [ ] Expected: contribution only, no content unlock, no payout
- [ ] Pass/fail notes:

## Paid Video

- [ ] Account: sandbox tester viewer
- [ ] Route: creator Platform or Player
- [ ] Selector: `tester-paid-video-unlock-button`
- [ ] Screenshot: `paid_video_gate.png`, `paid_video_player_ready.png`
- [ ] Expected: unlock one video only; playable source opens
- [ ] Pass/fail notes:

## Watch-Party Ticket

- [ ] Account: sandbox tester viewer
- [ ] Route: creator Platform or Party Room
- [ ] Selector: `tester-watch-party-ticket-button`, `watch-party-ticket-purchase-button`
- [ ] Screenshot: `watch_party_ticket_gate.png`
- [ ] Expected: ticket unlocks one Party Room/Watch-Party target only
- [ ] Pass/fail notes:

## Event Pass

- [ ] Account: sandbox tester viewer
- [ ] Route: event route
- [ ] Selector: `event-pass-purchase-button`
- [ ] Screenshot: `event_pass_gate.png`, `event_pass_confirmed.png`
- [ ] Expected: event pass unlocks one event only
- [ ] Pass/fail notes:

## Platform Subscription

- [ ] Account: sandbox tester viewer
- [ ] Route: creator Platform or Subscriber Area
- [ ] Selector: `tester-channel-subscribe-button`, `subscriber-area-subscribe-button`
- [ ] Screenshot: `subscriber_area.png`
- [ ] Expected: creator Platform subscription only; not Chi'llywood Premium
- [ ] Pass/fail notes:

## VIP Pass

- [ ] Account: sandbox tester viewer
- [ ] Route: creator Platform or VIP Area
- [ ] Selector: `tester-vip-pass-button`, `vip-area-get-vip-button`
- [ ] Screenshot: `vip_area.png`
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
