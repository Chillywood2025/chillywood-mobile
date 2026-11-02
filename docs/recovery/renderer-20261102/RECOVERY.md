# Exact renderer recovery checkpoint

This branch preserves partial source recovered from retained edit records after the execution workspace reverted to an older snapshot. It is NOT a completed implementation, release candidate, or production qualification.

Protected main remains 91e1720b4233803b7f32f4fccc25db032a575213. These copies are deliberately stored under documentation rather than installed at runtime paths. Missing pool/controller/migrations/tests and raw workload receipts have not been recreated. No test or workload was rerun for this checkpoint. Historical test reports are not fresh proof of this partial tree.

Each file below matches its previously recorded complete SHA-256:

- scripts/clip-export-control-plane-cli.mjs: c96f7717d64f52a82c57a92fa7bdbf0276426e145b727561ba4be0535a59dcb1
- scripts/lib/clip-export-control-plane.mjs: 54da359c23a8655eed64ac0845fb43ab56bc6b7f7fbe0735470fe14a5295bb7f
- tests/clip-export-control-plane.test.mjs: d2186d7a93dd2d5fef0d5b0e7b3676582b42bc1b6fc91073ffeb01245474c5d5
- scripts/lib/clip-render-core.mjs: f549f3e54bc016e6151b1f0450d94c84a43342b185e57ebec61408f76215ecb4
- tests/fixtures/clip-render-output-seek-baseline.mjs: f7f1b2fa705f0aa518c58ff4ff18d80dd54917dc3e05c345431ac26d864cde67

The optimized renderer copy is the earlier 584b54cc stage, before the later SAR/HDR changes. The baseline is the original protected-main renderer. The control-plane copies belong to the previously reported e86ae1c stage. Do not combine these partial artifacts into a readiness claim.

No deployment, provider change, server purchase, scaling activation, new credentials, build or OTA occurred. Reconstructing missing content and repeating affected validation requires resolving the owner's no-duplicate-work instruction; approval is pending.
