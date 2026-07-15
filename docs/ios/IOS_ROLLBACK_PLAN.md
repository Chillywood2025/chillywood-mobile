# iOS 90% Rollback Plan

Use this only to reverse a faulty integration safely; prefer minimal reversions by subsystem.

## Fast rollback sequence

1. Revert provider and build configuration to last known-good branch state via reverse PR or migration rollback.
2. Leave active Apple/EAS credentials in place unless explicitly revoked by provider policy.
3. Keep physical-device builds untouched unless they directly expose user data.
4. Re-run only the minimal CI jobs needed to confirm rollback integrity.

## Subsystem rollback steps

1. Push registration and delivery
   - Revert client-side platform-neutral registration changes and backend delivery paths.
   - Restore `no_enabled_push_token` consumers only if required by Android legacy paths.
   - Preserve Android behavior unless explicitly broken.

2. Universal Links / AASA
   - Remove/disable web-hosted AASA source and restore previous website route policy.

3. iOS commerce schema
   - Avoid destructive DB changes during rollback by only using additive migration reversions where available.
   - If needed, disable Apple-specific mapping resolution paths at runtime and rely on legacy Google paths.

4. Privacy and compliance artifacts
   - Restore older App Privacy docs and manifest only if required for build rejection triage.

5. Release and TestFlight artifacts
- Halt any active iOS production profile usage.
 - Keep branch changes unmerged until issue resolution is complete.

## Emergency pause conditions

- Any crash-class regression in Android behavior.
- Any accidental account-status or moderation bypass.
- Any unexpected secret/credential handling regression.
- Any physical iOS credential exposure.

## Non-rollback safeguards

- Keep App Store release disabled.
- Keep OTA updates disabled for production.
- Keep payouts/cash-out/live-money flags disabled.
- Keep Android release behavior unchanged.

