# Normal-app native store sandbox preparation

Feature scope: `native-store-sandbox-command-v1`, the preparation portion of
`native-store-sandbox-bridge-v1.md`. This is source integration, not an enabled
purchase flow, deployed endpoint, provider qualification or installed proof.

## Surfaces and authority

- Normal non-Test-Store sandbox-video offers link to
  `/sandbox-videos/native-offer/[offerId]`.
- `NativeStoreSandboxQuoteScreen` uses `nativeStoreSandboxQuote.ts` for exact
  offer reads, saved-selection preparation and original-request recovery.
- Any active signed-in account can use the route, subject to the backend's
  existing buyer, session, resource, offer and media checks. No admin role gate.
- The client snapshots the initiating user/account/session; a session gap
  permanently retires that owner. Late replies cannot rebind to another account.
- iOS maps to APP_STORE and Android to PLAY_STORE. Web and all isolated Test
  Store flavors are excluded. Existing V3 routes and SDK ownership are unchanged.

## Failure and recovery

Authentication, local storage and network work have bounded waits. An original
request and full quote are saved before preparing remotely. A failed or delayed
write cannot be replaced by another mounted owner. Once saved, the screen offers
read-only recovery, not a new prepare. Unknown replies remain unknown.

The server reply must match the exact actor, command, request, native store,
quote, original request/session and negative authority flags. Neither a quote
nor a selection enables a store call, access grant, playback, earnings or payout.
This client imports no RevenueCat SDK. It sends only to the new command endpoint.

## Accessibility, rollback and proof limits

The screen has a header, back action, labeled buttons with disabled state,
48-point minimum controls, a live status announcement and scrollable content.
Removing the normal-offer link or leaving the source endpoint uninstalled
returns the flow to unavailable without affecting existing purchases or grants.

Client and mounted React tests exercise preparation/recovery, account changes,
unmount, late replies, uncertain storage, concurrent owners and separate debug
flavors. Native provider purchase, refund/restore, signed build and installed
device behavior remain unproved. Before claiming checkout works, qualify both
platforms' initial one-time sandbox correlation and test real installed user
flows, interruption/relaunch, account switch, receipt delay and negative events.
