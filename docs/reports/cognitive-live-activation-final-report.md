# Cognitive Level 0/1 live activation sprint report

## Sprint identity

- `SPRINT_STARTED_AT`: `2026-07-24T02:00:29Z`
- `SPRINT_DEADLINE_AT`: `2026-07-24T08:00:29Z`
- `ACTUAL_STARTING_HEAD`: `7d4e822c87d95594d11d7ee06d5e72e185abc8cc`
- continuation branch: `codex/cognitive-live-activation-finalize`
- continuation draft PR: `#24`
- stacked base: `codex/cognitive-activation-accelerated-closeout`
- implementation freeze before this report:
  `316bbf85ff70d1c3bfda38e552e383102dc0a5ac`

The sprint stopped activation work before its six-hour deadline because the
reviewed source remains fail-closed behind deployment-blocking P1 findings.
No production workaround was attempted.

## Preservation and lineage

- PR `#21` reviewed head
  `a596478bef99d59d4c51f25ecee12a5864cb08a9` remains in ancestry.
- PR `#23` observed head
  `7d4e822c87d95594d11d7ee06d5e72e185abc8cc` remains in ancestry.
- PRs `#21`, `#22`, and `#23` were not modified.
- No deployed migration was edited, renamed, squashed, deleted, or reapplied.
- The five immutable migration file hashes still match the preservation
  readback:
  - `20260723001845`: `e4e51a840d3e7e0f77a06dfe5b1f1042bc134f377d534e51f4885da5ecbf14c6`
  - `20260723160911`: `4d0705b4e32d5917fd0ab79123bfaacc11ccd186641abd29e1591449f2ae1b7a`
  - `20260723163359`: `304f1538ab295b7f96ea992000cb0d661fc6bb6f3ef16ca33604c40aec1af154`
  - `20260723184340`: `0631e2ea59304969734f04d64d67574829a36325d909a2b12404bc043f30f681`
  - `20260723203512`: `7ed2114cd1515b7201462be39578a160fea9772cbe533a519117f95f495de7c8`
- No new migration was required or deployed.
- `deno.lock` remained untracked and unstaged.
- No generated Android or iOS directory was added. The only tracked Android
  paths remain the six pre-existing raw sound assets.

## Agent deliveries

| Lane | Agent branch | Delivery | Result |
| --- | --- | --- | --- |
| Local Supabase and HTTP | `agent/cognitive-http-environment` | `78d578206e204a9dbec84985d268ade49e16623b` | isolated stack recovered; real HTTP best run 46/48; blocked |
| Database concurrency | `agent/cognitive-database-concurrency-final` | `bd6195c2bbe56db4874758ad40073105ea33699e` | pgTAP 723/723; real races 13/13 |
| Edge deployment prep | `agent/cognitive-edge-deployment-prep` | `82b076f03532999330d0abd4e65682e2d0d5bcc9` | source audit/helper/runbook pass; no deploy |
| Sentinel artifact | `agent/cognitive-sentinel-artifact` | `89535ca172be1c1607a4277fdb1847d43405296f` | Android no artifact change; iOS binary required; canaries blocked |
| Provider/readiness | `agent/cognitive-provider-credential-readiness` | no-change proof | provider, runtime GitHub identity, accounts, and telemetry missing |
| Exact review | `agent/cognitive-final-exact-review` | review-only | zero-state bootstrap P1 independently confirmed; final frozen-head review pending |

Only the coordinator cherry-picked passing, non-overlapping deliveries. No
agent pushed directly to the continuation branch.

## Test and environment results

- Disposable local Supabase recovery: `PASS`.
  - A separate local project and nonconflicting ports were used for HTTP.
  - All tracked migrations through `20260723203512` applied.
  - The CLI showed one transient post-reset service restart failure and then
    recovered to a clean reset.
- Full pgTAP on a clean local reset: `723/723 PASS`.
- Database parallel-session matrix: `13/13 PASS`.
- Canonical cognitive attacks: `40/40 PASS`.
- Governance attacks: `33/33 PASS`.
- Collective governance: `38/38 PASS`.
- Hardening variants: `104/104 PASS`.
- Runtime authority: `11/11 PASS`.
- Two-party source contract: `PASS`.
- Model independence source contract: `PASS`.
- Product sentinel source contract: `PASS`.
- Real HTTP best bounded run: `46 PASS / 2 FAIL / 48 TOTAL`.
- Real HTTP diagnostic run: `36 PASS / 13 FAIL / 49 TOTAL`.
- Real HTTP acceptance: `FAIL/BLOCKED`, not a complete 40-scenario pass.

The best real HTTP run proved worker claim, preflight, executing, non-live
staging, independent evaluator proof, completion, live switch activation,
replay denial, revocation, expiry, renewal, and emergency-stop claim denial.
It used a disposable Owner PostgREST fixture approval and is explicitly not
live bootstrap proof.

## Deployment-blocking findings

### P1: exact Owner Edge approval is rejected

`cognitive-owner-approval` rejects the required
`action=record_owner_approval` request with HTTP 400
`owner_approval_payload_rejected`. The canonical classifier categorizes the
required action as `provider_authority` because the action name contains
`owner`. Random fixture identifiers can also trigger classifier false
positives, so the HTTP result is not deterministic.

### P1: zero-state two-party bootstrap is unreachable

The only zero-row creator is the legacy service-role-only
`cognitive_bootstrap_level01_canary` path. Owner approval requires a finalized
`MODEL_INDEPENDENCE_VERIFIED` decision that is already scoped to a task and
project, while the reviewed worker endpoint has no
`bootstrap_control_plane` side effect. Starting from the remote zero-row
state, the required Owner → worker → evaluator bootstrap cannot be reached
without the forbidden direct legacy service-role bootstrap.

### Functional activation gaps

- The installed sentinel readiness runner defaults the synthetic-account,
  two-participant, and provider-telemetry attestations to false and has no
  sanitized approved attestation input.
- No cognitive model-provider runtime client exists.
- No cognitive GitHub draft-PR broker/API client exists.
- No source path produces the required provider-credential receipt and
  evaluator chain.
- The current installed sentinel classifier consumes sanitized evidence but
  does not independently collect the full installed-product evidence.
- ICE and distinct remote-subscription evidence are not yet complete in the
  installed LiveKit collector.

These gaps were not bypassed or weakened.

## Secrets, functions, and remote state

- Worker invocation/assertion secret names: discovered; remote values
  `MISSING`.
- Evaluator invocation/assertion secret names: discovered; remote values
  `MISSING`.
- Independent candidate values were generated in an owner-only temporary
  directory, never printed or committed, never stored remotely, and deleted
  after deployment was blocked. They can be regenerated.
- Cognitive Edge Functions deployed by this sprint: none.
- Existing `autonomous-approval-request`: preserved; no secret rotation or
  redeployment.
- Remote migration alignment: unchanged at the five reviewed additive
  migrations.
- Remote cognitive/governance/product-quality table readback: 65 present, 65
  RLS enabled, 65 FORCE RLS enabled, anonymous grants 0, authenticated write
  grants 0.
- Remote switch rows: 0.
- Remote schedule rows: 0.
- Owner approval result: `BLOCKED_NOT_RECORDED`.
- Worker claim/stage result: local fixture proof only; remote `NOT_RUN`.
- Evaluator result: local fixture proof only; remote `NOT_RUN`.
- Completion/receipt result: local fixture proof only; remote `NOT_RUN`.
- Remote replay/concurrency/revocation/emergency proof: `NOT_RUN`.

## Provider, accounts, artifact, and sentinel status

- Approved synthetic accounts: `MISSING`; none created.
- Two approved LiveKit participants: `MISSING`.
- Provider/backend read-only telemetry: `MISSING`.
- Provider-backed model independence:
  `MODEL_INDEPENDENCE_PROVIDER_REQUIRED`.
- Deliberation/quorum: `NOT_ENABLED`; advisory-only source readiness.
- Cognitive GitHub runtime:
  `GITHUB_DRAFT_PR_CREDENTIAL_REQUIRED`.
- The developer GitHub credential was not accepted or installed as a
  cognitive runtime identity.
- Android artifact decision: `NO_ARTIFACT_CHANGE_REQUIRED`.
- iOS artifact decision: `INTERNAL_QA_BINARY_REQUIRED`.
- OTA decision: no OTA used on either platform.
- Build decision: no build started on either platform.
- LiveKit installed sentinel: `NOT_RUN/BLOCKED`.
- Visual installed sentinel: `NOT_RUN/BLOCKED`.
- Installed journey sentinel: `NOT_RUN/BLOCKED`.
- Research and non-personal memory canaries: `NOT_RUN/BLOCKED`.
- Governed draft-PR canaries: `NOT_RUN/BLOCKED`.
- Draft fixes/findings in Collective Governance: none created because the
  real bootstrap was unavailable.

## Switches and schedules

Active schedules: none.

Enabled cognitive switches: none.

The following remain off:

- public/non-personal research;
- non-personal memory;
- user-derived memory;
- collective deliberation;
- LiveKit, visual, and installed-journey sentinels;
- draft-PR executor;
- all Level 0/1 schedules;
- Level 2 production repair.

## Safety incident

A broad read-only search in the provider lane emitted an already-committed
device identifier from a tracked historical readiness document into internal
command output. It was not repeated. No credential, token, key, cookie,
private media, or remote state was exposed or changed. Broad-output searches
were stopped immediately. This violated the sprint's device-identifier output
rule and is recorded as a sanitization incident. No secret or private evidence
was added by this sprint.

## Rollback and continuation

There is no production rollback to perform: the sprint deployed no migration,
function, secret, switch, schedule, OTA, or binary and created no live
approval/execution/evaluator rows.

The continuation branch can be discarded without affecting production.
Before any later activation:

1. add a new forward-only correction for the zero-state bootstrap only if the
   schema must change;
2. correct the Owner payload classification with exact regressions;
3. make real HTTP fixtures classification-stable and pass the full required
   matrix;
4. add sanitized sentinel prerequisite attestations and a real evidence
   collector;
5. implement and attest the model and GitHub runtime brokers;
6. refreeze and obtain `P0=0/P1=0`;
7. only then generate fresh secrets, deploy, bootstrap, canary, and enable
   bounded schedules.

## Explicit confirmations

- PRs `#21`, `#22`, and `#23` history was preserved.
- No deployed migration was rewritten.
- No hard reset, rebase, clean, force-push, or destructive down migration
  occurred.
- No test was deleted or weakened to get green.
- Owner, worker, and evaluator remain distinct.
- No live state mutation occurred before evaluator proof.
- No self-approval was introduced.
- No unrestricted credential was used by the cognitive runtime.
- No public build, OTA, store release, or track mutation occurred.
- No merge occurred.
- No live money, payout, transfer, withdrawal, or cash-out occurred.
- No existing-product auth/RLS, role, rights, moderation, ranking, or
  provider-product mutation occurred.
- User-derived memory remains off.
- Level 2 production repair remains off.
- No secret/private evidence was committed by this sprint.
- No generated Android/iOS directory was committed.
- `deno.lock` remained unstaged.

