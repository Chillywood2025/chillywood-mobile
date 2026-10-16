# Local camera inference reconstruction — 2026-10-16

Snapshot: 2026-10-16 22:03 UTC, persistent worktree
`camera-inference-recovery`, HEAD
`5a9205bd797aaa7acc614c0c9b55ffb1315b0c0a`, with implementation edits still
uncommitted. This record supplements the historical
[`recovery-manifest.json`](./recovery-manifest.json) and
[`INCOMPLETE-HANDOFF.md`](./INCOMPLETE-HANDOFF.md); neither was rewritten to
make reconstruction appear to be exact recovery or completed validation.

## Recovered bytes and reconstruction

The original base was `d2ec4dc2a25d67e8f98b578496f5985359b9bebc`; the lost
complete local tree was `3c5e54aad3623f24b95630515bfe73a817812c46`.
Recovery checkpoints `e8d7c26e`, `afb2c05b` and `421f27e3` supplied exact blobs.
Current main through Studio safeguard merge `db69fd0e` was integrated.

At the 22:03 UTC snapshot, all **33 of 33** manifest entries marked
`published: true` matched their recorded Git blob SHA exactly. Verification hashed each file's actual
bytes with Git's `blob <byte-count>\0` header. None of those 33 files changed as
a result of integrating main. This includes production inference/processor code,
both models, licenses/model cards, the recovered SDK runner and instrumentation,
closure guards, workflows, and the recovered scanner README.

Subsequent deliberate integration edits are distinct from recovery or main-merge
changes: `config/ci/required-validation-v1.json` and
`tests/ci/local-camera-inference-validation.test.mjs` add selection coverage for
the native regression tests and raw-completion negative controls;
`scripts/test-local-camera-inference-offline.mjs`
adds raw instrumentation output (`am instrument -w -r`) so the existing
fail-closed parser can verify the terminal result. The final recheck found these
three changed published paths and the other **30 still exact**. Their recovered
original blobs remain preserved in the checkpoint and historical manifest.

The following five entries marked `published: false` were implemented anew from
the documented contract. Their current bytes differ from the historical blobs;
they are **reconstructions, not recovered original implementations**.

| Path | Reconstructed working-tree Git blob at this snapshot |
| --- | --- |
| `modules/chillywood-camera-effects/third-party/models.json` | `f36a6e1a3d1e3225c9823374b67fd14604f0f56c` |
| `plugins/expo-camera-no-barcode/patches.json` | `f46f86c4fb137b662d6c2aa3e5b533b7622f09a3` |
| `plugins/withExpoCameraNoBarcode.js` | `fb85dd85b1db43b98c0bc93eef56177d5a94238b` |
| `scripts/compile-native-camera-effects.mjs` | `0659e4b952f00836a8ccbf31099d5dc637df6e95` |
| `tests/expo-camera-no-barcode.test.mjs` | `93608b1eb0c62154230c30a8ad9799be625ef3ff` |

The compiler and release integration are still under active validation; the
working-tree identifiers above are a snapshot, not final-head certification.

## Provenance and intended native behavior

The exact recovered model bytes were independently rehashed locally:

| Bundled model | Bytes | SHA-256 |
| --- | ---: | --- |
| BlazeFace short range, version 1 | 229746 | `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f` |
| SelfieSegmenter, version 1 | 249537 | `191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b` |

The reconstructed `models.json` retains versioned Google model URLs and the
documented tensor/preprocessing contracts. The recovered model cards and full
Apache-2.0 licenses remain unchanged. The reviewed standalone Maven pins are
`com.google.ai.edge.litert:litert:1.4.1` (AAR SHA-256
`815ef39f7d40f579adda1c7bcb7ce090685fb286777ffd8283f33202f67da1b4`) and
`com.google.ai.edge.litert:litert-api:1.4.1` (AAR SHA-256
`ce5f6cc1924f0b9eb0fc339e0d3a3e6c9d041b9deb5e99f800fd6a42150f1875`).
These pins still require verification against the actual resolved app artifacts
by native compilation. Production code selects application-only CPU XNNPACK;
there is no substitution of ML Kit, MediaPipe Tasks, Play Services inference or
runtime model downloads. Local OS profiler hooks are not a claim of zero
diagnostic code or zero unrelated application network activity.

The scanner patch targets only Expo Camera **17.0.10**. The official npm archive
SHA-256 is `0f64d0221b88be7e75e72237fac5b043f903e11dd371e8608204316f48ce152c`;
cached archive bytes were checked against the package-lock SHA-512 integrity.
All ten Android source hashes are validated before any file is written. The
patch removes scanner dependency/provider/analysis paths, rejects unsupported
scanner calls, and preserves ordinary photo/video/preview/permission bodies and
the byte-identical photo plane helper. No iOS scanner source is patched.

## Validation status and holds

Confirmed in this reconstructed worktree: scanner regression suite **12/12**,
focused plugin/test ESLint, and `git diff --check`. The suite includes reverse
transforms, idempotence, original/patched tampering across all ten files,
provider reintroduction, failure before earlier writes, ordinary API preservation,
and the tracked application's scanner non-use with negative controls.
Historical pass counts in the incomplete handoff do not certify this worktree.

Full `:chillywood-camera-effects:compileDebugKotlin` and
`:expo-camera:compileDebugKotlin`, actual resolved AAR/merged-manifest checks,
and actual permission-free AOSP synthetic model inference were pending at this
reconstruction snapshot. Subsequent execution results and blockers are recorded
in the follow-up section below.
Exact-head Required Validation and live merge rules also remain mandatory.

V15 is a candidate native generation and remains held pending those gates and
fresh signed tester builds. Existing Android build **106 / V14 remains held**
because it contains the refused ML Kit dependency; it cannot serve as the new
binary or its qualification evidence. Preserve all earlier build records and
physical proof with their original source/runtime/device/conditions.

The five intended effects remain Studio Light, Chicago Skyline, Crimson Aura,
Neon Edge and Spotlight. Synthetic inference and compilation do not establish
real-subject quality, ARM/thermal performance, permission behavior on a phone,
or remote participant receipt. No physical testing, new signed build, Studio
cutover, public release or provider/account change is claimed by this record.

## Follow-up validation and packaging correction

At source `006ad5359069a0465f060235caff4304ab9d2937`, the actual permission-free
AOSP run passed 2,219,042 checks, including 1,170,432 native output sentinel
checks. It invoked face inference eight times and segmentation sixteen times;
two separately compiled controls removing the respective interpreter call were
rejected with the expected nonce-bound error and terminal status. The production
Java and model bytes remain the recovered originals. Harness changes add raw
instrumentation status, immutable input snapshots, output sentinels and executed
no-op controls. The retained receipt SHA-256 is
`65cfa857025c24be374b95f9ff6e36823c7349796378c4d4bd8612b42a9ff20e`.
The sanitized [synthetic receipt](./AOSP_SYNTHETIC_PROOF_006AD535.json) retains
the source, model, runtime AAR, test APK and harness hashes and both controls.
This is component-level synthetic x86_64 proof, not signed-app or physical proof.

Full Android compilation then exposed a production packaging defect: SDK 54
selected Expo Camera's published AAR, so the patched Kotlin source was not a
Gradle project. The mandatory compile target correctly failed. Commit `27522cd0`
adds the production Android `buildFromSource: ["^expo-camera$"]` setting, a
fail-closed plugin check and installed-resolver negative controls. This changes
native inputs and requires resealing V15; it does not invalidate the unchanged
adapter/model component proof. All 15 scanner tests pass, but an actual successful
Gradle source-project compile and resolved closure are still required.

iOS generation, SDK discovery and CocoaPods installation succeeded. Its first
verification attempt failed because plain Ruby could not load the `xcodeproj`
gem supplied by the CocoaPods wrapper. The compiler is being corrected to use
that actual interpreter and gem context. No complete native compile pass is
claimed by this follow-up.
