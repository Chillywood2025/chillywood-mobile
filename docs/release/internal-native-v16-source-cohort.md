# Prospective internal native V16 source cohort

The reviewed Expo SDK 54 compatibility patch changes `expo-asset` from
12.0.13 to 12.0.14 in `package.json` and `package-lock.json`. The canonical
`git-native-inputs/v1` algorithm conservatively binds those inputs for both
platforms, even when an upstream patch reports no user-facing changes.

V15's delivery state is not asserted or inferred from repository documents.
Its reviewed source remains immutable at
`191ffb8e610c81204f1d114ba39a80235ec58031`, tree
`d482493bae0a43038b689eb1034e8cc5be8883e2`, with these native input digests:

- Android: `514df5eb89ad4c29643aa8733da77afbdd20822d7b5b96da619e3107370aab3c`
- iOS: `b61e26f8176467abfca7b287fa516600d80167ea7fa2482e2f109cd3e3e6557f`

The source-only V16 transition preserves those identities in `supersedes` and
uses `1.0.0-android-production-v16` and `1.0.0-ios-production-v16`. It keeps the
existing private channels, Google Play internal track, and TestFlight Chillywood
Internal group. Production generation settings, audiences, activation controls,
held V14 restrictions, and historical receipts are unchanged.

Canonical digests are calculated with `nativeSourceSnapshot` in
`scripts/ota-native-source-compatibility.mjs`, using the complete committed Git
inputs, then recomputed after the digest fields are committed. Those fields are
excluded from their own input hash. Regression tests preserve V15's historical
digests and reject both an old V15 binary and changed inputs under its old runtime
before any synthetic provider call.

Any future V16 native delivery requires fresh matching signed binaries,
applicable qualification, and separate action-specific approval. This source
change does not build, submit, publish an OTA, distribute, activate, or physically
qualify anything. These future app-binary requirements are not prerequisites for
the separately authorized malware-scanner server deployment.
