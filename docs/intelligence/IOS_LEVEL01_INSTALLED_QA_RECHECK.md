# iOS Level 0/1 installed-QA recheck

Recorded at `2026-07-24T05:27:44Z` from source
`1335dc18669d8917bb72c14393bf464d98ce902f`.

## Decision

`NO_ARTIFACT_CHANGE_REQUIRED`

The owner-only build-8 IPA is still available and its SHA-256 is exactly
`24a951d58302dd73e13e4adc899fc28680472eb78f37cac04639ee95896e36d8`.
Read-only inspection passed:

- ZIP integrity;
- bundle `com.chillywood.mobile`, app `1.0.0`, and native build `8`;
- runtime `1.0.0-iosqa1` and channel `ios-qa`;
- strict code-signature verification and arm64 device architecture;
- embedded privacy manifest and Firebase configuration;
- device distribution profile;
- LiveKit/WebRTC native runtime; and
- embedded update-manifest hash
  `e26b9d17451a661b268e472151804fa75c02dcfed148ea875c4a969307266be8`.

No missing native capability or JS-only instrumentation gap was demonstrated.
An OTA cannot turn the installed development simulator binary into the isolated
`ios-qa` runtime. A new binary would duplicate the intact build-8 candidate.

The repository contract associates the candidate with binary source
`bbb9d6db67620b1d39e3a3e67ab8ef7166ce02ae`. That association is a prior
attestation, not a fresh provider-source readback.

## Current installed state

- One booted iOS simulator is available.
- It has Chi'llywood `1.0.0 (1)`, runtime `1.0.0`, channel `development`.
- Its build, runtime, and channel do not match the internal-QA contract.
- One paired physical iOS device is currently available to authenticated local
  device tooling, but Chi'llywood is not installed on it.
- The current process has authenticated EAS CLI access, but bounded EAS
  build/channel queries failed. App Store Connect API credentials are not
  available to the read-only adapter. Current TestFlight assignment therefore
  remains unverified.

The device-signed IPA is a valid internal-device candidate, not a simulator
artifact. A bounded direct installation attempt was made against the approved,
connected, paired, booted physical iPhone. Installation failed at the Apple
beta-distribution boundary with `0xe800801f` (`CoreDeviceError 3002`,
`MIInstallerErrorDomain 13`). This is the expected direct-sideload rejection
for an App Store/TestFlight distribution profile; it is not evidence of a
device trust, lock, IPA-integrity, or product defect.

The sanitized installation-attempt evidence hash is
`c84b00551eb51b39f2112350f782279d5a96fe198021fcf6e35c5c6d15f83f08`.
Raw device output was deleted after hashing. No device identifier, signing
material, token, account identity, or private log is stored here. No build,
OTA, submission, TestFlight assignment, external testing, App Review, or public
release occurred.

## Development-runtime evidence

The development simulator was used only for non-closing evidence. Its results
do not count as internal-TestFlight or exact-runtime proof.

- The synthetic session reached an authenticated Home surface. A direct Home
  route flow passed with the visible `HOME` and `Settings` states.
- Home flow elapsed time was `40,616 ms`, including Maestro startup/driver
  overhead; it is not a product render-time measurement.
- Explore, Library, and Live bounded flows did not complete their full
  assertion chains. Their elapsed times were `27,487 ms`, `29,465 ms`, and
  `27,622 ms`, respectively. These are automation-run durations, not route
  render-time classifications.
- A sanitized accessibility hierarchy contained 81 nodes and visible Home and
  Settings labels. The expected React Native test identifier
  `auth-logged-in-home` was absent from the Maestro hierarchy even while Home
  was visible. This explains the authentication-flow false negative and is
  classified as `DEVELOPMENT_RUNTIME_AUTOMATION_IDENTIFIER_GAP`, not a
  confirmed product defect.
- Search interactivity, route timing, touch-target sizing, visual layout,
  orientation recovery, and LiveKit media/UI stages remain unclassified for
  iOS because the target build is not installed. No finding should be created
  from these development-runtime automation results.

Sanitized automation-output hashes:

- authentication:
  `494ed76394545204c8cdc124bf0a3218f8c04d9919a80384b5b6d8cd96e1ea65`;
- Home:
  `d6dbaad7e801f161facc92f31497ec8121c60a5afa06e4afcf3e4efff3bcaa33`;
- Explore:
  `69ff31311402a0ba5fb199feb4a03c112f808f92ff3d79becf9abba31910efa7`;
- Library:
  `4592852b150b03d2b1da1f697e60ab67ef60aeec9f423bd9d395371ae2603947`;
- Live:
  `e2d826ba6c200023f8981942ed87158ae09fa4ce592aedc2efbb96d4099e3cec`;
  and
- accessibility hierarchy:
  `4976e1c8e8379ea41d8c3ee1d5919afab318e9e59d1ca5d01b3dac1bd1a25db`.

Raw hierarchy, Maestro output, and temporary test artifacts were deleted after
hashing. No screenshot was captured. No credential, tester identity, device
identifier, log, or token is stored here.

## Exact blocker and resumption

`IOS_INTERNAL_TESTFLIGHT_INSTALL_REQUIRED`

The unavoidable next action is an interactive Owner/device action: install
Chi'llywood `1.0.0 (8)` from the existing internal TestFlight group on the
connected and unlocked iPhone, then leave the app available to authenticated
local automation. Direct installation of the preserved IPA cannot replace this
TestFlight installation step. This action must not add external testers, submit
for App Review, or start a new build.

After installation, read the installed build/runtime/channel in-app, sign in
with one existing synthetic account, and run the visual, journey,
accessibility/orientation, and LiveKit stages. LiveKit closure additionally
requires the distinct second participant and read-only telemetry from its
separate prerequisite lane.

If build 8 is no longer available in internal TestFlight and cannot be installed
from the intact candidate, that failed availability check—not this recheck—is
the prerequisite for reconsidering one batched internal binary.

Rollback for an installed-device test is to terminate and remove only the
internal Chi'llywood app from the QA device. This recheck created no provider or
release state to roll back.
