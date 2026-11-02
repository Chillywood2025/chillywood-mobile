# Local synthetic workload qualification

This opt-in harness answers a narrower question than production capacity: can
the current local renderer process representative **synthetic** source shapes
and retire its children under bounded local resources? It is not the production
queue/storage worker, a provider transfer test, or a maximum-capacity result.

## Recovery boundary

The earlier `4d4bf237` tooling and its raw measurements were lost with the old
executor snapshot. This is an authorized reconstruction, not a claim that those
artifacts have been recovered. The supervisor starts from the exact earlier
10:26 UTC recovered source; PID-reuse cleanup and nested-cgroup protections were
rebuilt and regression tested. New receipts must identify their actual source
hashes and versions. Do not reconstruct historical JSON from remembered numbers.

## Run safely

Python 3, Node, FFmpeg and ffprobe must already exist. No installation, provider
login, production upload or configuration change is performed. Generated media
is private, synthetic, and removed at the end unless `--keep-fixtures` is given.

```sh
# Plan/preflight only; does not generate media or create the work directory.
python3 scripts/qualify-clip-render-workloads.py \
  --tier representative \
  --work-root /workspace/scratch/YOUR_NEW_WORK_DIRECTORY \
  --cpu-count 2 --memory-mib 1536 --disk-mib 4096 --wall-seconds 900

# Add --execute only after reviewing that preflight. The path must still be new.
```

Use a real workspace filesystem, not `/tmp`: child `TMPDIR` is explicitly
`<work-root>/tmp`. The harness acquires `/tmp/renderer-heavy-tests.lock` before
execution and checks headroom again after acquiring it. Other heavy suites must
use that same lock. A busy lock refuses execution; it does not silently overlap.

Every stage preflights the explicit budget. Available memory must cover **twice
the process-RSS budget plus 1 GiB**, and scratch must have the requested budget
plus **2 GiB** free. Do not lower reserves or increase the RAM allowance merely
to make a failed case pass. CPU affinity is inherited by all child jobs. These
are safeguards, not kernel-enforced memory limits: 100 ms samples can miss or
overshoot peaks, RSS can count shared pages twice, and short-lived CPU work can
escape sampling. Exit rusage and per-media-process rusage are reported separately.
Unknown cgroup quotas remain unknown; root cgroup files do not establish an
effective nested worker limit. Two pinned CPUs are not equivalent to two shared
Hetzner vCPUs.

The production pool's 11 GiB-per-slot temp-space admission guard is **not run or
bypassed** here. This harness has a separate, explicitly stated scratch budget.
An actual host still needs its own approved full-worker qualification.

## Tiers and fixtures

| Tier | 1080p source | Each rotated 4K source | High-entropy source | Minimum explicit budget |
| --- | --- | --- | --- | --- |
| `smoke` | 30 s | 4 s | 1 s | 2 CPUs, 1536 MiB RSS, 2048 MiB disk, 180 s |
| `representative` | 600 s | 12 s | 10 s | 2 CPUs, 1536 MiB RSS, 4096 MiB disk, 600 s |
| `maximum-contract` | 9000 s | 120 s | Up to 90 s / about 4.5 GiB | 4 CPUs, 4096 MiB RSS, 18432 MiB disk, 3600 s |

All inputs have AAC audio. The long source is 1920×1080 H.264 at 30 fps.
Both phone-style sources are coded 3840×2160 with verified 90-degree rotation
metadata and irregular frame timestamps: one H.264, one HEVC Main10. Main10 here
is **not HDR/Dolby Vision proof**. The large file contains genuinely encoded
temporal noise (lossless H.264), not sparse allocation, arbitrary padding or
bitrate filler. Its exact bytes/duration must come from the receipt.

Generator settings are separate from production output settings. To bound
synthetic HEVC generation, x265 uses ultrafast, zerolatency, one frame thread,
no worker pool/WPP, CTU 64 and one reference. These artificial streams are not a
statistical corpus of real phone GOP structures. The maximum-tier long source
has a 4 Mbit/s variable-rate ceiling without filler to keep its 150-minute
candidate below the unchanged 5 GiB contract. Maximum cases remain **NOT RUN**
unless an actual receipt says otherwise; listing a plan is not execution.

Each generated file is probed, fully decoded with `-xerror`, locally streamed
through SHA-256, and checked against dimensions, codec, rotation, VFR and the
original 5 GiB / 150-minute bounds. The core renderer itself is not modified by
this harness. It retains its encoding settings and output integrity validation.

## Jobs and measurements

The representative tier exports **8 seconds** from the 600-second source and
**3 seconds** from each 4K/large source. These are not full-source transcodes.
The long-source job uses fit plus a generated watermark. The same four edits
run serially and through a two-job local queue. Success requires observing two
real FFmpeg `-filter_complex` processes simultaneously, not merely two Node
launches. Queue wait is measured from local batch submission; it is not a
production queue latency or SLA.

Receipts include:

- Every stage's elapsed time, exit rusage, sampled aggregate process-tree RSS
  and CPU, scratch logical/allocated high-water marks and minimum free space.
- Per-job queue wait, actual export dimensions/duration/bytes, media phase
  elapsed/CPU/child peak RSS and descendant-retirement evidence.
- Exact source SHA-256, tool versions, host observations and real fixture
  codec/duration/size/hash; streaming hash elapsed/CPU and post-render rehash.
- Direct production-core abort after an actual transcode is observed, plus
  malformed-source failure. Cancellation bypasses the measurement shim; a
  wrapper child is never used as proof of production cancellation. This is an
  early-start abort, not sustained mid-render or transfer cancellation proof.

The measurement shim has an inner deadline and reaps its child. The supervisor
owns its process group if a wrapper is killed unexpectedly. Required cleanup or
leftover descendants cause failure rather than being credited as clean success.
Completed empty groups are retired from cleanup ownership to avoid signaling a
later unrelated session after numeric PID reuse.

`report.json` is updated atomically after completed stages. Failed or interrupted
runs remain failed; later separate controls do not rewrite an earlier failure.
Unexecuted cases remain explicit. Source downloads, scans, storage uploads,
network transfers, production leases/retries and provider costs are **NOT RUN**.

## Fast checks versus opt-in load

```sh
node --test tests/clip-workload-supervisor.test.mjs tests/clip-render-workload-plan.test.mjs
```

These root `tests/*.test.mjs` files are discoverable by mandatory Product CI.
They test guards, cleanup, planning and a tiny cancellation process, not the
representative load. The heavy Python CLI is never automatically executed by
these tests. Full Required Validation still belongs to the final composed head.

## Technical sources

- [FFmpeg CLI documentation](https://ffmpeg.org/ffmpeg.html): input/output
  option placement, encoding, size limits and stream metadata.
- [x265 presets and tuning](https://x265.readthedocs.io/en/stable/presets.html):
  zerolatency disables lookahead/B-frames and uses one frame thread. Those are
  fixture-generation controls, not changes to production render quality.

## Fresh execution receipts

No reconstructed historical receipt is valid.

- `audits/clip-workload-rebuild-rotation-failure-20261102.json`: first fresh
  representative attempt, **failed** after 138.80 seconds. The 600-second
  1080p H.264/AAC source was fully decoded and hashed (1,172,676,072 bytes).
  The generated 4K H.264 file lacked rotation side data after a metadata-only
  remux, so the strict fixture assertion stopped the run before any render
  jobs. No concurrency/cancellation/failure-control coverage from that run.
  Generated media was cleaned up. This is a fixture-generation defect, not a
  production render failure. The corrected helper uses an input display-matrix
  override and has a tiny real-MP4 regression; assertions were not relaxed.

- `audits/clip-workload-rebuild-representative-20261102.json`: corrected fresh
  representative run, **passed local scope only**, started 2026-11-02 14:48:10
  UTC and completed in 315.27 seconds. Source hashes in the receipt match the
  measured source checkpoint (local `2da8c1b2`, remote `54005b71`). FFmpeg/ffprobe
  7.1.5, Node 24.22.1, Python 3.12.14, Linux 6.18.57; 2-CPU affinity,
  1536 MiB sampled RSS budget, 4096 MiB scratch budget, 900-second deadline.
  Preflight observed 9,006,637,056 bytes available RAM and 58,700,038,144 bytes
  free workspace disk; effective cgroup quotas were unavailable/unknown.

| Actual synthetic input | Duration | Exact bytes | Export, each serial and concurrent |
| --- | ---: | ---: | --- |
| 1920×1080 H.264, 30 fps, AAC | 600 s | 1,172,676,072 | 8 s, 1080×1080, fit + watermark |
| 3840×2160 H.264, VFR, 90° rotation, AAC | 12 s | 73,285,852 | 3 s, 606×1080 |
| 3840×2160 HEVC Main10, VFR, 90° rotation, AAC | 12 s | 72,696,255 | 3 s, 606×1080 |
| 1920×1080 lossless H.264 temporal noise, AAC | 10 s | 1,145,371,590 | 3 s, 1080×1080 |

All four sources passed full decode, local hash and post-render immutable rehash.
All eight exports passed the production core's probe and full-decode validation.

| Measured local render batch | Wall time | Sampled process CPU | Sampled aggregate process-tree RSS |
| --- | ---: | ---: | ---: |
| Four serial jobs | 45.26 s | 80.11 CPU-s | 434.27 MiB |
| Same four edits, two-job queue | 41.92 s | 80.24 CPU-s | 778.03 MiB |

Two actual FFmpeg transcodes overlapped. Third/fourth queue waits were 8.98 s
and 11.34 s. Individual validated core elapsed times (serial → concurrent) were
5.57 → 11.03 s, 5.40 → 8.71 s, 9.36 → 14.61 s and 24.18 → 30.35 s. This single
warm/local sample does **not** establish throughput scaling, lower CPU cost or
capacity: concurrency increased individual latency and nearly doubled sampled
RSS; sampled CPU work was essentially unchanged. Per-phase CPU and child peak
RSS are retained in the raw JSON rather than inferred from this table.

Scratch allocated high-water was 2,566,287,360 bytes (about 2.39 GiB). Synthetic
HEVC generation—not production rendering—peaked at 1,077,207,040 sampled bytes
(about 1027 MiB) and took 62.03 s with the disclosed low-buffer generator.

Direct cancellation observed a transcode and signaled the Node worker at
0.206 s after launch; the worker exited at 0.308 s with `render_canceled`.
Malformed source returned `media_process_failed` after its metadata probe,
without a transcode. Both retired without supervisor cleanup or surviving
descendants. Cancellation was an **early-start** observation, not a sustained
mid-render/transfer cancellation test. No requested local stage remained
unexecuted in this successful run. Generated media was removed afterward.

**Still NOT RUN:** maximum tier, 150-minute full-source encoding, near-5-GiB input,
maximum-resolution cross-products, sustained/high-concurrency load, actual host
capacity and every production/provider path listed above. The prior failed
fixture receipt remains failed; this successful retry does not rewrite it.

### Later seek-eligibility correction

After this measured workload, an independent delayed-video comparison exposed
an intermittent difference. The renderer subsequently restricted input seeking
to explicit zero video/container/audio starts, retaining legacy seeking for
unknown or nonzero starts without rejecting those inputs. The receipt above
remains bound to its recorded pre-correction source; it is not a new throughput
measurement for the corrected revision. Exact retained-input repetitions and
the full media/focused regression suite separately qualified the correction.
Production hardware and maximum-capacity qualification remain outstanding.
