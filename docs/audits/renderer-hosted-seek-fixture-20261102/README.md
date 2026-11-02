# Hosted delayed-video fixture correction

TAP trailing whitespace normalized for repository hygiene; test results unchanged.

Hosted Product run41479160016/job125392793947 on ed2b9580 used FFmpeg6.1.1-3ubuntu5. Its17 completed seek cases passed exact video/audio comparison; the next delayed-video fixture failed the precomparison seek-strategy assertion (10 versus0). This is not evidence of a new production decoded mismatch.

The generator offset the video input but left output fps_mode at auto. Auto selects CFR/VFR depending on the muxer; CFR can duplicate frames back to zero and destroy the intended initial gap. Local FFmpeg7.1.5 control, identical2-second inputs: auto and passthrough report video start0.333008 with50frames; explicit CFR reports video start0 with60frames. Audio/container starts remain0. See the three raw probe JSON files. The explicit CFR control reproduces the zero-anchor condition, not the actual hosted binary; hosted revalidation is still required.

The fixture now explicitly requests passthrough only for intentionally delayed video (sparse already used it). The matrix first asserts real delayed-video/zero-audio/zero-container starts, then still requires legacy seek and exact decoded-video/audio equality. All21 cases remain; no production code, thresholds, timeouts or eligibility guards changed.

Reference: https://www.ffmpeg.org/ffmpeg-all.html (fps_mode: auto chooses CFR/VFR; passthrough preserves frame timestamps). Local2-second controls are not a production capacity or real-phone qualification.

First corrected local full matrix:24pass/2fail (including parent). Delayed-video and19 other comparisons pass; early-fractional fails exact decoded equality at byte2212900/2916000 (108 vs109). That case starts0.123s and does not use optimized input seeking. This independent mismatch remains unresolved; do not treat the fixture correction as a green matrix or merge qualification. Raw failed TAP is preserved; finally cleanup removed that run's media.
