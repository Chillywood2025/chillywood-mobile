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

No reconstructed historical receipt is valid. Add only freshly produced raw
JSON here, with an explicit execution scope and any failures or NOT RUN cases.
