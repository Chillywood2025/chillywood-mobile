# iOS 90% Rollback Plan

Checkpoint date: 2026-07-19

This plan reverses the smallest faulty subsystem while preserving Android,
security policy, audit evidence, permanent App Store identifiers, and provider
credentials. Prefer a reviewed revert commit on
`codex/ios-integration-90`; do not rewrite `main`, merge either draft PR, or use a
destructive database rollback.

## Immediate containment order

1. Keep or restore all high-risk switches to off:
   - ordinary iOS push client/delivery rollout;
   - VoIP APNs dispatch;
   - runtime-visible native iOS calls;
   - App Store purchases;
   - live money, payouts, cash-out, withdrawals, transfers, and payable balances.
2. Stop the affected manual workflow. Do not submit another build, assign external
   testers, publish an OTA, or release publicly.
3. Remove a faulty build from internal tester availability if necessary; do not
   delete the App Store record or permanent product IDs.
4. Preserve sanitized provider/function/build logs and the exact source/build IDs.
5. Revert only the faulty subsystem and rerun all eight Phase 1 checks plus its
   dedicated guards before rebuilding.

## Repository rollback by subsystem

The major integration commits are intentionally separable:

| Subsystem | Commit(s) | Safe repository rollback |
| --- | --- | --- |
| Baseline / validation | `20f14c06`, `9593ca22`, `1f9e06f9` | Revert the specific validation correction only after proving it is the regression. Never suppress a failing check or restore a generated-native-file dependency. |
| Universal Links / AASA | `b546b7ed` | Revert parser/AASA source together. Preserve Android App Links. Redeploy the last known-good website output and verify HTTP status, redirect count, content type, and body hash. |
| Commerce manifest | `d113075c` | Revert client manifest usage if faulty, but never rename/recreate permanent App Store product IDs. Keep Apple purchase activation off. |
| Privacy and store materials | `9c54a412` | Revert only an incorrect manifest reason or document claim. Re-run the privacy guard and inspect the generated/archive manifest before another upload. |
| Media readiness | `94d1d4c6`, `a5f23b06`, `8719ada3` | Revert permission/media lifecycle changes as one unit if they cause a regression. Confirm camera/microphone never activate without user intent and sign-out/leave still tears down tracks. |
| Push and native calls | `db63e456`, `e8dd7e38`, `d3f1715a`, `b5bebb35` | Turn runtime/server flags off first, then revert client/native/backend source together as required. Preserve Android FCM and full-screen call behavior. |
| Durable call orchestration | `e43f34ab41a7e936e6eeca9b0031faa3de557559` | Keep ordinary/VoIP rollout off. Revert client, dispatcher, transition function, and shared schema/policy together; retain delivery rows and apply only forward database fixes. |
| Final QA call/storefront/retry closeout | `bbb9d6db67620b1d39e3a3e67ab8ef7166ce02ae` | Keep all private rollout and money switches off. Revert the tip-sheet, call dispatch/transition/retry, storefront webhook, CI, and `ios-qa` profile only as a reviewed coherent unit; retain delivery/provider history and use forward database fixes. |
| Accepted-media controls and stale ringing expiry | `1334221b1dfbf418fba3fcaaae8757e7f5295df9` | Roll back the affected platform OTA to its recorded compatible group if device retest regresses. Revert the accepted-only media gate, serialized control queue, and retry worker together only after reproducing the regression. Retain call events/deliveries and correct migration behavior with a forward-only migration. |
| Store-aware policy/schema/webhook | `95fdc2b7`, copy/provider commits through `8328f052`, `2be7d4cb`, `1e213378`, `e39a069d`, `c40287ee`, `4d0ed187` | Disable the Apple rail first. Revert Apple-specific selection/copy without removing Google provider values or weakening webhook verification/idempotency. |
| Atomic RevenueCat application | `e43f34ab41a7e936e6eeca9b0031faa3de557559` | Keep the App Store rail and money switches off. Redeploy webhook v69 only with a reviewed forward compatibility plan; never delete provider events, entitlements, grants, ledger rows, or intents. |
| Release workflows / managed iOS upload boundary | `fa847965`, `19230653`, `63431991`, `b65ab225`, `f7af588d`, `d5a8db65edbdd19fec42ad37ca1162412f66a41e` | Disable/delete only the affected manual workflow or environment access. Preserve validation, protected approvals, exact-build submission, generated `/ios` exclusion, and no-auto-release controls. |
| Store screenshot drafts | `a4ab1d49` | Remove only the draft assets if incorrect. Preserve source/build evidence and never replace them with private-account or private-media captures. |
| Critical transitive dependency patch | `d6a95ed5` | Revert only if a verified incompatibility requires it and a separately reviewed safe dependency path exists. Never restore vulnerable `websocket-driver` 0.7.4 as a shortcut. |

Use `git revert <commit>` or a reviewed multi-commit revert in dependency order.
Do not use `git reset --hard`, force-push shared branches, or stage unrelated local
files.

## Supabase migration rollback

Integration migrations:

- `20260715150522_ios_voip_push_token_foundation.sql`
- `20260715151250_ios_app_store_mappings.sql`
- `20260715174500_ios_app_store_purchase_intents.sql`
- `20260718091500_fix_ios_app_store_premium_reference_prices.sql`
- `20260718103000_durable_chat_call_status_transition.sql`
- `20260718110000_revenuecat_atomic_event_transactions.sql`
- `20260718111500_harden_chat_call_transition_delivery_access.sql`
- `20260718113000_durable_call_delivery_retry_and_storefront_prices.sql`
- `20260718114500_enable_chat_call_transition_retry_scheduler.sql`
- `20260718120000_index_terminal_retry_and_revenuecat_intent_links.sql`
- `20260719213953_expire_stale_chilly_chat_calls.sql`

All eleven are deployed and additive. Roll back behavior with switches and a
reviewed forward fix; do not attempt a destructive down migration:

1. Turn VoIP and App Store rollout switches off.
2. Redeploy the last known-good Edge Function versions.
3. Stop writes through policy/function checks; retain tables, event records,
   idempotency keys, token revocation state, and audit evidence.
4. Apply a new reviewed forward migration for a schema correction. Do not drop
   tables, columns, policies, functions, constraints, or data as an emergency
   reaction.
5. A later destructive cleanup requires a separate backup, impact review, explicit
   owner approval, and tested restore plan.

Never weaken RLS or grant clients raw VoIP-token, provider-event, receipt, mapping,
or service-role access during rollback.

## Edge Function rollback

Affected functions include:

- `notification-device-tokens` v49;
- `notification-dispatch` v49;
- `chilly-chat-call-dispatch` v37;
- `chilly-chat-call-transition` v3;
- `chilly-chat-call-transition-retry` v5;
- `ios-voip-push-tokens` v1;
- `ios-voip-call-dispatch` v5; and
- `revenuecat-webhook` v72.

For a faulty deployment:

1. Keep rollout flags off and preserve ordinary missed-call fallback.
2. Redeploy the immediately preceding reviewed function version.
3. Verify authentication, account/block/room checks, dedupe, rate limits, token
   revocation, and idempotency before re-enabling any bounded test.
4. Preserve provider event and delivery-attempt evidence; do not delete failed
   events to make dashboards appear green.
5. Confirm Android notification payloads still include the established Android
   fields and Google webhook parsing remains unchanged.
6. For call rollback, disable or remove client invocation of
   `chilly-chat-call-transition` only in the same reviewed revert that restores a
   compatible awaited server transition; do not restore mobile fire-and-forget.

## APNs and native-call rollback

- Runtime-disable iOS native calls and ordinary/VoIP delivery before changing code.
- Do not revoke an EAS or VoIP APNs key merely because source is rolled back. Key
  revocation is destructive credential rotation and requires explicit owner
  approval plus a replacement plan.
- If a key is suspected compromised, stop dispatch, rotate it in the provider
  stores without exposing the value, update only approved secret stores, verify
  both APNs environments, and then revoke the old key.
- Remove the final internal build from tester availability if its entitlements are
  unsafe. Do not delete historical build evidence.
- Revert the Swift module/plugin only with its JS bridge, capability configuration,
  and server dispatch path in a coherent change, then run clean prebuild and both
  Simulator/device-target compilation.

## Commerce and RevenueCat rollback

- Turn the App Store rail off before changing products, mappings, offerings, or
  webhook behavior.
- App Store product identifiers are permanent. Do not delete, recreate, or replace
  them; set availability/state conservatively in App Store Connect if withdrawal
  is required.
- Do not delete verified purchase/refund/revocation events or access history.
- Disable the RevenueCat offering/Apple app integration rather than deleting
  entitlements impulsively.
- Redeploy the previous verified webhook while preserving event idempotency.
- Treat the two reconciliation-listed historical Google event-pass rows as review
  evidence; do not backfill or delete them during an emergency rollback without a
  separate owner-approved money-data plan.
- Never fall back to Google base-plan parsing for Apple product identifiers.
- Ensure tips still grant no access and no rollback path enables payable balances,
  payouts, or media authority.

## AASA and Supabase Auth rollback

- Redeploy the last known-good AASA file; do not replace it with `*` or an
  unrestricted path wildcard to conceal a routing regression.
- Verify HTTPS, no redirect, JSON content type, Team ID, bundle ID, and canonical
  route coverage after rollback.
- Remove an incorrect Supabase redirect only after confirming it is unused. Keep
  the established Android/custom-scheme redirect behavior intact.
- Re-run cold/warm/custom/HTTPS route parser proofs before shipping another build.

## EAS, App Store Connect, and TestFlight rollback

- Build-7 iOS OTA group `896eea68-859a-4cfe-9697-725299be45bf` targets channel
  `production`, runtime `1.0.0`, and keeps native calls false. Its previous
  compatible group is `8e158980-75d1-47ef-bd26-f3f9e564fdab`.
- If the build-7 OTA is faulty, run `eas update:rollback`, select the recorded
  previous group or embedded build-7 update, publish iOS only, and verify no
  Android update exists. Keep all server rollout switches off throughout.
- Local build 8 is isolated on channel `ios-qa`, runtime `1.0.0-iosqa1`, source
  `bbb9d6db67620b1d39e3a3e67ab8ef7166ce02ae`, with local IPA SHA-256
  `24a951d58302dd73e13e4adc899fc28680472eb78f37cac04639ee95896e36d8`,
  submission `e0b894e3-5dfc-44c5-9da2-e36c3b85bd5b`, and Apple build
  `a6ed5eda-fe76-4dd0-b18c-d00c72b0f00f`.
- Current iOS accepted-media-control OTA is group
  `e83cdc3e-d6d6-4f75-8116-decb3c36bed8`, update
  `019f7c68-4ae1-73e4-aa50-5c1774c3562a`, source
  `1334221b1dfbf418fba3fcaaae8757e7f5295df9`, on `ios-qa` / `1.0.0-iosqa1`.
  Its compatible rollback target is group
  `05a795c8-50da-44f2-b158-9512e22db1ad`.
- Current Android accepted-media-control OTA is group
  `069307c0-4f92-4ebc-acc6-d4f83410e900`, update
  `019f7c6a-92b3-7cbe-9c63-f5b6310691dd`, source
  `1334221b1dfbf418fba3fcaaae8757e7f5295df9`, on `production` / `1.0.0`.
  Its compatible rollback target is group
  `e03823f6-ec5a-436b-b10d-57cbf3f644c7`.
- If build 8 is faulty, remove only build 8 from `Chillywood Internal`, keep build
  7/its rollback target as historical evidence, disable the affected server
  switch, use a normal `git revert`, and create a later isolated binary only after
  validation. Never send an `ios-qa` update to runtime `1.0.0` or the production
  channel.

- Historical superseded Simulator build:
  `6d8e5193-ea75-490f-9451-759419a3e7b3`, app `1.0.0 (6)`, from `97cd97cd58b021d2f45021c3e121b8a35158cee8`.
- Historical superseded production/Internal TestFlight build:
  `a729aa9a-1a98-439c-8c81-48c381735d8d`, app `1.0.0 (6)`, from `97cd97cd58b021d2f45021c3e121b8a35158cee8`.
- EAS submission: `ade71443-0a05-49c2-8aa4-c411d4cb3e28`, assigned only to
  `Chillywood Internal`.
- Failed pre-fix Simulator build `a5f5ccfa-aa88-4026-91fc-2a9db2d79ea3`
  produced no artifact; do not retry it. Its generated-iOS/Firebase-path cause is
  prevented by `d5a8db65`.
- Current Simulator build `b9bb006e-1a96-4817-8ee2-6f3647983d8b` and production
  EAS build `8bfbd8cf-aa1b-4ba0-bebf-413ae0f60555` are from application source
  `d5a8db65edbdd19fec42ad37ca1162412f66a41e`.
- Current App Store Connect build is `1.0.0 (7)`, Apple build ID
  `b5eaaad6-ef24-49c5-8e50-b10cf2807412`; EAS submission
  `04b9bc95-eb1d-4fb3-95e0-dbf5de790fce` is assigned only to
  `Chillywood Internal`.
- Internal build `1.0.0 (3)` remains historical and is superseded by build 6; it
  was never external or public.
- Builds 6 and 7 are not the all-flags physical-test candidate. Build 7 may remain
  as the native-disabled JavaScript OTA lane; build 8 is the exact native QA lane.
- Cancel a queued build if safe or allow an in-flight immutable build to finish;
  do not submit it if validation failed.
- Submit only an exact successful build ID. Never switch a workflow to implicit
  latest-build behavior.
- Remove a faulty build from internal tester availability. Do not enable external
  testing or public release.
- Preserve the real `ascAppId`; do not substitute a placeholder.
- Keep protected GitHub environments and manual approvals in place.
- Do not delete EAS signing credentials, the registered device, certificate, or
  provisioning profile without explicit owner approval.

## Local and generated artifacts

- Generated `ios/` and `android/` folders are inspection output under the current
  ownership model; remove the temporary worktree/output rather than committing it.
- Remove downloaded `.ipa`, `.xcarchive`, screenshots with private data, and other
  local artifacts from their temporary location after evidence is recorded.
- Do not touch the unrelated untracked `deno.lock` or `supabase/.temp`.
- Keep Firebase plist, provider env files, certificates, profiles, and private keys
  outside the repository.

Two Apple distribution P12 payloads appeared only in the private tool transcript
during local-builder diagnosis. Both affected certificates and dependent profiles
were revoked immediately. Do not restore them. The final replacement credential
remained contained and signed build 8; rotate it only for a confirmed compromise
or an explicitly approved credential rollover.

## Exit criteria after rollback

- Eight required PR checks pass independently, including Supabase Database
  Integration.
- Android package, Firebase, EAS production/submit, FCM payloads, provider values,
  and release behavior match the known-good baseline.
- Affected iOS guard/proof and clean native generation pass.
- All high-risk switches remain off.
- No secret, private test data, signed URL, or unrelated artifact enters Git.
- The rollback is documented with exact commit/function/build identifiers and a
  sanitized reason.
