# Cognitive zero-state bootstrap HTTP proof

Status: **BLOCKED**

This report records the bounded local run of
`scripts/test-cognitive-zero-state-bootstrap-http.mjs` against the integrated
`20260724023712_cognitive_zero_state_two_party_bootstrap.sql` migration and
cognitive Owner, worker, and evaluator Edge contracts.

## Environment and source lineage

- Disposable local Supabase project: `chillywood-bootstrap-http-local`
- Test source: coordinator worktree at
  `/Users/loverslane/chillywood-mobile`
- Integrated bootstrap source entered testing at
  `7186ccf642951ce717af18560e62d18f143cfd01`
- Coordinator head observed after the bounded run:
  `e62c1c3feb10577b3a421706fe92b15ad556f8ed`
- The bootstrap migration, three cognitive Edge functions, canonical policy
  engine, and security policy did not change between those two commits.
- The harness verifies that its `_lib`, `config`, `supabase/functions`, and
  `supabase/migrations` paths resolve to the selected source root.
- No remote database, function, secret, account, schedule, switch, or product
  state was read or mutated.

The final positive-chain rerun must pin and verify one stable source head. This
blocked run is not represented as exact-head positive proof.

## Sanitized result

- Assertions: **31 PASS / 23 FAIL / 54 total**
- Required gate: **22 PASS / 18 FAIL / 0 missing / 40 total**
- Local Supabase reset/start: **PASS**
- Edge target readiness: **PASS**
- Positive Owner approval: **BLOCKED**

Passing evidence includes:

- zero project, task, switch, and schedule rows before approval;
- zero project, task, switch, and schedule rows after the attempted Owner
  approval;
- zero project, task, switch, and schedule rows after the attempted stage and
  evaluator proof;
- legacy direct bootstrap RPC denial;
- service credential denial at the Owner function;
- Owner/worker/evaluator invocation crossover denial;
- evaluator claim and worker self-evaluation denial;
- wrong stage target, evaluator receipt, completion receipt, and evaluator
  proof denial.

## Exact blocker

Authenticated requests to `cognitive-owner-approval` returned a sanitized HTTP
5xx before the bootstrap approval RPC was reached. A fixed-category inspection
of the disposable Edge runtime logs reported:

- `CPU_LIMIT=PRESENT`
- wall-clock timeout, worker termination, boot error, and memory-limit
  categories: `MISSING`

The valid bootstrap approval payload classified as `safe`, but a direct local
measurement of `classifyCanonicalSecurityPayload` took approximately 4.6
seconds. The local Edge worker therefore crossed its CPU budget on the
authenticated payload path.

Because no approval was created, the positive worker claim, stage, evaluator
proof, completion, receipt, replay-after-completion, and final ten-switch /
five-schedule readback assertions failed consequentially. No database or RPC
defect was established.

## Safety

- The run stopped after one classifier-payload correction and one bounded
  confirmation rerun.
- No migration or Edge source was edited by this lane.
- No key, token, assertion, password, cookie, private row, or request body was
  printed or committed.
- Temporary local credentials and function environment material were stored
  in mode-600 files beneath a mode-700 directory and deleted by the harness.
- `deno.lock`, `node_modules`, and generated `android/` or `ios/` directories
  were not created or staged.
- No schedule or cognitive switch was enabled.
