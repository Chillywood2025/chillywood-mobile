# Bounded Clip render pool: operator runbook

## Status and authority

The renderer and scaling control plane default **OFF**. Source availability is
not installation, production migration, host qualification or activation proof.
There is no qualified live provider adapter or activated alert-delivery transport.
No purchase, credential creation, deployment or provider change is authorized by
this document. The shared 2-vCPU / 2-GB / 40-GB LiveKit/scanner host is **not a
qualified renderer**; do not compete with those workloads.

The private database gate and operator-owned worker registrations grant capacity.
A worker UUID is an identifier, not a credential. Existing service-role secrets
must remain protected; render workers must never receive provisioning credentials.
Pending forward migrations extend deployed history; never edit a deployed migration.

## Bounds and queue behavior

| Control | Default / ceiling |
| --- | --- |
| Global active job leases | 1 / 32 |
| Registered worker slots | 1 / 8 |
| Active jobs per creator | 1 |
| Pending jobs per creator | 3 |
| Global pending jobs | 1,000 / 100,000 |
| Pending media estimate | 900,000,000 ms / 900,000,000,000 ms |
| Worker/job lease | 2 minutes; heartbeat every 30 seconds |
| Abandoned pre-output attempts | At most 3 |

Creator turns use last-claim/enqueue ordering. New creators cannot continually
jump ahead of an older turn. This is not a wall-clock latency guarantee.
Blank End reserves through the 150-minute source ceiling. Media duration and job
count are not CPU, storage, egress or dollar caps. Admission rejects new work;
deduplicated retries return the existing intent first. Lowering approved capacity
does not preempt valid running work or delete accepted queued jobs.

## Qualify before enabling even one slot

Record exact source, Node 22+, ffmpeg/ffprobe versions, architecture and isolated
service configuration. Preserve the 5-GiB / 150-minute source contract, original
bytes, and 1080-pixel long-edge / 30-fps output ceiling without upscaling. Standard
SDR exports of qualified HDR inputs follow [color policy](CLIP_RENDER_COLOR_POLICY.md);
this is not blanket Dolby Vision/iPhone HDR qualification.

Measure representative long, late-trim, high-resolution, watermark and concurrent
jobs through download, render, full-output decode, upload and full readback.
Record wall time, whole-cgroup peak memory/CPU, temporary-disk peak and transferred
bytes. Short exports from large files do not prove maximum-duration throughput.
The 130-minute job deadline does not guarantee every permitted source finishes
on small hardware. Do not silently reduce duration or resolution to fit a host.

Require at least **11 GiB free temporary disk per possible simultaneous job** plus
OS/service reserve. Local admission conservatively checks `(active jobs + 1) ×
11 GiB` against currently free space even when active files already occupy disk.
This is not a filesystem reservation. Heartbeat disk telemetry must be current,
including when all slots are occupied; unavailable samples remain unknown.
RAM/CPU cgroup ceilings are safeguards, not dynamic local capacity admission or
measured minimum hardware requirements. Qualify each concurrency/resource override.

Disk telemetry must include the actual successful read's `diskObservedAtMs`.
Cached free bytes carried by a later progress/outcome event keep their original
timestamp; a fresh event or database read does not mean a new disk measurement.
Unknown reads clear both fields. Before enabling growth, verify stale/unknown
disk evidence fails closed while fresh zero-job inventory can still drain safely.

The supplied sampler's `memoryLimitBytes` is explicitly leaf-only, not the
effective worker limit: it reports `memoryLimitScope: 'leaf-cgroup-only'` and
`effectiveMemoryConstraintKnown: false`. Effective limit/headroom remain null.
`leafMemoryAvailableHeadroomBytes` is only leaf arithmetic. A tighter parent or
busy sibling can exhaust memory while that leaf appears mostly empty; cgroup
namespaces can hide those constraints. Do not treat this sample as host proof.

Activation requires a separately qualified adapter to measure the effective
hierarchy, including hidden ancestors/siblings, and provide current
`effectiveMemoryLimitBytes` and `effectiveMemoryAvailableHeadroomBytes` with
`memoryLimitScope: 'qualified-effective-cgroup-v2-hierarchy'` and
`effectiveMemoryConstraintKnown: true`. The worker/session/profile-bound,
unexpired isolation qualification must attest the same scope and known flag.
Unknown effective hierarchy blocks growth. The built-in sampler does not make
this attestation; actual effective-host qualification remains unresolved.

Before activation prove real private create-only upload/readback, scanner
progression, owner-only review and cancellation/source-change/lease-loss fencing
with authorized synthetic media. SQL fixtures, modeled native UI and unit tests
are not physical-device, provider or installed-systemd proof.

## Installation and activation checklist — separately authorized only

1. Verify forward migration history, RLS/FORCE RLS, private grants and OFF gate.
   Register the qualified worker disabled with capacity 1 and qualification receipt.
2. Install reviewed code/config separately from LiveKit/scanner. Keep
   `CLIP_EXPORT_WORKER_ENABLED` false; set approved `CLIP_EXPORT_WORKER_ID`.
3. Under explicit activation authority enable registration, local activation and
   global DB gate. Use `node scripts/clip-export-worker-cli.mjs --pool`, or bounded
   supervised `--once`. Neither CLI opens the database gate.
4. Read back ready session/capacity and verify the complete private-output flow,
   telemetry and alarms. A default-OFF successful process exit is not a renderer.

Use exactly one supervised runtime per identity: **either** pool service **or**
one-shot service/timer, never both or standalone duplicates. The pool unit uses
`Restart=no`, `KillMode=mixed`, `SendSIGKILL=yes`, `MemoryMax=3G`, `CPUQuota=200%`
and a 7,900-second graceful-stop allowance. These are uninstalled templates and
not evidence a 3-GB host is sufficient. SIGTERM drains the pool while maintaining
accepted-job heartbeats; SIGINT explicitly aborts. One-shot has a shorter abort
stop allowance and is not equivalent to graceful pool drain.

**Database lease expiry does not prove ffmpeg stopped.** Before restart, identity
reuse or replacement, prove the old service stopped and its entire cgroup is
empty. Unit conflicts/order assist local cutover, not distributed exclusion.
Qualify mixed-mode TERM/CONT/KILL behavior on the actual installed systemd unit.
Do not change lease timestamps, reuse sessions or introduce advisory-only locks
to bypass physical process lifetime requirements.

## Observe actual work, not demand alone

`read_creator_clip_export_pool_metrics()` returns aggregate capacity, queue age,
pending media, active/expired leases, worker readiness and recent outcomes/timing.
No successful timing sample is unknown, not zero. Last-attempt processing timing
includes I/O; it is not an ffmpeg-only benchmark. Worker JSON logs include opaque
private correlation identifiers, stage checkpoints and resources, never source
URLs, owners, credentials or raw provider errors.

Worker-process RSS excludes ffmpeg descendants; use descendant-inclusive cgroup
memory. Peak memory/OOM counts are lifetime/cumulative values. CPU activity and
heartbeats do not prove processing progress. Cgroup sampling cannot self-certify
isolation from other services. Long live jobs with no new checkpoint must not be
called successful progress or automatically replaced as stalled.

Derived health separates healthy saturation, healthy idle, long-running work,
systemic dependency failure, isolated worker failure and unknown evidence.
Adding hosts cannot repair authentication/storage failure or permanent input
rejection. Alert on oldest-queue age against measured objectives, no ready worker
while enabled, expired leases, admission pressure, disk/memory pressure, unknown
output outcomes and unresolved circuit incidents. Stable incident IDs are not
delivered alarms: collection, retention, routing and operator response must be
separately installed/qualified. Do not invent healthy telemetry to open admission.

## Pause, drain, restart and rollback

- `accepting_requests=false` pauses new admission, preserving accepted jobs.
- Reduce approved capacity without killing accepted work.
- Set worker `draining=true` or send SIGTERM: stop claims, retain heartbeats until
  accepted jobs terminate. Do not disable that registration prematurely.
- Emergency stop: disable the global/worker gate and stop its process; SIGINT
  requests abort. This can leave failed attempts or uncertain write intents.
- Restart uses a new session after old-process/cgroup-stop proof. Only expired
  abandoned attempts **before output production** receive bounded retries.
- Once output production began, unknown outcomes require reconciliation, never
  blind PUT retry, overwrite or deletion. Lost completion reconciles the same draft.
- Rollback disables/drains while preserving originals, accepted jobs, receipts
  and created drafts. Database migration history remains forward-only.

## Creator-visible truth

Queued means accepted/durable capacity wait; technical delay means a processing
issue, not ordinary demand. Ready/terminal outcomes override health display.
Reconciliation-required means processing review, not automatic re-enqueue.
Deleted outputs display `stale/output_unavailable`; fresh explicit requests may
create a new draft, while original request IDs keep historical identity.
Unqualified HDR input and unavailable conversion capability have distinct safe
messages; original HDR bytes stay unchanged. No raw diagnostics are shown.
Capacity/admission rejection says the request was not added. Status polling never
resubmits. Account/session, route/focus, background and newer-intent boundaries
discard stale async results; an ambiguous enqueue reuses its operation UUID.

See [scaling contract](CLIP_RENDER_AUTOSCALING_CONTRACT.md) for approved budgets,
provider qualification and why approval expiry is **not a billing stop**.
