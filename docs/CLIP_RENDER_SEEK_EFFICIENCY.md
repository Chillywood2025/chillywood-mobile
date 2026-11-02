# Clip render seek efficiency: recovered source, rebuilt proof

The runtime renderer was recovered byte-for-byte (Git blob
`141a33a963d1cf520208049b0c30dabdb04b875c`). Its implementation is unchanged by
this reconstruction. Missing test helpers and the seek matrix were rebuilt;
they are **new tests**, not a claim that the lost original test files or raw
benchmark receipts were recovered. Historical pass messages are not new proof.

## Qualified seek path

Only the MOV/MP4 demuxer + H264 + AAC-LC (or no audio) combination uses input
seeking. The input seek is a whole second at least one second before the cut;
`-noaccurate_seek` retains keyframe preroll. The remaining exact trim stays at
output. This preserves the existing `fps=30` grid and warms the AAC decoder.
Fractional input seeking or a fixed preroll allowance must not replace it without
new decoded-media proof: sparse/VFR boundaries and audio history can differ.

A separate allowlisted ffprobe reads one video packet's PTS (not DTS). Negative,
missing, malformed or unavailable PTS keeps the original output-only path.
The probe is bounded to60seconds/4KiB, and cancellation propagates instead of
silently starting the fallback render. Nonnegative packet PTS, not merely stream
start_time, excludes MOV edit lists which can conceal negative packets.

WebM/VP9/Opus, HEVC, AV1, MP3/PCM, non-LC or unknown AAC profiles retain
output-only seeking. They are not claimed to have optimized-seek equivalence.
Whole-source/early exports gain nothing from input seeking. Poor seek indexes
and long GOPs can reduce the benefit. Source download/hash/readback costs remain.

## Rebuilt local comparison

```sh
flock /tmp/renderer-heavy-tests.lock node --test --test-concurrency=1 \
  tests/clip-render-core.test.mjs tests/clip-render-seek.test.mjs \
  tests/clip-render-color.test.mjs
```

The frozen baseline is the recovered pre-optimization renderer, Git blob
`9ef4992210911955cf1f975e3deaea4462b8fc96`; its SHA256 is pinned in the test.
Each comparison invokes both actual render flows, including their output probe
and complete integrity decode, then compares every decoded video byte, frame
count, stream timestamps/durations, aligned PCM sample count and final duration.
Aligned audio may differ by at most two signed16-bit quantization units, never
by a timing offset. Source bytes must remain unchanged.

The matrix builds21 small synthetic-media comparisons: zero/early/integer/
fractional/late/remainder cuts; keyframe and immediately-after-keyframe cuts;
24/25/29.97/30fps; sparse0.2fps and VFR; no audio; delayed44.1kHz MOV audio;
positive PTS, delayed video and negative-PTS edit-list fallback; WebM/Opus
fallback; Fit/Center, burned watermark and phone-style90-degree rotation.
These are actual FFmpeg operations on generated media, not real phone captures.
Each successful run emits per-case decoded-video hashes/audio error as fresh
test diagnostics. Temporary source/output/raw files are cleaned afterward.

Core tests separately cover immutable output, watermark pixels, input rejection,
and non-square sample aspect ratios with both directions of rotation. The SAR
normalization only downsamples an axis before framing; square-pixel behavior is
unchanged. [The color tests](CLIP_RENDER_COLOR_POLICY.md) establish the narrow
PQ/HLG-to-SDR policy, not Dolby Vision or generic HDR qualification.

## Resource and historical-evidence boundary

Both render encoding and full-output validation now explicitly request two
decoder threads; the complex render filter and simple validation filter pools
request two threads each. These are not a total-process thread count, CPU quota,
or memory limit. Accepted maximum dimensions/duration/size still need host proof.

The earlier120-second microbenchmark and its raw receipts were lost during the
workspace replacement. They are not included or reconstructed as measurements.
The small matrix above validates output equivalence, not speed, sustained load,
maximum-size exports, provider transfers, or Hetzner capacity. The representative
workload harness is separate and must label its own fresh evidence accurately.

Production activation still requires actual authorized host CPU/memory/disk
limits, deployed FFmpeg build, contention with LiveKit/scanner, full download/
hash/upload/readback costs, cancellation, and long/maximum-envelope workloads.
Cloud fixtures and CPU affinity do not qualify the shared2CPU/2GB/40GB Hetzner
host. No deployment, paid scaling, purchase, or gate activation is performed.

## Primary documentation

- [FFmpeg command-line options](https://ffmpeg.org/ffmpeg.html): input/output
  seek placement, accurate-seek behavior, and per-input decoder options.
- [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html): fps timestamp
  duplication/dropping and filter thread-pool semantics.
