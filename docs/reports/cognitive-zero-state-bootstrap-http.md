# Cognitive zero-state bootstrap HTTP proof

Status: **PASS**

This report records the bounded local run of
`scripts/test-cognitive-zero-state-bootstrap-http.mjs` against the integrated
`20260724023712_cognitive_zero_state_two_party_bootstrap.sql` migration and
cognitive Owner, worker, and evaluator Edge contracts.

## Environment and source lineage

- Disposable local Supabase project: `chillywood-bootstrap-http-local`
- Test source: coordinator worktree at
  `/Users/loverslane/chillywood-mobile`
- Exact integrated source head:
  `61964375b7ead3ce5eb250766811246d7d63f4b5`
- The harness verifies that its `_lib`, `config`, `supabase/functions`, and
  `supabase/migrations` paths resolve to the selected source root.
- The harness requires the expected 40-character source head before starting
  and proves that the source head is unchanged after the HTTP chain.
- No remote database, function, secret, account, schedule, switch, or product
  state was read or mutated.

## Sanitized result

- Assertions: **58 PASS / 0 FAIL / 58 total**
- Required gate: **44 PASS / 0 FAIL / 0 missing / 44 total**
- Local Supabase reset/start: **PASS**
- Edge target readiness: **PASS**
- Exact source head stability: **PASS**
- Malformed and extra-key bootstrap approval rejection: **PASS**
- Unsafe canonical branch-text rejection: **PASS**
- Positive Owner approval: **PASS**
- Worker claim and stage: **PASS**
- Independent evaluator proof: **PASS**
- Completion and immutable receipt binding: **PASS**
- Completion replay denial: **PASS**

The real HTTP chain proved:

- zero project, task, switch, and schedule rows before approval;
- zero project, task, switch, and schedule rows after Owner approval;
- zero project, task, switch, and schedule rows after worker stage and after
  evaluator proof;
- an exact Owner could record the immutable bootstrap approval;
- malformed and extra-key Owner bootstrap payloads were rejected;
- canonical instruction-bearing branch text was rejected;
- the worker could claim and stage only the exact approval and target tuple;
- the independent evaluator could record only the matching receipt-bound
  evaluator proof;
- completion succeeded only with the matching receipt and evaluator proof;
- completion created exactly one project, one bounded control task, ten
  reviewed switches, and five bounded schedules;
- all ten switches and all five schedules remained off;
- Level 2 repair, user-derived memory, and production authority remained off;
- legacy direct bootstrap RPC denial;
- service credential denial at the Owner function;
- Owner/worker/evaluator invocation crossover denial;
- evaluator claim and worker self-evaluation denial;
- wrong stage target, evaluator receipt, completion receipt, and evaluator
  proof denial;
- claim and completion replay denial.

## Resolved local blocker

The first bounded attempt exposed an Edge CPU limit in the authenticated Owner
bootstrap path before the approval RPC. The valid hash-heavy bootstrap payload
was safe, but the general canonical classifier consumed approximately 4.6
seconds locally. The integrated source fixed this without changing the general
classifier: `record_bootstrap_approval` now uses a strict exact-key bootstrap
schema gate before the normal action dispatch. The final run proved valid
approval plus malformed and extra-key rejection over the real Edge endpoint.

No database or RPC correction was required.

## Safety

- After the exact source fix was integrated, the harness ran one bounded
  exact-head confirmation pass.
- No migration or Edge source was edited by this lane.
- No key, token, assertion, password, cookie, private row, or request body was
  printed or committed.
- Temporary local credentials and function environment material were stored
  in mode-600 files beneath a mode-700 directory and deleted by the harness.
- `deno.lock`, `node_modules`, and generated `android/` or `ios/` directories
  were not created or staged.
- No schedule or cognitive switch was enabled.
