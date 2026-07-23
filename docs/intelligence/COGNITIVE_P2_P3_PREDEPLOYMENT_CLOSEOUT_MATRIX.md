# Cognitive P2/P3 Predeployment Closeout Matrix

Status: `collective_governance_source_complete_not_deployed`

This matrix closes the bounded technical P2/P3 controls requested after the frozen
hardening review. It does not authorize deployment. The exact frozen Collective
Governance head and its separate review-only PR are the deployment evidence.

| Control | Implemented boundary | Regression evidence | Predeployment state |
| --- | --- | --- | --- |
| Canonical sanitizer and fragments | One JSON policy drives TypeScript and Deno; the fixed corpus is mirrored in pgTAP. Bounded seeded properties use a fixed seed and hard CPU/input caps. | `guard:cognitive-policy-parity`; `cognitive_security_policy_parity_test.sql` | closed |
| Postflight result binding | Receipt binds task/project/repository/branch/platform/environment, capability usage, call, decision, approval, snapshot, before/after state, internally hashed tool result, actual usage, leases, diff, commit, rollback, and evaluation state. | collective governance source tests; governance pgTAP | closed |
| Independent evaluation | A distinct service actor records an immutable evaluation against the actual receipt, final commit, diff, evidence hash, and every decision-required test. Missing tests cannot pass. | governance pgTAP | closed |
| Budget edge cases | Reservations expire, orphaned reservations recover, settlement is single-use, cancellation is final, and negative/overflow usage fails closed. | `test:cognitive-collective-governance`; inherited budget suite | closed |
| Hierarchical leases | Repository/branch/path/provider scopes use deterministic conflict rules, opaque ownership, expiration, heartbeat, revocation, and cancellation cleanup. | collective governance and canonical adversarial suites | closed |
| Rollback authority | Successful rollback revokes prior write capability, releases leases, stops children, invalidates the plan, and requires a new plan/capability; failure quarantines and escalates. | collective governance and canonical adversarial suites | closed |
| Network/metadata policy | One machine policy covers HTTPS/443, metadata names, private/reserved networks, mapped IPv6, noncanonical IPv4, IDNA/trailing-dot normalization, redirect revalidation, pinned DNS, and connected-peer verification. | `guard:cognitive-network-policy-parity` | closed |
| Provider policy interpretation | Typed AWS, Azure, Kubernetes, GCP, GitHub, App Store Connect, Google Play, EAS, RevenueCat, and Stripe interpreters distinguish deny, read, write/release, and escalation. Provider text is never executable. | `test:cognitive-collective-governance` | closed |
| Credential paths | One policy covers environment, Git, SSH, cloud, Firebase, Kubernetes, Docker, package-manager, database, signing, vault/token, backup/temp, case, Unicode, hidden, and nested credential paths. | `guard:cognitive-credential-path-policy-parity` | closed |
| Timestamp semantics | Authority-bearing fields use `timestamptz`, one transaction clock, and exclusive expiration. UTC/session/DST/provider-boundary fixtures are fixed pgTAP cases. | governance pgTAP | closed |
| Dependency advisories | Root production audit is 0 critical/0 high; alert automation is 0 critical/0 high. Remaining moderate tooling advisories are documented, not silently fixed. | `guard:cognitive-dependency-advisories` | closed for Level 0/1 |
| Retention and erasure | Policy remains `owner_counsel_decision_required`; private/user-derived memory, reports, chats, media, analytics, and model inputs fail closed. Only public/repository/non-personal bounded evidence is permitted. | Level 0/1 pgTAP | closed for public/non-personal canary only |
| Activation prerequisites | Research/memory require retention gate; deliberation requires three research canaries; executor requires three deliberations plus a fresh credential attestation; schedules require three independently evaluated draft PRs. | Level 0/1 pgTAP | closed |
| Admin truth | Source fallback is labeled source-only. Live readback is backend-authoritative. Only exact Owner can attempt Level 0/1 changes; backend gates remain authoritative. | TypeScript, route/access guards, Edge check | closed |
| Service identity | Runtime governance mutations require a separately stored opaque service token whose hash is bound to one closed service identity, purpose, validity window, and revocation state. A caller cannot select an identity label. | governance Edge tests; foundation/governance/Level 0/1 pgTAP | closed pending independent retest |
| Canary evidence | Research, deliberation, and credential canary acceptance require existing relational evidence, a trusted execution receipt, and an independent evaluator pass. Request JSON cannot create a passing canary or credential attestation. | governance Edge tests; Level 0/1 pgTAP | closed pending independent retest |
| Governance derivation | Council roles, votes, vetoes, dissents, and evaluation hashes use closed schemas. Quorum requires support to exceed opposition, mandatory vetoes fail closed, and authorization recomputes/binds the evaluation to the exact manifest. | governance source and adversarial tests | closed pending independent retest |
| Capability postflight | Consumption rechecks the finalized decision, active approval, veto state, execution count, expiry, task state, cancellation, quarantine, deadman, exact stored result, budget, and scoped write leases. | foundation/governance pgTAP | closed pending independent retest |

Remaining non-technical decisions:

- `OWNER_COUNSEL_RETENTION_DECISION_REQUIRED` blocks user-derived memory.
- Three distinct human review lanes remain required before Level 2.
- A least-privilege server-side GitHub App/equivalent is required before any
  draft-PR executor canary.
- A model provider credential is optional for deterministic source ingestion but
  required before model-backed production research or deliberation.

The trusted research transport/runner, model-backed deliberation worker,
least-privilege GitHub draft-PR broker, and bounded schedule worker are not
fabricated by this checkpoint. Their absence is a deployment/canary blocker, not
evidence of a successful canary.
