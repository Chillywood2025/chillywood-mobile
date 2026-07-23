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
covered by 224 focused cognitive pgTAP assertions, 509 assertions across the
complete local database suite, and a real two-session recurrence race.
`test:cognitive-hardening-regressions` adds 91 variants derived from the failed
independent retests, including wrong bearer/nonce proof, complete request/capability
binding, no-follow existing-file identity pinning, fail-closed new-file creation,
engine-owned and anti-forgery budget
reservation, postflight rollback, double-encoded/split secrets, IPv6/connected-peer
and cancellation SSRF cases, verified source authority, caller-created evidence
roots, deterministic required tests, and exact service-actor/scoped-Admin
database enforcement. The latest 87 variants also cover Unicode/IDNA security
normalization, Unicode default-ignorables and cross-script confusables,
linear reconstruction beyond twelve leaves, provider wildcard policy decoding,
benign provider-denial semantics, encoded private IPv6, and normalized UTF-8
URL bounds. The latest variants additionally cover positioned credential
fragments, numbered research-query reconstruction before DNS, nested provider
wildcards, provider denial reversal, and outer/short decoded envelopes. Focused
cognitive pgTAP now adds exact international-digit, date-email, long-fragment,
maximum prose-envelope, cross-object assignment, bounded-depth, and CPU-bound
regressions.
The fresh independent review-only retest remains a separate gate.
