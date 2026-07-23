# Cognitive evaluator independence

The evaluator is a distinct read-only identity with no repository write, Git push,
approval, capability issuance, merge, release or deployment authority.

Evaluation is bound to the original objective hash, immutable plan snapshot,
final commit, diff hash, rollback hash and trusted execution-evidence manifest.
A runner or physical collector cannot create trusted evidence without proving its
separate authority credential to the evidence ledger; caller-supplied booleans,
summaries and hashes do not create ledger records. The evaluator receives only the
ledger’s read methods and has no evidence-write method.
A required-test manifest is derived from changed paths, affected platform and
risk. Each required record must come from a trusted runner, use the expected
command, target the final commit, have a real exit code and output hashes, and not
be skipped.

Executor-authored summaries, “passed” files, screenshots without provenance,
omitted tests and physical claims without a physical evidence type cannot satisfy
the manifest. Results are `PASS`, `FAIL`, `INCOMPLETE`, or `BLOCKED`; none grants
owner approval.

The undeployed scaffold intentionally configures no trusted evidence authority,
so a caller-created ledger cannot produce `PASS`. A future deployment must add a
separately reviewed verifier identity and credential boundary. Required tests are
derived inside the evaluator from the final changed paths and platform; callers
cannot submit an empty manifest to suppress them.

Regression: `guard:cognitive-evaluator-independence` and
`test:cognitive-evaluator-independence`.
