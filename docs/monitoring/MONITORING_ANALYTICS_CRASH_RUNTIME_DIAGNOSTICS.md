# Monitoring, Analytics, Crash, And Runtime Diagnostics

Date: 2026-06-25

Monitoring, analytics, crash, and runtime diagnostics: Closed for repo-side alignment. Owner must confirm final SDK/provider collection settings before Play submission.

This lane documents and hardens the app's production telemetry posture without adding a new analytics vendor and without expanding data collection. Data Safety and Privacy disclosures match monitoring/diagnostics behavior at repo level, subject to final owner/provider confirmation for the submitted build.

## Provider Inventory

| Provider / surface | Present in package? | Initialized? | Enabled in production? | Data collected | PII/private-data risk | Data Safety disclosure status | Action needed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Firebase Analytics | Yes: `@react-native-firebase/analytics` | App shell installs the Firebase analytics sink | Intended when Firebase collection is enabled | Production-labeled route and event names, user id where configured | Event payloads must not include private content or sensitive identifiers | Covered as analytics/app activity when enabled | Owner confirms final Analytics collection settings before Play submission |
| Crashlytics | Yes: `@react-native-firebase/crashlytics` | App shell bootstraps Crashlytics and root errors use `_lib/logger.ts` | Intended when Firebase collection is enabled | Non-fatal/fatal runtime diagnostics and sanitized metadata | Error messages, stacks, and metadata must be redacted | Covered as crash/diagnostics when enabled | Keep forced crash proof owner-approved only |
| Firebase Performance | Yes: `@react-native-firebase/perf` | App shell bootstraps `app_runtime_bootstrap` | Intended when Firebase collection is enabled | Performance traces and bounded network metrics | URL/header leakage risk in proof probes | Covered as diagnostics/performance when enabled | Keep probes dev-only and do not log keys |
| Sentry | No runtime package found | No | Disabled / not intended | None | None | Not disclosed as active | Do not enable in this lane |
| PostHog | No runtime package found | No | Disabled / not intended | None | None | Not disclosed as active | Do not enable in this lane |
| Supabase logs | SDK/provider-side | Runtime service dependency | Active for app services | Auth, database, function, and operational logs | Raw backend/SQL errors must not reach users | Covered as service-provider processing | User-facing errors stay sanitized |
| LiveKit diagnostics | Runtime provider | Live room/token flow | Active where live features run | Connection and room operational metadata | LiveKit token/raw room URL leakage risk | Covered under live room behavior | No token/raw room URL logging or UI exposure |
| Expo Notifications / FCM | Notification helpers | Notification runtime | Active when permission/grants allow | Push delivery and device registration metadata | Push token exposure risk | Covered as notification/device data when enabled | No raw push token exposure |
| RevenueCat / Google Play Billing diagnostics | Monetization helpers | Conditional provider flow | Premium remains off for public activation | Entitlement and provider status summaries | Receipt/order/payment credential risk | Covered as purchase/provider data when enabled | Provider IDs stay masked/support-safe; refunds remain manual/external |
| Media upload/scanner diagnostics | Upload/scanner helpers | Conditional upload paths | Active for upload and scan workflows | Upload/scan status and safe failure summaries | Raw storage path/signed URL leakage risk | Covered under media/security processing | No raw storage paths or signed URLs |
| Support/admin diagnostics | Scoped staff surfaces | Owner/Admin Command Center and support workflows | Active only with exact role/scopes | Safe summaries, audit status, support context | Private evidence risk | Covered under staff/moderation/support disclosures | Exact scope and case/support context only |
| Local console logs | Dev helper paths | Dev-only or gated | Minimized in production | Debug summaries | Secret/private payload leakage risk | Not public telemetry | Gate and redact; release log audit remains required |

Firebase Analytics/Crashlytics status is documented. Sentry/PostHog status is documented and disabled/removed if not intended.

## Analytics Event Safety Policy

Analytics events must be production-labeled, bounded, and useful for product quality and incident response. Event names should describe product behavior, not proof/debug/test activities.

Analytics events must not include PII, private chat/message content, reporter identity, raw IPs, tokens, signed URLs, provider secrets, tax IDs, bank details, or payment credentials. Analytics payloads must also avoid private provider IDs, raw storage paths, push tokens, LiveKit tokens, plaintext passcodes, proof passwords, private dashboard data, and private evidence content.

Current repo controls:

| Control | Status |
| --- | --- |
| Typed production event names exist in `_lib/analytics.ts` | Closed |
| Firebase event names are normalized in `_lib/firebaseAnalytics.ts` | Closed |
| Route analytics drops reset/auth token-like params in `app/_layout.tsx` | Closed |
| Signed-in email identity is not sent to Firebase Analytics | Closed |
| Runtime error analytics do not include exception message text | Closed |
| Dev analytics mirror is gated by `__DEV__` or explicit dev debug flag | Closed |

## Crash / Error Sanitization Policy

Crash/error diagnostics are sanitized. `_lib/logger.ts` and `_lib/firebaseCrashlytics.ts` redact common bearer tokens, JWTs, token query parameters, API keys, signatures, participant tokens, signed URLs, secrets, and auth fields before Crashlytics handoff or dev console output.

Crash reports must be free of secrets, tokens, raw URLs, signed URLs, raw IPs, payment data, private message content, reporter identity, push tokens, LiveKit tokens, service-role keys, OAuth tokens, provider secrets, tax IDs, bank details, proof passwords, plaintext passcodes, private dashboard data, and private evidence.

Forced crash testing remains owner-approved only. Dev-only Crashlytics and Performance probes stay behind the development debug overlay and are not production user features.

## Runtime Diagnostics / Health Matrix

| Runtime condition | User-facing behavior | Diagnostic behavior | Privacy rule |
| --- | --- | --- | --- |
| Root React error | Root error boundary shows safe recovery copy | Reports sanitized runtime error through logger/Crashlytics | No raw stack or message shown to user; support feedback omits raw error text |
| Missing required runtime config | Runtime unavailable screen fails closed | Safe missing-config summary only | No secret values printed |
| Runtime update gate | Runtime update wrapper controls availability | Safe update state only | No raw provider details |
| LiveKit failure | Live surfaces use safe failure copy and guarded token authority | Operational diagnostics only | No LiveKit token or raw room URL |
| Chat/call failure | Chat/call lanes keep private content scoped | Safe error summaries | No private message bodies or call content |
| Upload/scanner failure | Scan gates fail closed | Safe scan/upload status | No raw storage path or signed URL |
| Payment/provider failure | Provider failures surface safe support copy | Support-safe status summaries only | No payment credentials, raw receipts, or automatic refunds |
| Reporting/moderation failure | Submission/action fails closed with safe copy | Audit/support diagnostics where backed | No reporter identity leakage |

User-facing runtime errors use safe copy. LiveKit/chat/upload/payment/reporting failures use safe diagnostics.

## Support / Admin Diagnostics Privacy

Support/admin diagnostics are scoped and privacy-safe. Staff diagnostic access must use existing Owner/Admin/Moderator role truth, exact permission scopes, and case/support context where private evidence is involved. Support is a work area, not a staff role.

Support/admin diagnostics must not expose raw backend errors, raw SQL errors, service-role concepts, raw storage paths, signed URLs, raw IPs, tokens, push tokens, LiveKit tokens, provider secrets, tax IDs, bank details, payment credentials, private provider IDs, private message bodies, call audio/video content, reporter identity, or private evidence outside exact-scope case context.

## Console / Logging Policy

Production console logging must be minimized. Development logs may exist when gated by `__DEV__` or explicit local debug flags and must be redacted before output.

No debug/proof/internal copy is exposed in production UI. Public and user-facing monitoring copy must say safe terms such as unavailable, try again, support can review, or temporarily unavailable. It must not show raw backend, SQL, provider, token, or stack details.

## Incident / Health Checklist

Before and after any public rollout:

1. Confirm Firebase Analytics, Crashlytics, Performance, and Remote Config collection settings for the submitted build.
2. Confirm Play Data Safety and Privacy disclosures match the final SDK settings.
3. Verify Crashlytics dashboard receipt for the release version without forcing a crash unless explicitly approved.
4. Verify Analytics dashboard activity for production-labeled events only.
5. Verify Performance dashboard receipt for app start/screen/network traces where enabled.
6. Run release log audit for tokens, signed URLs, raw IPs, push tokens, LiveKit tokens, RevenueCat receipts, payment identifiers, private chat content, and raw provider errors.
7. Confirm runtime unavailable/root error screens use safe copy.
8. Confirm support/admin diagnostic access is staffed, scoped, and audit-backed.
9. Confirm provider failures use safe user copy and manual/external support paths.
10. Record findings in a sanitized `/tmp` artifact, not in public docs with secrets or private user data.

## Data Safety / Privacy Alignment

Data Safety and Privacy disclosures match monitoring/diagnostics behavior at repo level. Firebase Analytics, Crashlytics, Performance, and Remote Config are documented as final owner/provider confirmation items before Play submission. The app must not claim no analytics/crash/diagnostics collection if those SDKs remain enabled in the submitted build.

No new analytics vendor was added. Sentry and PostHog remain disabled/not intended unless a future owner-approved lane explicitly changes the standard and updates legal/Data Safety docs first.

## Money / Provider Boundary

This lane does not enable Premium public activation, creator-money switches, `live_money_enabled`, payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, provider refunds, Google Play product/base-plan edits, RevenueCat mapping changes, purchases, refunds, or payout actions. Provider refunds remain manual/external.

## Existing Proof References

- `docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md`
- `docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md`
- `docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md`
- `docs/legal/CONTENT_TAKEDOWN_DECISIONS.md`
- `docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md`
- `docs/live/LIVE_ROOM_MODERATION_INCIDENT_RESPONSE.md`
- `docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md`
- `docs/FIREBASE_CRASHLYTICS_PERFORMANCE_RUNBOOK.md`

## Launch Status

Monitoring, analytics, crash, and runtime diagnostics are closed for repo-side alignment after validation. Remaining owner/provider confirmation items are external: final Firebase SDK collection settings, Play Data Safety entry confirmation, release dashboard monitoring, and release log audit for the exact submitted build.
