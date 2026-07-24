# Cognitive live activation exact-head review

Status: **SOURCE REVIEW PASS; REMOTE CI AND ACTIVATION REMAIN GATED**

## Exact source

- Final reviewed head:
  `1335dc18669d8917bb72c14393bf464d98ce902f`
- Runtime/source head exercised by the stable real HTTP bootstrap:
  `61964375b7ead3ce5eb250766811246d7d63f4b5`
- The only final-head delta after the stable runtime proof is the committed
  zero-state HTTP harness and its sanitized evidence report.
- Reviewed implementation ancestor:
  `a596478bef99d59d4c51f25ecee12a5864cb08a9`
- Accelerated-closeout ancestor:
  `7d4e822c87d95594d11d7ee06d5e72e185abc8cc`

Both required ancestors are present. The review branch contains no
implementation fix.

## Severity result

- P0: **0**
- P1: **0**

This result covers the exact committed source. It does not claim that remote
deployment, bootstrap, installed-product canaries, providers, credentials,
switches, or schedules have completed.

## Lane 1 — Owner, worker, evaluator, and Edge security

- Canonical cognitive red team: **40/40 PASS**
- Independent hardening variants: **104/104 PASS**
- Runtime-authority regressions: **11/11 PASS**
- Canonical policy parity: **20/20 corpus plus 256 fixed-seed properties PASS**
- Two-party source contract: **PASS**
- Bootstrap Edge contract: **PASS**
- Owner/worker Deno tests: **6/6 PASS**
- Edge source authority separation, CORS, and sanitized errors: **MATCH**
- Edge secret-helper self-test: **PASS**

The exact Owner is the only authenticated principal able to record bootstrap
approval. The Owner endpoint cannot claim or execute. The worker cannot approve
or self-evaluate. The independent evaluator cannot claim, stage, complete, or
execute. Bootstrap staging creates no live task, project, switch, or schedule.
Completion requires the matching passed evaluator proof and receipt.

The strict bootstrap payload path is an exact ten-key schema. It retains
canonical classification for the operational branch field and rejects
malformed, extra-key, instruction-bearing, secret-like, and provider-authority
input without invoking the expensive full nine-string permutation path.

## Lane 2 — Database, RLS, concurrency, and migration safety

- Clean local pgTAP evidence: **769/769 PASS**
- Real parallel-session matrix: **17/17 PASS**
- Bootstrap migration/test/concurrency sources at the final head are
  byte-identical to the sources used for those passing database runs.
- New migration:
  `20260724023712_cognitive_zero_state_two_party_bootstrap.sql`
- New migration SHA-256:
  `9b378bdc19c8ce4fbfcf27434f2554b6b3fe0ac03033729d5271501a937d338d`

The five already deployed migration files remain unchanged:

| Version | SHA-256 |
| --- | --- |
| `20260723001845` | `e4e51a840d3e7e0f77a06dfe5b1f1042bc134f377d534e51f4885da5ecbf14c6` |
| `20260723160911` | `4d0705b4e32d5917fd0ab79123bfaacc11ccd186641abd29e1591449f2ae1b7a` |
| `20260723163359` | `304f1538ab295b7f96ea992000cb0d661fc6bb6f3ef16ca33604c40aec1af154` |
| `20260723184340` | `0631e2ea59304969734f04d64d67574829a36325d909a2b12404bc043f30f681` |
| `20260723203512` | `7ed2114cd1515b7201462be39578a160fea9772cbe533a519117f95f495de7c8` |

The bootstrap domain has RLS and FORCE RLS, no direct anonymous,
authenticated, or service-role table mutation authority, authenticated
exact-Owner approval only, and service-role-only worker/evaluator RPC entry
points. The legacy direct bootstrap RPC is revoked. Claim, proof, completion,
replay, revocation, cancellation, emergency-stop, rollback, lease, budget, and
finding-lifecycle races remain fail-closed.

## Lane 3 — Research, memory, provider, retention, and sentinel safety

- Research-authority guard: **27/27 MATCH**
- Memory guard and proof: **PASS**
- Dependency advisory gate: **0 critical / 0 high**
- Model-independence source contract: **PASS**
- Product-sentinel source contract: **PASS**
- Availability attestations remain `attested_unverified` and cannot grant a
  sentinel PASS.

Provider-backed independence, approved synthetic accounts, two approved
LiveKit participants, read-only provider telemetry, and the least-privilege
GitHub runtime credential remain unavailable. Therefore deliberation,
installed-product sentinel PASS states, draft-PR execution, and schedules are
not authorized by this review.

## Lane 4 — Real HTTP and final evidence

- Existing real two-party HTTP proof: **89/89 PASS**
- Existing required scenario gate: **40/40 PASS**
- Stable zero-state bootstrap HTTP proof: **58/58 PASS**
- Stable required bootstrap gate: **44/44 PASS, 0 missing**
- Stable runtime/source SHA:
  `61964375b7ead3ce5eb250766811246d7d63f4b5`
- Local lint: **0 errors**; pre-existing warnings remain visible
- TypeScript and platform policy guards: **PASS**
- Cognitive CI supply-chain guard: **PASS**

The real local HTTP chain used Auth, PostgREST, and locally served Owner,
worker, and evaluator Edge endpoints. It proved exact Owner approval, worker
claim and non-live stage, independent receipt-bound evaluator proof,
evaluator-gated atomic completion, all-off switch/schedule materialization,
wrong-binding denial, identity crossover denial, legacy-path denial, and
replay denial. The final evidence-only commit adds the canonical unsafe-branch
HTTP assertion and sanitized report; it changes no runtime source.

Installed LiveKit, visual, and journey canaries have not run and are not
represented as passing. Android remains `NO_ARTIFACT_CHANGE_REQUIRED`; iOS
remains `INTERNAL_QA_BINARY_REQUIRED` unless an existing compatible internal
artifact is independently proven sufficient.

## Deployment gate

The source-review severity gate is satisfied at `P0=0/P1=0`. Deployment remains
conditional on all remote CI checks completing successfully and on the
coordinator re-verifying remote migration alignment and secret handling.

Do not deploy or enable when any of these conditions changes:

- exact source lineage or migration hashes differ;
- real HTTP separation, replay denial, or emergency behavior regresses;
- remote migration state differs unexpectedly;
- secret storage or rollback safety is uncertain;
- Owner, worker, or evaluator identities collapse;
- installed-product, provider, GitHub, or schedule prerequisites are claimed
  without their independent evidence.

No Level 0/1 schedule, research switch, memory switch, sentinel switch,
deliberation switch, or draft-PR executor is authorized by this report alone.
User-derived memory and Level 2 production repair must remain off.
