# Chi'llywood Public V1 Release Checklist

> Current tracker: use `docs/PUBLIC_V1_READINESS_CHECKLIST.md` for the active Public v1 readiness matrix. This older release checklist remains as a packaging/EAS smoke reference.

## Before Build

1. Confirm `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST` are set.
2. Set `EXPO_PUBLIC_BETA_ENVIRONMENT=public-v1`.
3. Apply migrations through `202604260004_tighten_watch_party_room_rls.sql` and verify local/remote schema alignment before runtime proof.
4. Confirm real sign-in is enabled in the launch build. Do not treat temporary no-login behavior as release-ready.
5. Run `npm run validate:runtime`.
6. Run `npm run lint`.
7. Run `npm run typecheck`.
8. Confirm Android legal/support env values are ready for the launch build:
   - `EXPO_PUBLIC_PRIVACY_POLICY_URL`
   - `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`
   - `EXPO_PUBLIC_ACCOUNT_DELETION_URL`
   - `EXPO_PUBLIC_SUPPORT_EMAIL`

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
10. Open `/settings` on Android and confirm:
    - `Privacy Policy` opens the configured policy destination
    - `Terms of Use` opens the configured terms destination
    - `Request Account Deletion` reaches the configured deletion destination or the canonical support fallback path
11. Open Login, Signup, Settings, and Support on Android and confirm top spacing/safe-area treatment looks consistent and the auth forms remain usable with the keyboard open.
12. Open a title detail route on Android and confirm no literal ad placeholder copy appears.
13. Confirm Android-facing premium lock surfaces use neutral availability language rather than tester/placeholder wording.
14. Confirm a non-allowlisted signed-in account is blocked from `/admin`.
15. Build Android production with the `production` EAS profile and confirm the bundle succeeds.

## EAS Update Rollout

1. Run `npm run validate:runtime`.
2. Publish the preview update:
   `npx eas-cli@latest update --channel preview --message "Chi'llywood preview OTA"`.
3. Verify preview delivery:
   - `npx eas-cli@latest update:list --branch preview`
   - `npx eas-cli@latest update:view <update-group-id>`
   - reopen the latest preview build up to two times and confirm the expected JS/assets load
4. If a production build does not yet exist for the current runtime, create one:
   `npx eas-cli@latest build --platform android --profile production --non-interactive`
5. Start the first controlled production rollout only after preview verification:
   `npx eas-cli@latest update --channel production --message "Chi'llywood production OTA" --rollout-percentage 10`
6. Progress or inspect the rollout with:
   - `npx eas-cli@latest update:edit`
   - `npx eas-cli@latest update:list --branch production`
7. Recover safely if needed with:
   - `npx eas-cli@latest update:rollback`
   - `npx eas-cli@latest update:revert-update-rollout`

## Launch Gate

- Real signed-in auth restored and verified in the actual launch build
- Signed-in safety-report verification completed
- Distinct-account two-device watch-party verification completed
- Distinct-account two-device communication verification completed
- Android account-policy handoffs verified on the launch build
- Android public monetization copy no longer reads as placeholder/test-only copy
- Android title detail no longer shows literal ad placeholder content
- Zero open `blocking` feedback items
- Zero open `before_public` feedback items
- Preview-channel OTA publish verified on the current runtime before any production rollout

## Deferred Post-V1

- iOS public packaging and App Store submission
- External analytics vendor integration
- Follow graph and subscriber/community systems
- Checkout, payouts, and ad network delivery
- Push notifications
- Account-level block lists and deeper trust/safety tooling
- Large-room/server-side RTC arbitration
