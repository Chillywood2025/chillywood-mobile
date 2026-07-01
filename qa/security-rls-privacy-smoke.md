# Security, RLS, And Privacy Smoke

Run these checks with dedicated E2E accounts only. Service-role credentials may be used by local fixture scripts, never by app code.

## Required Checks

- Owner-only actions are hidden or denied for viewers.
- Viewer cannot edit owner profile, Platform, videos, events, offers, or visibility settings.
- Blocked viewer is denied profile/platform/subscription/VIP access where block rules apply.
- Follower-only does not unlock private or subscriber-only access.
- Circle member unlocks private only.
- Subscriber and VIP are scoped to one creator.
- Paid video access is scoped to one video.
- Watch-Party Seat Pass access is scoped to one room/party target.
- Event pass access is scoped to one event.
- No service-role key or BrowserStack access key appears in app code.
- Logs do not print passwords, service-role keys, provider secrets, or raw auth tokens.
- User UI does not show raw provider IDs, stack traces, SQL errors, or internal RLS errors.
- Sandbox fixtures do not enable live money, payouts, host authority, LiveKit publish, or payable ledgers.

## Proof Sources

- Existing guards: route contracts, creator monetization policy, Premium sandbox policy, monetization test IDs.
- Social graph readback: `npm run qa:browserstack:e2e-social-graph:readback`.
- Fixture readback: `npm run qa:monetization:fixtures:readback`.
