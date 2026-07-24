# Cognitive two-party HTTP proof

Branch: `agent/cognitive-http-environment`

Scope:

- disposable local Supabase only;
- real PostgREST and locally served Edge Function requests;
- separate exact Owner, normal authenticated user, scoped operator, super-admin,
  recycled-email caller, worker, evaluator, and anonymous identities;
- local prerequisite fixture seeding through the disposable database container;
- sanitized output limited to PASS/FAIL, HTTP status categories, and fixed error
  identifiers.

Run:

```bash
node scripts/test-cognitive-two-party-http.mjs \
  --supabase-workdir /path/to/isolated/local-supabase-workdir
```

The isolated workdir must contain a generated `supabase/config.toml`, repository
`supabase/migrations` and `supabase/functions` links, and nonconflicting local
ports. The harness links the repository `_lib` and `config` directories when
they are absent. It captures `supabase status` output and generated function
secrets in a mode-700 temporary directory with mode-600 files, then deletes
that directory.

## Local environment result

- Docker: ready.
- Supabase CLI: `2.75.0`.
- Isolated project: ready on nonconflicting ports.
- All local migrations through `20260723203512` applied.
- `supabase db reset` can return a transient 502 while the restarted services
  become healthy; the harness performs a bounded status recovery check.
- No migration file was edited.
- No remote data or function was touched.

## Bounded HTTP result

The final isolated run reached `89 PASS / 0 FAIL / 89 TOTAL` real HTTP
assertions. Its explicit numbered scenario result was
`40 PASS / 0 FAIL / 0 NOT_RUN / 40 TOTAL`.

The run proves the exact Owner approval, worker claim and stage, non-live
staging, evaluator separation and proof, completion, live switch activation,
replay denial, exact binding rejection, revocation, expiry, renewal,
emergency-stop-before-claim, post-side-effect revocation and emergency cleanup,
cancellation-after-claim, widened-renewal rejection, rollback-success authority
revocation, rollback-failure quarantine and Owner escalation, and a concurrent
single-winner claim through PostgREST or locally served Edge Functions.

The acceptance gate fails closed when any assertion fails, any required
scenario fails, or any required scenario remains `NOT_RUN`. The bounded
`--self-test-required-scenario-gate` regression proves all four gate outcomes.

## Required 40-scenario matrix

| # | Scenario | Result |
|---:|---|---|
| 1 | Exact Owner records immutable approval | PASS |
| 2 | Exact Owner cannot worker-execute | PASS |
| 3 | Worker cannot record Owner approval | PASS |
| 4 | Worker claims a valid approval | PASS |
| 5 | Worker stages an operation | PASS |
| 6 | Staged operation remains non-live | PASS |
| 7 | Worker cannot self-attest evaluator proof | PASS |
| 8 | Evaluator records evaluator proof | PASS |
| 9 | Evaluator cannot claim | PASS |
| 10 | Evaluator cannot execute | PASS |
| 11 | Evaluator cannot complete | PASS |
| 12 | Completion without evaluator proof fails | PASS |
| 13 | Completion with matching passed proof succeeds | PASS |
| 14 | Wrong receipt hash fails | PASS |
| 15 | Wrong evaluator-requirement hash fails | PASS |
| 16 | Wrong proof hash fails | PASS |
| 17 | Non-Owner approval fails | PASS |
| 18 | Scoped Admin approval fails | PASS |
| 19 | Anonymous approval/execution fails | PASS |
| 20 | Recycled-email authority fails | PASS |
| 21 | Missing approval fails | PASS |
| 22 | Expired approval fails | PASS |
| 23 | Revoked approval fails | PASS |
| 24 | Superseded approval fails | PASS |
| 25 | Consumed approval replay fails | PASS |
| 26 | Wrong manifest fails | PASS |
| 27 | Wrong snapshot fails | PASS |
| 28 | Wrong task/project/repository/branch/platform/environment/provider/operation/target fails | PASS |
| 29 | Owner revocation before claim blocks execution | PASS |
| 30 | Owner revocation after side effect blocks success but allows cleanup | PASS |
| 31 | Emergency stop before claim blocks execution | PASS |
| 32 | Emergency stop after side effect blocks success but allows cleanup | PASS |
| 33 | Concurrent duplicate worker claim yields exactly one winner | PASS |
| 34 | Late result after cancellation fails | PASS |
| 35 | Equivalent capability renewal remains within scope | PASS |
| 36 | Widened renewal fails | PASS |
| 37 | Reinstatement creates a new immutable approval version | PASS |
| 38 | Material plan change requires amended approval | PASS |
| 39 | Successful rollback revokes old write authority | PASS |
| 40 | Failed rollback quarantines and escalates | PASS |

## Bootstrap second-phase hook

The harness names and classification-tests the reviewed bootstrap actions:

- `record_bootstrap_approval`;
- `bootstrap_control_plane`;
- `record_bootstrap_evaluator_proof`.

It prints `BOOTSTRAP_SECOND_PHASE NOT_RUN` until the coordinator integrates the
bootstrap database and Edge commit into the exact frozen head. Local fixture
seeding is prerequisite setup, not live bootstrap proof, and is never reported
as the remote Owner → worker → evaluator bootstrap.

## Safety and remaining scope

- The classifier correction is structural: only exact reviewed Owner-control
  action values are omitted from provider-authority term matching. Attached
  provider write authority, secrets, production money instructions, auth
  bypass, and RLS bypass continue to be rejected.
- Random run identifiers use letters only and the nonexistent-approval fixture
  uses a fixed nonnumeric UUID, preventing private-identifier false positives
  without weakening classification.
- The rollback-failure proof registers a disposable local cognitive service
  identity by digest, constructs its short-lived signed local assertion only in
  process memory, and uses the existing PostgREST transition RPC to prove the
  quarantined task, P1 finding, and pending Owner-review request.
- No deployed migration was edited or reapplied.
- No remote database, secret, function, schedule, switch, build, OTA, or PR was
  mutated by this lane.
