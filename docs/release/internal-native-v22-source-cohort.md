# Prospective internal native V22 source cohort

The dormant read-only StoreKit AppTransaction evidence adapter adds
`AppTransactionEvidence.swift`, `AppTransactionEvidencePolicy.swift`, and the
module's exported read method. Its module documentation also changes. The
unchanged `git-native-inputs/v1` algorithm includes the iOS implementation only
for iOS, but conservatively includes shared module documentation for both
platforms. Thus both canonical native inputs changed; Android changed because
of the shared README, not because it gained a StoreKit implementation.

V21 remains immutable at `997df8a9f491f9f5336f686729bba21c1066ef1c`, tree
`9c0cc84bf6bfb981c2a476f1b475ca22be63a4f1`:

- Android: `a0d0bdf51a6029e52186ae056c2e931f33b63cb2f9d76acdb1e706aa9c9c4dc5`
- iOS: `d71f53ce412fc4fb36c1b0985ec9db20e36dcdb192089eefbd250c06c1c26114`

V22 uses fresh `1.0.0-android-production-v22` and
`1.0.0-ios-production-v22` runtime identities. Its digests were calculated from
committed source after setting those identities, then checked again after
recording the digest fields, which do not hash themselves:

- Android: `6b8900bcf2c05520edf001ab661bfab0e9b9037534b179af7bcd79bbb3f0c9a4`
- iOS: `90a2fc454799dce3e2cfcb5d9c8c04babc4115c88424500e891d0b1b3cc0d30a`

Only the current internal-generation declaration and its current-cohort guards
move to V22. Historical V21 assertions bind its original commit, tree and digests;
retained V20/V19/V18 negative controls remain. Historical assurance records are
not relabelled. Tests reject an old binary and reject rebuilt new native inputs
under an old runtime before any synthetic publisher invocation.

Internal channels, tester audiences, production generation, app-owned update
activation and held Android106 restrictions are unchanged. No existing users are
assumed, and no V21 or V22 build, signing, installation or physical qualification
is asserted. Source metadata grants no build, deployment, submission, OTA,
public release, payment or provider activation authority. Future delivery needs
fresh matching binaries and separately qualified platform/device evidence.
AppTransaction app evidence alone does not establish purchase-account, exact
build, IAP sandbox or provider qualification.
