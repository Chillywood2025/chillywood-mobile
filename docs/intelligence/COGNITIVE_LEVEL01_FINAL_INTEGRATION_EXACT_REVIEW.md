# Cognitive Level 0/1 final integration exact review

Review date: 2026-07-25

Implementation branch: `codex/cognitive-level01-final-integration`

Exact reviewed implementation head: `b24dbd67028e214eed56e837c3f113ad293aa7a2`

Exact reviewed implementation tree: `3271293866c01087f6ef2f36a186cf3158535938`

Review branch: `codex/cognitive-level01-final-integration-review`

Disposition: review evidence only; never merge this branch.

## Result

- P0: 0
- P1: 0
- P2: 1
- P3: 0
- GitHub CI: 13/13
- Implementation ancestry: 10/10 required implementation heads included
- Review-only heads included: 0/9
- Canary heads included: 0/3

Two independently reproduced P1 findings at the preceding head were closed before
this exact review:

1. Source-only cognitive status now displays the exact statement
   `No execution authority is granted by this control center.` just as the live
   readback state does.
2. A valid append-only post-OTA V2 entry now passes the validator, regression
   suite, and future-import planner without indexing beyond historical V1.

The remaining P2 is intentionally nonblocking for Owner-assisted integration and
the Android OTA. Research-retention provider evidence remains hard-coded to the
historical Supabase Free/backup-absent state. Before any future autonomous
research or memory activation, add a forward migration for the current Pro plan
truth and obtain a fresh provider retention attestation. Do not rewrite a
deployed migration.

## Independent lanes

1. Architecture, credentials, network and authority: P0=0, P1=0.
   No LOGIN password, Hyperdrive credential, provider secret, switch, schedule,
   route, navigation, or execution authority was added. The gateway remains
   credential-free and the isolated runtime remains fail-closed on the Supabase
   `net` boundary.
2. Database, RLS, migration and evidence import: P0=0, P1=0.
   The migration subtree is unchanged from PR #35. Historical V1 remains
   byte-identical. Canonical V2 retains hash
   `4763f7bb16bcf82e35c61d95542e84773c3f3f55838624701155925da3240b9c`,
   and a synthetic twelfth entry proved append-safe planning.
3. Research, memory, model and retention: P0=0, P1=0, P2=1.
   Pinned transport, Worker adapter, evaluator and model boundaries fail closed.
   User-derived memory and Level 2 remain off. The P2 above is an explicit future
   activation blocker.
4. App UI, Android OTA, sentinel, LiveKit, GitHub and scheduler: P0=0, P1=0.
   Both operating modes and the exact no-execution-authority statement are
   present in live and source-only states. HapticTab retains navigation and iOS
   haptics while enforcing Android minimum height 48 dp. Native compatibility,
   build-80 runtime isolation, sentinel, LiveKit, GitHub broker and scheduler
   contracts pass.

## Exact-head validation

- pgTAP: 1275/1275
- isolated runtime: 128/128
- database concurrency: 18/18
- zero-state HTTP: 58/58; required 44/44
- two-party HTTP: 89/89
- LiveKit collector: pass
- LiveKit fixture concurrency: 7/7
- GitHub broker: 12/12
- scheduler: 9/9
- pinned research transport: 76/76
- research Worker adapter: 4/4
- research authorities: 30/30
- deferred evidence identity: 22/22
- TypeScript: pass
- lint: 0 errors (86 inherited warnings)
- Expo Doctor: 18/18
- architecture graph determinism: 3/3 with identical SHA-256
  `99e1fefe8e870517e4c79a0ed8f747396134b0249961fdf4dfb8baad43272f2f`
- OTA native boundary: pass
- Android native compatibility: 55 native packages; reviewed digest
  `4abe7acf4df511520c4645be55ea01b0c5762f8184c76a4f48ed6ab31a47a50a`
- `git diff --check`: pass

The local pgTAP retry ran in a disposable Supabase sandbox. One earlier
CPU-contended run exceeded a 500 ms timing assertion at 531.889 ms; the isolated
rerun passed all 1275 assertions. No remote database was contacted by these
tests.

## Merge and deployment boundary

Only the cumulative implementation PR may merge into
`codex/ios-integration-90`. This review branch, every historical review-only PR,
and canary PRs #32, #33, and #34 remain unmerged. No merge to `main` is
authorized. The operating truth remains:

- `OWNER_ASSISTED_ACTIVE`
- `ISOLATED_AUTONOMOUS_PENDING`
- `WAITING_FOR_SUPABASE_NET_SCHEMA_PROVIDER_ADMIN`

No runtime password, Hyperdrive database credential, autonomous switch, schedule,
remote memory, Level 2 capability, or autonomous evidence import is authorized by
this review.
