# Cognitive remediation matrix

Review source: PR #15 at `ff6b2588e2dcc4fa8e76c8f8f6dac47f64cb0667`.
Implementation base: `bd8fd0c709db8ff843b69fa9b9a5039a74d09a94`.
This branch is an undeployed scaffold. While remediation is incomplete its state is
`security_hardening_in_progress`.

| Finding | Severity | Defect | Implementation and regression | Status |
|---|---:|---|---|---|
| A-SEC-001, C-08, D-11–D-13 | P1 | Executor accepted forbidden actions, workflow edits, traversal and symlinks. | Closed action enum, argument arrays, exact repo/remote/branch policy, canonical no-follow path confinement; executor suite. | in progress |
| A-SEC-002, D-14–D-17 | P1 | Capabilities were declarative, replay-unaware and unbound. | Typed expiring capability with atomic JTI usage, exact task/project/repository/branch/platform/environment/provider/action binding; capability suite. | in progress |
| A-SEC-003, D-23, D-24 | P1 | Evaluator trusted executor assertions and omitted tests. | Separate read-only evaluator over immutable evidence/test manifests and actual exit/hash records; evaluator suite. | in progress |
| COG-B-001 | P1 | Rows lacked task/project/platform isolation. | Composite isolation keys and foreign keys; pgTAP isolation suite. | in progress |
| COG-B-002 | P1 | Direct state edits could fabricate outcomes. | Revoked state writes, strict transition RPCs and immutable lifecycle events; pgTAP state-machine suite. | in progress |
| D-06, D-07, D-37 | P1 | Tool/provider/model output could become authority. | Strict model schema and untrusted tool/provider envelopes that cannot widen scope; boundary suite. | in progress |
| D-08, D-30 | P1 | Encoded and nested secrets were accepted. | Recursive bounded sanitizer with base64/hex inspection; sanitizer suite. | in progress |
| D-19, D-20 | P1 | Atomic budgets, recursion and deadman controls were absent. | Reserve/settle budgets plus depth/fan-out/retry/time ceilings; budget suite. | in progress |
| D-36 | P1 | SSRF-safe research transport was absent. | HTTPS-only DNS/redirect/private-network policy with bounded mock transport; SSRF suite. | in progress |
| D-39 | P1 | Active tool cancellation was absent. | AbortSignal propagation and rejection of late results; cancellation suite. | in progress |
| D-40 | P1 | Rollback failure had no quarantine/escalation. | Typed rollback states, revocation, quarantine and critical immutable finding; rollback suite. | in progress |
| A-SEC-004, C-04, D-01, D-04 | P2 | Injection variants and repository/web text could be mistaken for authority. | Untrusted source envelopes and no authority derivation; red-team D-01–D-05. | in progress |
| A-SEC-005 | P2 | Missing loop/budget/cancellation fields failed open. | Strict required numeric schema and runtime ceilings; budget suite. | in progress |
| A-SEC-006, COG-B-009 | P2 | Learning and ceilings were broadly mutable. | Closed bounded learning fields and immutable owner ceilings; learning suite. | in progress |
| A-SEC-007, C-09 | P2 | Graph followed symlinks and was not content/commit bound. | Tracked regular files only, content hashes, commit/config binding and compact manifest; graph suite. | in progress |
| COG-B-003 | P2 | Execution depended on mutable plans. | Immutable canonical snapshot/hash shared by approval, capability, run and evaluation; pgTAP. | in progress |
| COG-B-004, C-05, C-06 | P2 | Storage/prompt/article bounds were incomplete. | Bounded redacted excerpts, hashes, lengths and total-byte limits; sanitizer/pgTAP. | in progress |
| COG-B-005 | P2 | Retention and erasure conflicted with immutable raw evidence. | Data classes, tombstones and non-personal lifecycle history; pgTAP. `OWNER_COUNSEL_RETENTION_DECISION_REQUIRED` remains a deployment blocker. | in progress |
| COG-B-006, C-01 | P2 | Provenance UUID arrays lacked relational validity. | Claim-source/retrieval/contradiction relations with scoped FKs; pgTAP. | in progress |
| COG-B-007, D-32 | P2 | Global dedupe lost recurrence/resolution semantics. | Task-scoped current findings and immutable detection/resolution events; concurrency pgTAP. | in progress |
| COG-B-008 | P2 | Index, fan-out and size controls were absent. | Scoped indexes and cardinality/payload limits; pgTAP/EXPLAIN. | in progress |
| C-02 | P2 | Freshness, quality and contradictions failed open. | Source-category requirements, valid dates, freshness and contradiction enforcement; research suite. | in progress |
| C-03 | P2 | URL contract absent. | SSRF-safe transport; D-36. | in progress |
| C-07 | P2 | Provider/tool scopes were free-form. | Closed provider/action/resource enums; capability suite. | in progress |
| D-21 | P2 | Conflicting operators could write concurrently. | Typed expiring resource leases; conflict suite. | in progress |
| A-SEC-008, C-10 | P3 | Admin copy overstated live truth. | Source-manifest-only undeployed copy and access guard; Admin truth suite. | in progress |
| A-SEC-009 | P3 | CI used mutable action tags. | Immutable action SHAs and mutable-tag guard; supply-chain suite. | in progress |
| COG-B-010 | P3 | Super-admin omitted and Admin readback global. | Exact owner/super-admin/`admin.cognitive.read` contract and normal-user denial; Admin/pgTAP suite. | in progress |

Each row will receive its implementing commit and independent-retest result in the
final remediation report. No P1 is fixed until the corresponding behavior test
passes.
