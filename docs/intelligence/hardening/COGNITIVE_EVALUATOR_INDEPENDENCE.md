# Cognitive evaluator independence

The evaluator is a distinct read-only identity with no repository write, Git push,
approval, capability issuance, merge, release or deployment authority.

Evaluation is bound to the original objective hash, immutable plan snapshot,
final commit, diff hash, rollback hash and trusted execution-evidence manifest.
A required-test manifest is derived from changed paths, affected platform and
risk. Each required record must come from a trusted runner, use the expected
command, target the final commit, have a real exit code and output hashes, and not
be skipped.

Executor-authored summaries, “passed” files, screenshots without provenance,
omitted tests and physical claims without a physical evidence type cannot satisfy
the manifest. Results are `PASS`, `FAIL`, `INCOMPLETE`, or `BLOCKED`; none grants
owner approval.

Regression: `guard:cognitive-evaluator-independence` and
`test:cognitive-evaluator-independence`.
