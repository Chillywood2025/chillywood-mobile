# Delayed timeline investigation and conservative fallback

The original integrated run on local50f5794b had153pass/1fail, with generic file-level diagnostics. Its fixture cleanup removed original media. Same-source isolated4pass and combined154pass were separate runs; neither proves the original cause. Bounded diagnostics on remote773ef47b exposed a real delayed-video mismatch (174pass/2fail including parent test).

Fresh fixed five-source/two-pair controls reproduced the failure. All five source files have SHA256 bc1842731a9061377b030c683c48af41a15abaf734d23fb7bb1a7d32d6c7855d; ten legacy baseline decoded outputs match c07a59aad5da4d6ca8223f42d16a94d9c8de04a1bee7bad54218c81aa6d2752b. One optimized candidate differs in158939 bytes, max44, frames35–59. Nine optimized candidates match. Source video starts0.333008s while audio/container start0. This establishes an unqualified input-seek path, not the complete internal FFmpeg cause.

fresh-reproducer.tar.gz preserves fresh control-1 source plus baseline/candidate MP4 bytes. These are not the removed original matrix files. controls.json contains bounded byte/frame comparison details. controls.mjs records the exact local harness imports used.

Correction local8505833e0a152612dbc48de8e24d2569b4f9d6d9 = remote34fa66171991eb88509102523a5643250d6a89d5, common tree14ef1e494b7f25792dc29dd07005b29a1f3d914c, requires explicit zero video/container/audio starts for optimization. Unknown/nonzero starts use original output-only seeking; accepted input support stays intact. Negative first-packet guard remains. Exact decoded equality and audio thresholds are unchanged. Fixed six comparisons reuse retained control-1.mp4; all six baseline/candidate pairs decode identically (postfix-receipt.json).

This is local synthetic qualification, not genuine-phone/DolbyVision, deployed-build or shared-Hetzner capacity proof. No deployment or production readiness is asserted.
