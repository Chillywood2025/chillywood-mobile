# Two-Party PostgREST Integration Report

Status: local database proof complete; real HTTP/PostgREST harness still pending.

The pgTAP suite exercises the same SQL privileges used by PostgREST roles:

- exact Owner can record an immutable approval version;
- Owner-authenticated requests cannot service-execute;
- service principal cannot create Owner approval;
- service principal can claim and execute an exact approved action;
- approved switch execution stages a pending switch without making it live;
- worker self-attestation of evaluator proof fails closed;
- distinct independent evaluator proof is required before completion;
- completion after evaluator proof activates the staged switch transactionally;
- replayed single-use claims fail closed;
- wrong decision-manifest hash fails closed;
- legacy direct Owner switch activation fails closed.
- service-principal assertion revocation blocks later service assertions;
- emergency stop or Owner revocation after side effects blocks successful
  completion but still permits cleanup-only quarantine/rollback settlement.

Current local result:

`supabase test db` passed 723 tests across 12 files, including
`supabase/tests/cognitive_two_party_activation_handoff_test.sql`.

Remaining gap before deployment:

Run disposable local HTTP requests through PostgREST and the Edge Functions using
separate local tokens for Owner, non-Owner, scoped Admin, anon, and service
principal. That harness must not print or persist local keys and must record only
PASS/FAIL and sanitized hashes.
