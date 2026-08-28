# Public Platform end-to-end audit — 2026-08-28

Scope: `app/channel/[userId].tsx` and viewer entry/exit behavior from Home, Explore, Live/events, Saved followed Platforms, Profile, Platform Studio, and creator support surfaces.

## Findings closed

- User-facing creator membership terminology on the public Platform still exposed `Channel Subscription` and a `Creator Channel` accessibility label. These are now `Platform Subscription` and `Creator Platform`; internal `channel_*`, helper, route, type, analytics, and database identifiers remain unchanged.
- Live Now and Upcoming Events were rendered as informational cards with no direct event navigation. The cards now open the existing backed `/event/<eventId>` route and expose stable Live/Upcoming selectors plus accessibility labels.
- The route contract now guards both event-card navigation and the public Platform terminology boundary.
- BrowserStack viewer coverage now explicitly includes public Platform viewer mode, owner mode, follow/unfollow, video/event navigation, creator-offer separation, access denials, and entry from Explore/Saved/Profile/Live where backed.

## Authority preserved

No database migration, RLS change, provider mutation, money activation, payout change, purchase-authority change, Premium entitlement change, LiveKit authority change, build, OTA, submission, or public release is included.

Viewer/owner/sandbox/public-preview/draft-preview and visibility-denial authority remains owned by the existing resolvers and routes.

## Focused verification

The temporary mutation helper ran on GitHub Actions and was removed from the final diff. `npm run guard:route-contracts` passed. Root TypeScript passed after installing the repository's separate `ops/alert-automation` dependencies, matching the normal Phase 1 setup.
