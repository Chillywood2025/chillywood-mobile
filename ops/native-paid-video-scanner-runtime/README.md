# Isolated native paid-video scanner runtime

Source-only deployment preparation, with a bounded local Linux engine qualification of the exact snapshot recorded below. No host service or credentials are created, and the supplied approval file is deliberately disabled. This directory does not replace the existing generic malware scanner. The snapshot is not final-tree deployment approval.

**Hosting is parked with future new-server work.** Do not seek or provision capacity, resize hosts, upgrade the existing scanner service or launch a persistent native runner for this task. Scanner-dependent deployed flows remain disabled and unverified. The source and local evidence are retained for a separately authorized resumption.

## Trust and qualification

The Linux/amd64 base is the official ClamAV **1.5.4** image pinned by content digest. Official release notes identify security fixes after 1.5.2, so a real Mac 1.5.2 synthetic scan is behavioral evidence only, never approval for this deployment. See [August 2026 security release](https://blog.clamav.net/2026/08/) and `provenance.json`.

The Dockerfile pins Node, FFmpeg, tini and CA package versions from official Alpine 3.24 repositories. Transitive package versions are recorded in `/app/runtime-manifest.json`, along with all copied source hashes, executable hashes and the Cisco certificate hash. Direct package pins alone do **not** make future rebuilds byte-identical: retain the complete package closure and deploy the exact **final built image digest**, never a mutable tag or an assumed equivalent rebuild. Rebuilds, library/security updates or source changes require fresh exact-image qualification and approval.

Build preparation, when an authorized local Docker engine with sufficient capacity is available:

```sh
docker build --platform linux/amd64 -f ops/native-paid-video-scanner-runtime/Dockerfile -t chillywood-native-scanner:qualification .
```

Do not push an image to any registry until that upload is authorized. Before persistent deployment, retain the final immutable digest and run the exact unchanged `ops/isolated-paid-video-worker/scan.native.mjs` plus `r2-scan.native.mjs` inside that image with current official full CVD files and detached signatures. The baseline harness requires all seven cases, including actual EICAR detection, malformed media, stale definitions and symlink rejection. Capture actual Linux cgroup peak memory for maximum supported 16 MiB/60-second media and definition refresh, not just a small sample or idle RSS. Capture package closure, OS, source, tools, trust root, definition hashes, cleanup and exit status. Mac executable hashes cannot satisfy this Linux gate.

### Measured local snapshot

On 2026-11-10 at 12:18:46 UTC, a disposable Linux/amd64 container passed the unchanged seven-case scanner harness and all four typed-R2 wrapper groups using real ClamAV/sigtool 1.5.4, FFmpeg/ffprobe 8.1.3 and authenticated official definitions. The typed transport was synthetic, not a hosted R2 read. The 38-file source archive SHA256 was `b8e2cef9acbae9a175cdab54ce3826f08ae0fe0a70fb8650d5f548f061e26082`; the test image ID was `sha256:cd6c7c31da88956fe79a5c420180b3a004b18de5be4eb54ca6696ecf0da0fabf`.

The sequential run took 223.593 seconds and peaked at 1,458,184,192 bytes (1.358 GiB) in its actual cgroup, with no OOM events. It used one CPU, 4 GiB memory, 128 PIDs, no extra swap, disabled networking, read-only root, UID 65532, no capabilities and no new privileges. Both harnesses removed their temporary fixtures; the stopped container exited zero and was removed. No unrelated service or provider credential was used.

The first candidate passed the seven baseline cases but its new typed fixture captured two clocks and could produce a 600001 ms ticket. That failed evidence is retained. The fixture now captures one timestamp; production validation limits were not changed. The corrected full run passed. Evidence archive `scanner-linux-qualification-evidence-20261110.zip`, SHA256 `8fd322e10775ebb8a2728fc3fc1b01ea6654f7c4f6deabbd8b857d2c17d60e71`, retains source/image/tool/definition hashes, package closure, failure diagnosis, reports, cleanup and the parked hosting decision.

Source changed after this snapshot, including this documentation. Final-image requalification remains required. This small-media run does not establish worst-case media or updater capacity, hosted R2/SQL lease and completion, persistent supervisor/refresh service, moderation, provider checkout or app playback. It does not authorize service activation. The definition snapshot's daily file was created 2026-11-10 at 06:26 UTC and must not be used beyond its normal 48-hour freshness limit.

Copy the reviewed seven-case engine and four-group typed-wrapper proofs and their separate hashes into an operator-owned runtime approval derived from `runtime-approval.example.json`. Mount the reports using `NATIVE_SCANNER_LINUX_PROOF` and `NATIVE_SCANNER_LINUX_R2_PROOF`; the aggregate evidence wrapper is not a substitute for these individual reports. Never change approval booleans or hashes merely to make a service start. The gate requires both passed proofs, exact typed-wrapper source hashes and executable/source/certificate manifest matching, the same final image reference supplied to Compose, unprivileged UID, read-only root, zero capabilities, no-new-privileges, bounded memory/PIDs, private directories, current authenticated definitions and no unresolved completion.

The gate depends on Linux cgroup v2. It must fail closed on unsupported hosts, not silently omit resource checks.

## Hosting dependency is parked

Each native scanner or definition-updater container is bounded to one CPU, 4 GiB memory, no added swap and 128 PIDs. ClamAV currently [recommends at least 3 GiB, preferably 4 GiB](https://docs.clamav.net/Introduction.html), plus resources for other workloads. Running both profiles concurrently requires budgeting **8 GiB total for these containers**, plus host/legacy services and measured headroom. A serialized update with the scanner fully drained can use the one-container budget, but needs an explicitly designed and approved coordinator; the two profiles do not implement that coordination.

Observed existing scanner hosting had only about 1.9 GiB total RAM and 1.2 GiB available, below even the measured 1.358 GiB small-file Linux peak. A separate older Mac-engine scan reported about 1.50 GiB maximum RSS. Neither observation justifies starting a native service on that host or lowering the 4 GiB design budget. No other suitable durable host has been verified. Capacity selection and any associated cost approval are deferred to the future new-server task; do not resume them implicitly.

## Runtime and narrow credentials

Use `compose.yaml` only after exact deployment approval. Its `native-scanner` and `definition-refresh` profiles are separate, have no published ports, no Docker socket, no elevated capabilities, and never inherit the base image's generic clamd daemon. All source/trust/config mounts are read-only. Temporary media is private tmpfs. Durable private state must survive container replacement. Both profiles use `restart: "no"`: an unexpected exit or uncertain completion requires inspection, never automatic replay.

Non-secret scanner config is owned by the typed runtime at `../isolated-paid-video-worker/r2-scanner-runtime.mjs`:

- Exact authority origin and public anonymous API key.
- Exact gateway origin, bucket, routeId, profileId, qualificationSha256 and keyId.
- Dedicated workerId and `workDirectory: "/work"`.
- `scanner.certificateDirectory: "/opt/native-scanner/certs"`.
- Explicit `/usr/local/bin/ffmpeg`, `ffprobe`, `clamscan`, `sigtool` paths.
- Prefer `scanner.definitionSnapshotsDirectory: "/definitions"`. A fixed `scanner.databaseDirectory: "/definitions"` is also supported for a manually mounted immutable snapshot; never specify both.

Only two secret **file handles** enter the scanner:

- `PAID_VIDEO_R2_SCANNER_RPC_TOKEN_FILE=/run/secrets/scanner_rpc_token`.
- `PAID_VIDEO_R2_SCANNER_KEY_FILE=/run/secrets/scanner_key_hex`.

The authority is the dedicated NOLOGIN/NOBYPASSRLS scanner role and only the current native scanner lease/next/admission/completion RPCs. No Supabase service-role credential, Cloudflare API token, R2 account credential, reviewer permission, payment key, upload/delete capability or arbitrary SQL authority is permitted. Generation/configuration of persistent credentials requires the applicable action-time approval. Do not reuse the old generic scanner's secret.

Host credential files must be readable by container UID 65532 and inaccessible to unrelated users. Compose file-backed secrets may preserve host ownership/mode rather than honor desired UID mapping, so verify access on the selected host without printing values. Do not loosen permissions to world-readable to fix startup.

## Automatic processing and stop behavior

The typed CLI owns all authenticated polling, bounded 30-to-300-second idle backoff, atomic one-job lease selection, exact R2 identity reads, complete-byte scanning, signing and completion. This wrapper owns only runtime integrity, an exclusive durable runtime lock and signal forwarding.

```text
--config /run/native-scanner/config.json --supervise --result /state/pending.json
```

The scanner stores the exact signed result privately **before** completion. A response-loss/uncertain completion leaves `pending.json` and stops. Successful typed completion alone permits archival as `pending.json.completed-<ticket UUID>`. The launcher refuses unresolved pending state and never retries its child. These result files are private capabilities/evidence and must never be logged or committed. The runtime lock also prevents a second local supervisor in the same state directory. A killed process can leave a stale lock; verify process absence and reconcile its lease/pending state before an authorized removal.

SIGTERM/SIGINT are forwarded, the typed supervisor stops polling/drains safely, and the container allows 150 seconds before forced stop. A forced stop can leave a pending result/lease or lock and must not be treated as success. The updater has 330 seconds to finish its bounded 300-second download before stop. Neither process starts a second job while one is active. An external supervisor must distinguish clean planned shutdown from error/uncertainty before restart; do not add unconditional restart behavior.

Health checks verify runtime integrity and current authenticated definition selection. They do not claim queue progress, a successful server completion, moderation, provider checkout or playback. Alert on process exit, stale definitions, pending completion, stale lock, failed refresh and a growing queue. Do not use healthcheck-only success as activation proof.

## Definition snapshots

`definition-snapshots.mjs` exports the strictly bounded resolver used by the typed scanner. It validates a private real root and exact active pointer, resolves only `snapshots/<64-hex-manifest-sha>/`, performs the unchanged full authentic/fresh `inspectDefinitions`, and checks the manifest hash. A job receives this fixed directory once; it never follows a changing “latest” path during a scan.

`refresh-definitions.mjs` is a separate no-credential process. It runs once or at a bounded 12-hour cadence and stops on any error. It:

1. Preserves official FreshClam cooldown state and existing verified full CVD files to avoid needless full main/bytecode downloads.
2. Downloads from only `database.clamav.net` into private staging with full CVD output.
3. Requires successful updater exit, embedded archive checks, detached signatures and current daily freshness.
4. Rejects definition rollback and same-version byte substitution.
5. Publishes a new immutable snapshot and atomically changes `active.json`. The scanner mount is read-only.
6. Never deletes an old snapshot that an active job may still hold. Authorized retention must account for in-flight jobs and preserve audit metadata; disk monitoring is required.

For first local qualification, bootstrap definitions with the same official FreshClam command/config in a disposable, isolated container without app/provider credentials, then run the exact harness. Persistent updater startup itself requires approved exact-image Linux proof, so this is not a circular instruction to set a fake approval first.

No mirror switching, clock adjustment, weakened freshness, seeded clean verdict, CLD-to-CVD renaming, automatic human moderation, or clean-result replay is allowed.

## Exact future approval scope

This is a future checklist for an explicitly resumed new-server task, not a request to activate hosting now.

Before starting anything persistent, name the selected host and capacity/cost, final image digest, separate scanner/updater service names, private definition/state/config paths, permitted outbound authority/gateway/official-definition destinations, resource budget, rollback/stop behavior and the fact the existing generic scanner remains untouched. Separately identify creation/configuration of the dedicated scanner RPC credential and independent signing/verification trust with only their exact native RPC/gateway permissions. Deployment approval does not substitute for required action-time approval of persistent access. Live money/payout/cashout controls remain off.

## Checks and limits

`node --test ops/native-paid-video-scanner-runtime/*.test.mjs` covers source contract, pointer/path/symlink checks, memory/approval rejection and monotonic snapshot promotion. ESLint and syntax checks apply to all .mjs files. These are focused source tests, not Linux container qualification, service availability or hosted end-to-end proof. Combined exact-head Required Validation and diff review still belong to the repository integration.
