# Commerce visual integration audit

Scope: all 19 UI files changed between pre-PR637 main `12623b336cab9e47f84c79012cab35dfa3058699` and the PR638 commerce source. This is source and mounted-component evidence, not installed Android/iOS screenshots or physical-device visual approval.

## Route and sheet inventory

- `app/admin.tsx`: existing Chicago skyline and Studio visual tokens retained; embedded staff return review now consumes shared text/control tokens.
- `app/channel-settings.tsx`: existing branded Studio background retained; event sale editor embeds the auction editor, which inherits the repaired shared auction styles. Existing subscription-price controls remain Studio styles.
- `app/event/[eventId].tsx`: removed opaque route background so the canonical app-root Chicago skyline remains visible. Existing event card now uses shared glass background/border.
- `app/watch-party/[partyId].tsx`: existing room background/media presentation retained. New auction entry opens a separate branded sheet.
- `app/watch-party/live-stage/[partyId].tsx`: existing branded access gates and room/media background retained. New auction entry opens a separate branded sheet.
- `components/monetization/room-seat-auction-entry.tsx`: separate native page sheet now owns `ChillywoodBrandedSurface variant="app"`; its scroll view is transparent. Both Party admission and reserved Stage spot variants tested for open, close, reopen and account replacement.
- `components/monetization/tip-sheet.tsx`: already uses canonical glass/control tokens and `ChillywoodPrimaryActionFill`; retained.
- `components/monetization/event-auction-panel.tsx`: replaced isolated opaque navy/red palette with shared glass, border, input, control and text tokens.
- `components/monetization/room-seat-auction-panel.tsx`: same repair, with auction state/payment handlers unchanged.
- `components/monetization/event-auction-editor.tsx`: inherits the actual event auction panel styles.
- `components/monetization/event-auction-time-input.tsx`: inherits the actual event auction panel styles.
- `components/monetization/room-seat-auction-editor.tsx`: inherits the actual room auction panel styles.
- `components/monetization/event-sale-editor.tsx`: existing host editor presentation retained; embedded auction form inherits shared styles.
- `components/merch/merch-screens.tsx`: all shop, orders and creator Studio screens now use the shared skyline Shell, including loading and inactive-account gates. Transparent scrolling and shared glass/control tokens replace opaque standalone backgrounds. This covers `app/merch/[creatorId].tsx`, `app/merch/orders.tsx` and `app/merch/studio.tsx`.
- `components/merch/merch-return-cases.tsx`: transparent embedded panel inherits order glass card; shared text/control borders replace isolated colors.
- `components/merch/merch-return-review.tsx`: transparent embedded staff panel inherits branded admin screen; shared text/control borders replace isolated colors.
- `components/merch/merch-shipping-details.tsx`: transparent private details panel inherits order glass card; shared text tokens.
- `components/merch/merch-tracking-panel.tsx`: transparent embedded tracking panel inherits order glass card; shared controls, selection accent, borders and text.
- `components/system/support-screen.tsx`: existing Chicago skyline remains; commerce route-navigation change does not replace presentation.

## Evidence and limits

152 focused tests pass, including existing auction, event-route, merchandise, shipping and return mounted behavior plus visual regression tests. Shared visual components execute as production source in the harness; only native drawing hosts, SVG hosts and the bundled image handle are substituted. New tests verify actual skyline reachability and transparent scroll containers, not only import strings. Account subscriptions in the auction harness now support all mounted consumers, matching the real subscription contract.

Lint, TypeScript and diff checks pass. No commerce handler, financial rule, permission, provider, deployment or navigation target changed. No claim of physical-device pixels, keyboard layout or native modal rendering is made; those remain installed-device qualification.
