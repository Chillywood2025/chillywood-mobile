# Prospective internal native V17 source cohort

The root Undici advisory repair changes the Expo CLI dependency from 6.28.1 to
6.29.1. It changes no mobile runtime implementation. The unchanged canonical
`git-native-inputs/v1` contract conservatively binds the root manifest and entire
lockfile, however, so it requires a new source cohort rather than rewriting V16.

V16 remains immutable at `35d85e893ebb1c35a065248ee6820716b8cdcfd2`, tree
`dbe21f55a0afe68635efe6ee4cef9706bb3a23fd`, with these native input digests:

- Android: `37c6b96c66ce64121a9c134fdca58d919a757868f70feebd02928c4d694259d3`
- iOS: `3609267e9486d0eddcd426f974b24b773b32c24977dbbad69a4a6eec07a72932`

The prospective V17 transition preserves those identities in `supersedes`, uses
`1.0.0-android-production-v17` and `1.0.0-ios-production-v17`, and leaves all
release policy unchanged. Existing private channels, internal tester audiences,
app-owned activation, production generation, held V14 restrictions, and prior
receipts are preserved. No V16 build, distribution, or installation is inferred.

Canonical digests are calculated by `nativeSourceSnapshot` from complete committed
Git inputs after the V17 identities are set, then verified again after storing
the digest fields, which do not hash themselves. Regression tests preserve V16's
historical digests and reject both its old binary and changed source inputs under
its old runtime before any synthetic provider call.

This tooling repair needs no immediate mobile delivery. A future delivery from
V17 must use fresh matching signed binaries, applicable qualification, and
separate action-specific authorization under the existing release controls.
Source validation does not build, submit, distribute, activate, physically
qualify, or publish an OTA. The independent alert-service dependency rollout has
no prerequisite on those future mobile builds.
