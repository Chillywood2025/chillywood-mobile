# Chi'llywood Money Flow UI/UX Audit And Upgrade Plan

Date: June 19, 2026

Scope: visual and interaction quality for the seven viewer and creator money flows. This audit does not change backend payments, Premium entitlement logic, RLS, LiveKit authority, Watch-Party shared player behavior, Chi'lly Chat, payouts, or live-money behavior.

Inspected surfaces include:

- `app/subscribe.tsx`
- `components/monetization/tip-sheet.tsx`
- `components/monetization/access-sheet.tsx`
- `app/channel/[userId].tsx`
- `app/player/[id].tsx`
- `app/watch-party/[partyId].tsx`
- `app/event/[eventId].tsx`
- `app/channel-subscription/[creatorId].tsx`
- `app/vip-pass/[creatorId].tsx`
- `app/channel-settings.tsx`

## Executive Verdict

June 20 closeout update: Seven-flow money proof: CLOSED / app-side proof complete. Premium, Tips, Paid Video, Watch-Party Ticket, Channel Subscription, VIP, and Event Pass have reliable Android app-side proof; Watch-Party Ticket exact-target purchase/readback and VIP provider ownership reset plus fresh first-purchase proof are closed. Do not reopen the money lane unless a new regression appears. Remaining future work is provider/test-account maintenance and live-production rollout governance, not app-code proof.

The seven money flows are **partially ready visually**.

The strongest part is product safety and scope clarity. The UI repeatedly explains that Premium, tips, paid videos, Watch-Party tickets, subscriptions, VIP, and paid events are separate. The app also has stable route and flow test IDs, clear sandbox language, locked/unlocked states, and creator Money Center foundations.

The weaker part is public-facing premium polish. Several flows still feel like safe QA/proof screens rather than a finished creator-economy experience. They are understandable, but not consistently adaptive, branded, rewarding, or emotionally satisfying after purchase. Creator tools are broad and useful, but the business dashboard can feel dense and operational instead of modern, high-signal, and creator-first.

Launch posture:

- **Can proceed for controlled proof/testing:** yes; the app-side proof lane is closed.
- **Feels fully public-ready as a premium monetization experience:** not yet.
- **Recommended launch classification:** partially ready, with must-have visual polish before broad public money launch.

This visual verdict does not reopen app-code proof. Sandbox proof does not enable live money or payouts. Public launch still requires external launch governance, Play/RevenueCat production readiness, any non-money Public V1 blockers, and explicit owner approval before live-money or payout rollout. iOS remains later unless explicitly changed.

## Money Flow UI/UX Matrix

| Flow | Viewer Experience | Creator Experience | Current UI Status | Feels Premium? | Feels Adaptive? | Visual Gaps | Recommended Upgrade | Launch Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Premium subscription | Viewer sees a dark branded Premium screen with status, restore/manage options, app-wide Premium separation, and purchase-unavailable states. Value is clear but static. | Creator sees Premium as a gate for creator tools and Studio access, not as creator revenue. | Functional and well-scoped. Strong safety copy. Uses route-level selectors and status cards. | Medium. Branded, but more utility than premium. | Low-medium. Handles active, unavailable, restore, and sandbox states, but not personalized. | Benefit hierarchy is plain. Unlock moment is not memorable. Premium vs creator products is mostly text, not visual. | Add a compact cinematic Premium hero, three benefit pillars, clear current-state card, active-member receipt, and visual "Premium is app-wide" comparison strip. | Must-have |
| Creator tips | Viewer gets a bottom sheet with creator identity, amount chips, custom amount, note, contribution-only copy, and success notice. | Creator can enable/manage tip settings and see tip transactions in Money Center. | Clear and safe. Amount selection is practical. | Medium. Sheet is clean but not emotionally strong. | Medium. Suggested/custom amounts adapt, but no creator-branded context or support narrative. | Feels like a payment form. Thank-you state is text-only. Too much sandbox/proof tone leaks into public feel. | Add creator-branded support card, selected amount emphasis, optional "why support" copy, warm success receipt, and "tip unlocks nothing" as trust copy below the CTA. | Must-have |
| Paid creator videos | Viewer sees paid lock messaging in Player, exact scope copy, unlock CTA, and player-ready selector after access. | Creator can mark/manage paid videos and see paid video offers/transactions. | Functional. Good scope copy. Locked player state exists. | Medium-low. Floating card works, but it looks like a technical overlay. | Medium. Responds to locked/unlocked/busy states. | Missing paid video storefront feel: thumbnail, title, preview metadata, price card, creator context, and post-unlock celebration. | Use a paid video lock overlay with thumbnail, creator avatar, exact video title, price, access scope chip, and smooth transition into playback after unlock. | Must-have |
| Paid Watch-Party rooms | Viewer gets a room ticket gate, price, ticket-only scope, and room re-entry path after access. | Creator can manage a Watch-Party ticket target and sees ticket offers/transactions. | Functional and safety-heavy. It protects LiveKit/host authority. | Medium-low. Gate is clear but basic. | Medium. Handles room locked, ticket unavailable, purchase required, and room access. | Ticket should feel like an event/room pass. Current gate reads like an error card. | Add room access card with live/upcoming/locked status chips, ticket badge, room name, host identity, seat/capacity if available, and "enter room" reward state. | Must-have |
| Channel subscriptions | Viewer can subscribe/open Subscriber Area and sees clear includes/does-not-include copy. | Creator can enable/manage subscription, view offer, and see subscriber signals/transactions. | Clear, scoped, and safe. Subscriber Area exists. | Medium. Good separation, sparse member experience. | Medium. Owner/viewer/subscribed/unavailable states exist. | Subscriber Area empty state can feel unrewarding. Offer card is generic. | Add creator-branded membership card, subscriber badge, active benefits panel, member-only empty state that promises upcoming drops without faking content, and renewal/restore state clarity. | Must-have |
| VIP passes | Viewer can buy/open VIP Area and sees clear VIP-only scope. | Creator can enable/manage VIP and see VIP signals/transactions. | Functional and separated from Premium/subscription. | Low-medium. VIP does not visually feel VIP yet. | Medium. Owner/viewer/VIP/unavailable states exist. | VIP lacks distinct identity, badge, visual status, and premium reward. | Add VIP pass visual identity, active VIP badge, high-contrast VIP Area header, creator-specific perk cards, and "VIP does not include..." trust strip. | Must-have |
| Paid creator events | Viewer sees event title, type, time, price, pass status, capacity, locked/access/denied states. | Creator can create/manage events and paid event offers, and see pass counts. | Functional. Event pass route is simple and direct. | Medium-low. It is understandable but not event-like. | Medium. Handles locked, granted, unavailable, sold-out copy. | Missing event poster/hero, countdown, schedule framing, ticket receipt, and return-visit state. | Add paid event poster card, countdown/status chip, pass card after purchase, capacity/proof row, and clear expired/canceled/refunded states. | Must-have |

## Viewer Journeys

### 1. Premium Subscription

Discovery:
Viewer sees Premium entry from locked Premium features, Studio access prompts, player/watch-party Premium gates, or `/subscribe`.

Locked state:
Show a stable Premium screen with `screen-premium` / `premium-screen`, current entitlement status, and a high-contrast "Premium required" state when coming from a gated feature.

Value explanation:
Lead with app-wide Chi'llywood Premium. Show three clear benefit pillars: creator tools, Watch-Party Live access where applicable, and premium app experience. Include a visual "does not include creator subscriptions, VIP, paid videos, tickets, or events" comparison row.

Action:
Primary CTA changes by state: subscribe, restore, manage, active, product unavailable, or sandbox unavailable. Never show a misleading purchase CTA when product data is unavailable.

Payment:
Use system purchase sheet only. UI should remain calm and show "Opening Google Play" while preserving route context.

Unlocked/reward state:
After purchase or restore, show a compact active-member receipt with the enabled feature, next best action, and a subtle haptic/motion cue.

Return visit:
Status card should show active entitlement, renewal/manage action, restore option, and the last feature context when opened from a gate.

### 2. Creator Tips

Discovery:
Viewer finds Tip from the Platform hero, Support this Platform section, creator profile support prompt, or a post-video creator support prompt.

Locked state:
Tips do not lock content. The "locked" equivalent is contribution-only clarity: tip is optional support and unlocks nothing.

Value explanation:
Show creator avatar/name, a short creator-branded support line, selected amount chips, and "contribution only" trust copy. The no-unlock warning should be visible but not dominate the emotional support moment.

Action:
Amount selection, optional note, then "Send tip" or safe sandbox label. Disabled state must explain unavailable provider/setup state.

Payment:
Open Google Play. If purchase is unavailable, return to the sheet with a clear retry/restore/provider-unavailable state.

Unlocked/reward state:
Show a thank-you receipt, amount, creator name, and "No content was unlocked" trust line. Optional subtle confetti or haptic is acceptable; no badges or public clout should be invented.

Return visit:
Tip sheet should remember suggested amounts from creator settings but should not imply access, rank, or VIP status.

### 3. Paid Creator Videos

Discovery:
Viewer sees a paid lock badge on the creator video card, Platform support section, player route, or creator storefront.

Locked state:
Player should show a premium lock overlay with thumbnail/preview still, video title, creator identity, price, and "unlocks this video only".

Value explanation:
Clarify what the viewer gets: this one creator video and playback access. Separate from Premium, subscription, VIP, rooms, tickets, events, and other creator content.

Action:
Primary CTA: unlock video. Secondary: back to creator Platform or view more from creator. Product unavailable state should be visually separate from access denied.

Payment:
Open Google Play with busy state in the overlay.

Unlocked/reward state:
Replace lock overlay with "Unlocked" receipt and transition into player-ready state. The player should feel immediately available, not like a technical reload.

Return visit:
Show a small "Unlocked" chip on the video card/player and skip the paywall. Restore/readback state should be clear if access is missing.

### 4. Paid Watch-Party Rooms

Discovery:
Viewer sees ticketed room from Platform support, room link, live/upcoming room list, or creator event/programming area.

Locked state:
Gate should feel like a ticketed room pass, not an error. Show room title/host, live/upcoming/ended/locked chip, seat/capacity when available, price, and exact scope.

Value explanation:
Explain: this ticket unlocks this Watch-Party room target only. It does not grant LiveKit publish, host, moderator, Premium, VIP, subscription, paid videos, events, or other rooms.

Action:
Primary CTA: get ticket. Secondary: back to Platform or room details. If room is ended/locked/unavailable, the disabled state must say why.

Payment:
Open Google Play. Keep user anchored to the room target.

Unlocked/reward state:
Show ticket confirmed, then "Enter room" or waiting-room path. If camera/mic permission appears, frame it as device permission, not monetization proof.

Return visit:
Show access chip for this room and route directly to waiting room/Party Room when access is still valid. Expired/revoked state must show a clear re-entry denial.

### 5. Channel Subscriptions

Discovery:
Viewer sees Subscribe in the Platform hero/support section, Subscriber Area route, private/subscriber-only content gates, or creator membership card.

Locked state:
Subscriber Area should show creator identity, monthly membership card, price, active/inactive state, and what subscription unlocks.

Value explanation:
Use two visual columns: included and not included. Included: creator subscriber area / private subscriber access where allowed. Not included: Chi'llywood Premium, VIP, paid videos, tickets, events, and other creators.

Action:
Primary CTA: subscribe or open Subscriber Area. Restore/manage states should be present where supported.

Payment:
Open Google Play monthly subscription sheet.

Unlocked/reward state:
Show active subscriber badge and a member card. If no subscriber-only posts exist, the empty state should feel like "you are in early" rather than "nothing exists".

Return visit:
Subscriber Area opens as active with current member state, creator updates, and scoped access. Expired/canceled/restored states need explicit visuals.

### 6. VIP Passes

Discovery:
Viewer sees Get VIP in Platform support, VIP Area route, creator highlight prompt, or creator storefront.

Locked state:
VIP gate should feel distinct from subscription. Use a VIP pass card, creator-branded treatment, and strong status chip.

Value explanation:
Explain VIP is creator-specific identity/access. It does not include Chi'llywood Premium, subscription, paid videos, tickets, events, room authority, LiveKit authority, payouts, or other creators.

Action:
Primary CTA: get VIP. If already VIP, open VIP Area. Unavailable state should distinguish missing offer, provider unavailable, and revoked/expired access.

Payment:
Open Google Play. Keep VIP context visible before and after sheet.

Unlocked/reward state:
Show active VIP badge/pass and VIP Area entry. Use a restrained haptic or glow transition. Do not invent public status unless the product explicitly supports it.

Return visit:
VIP Area opens with active state, perks/updates, and clear scope. Empty VIP area should still feel premium and intentional.

### 7. Paid Creator Events

Discovery:
Viewer sees event card from Platform programming, event route, event reminders, creator announcements, or event pass prompt.

Locked state:
Event pass gate should show poster/hero, event title/type, date/time, countdown, status, price, capacity/pass count when available, and pass-only scope.

Value explanation:
Explain the pass unlocks this event only. It does not include Premium, VIP, subscription, paid videos, Watch-Party tickets, other events, host authority, or payout authority.

Action:
Primary CTA: get event pass. Disabled states: sold out, canceled, ended, unavailable, provider unavailable.

Payment:
Open Google Play. Maintain event context.

Unlocked/reward state:
Show event pass confirmed as a ticket receipt with date/time and "Open event" action.

Return visit:
Show pass confirmed until event expires/ends/revokes. Expired/canceled/refunded states must be visually clear and not look like a bug.

## Creator Journeys

### 1. Premium Subscription

Setup:
Creator accesses Platform Studio and creator tools through Premium or owner/operator access.

Preview:
Creator sees which app-wide creator tools Premium enables, separate from creator earnings.

Publish/enable:
No creator offer is published from Premium. Premium is app-wide.

Viewer activity:
Premium activity should not be displayed as creator income or creator subscriber activity.

Earnings/status:
Creator dashboard should show Premium as app access/tool readiness, not creator revenue.

Admin or payout readiness:
No payout readiness impact. Premium purchase does not create creator payable records.

### 2. Creator Tips

Setup:
Creator enables tips, suggested amounts, min/max, and provider readiness from Money Center.

Preview:
Creator previews the support sheet with the creator name/avatar and contribution-only copy.

Publish/enable:
Tip status becomes visible on Platform when provider/test mode allows it.

Viewer activity:
Creator sees tip transactions, contributor-safe details, failed/refunded/revoked states where supported.

Earnings/status:
Show sandbox/not-payable or live/payable status clearly. For launch, avoid showing withdrawable earnings unless payouts are truly active.

Admin or payout readiness:
Payout readiness appears as locked/off/read-only until live money and payouts are approved.

### 3. Paid Creator Videos

Setup:
Creator selects a safe public video and sets an approved price/product mapping.

Preview:
Creator previews the paid lock overlay and public video card lock badge.

Publish/enable:
Paid offer appears only when video is public/safe and product setup is ready.

Viewer activity:
Creator sees sales/unlock count, gross sandbox/test label, and video title.

Earnings/status:
Show paid video activity as scoped to that video. Payout status stays separate and off until approved.

Admin or payout readiness:
Admin/readback confirms no Premium/VIP/subscription/room/event unlocks.

### 4. Paid Watch-Party Rooms

Setup:
Creator links a ticket offer to one Party Room target.

Preview:
Creator previews ticket gate, room status, seat/capacity, and "no LiveKit authority" copy.

Publish/enable:
Ticket becomes visible only for the linked room target.

Viewer activity:
Creator sees seats sold and room target readiness.

Earnings/status:
Ticket activity is scoped to one room and is not host/publish authority.

Admin or payout readiness:
Readback must show no LiveKit publish, host, moderator, payout, or unrelated unlock authority.

### 5. Channel Subscriptions

Setup:
Creator enables monthly channel subscription and defines creator membership positioning.

Preview:
Creator previews Subscriber Area and public subscription card.

Publish/enable:
Subscribe CTA appears on Platform when offer and provider state are ready.

Viewer activity:
Creator sees subscriber count/signals, active/expired/revoked states, and member area engagement when supported.

Earnings/status:
Subscription activity must show scoped creator subscription status, not Chi'llywood Premium.

Admin or payout readiness:
Payout readiness remains separate. Subscription grants should not unlock VIP/paid videos/tickets/events.

### 6. VIP Passes

Setup:
Creator enables VIP Pass and defines VIP positioning/perks.

Preview:
Creator previews VIP Area and public VIP card.

Publish/enable:
Get VIP CTA appears on Platform when offer/provider state is ready.

Viewer activity:
Creator sees VIP count/signals, active/revoked/expired states, and VIP Area activity when supported.

Earnings/status:
VIP activity is creator-specific. It does not replace subscription or Premium.

Admin or payout readiness:
Readback confirms no Premium/subscription/paid target/room authority unlocks.

### 7. Paid Creator Events

Setup:
Creator creates an event, then enables an event pass for that event.

Preview:
Creator previews event card, pass gate, date/time, capacity, and event status.

Publish/enable:
Event pass appears only when event is scheduled/live and paid offer is ready.

Viewer activity:
Creator sees pass count, capacity, reminder interest, and event status.

Earnings/status:
Event pass activity is scoped to one event and should not show as broad membership.

Admin or payout readiness:
Readback confirms the event pass does not unlock VIP, subscription, paid videos, room tickets, Premium, LiveKit authority, or payouts.

## High-Tech UI Upgrade List

## Implementation Plan

This plan should be implemented as UI-only or UI-first work behind existing payment, access, Premium, RLS, LiveKit, Watch-Party, and payout rules. The first pass should not change purchase providers, entitlement decisions, access grants, payout states, or production money switches.

### Phase 0 - Visual System Foundation

Goal: make the seven flows feel like one premium money system without changing what any flow unlocks.

Build or standardize these reusable UI patterns:

- `MoneyOfferCard`
  - Shows title, creator/platform identity, price, billing cadence, scope, status, and primary CTA.
  - Supports modes: `premium`, `tip`, `paid_video`, `ticket`, `subscription`, `vip`, `event`.
  - Supports states: `available`, `active`, `locked`, `unavailable`, `expired`, `canceled`, `restored`, `refunded`, `revoked`, `loading`.

- `MoneyScopeStrip`
  - Shows concise "Includes" and "Does not include" rows.
  - Must keep Premium and creator products visually separate.
  - Should use the same language across all seven flows.

- `MoneyStatusChip`
  - Standard chips for: Premium active, creator-specific, sandbox/test, locked, unlocked, unavailable, sold out, ended, restored, expired, refunded, revoked, payouts off.

- `MoneySuccessReceipt`
  - One shared receipt pattern with product-specific copy.
  - Must say exactly what was unlocked or, for tips, that nothing was unlocked.

- `CreatorIdentityHeader`
  - Creator avatar, Platform name, verified/official state if available, and optional brand hero treatment.
  - Used for tips, paid videos, Watch-Party tickets, subscriptions, VIP, and paid events.

- `MoneyUnavailableState`
  - Explains provider unavailable, product unavailable, missing offer, blocked user, expired access, canceled event, sold out, or unsupported device without raw provider errors.

Acceptance for Phase 0:

- The seven flows share visible design language.
- Each money CTA remains backed by existing logic.
- No new unlocks, entitlements, payouts, provider calls, or RLS changes are introduced.
- Attached-device screenshots show consistent offer, lock, success, and unavailable states.

### Phase 1 - Viewer Money Flow Polish

Goal: make every viewer-facing paywall feel premium, creator-branded, and easy to understand.

1. Premium
   - Upgrade `/subscribe` with a cinematic but compact Premium hero.
   - Keep `premium-screen`, `screen-premium`, `premium-status-card`, and `premium-not-creator-offer-copy`.
   - Add an app-wide vs creator-products visual comparison strip.
   - Add active/restored receipt card when entitlement is active.

2. Tips
   - Upgrade `TipSheet` into a creator support moment.
   - Keep `tip-sheet`, `tip-confirm-button`, `tip-success-receipt`, and `tip-no-content-unlock-copy`.
   - Make selected amount visually stronger.
   - Add a warm thank-you receipt that still states tips unlock nothing.

3. Paid Videos
   - Upgrade the paid video player lock card.
   - Keep `paid-video-lock-card`, `paid-video-unlock-button` or current test equivalent, `paid-video-purchase-success-receipt`, and `paid-video-player-ready`.
   - Add thumbnail/creator context, price, and exact one-video-only scope.
   - Add smoother success-to-player transition.

4. Watch-Party Tickets
   - Replace error-card feeling with a ticketed room pass presentation.
   - Keep `watch-party-ticket-lock-card`, `watch-party-ticket-purchase-button`, `watch-party-ticket-success-receipt`, and room entry selectors.
   - Add room status chips and "no host/media authority" trust copy.

5. Channel Subscriptions
   - Upgrade Subscriber Area with a membership card.
   - Keep `subscriber-area-screen`, `subscriber-area-subscribed-badge`, `subscriber-area-includes-list`, and `subscriber-area-does-not-include-list`.
   - Make empty state feel intentional for early members.

6. VIP
   - Give VIP a distinct visual identity without adding fake clout.
   - Keep `vip-area-screen`, `vip-area-active-badge`, `vip-area-includes-list`, and `vip-area-does-not-include-list`.
   - Add a creator-specific VIP pass card and active state.

7. Paid Events
   - Upgrade event pass route into an event ticket experience.
   - Keep `screen-event`, `event-pass-lock-card`, `event-pass-purchase-button`, and access-granted selectors.
   - Add countdown/status, pass card, and expired/canceled/sold-out distinction.

Acceptance for Phase 1:

- A viewer can tell what they are paying for within five seconds.
- Every flow has a visually clear locked, payment-started, success, unavailable, and return-visit state.
- No flow implies unrelated access.
- Screens remain usable on small Android devices.

### Phase 2 - Creator Money Center Polish

Goal: make creators feel like they have a real creator business dashboard, while keeping live money and payouts off until explicitly enabled.

Upgrade Money Center around these areas:

- Top command center
  - Cards: Money readiness, Offers ready, Test activity, Payouts off, Next action.
  - Avoid making unavailable balances look like real earnings.

- Ways to earn
  - Show tips, paid videos, tickets, subscriptions, VIP, and events as product lanes.
  - Each lane shows: status, setup state, public visibility, latest activity, and next action.

- Offer health
  - Show "Ready", "Needs content", "Needs event", "Needs room target", "Unavailable", or "Provider blocked".
  - Do not hide missing setup behind generic empty states.

- Transactions/readback
  - Keep detailed rows available.
  - Summarize first; details second.
  - Never expose raw provider/private user data.

- Payout readiness
  - Keep visually separated from viewer purchases.
  - Show locked/off/read-only clearly.
  - Do not create a cash-out impression while payouts are off.

Acceptance for Phase 2:

- Creator can answer: what can I sell, what is live/test, what needs setup, what happened, and what is not payable.
- Creator sees no fake earnings, no fake followers, no fake sales, and no implied payout authority.
- Owner/tester mode remains visually distinct from public creator mode.

### Phase 3 - Adaptive And Reward Polish

Goal: add modern behavior after the core money UX is stable.

Safe adaptive behaviors:

- Shorter paywall copy for returning viewers.
- Active-access cards for already purchased products.
- Expired/revoked recovery states.
- Contextual prompts based on real state: follower, subscriber, VIP, blocked, already unlocked, or provider unavailable.
- Subtle haptics on confirmed success only.
- Creator-defined support goal only if backed by real data and excluded from fake public clout.

Do not add:

- Fake AI recommendations.
- Fake scarcity.
- Fake earnings pulse.
- Fake supporter rankings.
- Crypto/tokens.
- Public badges that imply unsupported status.

Acceptance for Phase 3:

- Adaptive UI reduces confusion and taps.
- No unsupported claims appear.
- The same test IDs remain available for attached-device automation.

## Concrete Screen Upgrade Map

| Surface | Keep | Upgrade | Do Not Change |
| --- | --- | --- | --- |
| `app/subscribe.tsx` | Premium route selectors, status card, restore/manage behavior, product-unavailable fallback | Add hero hierarchy, benefit pillars, active receipt, Premium-vs-creator-products comparison | Premium entitlement logic, RevenueCat/Google Play logic |
| `components/monetization/tip-sheet.tsx` | Tip amount logic, note, no-unlock copy, success receipt test ID | Add creator-branded support card, stronger selected amount, better receipt state | Tip purchase backend, payout logic, public rewards |
| `components/monetization/access-sheet.tsx` | Existing Premium/Party Pass safety and restore behavior | Standardize into shared money offer/status/success components | Access resolution and entitlement decisions |
| `app/channel/[userId].tsx` | Platform hero, support section, owner/viewer mode selectors | Convert Support this Platform into polished money shelf with creator-branded offer cards | Platform visibility gates, owner self-purchase rules |
| `app/player/[id].tsx` | Paid video lock logic, player-ready selector, Watch-Party shared player behavior | Improve paid video lock overlay and unlocked transition | Playback authority, shared player controls, LiveKit |
| `app/watch-party/[partyId].tsx` | Ticket gate logic, waiting-room/Party Room path, LiveKit authority protections | Make ticket gate feel like a room pass with status chips | Watch-Party shared player, host/publish authority |
| `app/event/[eventId].tsx` | Event pass access states and route selector | Add event ticket layout, countdown, ticket receipt, sold-out/canceled/ended clarity | Event access grant logic |
| `app/channel-subscription/[creatorId].tsx` | Includes/does-not-include, subscriber badge, access gate | Add creator membership card, better empty member area, return-visit active state | Subscription access logic |
| `app/vip-pass/[creatorId].tsx` | VIP active badge, includes/does-not-include, access gate | Add VIP pass identity, distinct VIP styling, premium empty state | VIP access logic |
| `app/channel-settings.tsx` | Money Center data, safety state, provider/readback sections | Reorder into creator command center, product lanes, and high-signal next actions | Payout enablement, live money, provider side effects |

## Visual Language Rules

- Cards should be compact and sharp; avoid nested card stacks.
- Use 8px or less radius for ordinary cards unless matching an existing app pattern.
- Use creator media where it clarifies what is being bought.
- Use icons only where they reduce reading load.
- Prefer status chips over long inline status sentences.
- Put trust copy close to money CTAs, but keep value copy first.
- Avoid oversized marketing hero sections inside operational flows.
- Use motion only for purchase success, active access, and important state changes.
- Do not use random badges, fake leaderboards, fake scarcity, fake sales, or unsupported audience metrics.

## Attached-Device Proof Plan

Run on a real attached Android device before public launch. BrowserStack is paused for this lane.

Proof folders should follow:

`/tmp/chillywood-money-ui-ux-proof-YYYYMMDD-HHMMSS`

Capture per flow:

- locked state screenshot
- value explanation screenshot
- CTA/payment-start screenshot
- success/unlocked screenshot when sandbox proof is available
- unavailable/failed/canceled state screenshot where practical
- return-visit screenshot
- creator setup/status screenshot
- creator activity/readback screenshot

Minimum command/test expectations:

- Use test IDs or visible text for taps.
- Do not use coordinate taps for money CTAs.
- Do not run live-money or payout behavior.
- Do not fake purchase success.
- If purchase confirmation is unavailable, still capture the pre-purchase visual state and classify the blocker separately from UI readiness.

Attached-device pass condition:

- The money flow looks understandable and premium before purchase.
- The purchase-start state does not look broken.
- Success/access state is visibly rewarding when purchase proof is available.
- Unavailable/failure state is clear and non-scary.
- Creator dashboard shows truthful status and next action.

## Launch Cutline

### Must Land Before Broad Public Money Launch

- Unified money visual components or equivalent consistent styling.
- Public-ready Premium screen.
- Public-ready Tip sheet.
- Paid video lock overlay polish.
- Watch-Party ticket gate polish.
- Subscription and VIP active/empty-state polish.
- Paid event ticket/pass polish.
- Creator Money Center command-center pass.
- Attached-device visual proof for all seven flows.

### Can Ship After First Controlled Launch

- Haptics and subtle motion.
- Adaptive shorter copy for returning viewers.
- Creator support goals.
- Offer performance cards.
- Event countdown polish.
- More detailed refund/revoke center.

### Should Wait Until Real Data Exists

- Live earnings pulse.
- Conversion analytics.
- Personalized support prompts.
- Repeat supporter identity.
- Creator storefront ranking.
- Dynamic pricing suggestions.

## Risk Controls

- Keep all money UI upgrades scoped to presentation, copy, state display, and testability.
- Any change that touches provider purchase logic, Premium entitlement, RLS, service-role handling, LiveKit authority, Watch-Party shared player behavior, payout authority, or live-money state must be treated as a separate backend/security task.
- Synthetic or sandbox activity must not appear as real public traction.
- E2E/test accounts must not inflate real creator credibility.
- Debug/proof language must not leak into normal public mode.

### Must-Have Before Launch

1. **Unified money visual system**
   - Shared offer card pattern for price, scope, provider state, and CTA.
   - Shared access status chips: locked, active, unavailable, restored, expired, canceled, refunded, revoked.
   - Shared success receipt pattern per product.
   - Shared "does not include" trust strip with concise icons/text.

2. **Creator-branded offer presentation**
   - Use creator avatar, Platform name, and brand color/hero image where available.
   - Keep dark premium Chicago entertainment styling: black/charcoal base, controlled crimson/gold accents, restrained glow.
   - Avoid one-note purple/blue gradients or generic SaaS cards.

3. **Clear locked-to-unlocked transitions**
   - Lock state says exactly what is locked.
   - Payment busy state says what is happening.
   - Success state says what is now unlocked.
   - Return visit skips unnecessary re-explanation and shows active access.

4. **Premium separation map**
   - Every creator product should visually reinforce: "This is creator-specific. Chi'llywood Premium is separate."
   - Premium should visually reinforce: "This is app-wide. Creator offers are separate."

5. **Creator Money Center clarity pass**
   - Top summary should feel like a creator business dashboard, not a provider checklist.
   - Use "Ready / Needs setup / Locked / Payouts off" cards with clear next action.
   - Keep provider/readback detail collapsible.

6. **Public copy cleanup**
   - Sandbox/test language should be hidden from normal public users when live mode eventually exists.
   - Public flows should prioritize value and trust, not proof jargon.

7. **Attached-device acceptance tests**
   - Use route/test IDs and visible text for taps.
   - Verify no coordinate-dependent money interactions.
   - Capture screenshots for locked, purchase-start, success, failed/unavailable, and return-visit states.

### Good Upgrade After Launch

1. **Subtle unlock motion and haptics**
   - One short haptic and a restrained receipt animation after successful unlock.
   - No looping celebration or distracting animation.

2. **Adaptive paywalls**
   - New viewer: stronger explanation.
   - Returning viewer: shorter state card.
   - Already unlocked: direct access and active receipt.
   - Expired/revoked: clear reason and recovery action.

3. **Creator goal progress**
   - Optional creator-defined support goal for tips or event capacity.
   - Must be real data only, never fake public traction.

4. **Offer performance cards**
   - Creator sees views, starts, completed purchases, failed purchases, refunds, and scoped access counts when real read models exist.

5. **Supporter identity**
   - VIP/subscriber identity inside that creator's area only.
   - No random badges, no global clout, no fake rank.

6. **Paid event countdowns**
   - Countdown, reminder status, pass capacity, and post-event replay/expired state.

### Future Premium Creator-Economy Polish

1. **Creator storefront layout**
   - One polished Platform money shelf with videos, VIP, subscription, events, tickets, and tips in a coherent order.

2. **Smart offer cards**
   - Contextual prompts based on actual viewer state: follower, subscriber, VIP, already purchased, blocked, or expired.
   - No black-box claims or fake AI positioning.

3. **Advanced creator analytics**
   - Conversion funnel, repeat supporters, offer health, event interest, and content unlock trends.
   - Keep e2e/sandbox traffic excluded where supported.

4. **Return-visit personalization**
   - Continue watching paid video.
   - Enter purchased room.
   - Reopen Subscriber/VIP Area.
   - Upcoming paid event reminder.

5. **Trust/refund center**
   - Clear restore, refund status, revoked access, expired pass, and provider-unavailable states.

## Production Acceptance Checklist

Run these on attached Android devices using test IDs or visible text. Do not use coordinate taps for money flows.

### Global Visual Tests

- Every money route loads without raw provider/internal errors.
- Every money flow has a stable screen selector.
- Every CTA has a readable label and accessible target.
- Text fits on small Android screens without overlap.
- Dark premium styling is consistent across all seven flows.
- No public screen misspells `Chi'llywood`.
- No flow implies Premium includes creator products.
- No creator product implies it includes Premium or unrelated creator products.
- Failed, canceled, unavailable, expired, revoked, restored, locked, and unlocked states are visually distinct.
- Sandbox/test labels are visible only in sandbox/test proof contexts.
- Public copy is value-first and trust-clear, not developer/proof-first.

### Premium Subscription

- `screen-premium` and `premium-screen` are visible in loading, signed-out, purchase, active, unavailable, and error-render states.
- Viewer understands Premium is app-wide within five seconds.
- Status card explains current state: active, inactive, unavailable, restore available, or manage available.
- CTA changes correctly by state.
- Restore/manage actions are visible and not confused with creator subscription/VIP.
- Purchase success or active state feels rewarding, not just informational.

### Creator Tips

- `tip-sheet` opens from Platform support.
- Viewer sees creator name/avatar, selected amount, optional note, and contribution-only scope.
- `tip-confirm-button` is visually primary.
- `tip-no-content-unlock-copy` is visible without overwhelming the support moment.
- Success receipt is visually distinct and says no content was unlocked.
- Failed/unavailable state keeps viewer in context with a safe retry/back option.
- Creator Money Center shows tip settings and transactions in a readable way.

### Paid Creator Videos

- Paid video card/player clearly indicates paid access before playback.
- `paid-video-lock-card` includes video title, price, creator context, and one-video-only scope.
- `paid-video-unlock-button` or current test ID equivalent is visible and tappable.
- Busy state says checkout is opening.
- Success state shows receipt and `paid-video-player-ready`.
- Return visit shows unlocked access without flashing the lock card.
- Creator can see/manage paid video offer and scoped transactions.

### Paid Watch-Party Rooms

- `watch-party-ticket-lock-card` feels like a room ticket, not an error.
- Room title/target, price, and access scope are visible.
- CTA `watch-party-ticket-purchase-button` is visually primary.
- Success receipt and `watch-party-ticket-enter-target-button` are clear.
- Entry reaches `screen-watch-party-waiting-room` or `screen-party-room` when allowed.
- UI never implies ticket grants LiveKit publish, host, moderator, or room authority.
- Creator Money Center shows room target, seats sold, and no-payout/readiness state.

### Channel Subscriptions

- Platform support card explains monthly creator membership.
- Subscriber Area shows `subscriber-area-screen`, `subscriber-area-includes-list`, and `subscriber-area-does-not-include-list`.
- Active subscriber state has a visible badge/card.
- Empty Subscriber Area feels intentional and creator-branded.
- Follower-only viewer does not see subscriber-only access.
- Expired/revoked/restored states are visually clear.
- Creator can enable/manage subscription and view subscriber signals without payout confusion.

### VIP Passes

- Platform support card makes VIP visually distinct from subscription.
- VIP Area shows `vip-area-screen`, `vip-area-active-badge`, `vip-area-includes-list`, and `vip-area-does-not-include-list`.
- Active VIP state feels premium and creator-specific.
- VIP does not visually imply Premium, subscription, paid video, ticket, event, or room authority.
- Empty VIP Area still feels like a premium holding state.
- Creator can enable/manage VIP and view VIP signals.

### Paid Creator Events

- Event pass route shows `screen-event`.
- Locked event state shows event title, date/time, status, price, capacity/pass count where available, and exact pass scope.
- `event-pass-purchase-button` is visually primary.
- Sold-out, canceled, ended, unavailable, and active states are different.
- Success state shows `event-pass-success-receipt` or access-granted state and a ticket-like confirmation.
- Return visit shows confirmed pass until event expiration/revocation.
- Creator can manage event pass and see pass count/status.

### Creator Business Dashboard

- Money Center top summary answers: what is ready, what needs setup, what is locked, and whether payouts/live money are off.
- Offers are grouped by money type with status and next action.
- Transactions/readback are readable without exposing private provider data.
- Payout readiness is clearly separated from viewer purchase flows.
- Empty states tell creators what to do next.
- Creator feels they are building a real channel business, not just toggling test rows.

## Design Direction

Chi'llywood money UI should feel like a premium Chicago entertainment app:

- Dark cinematic base.
- Strong creator identity.
- Controlled crimson, gold, and white emphasis.
- Compact, scan-friendly cards.
- Real media/creator imagery where available.
- High-confidence CTAs.
- Trust copy close to money actions.
- Motion only at important moments.

Avoid:

- Fake AI claims.
- Crypto/tokens.
- Random status badges.
- Overly gamified supporter ranks.
- Cluttered dashboards.
- Proof/debug language in public UI.
- Animations that slow down payment comprehension.

## Final Readiness Call

The seven money flows are **partially ready visually**.

They are structurally understandable and safety-aware, but they need a unified money visual system, better creator-branded paywalls, stronger unlock/reward states, and a more polished creator Money Center before they feel fully public-ready as a premium creator-economy product.
