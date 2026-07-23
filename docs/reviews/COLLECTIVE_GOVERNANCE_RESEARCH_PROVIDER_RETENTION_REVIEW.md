# Collective Governance Research, Provider, Release, and Retention Review

Reviewed source: `a1d2ec3545581b1904d94e6a72668789f2065ecb`

Decision: `RESEARCH_PROVIDER_RELEASE_RETENTION_PASS_FOR_EXACT_SOURCE_HEAD`

Counts: P0=0, P1=0, P2=3, P3=1.

The prior credential-path P1 is closed: the canonical policy and executor reject
the fixed token-named credential-path corpus, including npm, yarn, and GitHub
token filename families under otherwise allowed directories.

Verified controls:

- research source and claim creation is service-owned, scope/freshness/citation
  constrained, sanitized, and non-executing;
- research PASS derives from database evidence through the independent evaluator;
- provider credential state requires two differently produced verified external
  evidence records, matching fingerprint/scope/expiry, and derived evaluation;
- the Edge boundary accepts Owner references to existing trusted records rather
  than Owner-authored evidence hashes;
- release, OTA, store, provider mutation, Level 2, and user-derived-memory actions
  remain outside the Edge action allowlist;
- retention remains fail closed at `owner_counsel_decision_required`.

Fixed results: sanitizer 20/20 plus 256 properties, network/path parity MATCH,
research authorities 27/27, research guard/proof/test pass, canonical attacks
40/40, hardening 104/104, runtime authority 11/11, Collective Governance 38/38,
governance attacks 33/33, Edge 8/8, and zero critical/high
production-reachable dependency advisories.

## Bounded residual findings

- `CG-C-P2-001`: Owner/counsel retention approval remains required before any
  user-derived memory. Public/repository/non-personal data is the only eligible
  Level 0/1 scope.
- `CG-C-P2-002`: live model and least-privilege GitHub draft-PR credentials and
  provider readback remain external deployment gates.
- `CG-C-P2-003`: live research, deliberation, schedule, rollback, and provider
  behavior require bounded post-deployment evidence; source tests are not
  provider truth.
- `CG-C-P3-001`: 23 moderate npm advisories remain documented. No current
  critical/high production-reachable advisory was found.

This review is not an approval, merge decision, or deployment authorization.
