# Cognitive red-team implementation suite

The implementation CI ports all 40 attack IDs from independent review PR #15.
`npm run test:cognitive-red-team` must execute the real source handlers and report
exactly `40/40`.

Coverage includes untrusted web/user/Git/source/tool/model input, strict model
parsing, encoded secrets, learning authority, protected branches and force-push,
traversal/symlink escape, capability expiry/replay/scope, emergency stop, atomic
budget and recursion caps, conflicting leases, evaluator evidence, fake physical
proof, source quality, stale graph binding, database client/cross-task denial,
finding lifecycle, absent-migration compatibility, Admin access, SSRF redirects,
provider scope expansion, cancellation and rollback quarantine.

Observed local result under Node 20.20.2:

`cognitive red team 40/40 passed`

The suite invokes the implementation handlers for every attack rather than
accepting documentation strings as results. Database state attacks are also
covered by 203 cognitive pgTAP assertions and a real two-session recurrence race.
`test:cognitive-hardening-regressions` adds 83 variants derived from the failed
independent retests, including wrong bearer/nonce proof, complete request/capability
binding, no-follow existing-file identity pinning, fail-closed new-file creation,
engine-owned and anti-forgery budget
reservation, postflight rollback, double-encoded/split secrets, IPv6/connected-peer
and cancellation SSRF cases, verified source authority, caller-created evidence
roots, deterministic required tests, and exact service-actor/scoped-Admin
database enforcement. The latest variants also cover Unicode/IDNA security
normalization, arbitrary small-fragment reconstruction, provider wildcard
policy semantics, encoded private IPv6, and normalized UTF-8 URL bounds. The
fresh independent review-only retest remains a separate gate.
