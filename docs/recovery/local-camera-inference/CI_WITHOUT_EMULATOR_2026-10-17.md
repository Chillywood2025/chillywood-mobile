# CI scope after emulator removal — 2026-10-17

The user explicitly requested "Take emulator out and rerun". The workflow
change removes the `--emulator` execution step and emulator/system-image SDK
installation from `local-camera-inference.yml`. Job labels now describe source
contracts and compilation. The existing job dependencies, failure propagation,
validation planner, protected publisher and required-check policy are preserved.

CI still requires immutable model/source checks, parser and mutation failure
controls, actual Android camera Java/Kotlin compilation for Debug and Release,
both variants' resolved dependency graphs, original AAR hashes and merged
manifests, Android/iOS native SDK contracts and camera compilation, and the
ordinary product, sensitive, database, autonomous, policy and release checks.
The compiler and production source are unchanged by this workflow adjustment.
No skip, `continue-on-error`, synthesized success or branch-rule change is added.

A successful run after this change does **not** establish emulator inference
execution, executed native no-op model controls or real-device qualification.
The retained harness/parser tests are not substitutes for those execution
receipts. Physical camera/effect quality, ARM behavior, performance and remote
participant media qualification remain pending within their original scope.

Historical receipts remain unchanged, including the component-level synthetic
[AOSP proof at 006ad535](./AOSP_SYNTHETIC_PROOF_006AD535.json), the
[iOS compile proof at 984c7b22](./IOS_NATIVE_COMPILE_PROOF_984C7B22.json), and the
failed f600bba0 CI run `38979198493`. None is relabeled as proof of the new head.

Existing signed EAS artifacts retain source
`f600bba0cc99e7d0114c99730cd12c8a2177422f`, tree
`7499a85285e778a04ae33ae9a4250b1768fb2b22`:

- Android 107: build `9b486eb2-9f75-4f87-8d5b-98dd58d7ad07`, AAB SHA-256
  `24dddad108a280ca41bbfacefbe7938cc3687a0678b5cc591ab32c761462dd43`.
- iOS 40: build `4ca981f8-4af7-41fa-be7a-fa37ffcd653c`, IPA SHA-256
  `c340977ef7c2733a35a2b82093ac1b7f4589a9b055258989d1f08b659cc233b0`.

This change does not rebuild, resubmit or retag either artifact. Their installed
or physical behavior is not inferred from workflow results. PR565 remains
unmerged until its updated exact head passes Required Validation and the workflow
delta is reviewed under the live repository rules. The paused task and held
Studio migration remain untouched.
