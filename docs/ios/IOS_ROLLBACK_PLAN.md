# iOS 90% Rollback Plan

Checkpoint date: 2026-07-15

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
5. Revert only the faulty subsystem and rerun all seven Phase 1 checks plus its
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
| Store-aware policy/schema/webhook | `95fdc2b7`, copy/provider commits through `8328f052`, `2be7d4cb`, `1e213378`, `e39a069d`, `c40287ee`, `4d0ed187` | Disable the Apple rail first. Revert Apple-specific selection/copy without removing Google provider values or weakening webhook verification/idempotency. |
| Release workflows | `fa847965`, `19230653`, `63431991`, `b65ab225`, `f7af588d` | Disable/delete only the affected manual workflow or environment access. Preserve validation, protected approvals, exact-build submission, and no-auto-release controls. |
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

All three are deployed and additive. Roll back behavior with switches and a
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
- `chilly-chat-call-dispatch` v33;
- `ios-voip-push-tokens` v1;
- `ios-voip-call-dispatch` v1; and
- `revenuecat-webhook` v69.

For a faulty deployment:

1. Keep rollout flags off and preserve ordinary missed-call fallback.
2. Redeploy the immediately preceding reviewed function version.
3. Verify authentication, account/block/room checks, dedupe, rate limits, token
   revocation, and idempotency before re-enabling any bounded test.
4. Preserve provider event and delivery-attempt evidence; do not delete failed
   events to make dashboards appear green.
5. Confirm Android notification payloads still include the established Android
   fields and Google webhook parsing remains unchanged.

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

- Final-source Simulator build:
  `6d8e5193-ea75-490f-9451-759419a3e7b3`, app `1.0.0 (6)`, from `97cd97cd58b021d2f45021c3e121b8a35158cee8`.
- Reviewed production/Internal TestFlight build:
  `a729aa9a-1a98-439c-8c81-48c381735d8d`, app `1.0.0 (6)`, from `97cd97cd58b021d2f45021c3e121b8a35158cee8`.
- EAS submission: `ade71443-0a05-49c2-8aa4-c411d4cb3e28`, assigned only to
  `Chillywood Internal`.
- Internal build `1.0.0 (3)` remains historical and is superseded by build 6; it
  was never external or public.
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

## Exit criteria after rollback

- Seven required PR checks pass independently.
- Android package, Firebase, EAS production/submit, FCM payloads, provider values,
  and release behavior match the known-good baseline.
- Affected iOS guard/proof and clean native generation pass.
- All high-risk switches remain off.
- No secret, private test data, signed URL, or unrelated artifact enters Git.
- The rollback is documented with exact commit/function/build identifiers and a
  sanitized reason.
