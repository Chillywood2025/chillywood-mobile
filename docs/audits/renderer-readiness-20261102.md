# Creator renderer readiness audit — November 2, 2026

This is the source-audit snapshot before final aggregate/hosted validation.
It is not a release approval or production-capacity claim. Protected main was
`91e1720b4233803b7f32f4fccc25db032a575213`; the reviewed integrated source and
local workload evidence were remotely preserved as `192522f25b292f6214f2bf2a514df0b5cb3ad05f`.
The exact eventual PR-head Required Validation result remains authoritative.

## Reviewed path and corrections

The audit followed creator upload/scan eligibility, saved edits, account-bound
enqueue/status/cancel UI, bounded admission and worker claims, source download,
FFmpeg conversion, private immutable output reservation/write/readback, lease
and source fences, draft completion, scan enqueue, owner review and publication.
LiveKit recording and adaptive streaming are separate pipelines, not work done
by this clip-export worker.

Corrections cover:

- Authoritative worker registration, one-use process sessions, bounded global
  and per-worker leases, creator fairness, queue/media backpressure and no
  automatic rerender after uncertain output production begins.
- Durable disabled scaling control, fresh health evidence, bounded cold-start
  and recovery, safe idle draining, obsolete-target rejection, boot deadlines,
  batched observations and repeat qualified scale-to-zero wake-ups.
- Separate disk sample timestamps and explicit unknown effective memory limits.
  Leaf cgroup arithmetic is not host headroom; tighter/hidden ancestors require
  separately qualified evidence before growth.
- Status-response generation fencing, accurate technical-delay/HDR messages,
  and replacement of deleted exports without replaying historical completion.
- Qualified seek optimization, anamorphic sample-aspect/rotation preservation,
  bounded integrity decoder threads, and explicit PQ/HLG-to-SDR conversion with
  originals unchanged. Dolby Vision/ambiguous HDR remain explicit limitations.

The default worker/controller gates remain OFF. The two new migrations are
forward-only source changes; deployed migration `20261101141646` is unchanged.
No live database or provider mutation is part of this audit.

## Evidence and its limits

Fresh component checks include DB authority/admission tests, composed controller
and telemetry tests, worker/local-HTTP transport tests, mounted creator UI,
21 actual seek-comparison cases, SAR/color/reference-pixel tests and resource
regressions. Counts overlap and must not be added into a capacity metric.
Native PostgreSQL contention is mandatory hosted CI: local Docker was absent,
so PGlite and runner-source checks are not represented as native lock proof.

Fresh representative media evidence is stored in
[`clip-workload-rebuild-representative-20261102.json`](clip-workload-rebuild-representative-20261102.json).
It covers a 600-second 1080p input, rotated/VFR 4K H.264 and HEVC Main10 inputs,
and valid large high-entropy video. Eight short exports passed: 8 seconds from
the long input and 3 seconds from the others. Two overlapping FFmpeg transcodes
were observed; the concurrent batch took 41.92 seconds with approximately
778 MiB sampled aggregate process-tree RSS. This is not cgroup peak measurement,
sustained throughput, doubled capacity, or equivalence to two provider vCPUs.
Early-start direct cancellation and malformed-input failure passed without
surviving descendants or credited supervisor cleanup. Source bytes were rehashed.

All six measured source hashes match the integrated checkout. The earlier
rotation-fixture failure remains separately preserved; the corrected run does
not erase it. Lost pre-recovery raw receipts were not recreated as measurements.
See the [workload runbook](../CLIP_RENDER_WORKLOAD_QUALIFICATION.md) for scope,
budgets, sampling limitations and reproduction instructions.

## Remaining production blockers

1. Complete exact-head aggregate Required Validation, including real native
   PostgreSQL contention, before merge. Component passes are not a substitute.
2. Obtain existing authorized OS access and measure the actual worker host.
   Hetzner's console confirmed a shared 2-vCPU/2-GB/40-GB server; free RAM,
   swap, temporary filesystem, effective cgroups, service contention and actual
   binaries are unverified. A 3-GiB service ceiling does not qualify that host.
3. Qualify trusted telemetry, provider execution and alert-delivery adapters.
   Runnable default-OFF control-loop code and fake-adapter tests do not establish
   a deployed automatic-scaling service or functioning operator alarms.
4. Prove real source download, create-only output upload/readback, scanner,
   owner review/publication and interrupted lifecycle using authorized synthetic
   objects. Local file/local-HTTP/SQL fixtures are not provider qualification.
5. Establish hardware/resource profiles and provider quotas with an approved
   budget and cleanup policy. Reservations are estimates; storage, transfer,
   taxes and billing increments are not a guaranteed invoice cap. Approval
   expiry blocks mutations and does not itself stop existing resource billing.
6. Qualify sustained/maximum workloads and real creator captures. Full 150-minute
   exports, near-5-GiB inputs, 16384-pixel extremes, all concurrency combinations,
   physical phone/Dolby Vision and deployed-build color fidelity remain unproven.
7. Verify installed supervision, drain/restart and empty-cgroup behavior.
   Expired DB leases do not prove that abandoned OS child processes stopped.

The architecture separates queued rendering from viewer traffic and retains
small initial capacity. It does not demonstrate millions-of-users readiness;
storage/CDN, database, LiveKit and operational scaling require separate proof.

No server purchase, paid scaling activation, new credential/security change,
unqualified renderer deployment, native build, public release or OTA occurred.
