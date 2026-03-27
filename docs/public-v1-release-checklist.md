# Chi'llywood Public V1 Release Checklist

## Before Build

1. Confirm `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST` are set.
2. Set `EXPO_PUBLIC_BETA_ENVIRONMENT=public-v1`.
3. Apply migrations through `202603270009_public_v1_feedback_policy.sql`.
4. Confirm real sign-in is enabled in the launch build. Do not treat temporary no-login behavior as release-ready.
5. Run `npm run validate:runtime`.
6. Run `npm run lint`.
7. Run `npm run typecheck`.

## Public V1 Smoke Tests

1. Launch signed out and confirm Home, Explore, Title, and Player still browse correctly.
2. Attempt watch-party create/join while signed out and confirm sign-in is required.
3. Attempt communication create/join while signed out and confirm sign-in is required.
4. Attempt channel settings, support feedback submission, safety reporting, and admin while signed out and confirm sign-in is required.
5. Sign in with a real account and confirm watch-party room create/join works.
6. Sign in with a second distinct account and confirm two-device watch-party membership and reconnect still behave correctly.
7. Sign in with a second distinct account and confirm communication room join, leave, and reconnect still behave correctly.
8. Submit one title report, one room or participant report, and confirm no client error is shown.
9. Open `/support`, submit one feedback item, and confirm it lands in `beta_feedback_items`.
10. Confirm a non-allowlisted signed-in account is blocked from `/admin`.
11. Build Android production with the `production` EAS profile and confirm the bundle succeeds.

## Launch Gate

- Real signed-in auth restored and verified in the actual launch build
- Signed-in safety-report verification completed
- Distinct-account two-device watch-party verification completed
- Distinct-account two-device communication verification completed
- Zero open `blocking` feedback items
- Zero open `before_public` feedback items

## Deferred Post-V1

- iOS public packaging and App Store submission
- External analytics vendor integration
- Follow graph and subscriber/community systems
- Checkout, payouts, and ad network delivery
- Push notifications
- Account-level block lists and deeper trust/safety tooling
- Large-room/server-side RTC arbitration
