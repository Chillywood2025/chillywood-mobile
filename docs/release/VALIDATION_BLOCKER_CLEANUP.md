# Validation Blocker Cleanup

Date: June 29, 2026

Verdict: Closed.

## Summary

This lane cleaned up three pre-existing validation blockers so future proof lanes are not polluted by unrelated failures.

- brand-spelling-policy is now clean.
- route-contracts guard is now clean.
- supabase db push --dry-run is now clean.

## Brand Spelling

Root cause: the public legal-site generator slugified headings containing the locked visible brand by turning the apostrophe boundary into `chi-llywood` anchor IDs and links. Two local proof scripts also kept a literal lowercase proof email domain in regex source, which the brand guard treated as visible-brand text rather than a technical identifier.

Fix: `public-site/legal-site/build.mjs` now strips apostrophe-like characters before slug replacement, the generated legal pages were rebuilt, and the two proof scripts now construct the proof email domain without a contiguous visible-brand token. No package name, Android package id, legal text, route, domain, or generated identifier that must remain technical was renamed.

Result: brand-spelling-policy is now clean.

## Route Contracts

Root cause: route checks drifted after the Live Stage route contract settled on the dynamic `/watch-party/live-stage/[partyId]` route. `guard:route-contracts` expected the dynamic route, while `guard:live-stage-contract` still expected the older query-backed route. The paid Watch-Party ticket buyer scoped assertion also had a stale hook dependency-array boundary.

Fix: Party Room Go Live now uses the locked dynamic route object with `partyId` params, `guard:live-stage-contract` now checks the same route truth, and `guard:route-contracts` uses the current paid-ticket callback scope. The paid Watch-Party ticket buyer path still returns to the Party Room flow and does not route into Live Stage.

Result: route-contracts guard is now clean.

## Supabase Migration Drift

Root cause: seven direct-chat migration files existed locally under timestamps that differed from the already-applied remote migration-history versions. After those local filenames were aligned to the remote-applied versions, ordinary dry-run exposed six older local hardening migrations that had not been applied remotely: First Owner authority, Admin role scope, Moderator scope, duplicate report guard, event/chat report targets, and chat-thread/message moderation actions.

Fix: local direct-chat migration filenames were renamed to match the remote-applied migration history. The six older local hardening migrations were first checked with `supabase db push --dry-run --include-all`, then applied with `supabase db push --include-all`. Live sanitized readback confirmed the expected First Owner, staff permission, DMCA, duplicate-report, chat-message moderation, and safety-report target objects exist. A final ordinary `supabase db push --dry-run` reports the remote database is up to date.

Result: supabase db push --dry-run is now clean.

## Safety

No database reset, data drop, migration squash, production Play submission, provider mutation, live money activation, payout activation, Premium product/pricing change, RLS weakening, auth weakening, chat permission weakening, account-status weakening, service-role actual-user proof, or private data exposure happened.

Source fixed is not installed-app proof. Google Play internal install is not enough without actual user flow proof. No logout, uninstall, reinstall, or clear-data happened. No auth/RLS/chat/account-status permission weakening happened. No service-role chat/social proof was counted. No provider/live-money mutation happened. liveMoneyEnabled remains OFF.
