# Prospective internal V19 native cohort

Source base: qualified PR651 merge `4f2d14635945c45650ea36b68313b90fd2fa1b73`.
V19 gives the existing Android Gallery module, Expo picker result-retention repair
and iOS dismissal repair fresh runtime identities; it does not add another native
implementation or grant delivery authority.

V18 remains immutable at `daa63e320bcb6e4e5ed059d793af02a5af93d809`, tree
`ead50a10f9739a5f9964c260011d63f9c280c2dc`, with Android digest
`aa0a83a683ae83cea39d964ea43688faf0d20a725dd5f18fb7b94ded1eea4243`
and iOS digest
`7b709e9e43fc8bface36ae2009e5b2e635bf7d522cbc1e909fffbe2153ef05c6`.
The previous held picker source is retained in regression tests: its changed
native inputs cannot be delivered under V18 even with a hypothetical matching
binary receipt. No historical binary receipt or remote version counter is edited.

V19 uses `1.0.0-android-production-v19` / `1.0.0-ios-production-v19` on the same
private internal-v2 channels. Canonical `git-native-inputs/v1` calculation after
committing those identities yields Android
`807f1ba7007f93f6c05efab66055fd3eb6471c3d85116e7028b6e22a049572f7`
and iOS
`9c078431f4b69a8d2f39877e34685d00539268cd4c445b32fcec1f53ae31b908`.
Digest fields do not hash themselves; final committed equality is tested.

All release policy fields except explanatory reason remain unchanged: internal
only, Google Play internal and TestFlight Chillywood Internal, app-owned update
activation, no public release or outside-tester submission. Production generation,
historical manifests and held Android106 restrictions are untouched.

Still required before delivery: exact-head Required Validation and reviewed
merge, release-review gate, authenticated current EAS/channel/store readback,
duplicate-build/submission checks, remote version/signing verification, fresh
matching binaries, platform-specific native qualification, rollback compatibility
and installed physical evidence. This source change does not call EAS, build,
deploy, submit or publish an OTA.

Financial test routing is a separate qualification: internal profiles use the
production EAS environment, which does not prove Stripe test mode or Apple/Google
sandbox purchase identities. No financial flags, provider keys, money policy or
payout activation are changed here. Real-money controls must remain off; test UI
and provider flows require independently verified sandbox bindings.
