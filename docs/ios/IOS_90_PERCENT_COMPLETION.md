# iOS 90% Completion Record

## Baseline and scope

Branch target: `codex/ios-integration-90` (base `codex/ios-first-development-build`).

Foundation verification:

- `codex/ios-first-development-build` HEAD: `a85fa0f42cf9b1a20f761c8817b0713fe27e43bd`
- PR #9 remains open and in draft state.
- PR #8 is confirmed closed and contains no unique changes.

## Completion against required definition

1. All required CI checks pass: **No**
   - Baseline failures remain from existing mainline issues: repository lint and Expo Doctor.
2. Repository lint is green: **No**
3. TypeScript is green: **Yes**
4. Expo Doctor is green or documented unavoidable incompatibility: **Partially**
   - Current state: 17/18 pass with documented 10 patch-version mismatches.
5. Android regression guards pass: **Yes**
6. iOS simulator native build passes from final source: **Yes**
   - Latest signed simulator artifact: `ddc48433-d29d-4a83-a847-0d8908e2da63`
7. Production iOS archive builds: **No**
8. Firebase iOS is configured: **Yes**
9. AASA deployed and validates: **In progress**
10. Supabase auth redirect URLs configured: **In progress**
11. Ordinary iOS push client code complete: **Yes**
12. Ordinary iOS push backend deployed: **No**
13. APNs credentials configured: **No**
14. CallKit/PushKit source compiles: **No**
15. VoIP token and APNs dispatch backend deployed: **No**
16. iOS native calls runtime-disabled pending proof: **Yes**
17. RevenueCat Apple app configured: **In progress**
18. App Store products exist: **No**
19. Store mappings exist: **Yes** (`revenuecat_app_store` + `app_store` + mappings table scaffold)
20. Store-aware webhook deployed: **No**
21. Apple purchase paths sandbox/internal only: **Not yet enabled**
22. Live money remains off: **Yes**
23. Payouts and cash-out remain off: **Yes**
24. Privacy manifest included: **Yes**
25. App Privacy working papers complete: **Yes** (repository docs created; legal attestation not yet final)
26. App Store metadata and screenshots prepared: **Partially**
27. EAS iOS submit profile exists: **Yes**
28. Production App Store build succeeds: **No**
29. Internal TestFlight upload succeeds: **No**
30. No public release occurred: **Yes**
31. `IOS_90_PERCENT_COMPLETION.md` evidence and remaining matrix exists: **In progress** (this file and device matrix are being maintained)

## Practical completion summary

- Source-level iOS integration foundations, universal-link source, push client/backends, and AASA guarding are in place.
- Remaining gaps are almost entirely platform/runtime or provider dashboard steps requiring owner/device action, including APNs/StoreKit/TestFlight/proof steps.

## Latest blocker log

1. `APNs credential` creation is owner-permitted but not yet executed in this phase.
2. Physical-device proof remains pending for camera/mic/photo/media, APNs delivery, and native call stack behavior.
3. StoreKit/App Store/RevenueCat production linkage remains pending.

## Remaining work for 90% handoff

- Complete deployment-only remaining flows: APNs, App Store Connect setup, RevenueCat Apple setup, internal TestFlight build/upload, and all pending provider proofs.
- Resolve repository lint + Expo Doctor baselines on next dedicated remediation pass.
- Execute and record the AASA deploy+validation and canonical route parser tests.

