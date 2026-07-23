# Cognitive remediation matrix

Review source: PR #15 at `ff6b2588e2dcc4fa8e76c8f8f6dac47f64cb0667`

Implementation base: `bd8fd0c709db8ff843b69fa9b9a5039a74d09a94`

Hardening state: `security_hardened_scaffold_not_deployed`

The matrix retains every independent-review finding. “Fixed locally” means its
source change and regression test pass on the hardening branch; it is not a
deployment claim. The first two automated independent retest rounds found
remaining P1s and therefore did not close any row. The current corrective working
tree adds composed enforcement plus 25 independent-variant regressions. The
“pending” values below refer to the required fresh retest of the next exact
corrective commit.

| Finding | Severity | Exact defect | Implementation change | Regression | Commit | Status | Independent retest |
|---|---:|---|---|---|---|---|---|
| A-SEC-001 | P1 | Executor accepted arbitrary/forbidden actions and unsafe paths. | Closed non-shell action engine and canonical filesystem confinement. | executor suite | `0b987819` | fixed locally | pending |
| A-SEC-002 | P1 | Capability plane was declarative and replay-unaware. | Typed task/project/repository/branch/platform/environment/provider/action capability with atomic use. | capability + pgTAP | `0b987819`, `8c7b3bbd` | fixed locally | pending |
| A-SEC-003 | P1 | Evaluator trusted executor assertions. | Independent read-only evidence evaluator and deterministic required-test manifest. | evaluator suite | `0b987819` | fixed locally | pending |
| COG-B-001 | P1 | Task/project/platform isolation was unenforced. | Composite isolation keys and same-scope foreign keys. | 125 cognitive pgTAP assertions | `8c7b3bbd`, `44aa2aa0` | fixed locally | pending |
| COG-B-002 | P1 | Direct state edits could fabricate control-plane outcomes. | Revoked state writes, transition RPCs, immutable transition events. | state-machine pgTAP | `8c7b3bbd` | fixed locally | pending |
| C-08 | P1 | Workflow edits could produce release authority. | Workflow paths/actions permanently excluded from executor authority. | executor + CI guard | `0b987819`, `b19ee9ed` | fixed locally | pending |
| D-06 | P1 | Tool output could become executable authority. | Untrusted bounded tool-result envelope. | D-06 | `0b987819` | fixed locally | pending |
| D-07 | P1 | Malformed model output could retain hidden commands. | Strict whole-document parser, closed schema/enums, no repair fallback. | D-07 | `0b987819` | fixed locally | pending |
| D-08 | P1 | Encoded credential metadata was accepted. | Recursive bounded base64/hex-aware sanitizer. | D-08 | `0b987819` | fixed locally | pending |
| D-11 | P1 | Force push was accepted. | Force push is absent from the action enum and rejected in arguments. | D-11 | `0b987819` | fixed locally | pending |
| D-12 | P1 | Lexical traversal was accepted. | Multi-decode, Unicode-normalized lexical and canonical path checks. | D-12 | `0b987819` | fixed locally | pending |
| D-13 | P1 | Symlink escape was accepted. | `lstat` no-follow traversal, submodule/mount/hard-link boundaries. | D-13 | `0b987819` | fixed locally | pending |
| D-14 | P1 | Capability expiry was not checked per call. | Every call rechecks validity and runtime gates. | D-14 | `0b987819` | fixed locally | pending |
| D-15 | P1 | Replay protection was absent. | Atomic unique call IDs and immutable usage sequences/events. | D-15 + pgTAP | `0b987819`, `8c7b3bbd` | fixed locally | pending |
| D-16 | P1 | Platform scope was absent. | Exact platform binding in source and database capability paths. | D-16 + pgTAP | `0b987819`, `8c7b3bbd` | fixed locally | pending |
| D-17 | P1 | Repository scope was absent. | Exact repository/project/branch binding. | D-17 + pgTAP | `0b987819`, `8c7b3bbd` | fixed locally | pending |
| D-19 | P1 | Mid-plan atomic budget termination was absent. | Reserve/settle ledgers with immutable usage events and no negative balance. | D-19 + pgTAP | `0b987819`, `8c7b3bbd` | fixed locally | pending |
| D-20 | P1 | Child depth/fan-out/deadman caps were absent. | Closed plan ceilings and task deadman fields. | D-20 | `0b987819` | fixed locally | pending |
| D-23 | P1 | Fabricated executor output could pass evaluation. | Trusted runner, exit code, hashes and commit identity required. | D-23 | `0b987819` | fixed locally | pending |
| D-24 | P1 | Omitted required tests could pass evaluation. | Missing/skipped/wrong-commit tests fail incomplete/failed. | D-24 | `0b987819` | fixed locally | pending |
| D-30 | P1 | Deeply nested secret JSON passed sanitization. | Recursive caps, prototype/cycle rejection and nested key/value scanning. | D-30 | `0b987819` | fixed locally | pending |
| D-36 | P1 | No enforceable SSRF boundary existed. | HTTPS-only DNS/redirect/private-network/size/type-bounded mock transport. | D-36 + research suite | `0b987819` | fixed locally | pending |
| D-37 | P1 | Provider output could request scope expansion. | Provider output remains untrusted evidence and cannot mint capability fields. | D-37 | `0b987819` | fixed locally | pending |
| D-39 | P1 | Cancellation did not propagate through tool execution. | AbortSignal propagation and late-result rejection. | D-39 | `0b987819` | fixed locally | pending |
| D-40 | P1 | Rollback failure lacked quarantine/escalation. | Rollback-failed state revokes capabilities, stops children and escalates. | D-40 + pgTAP | `0b987819`, `8c7b3bbd` | fixed locally | pending |
| A-SEC-004 | P2 | Prompt-injection filtering accepted hostile variants. | Shared untrusted-input classifier and authority separation. | D-01–D-08 | `0b987819` | fixed locally | pending |
| A-SEC-005 | P2 | Loop, budget and cancellation values failed open. | Required bounded numeric fields and executable ledgers. | budget suite | `0b987819` | fixed locally | pending |
| A-SEC-006 | P2 | Learning validated only top-level names. | Closed numeric learning fields plus recursive sanitizer. | D-09 | `0b987819` | fixed locally | pending |
| A-SEC-007 | P2 | Graph followed symlinks and asserted secret exclusion. | Tracked regular files only, no-follow, computed exclusions/content hashes. | graph proof | `b19ee9ed` | fixed locally | pending |
| COG-B-003 | P2 | Execution depended on mutable plans. | Canonical immutable snapshot shared by approval/capability/run/evaluation. | snapshot pgTAP | `8c7b3bbd` | fixed locally | pending |
| COG-B-004 | P2 | Secret/PII and payload bounds were incomplete. | Bounded redacted storage columns and recursive sanitizer. | sanitizer + pgTAP | `0b987819`, `8c7b3bbd` | fixed locally | pending |
| COG-B-005 | P2 | Retention/erasure conflicted with immutable raw evidence. | Data classes, deadlines, legal hold, tombstones, non-personal audit. | erasure pgTAP | `8c7b3bbd` | fixed technically; counsel gate remains | pending |
| COG-B-006 | P2 | Research provenance references were not relational. | Claim-source, contradiction and retrieval relations with scoped FKs. | provenance pgTAP | `8c7b3bbd` | fixed locally | pending |
| COG-B-007 | P2 | Global dedupe lost recurrence/task scope. | `(task_id,finding_key)` current state plus immutable events. | recurrence + real race | `8c7b3bbd` | fixed locally | pending |
| COG-B-008 | P2 | Specialized indexes and bounds were absent. | Scope/state indexes, cardinality and text/JSON bounds. | pgTAP | `8c7b3bbd` | fixed locally | pending |
| COG-B-009 | P2 | Budgets and policy-like learning were broadly mutable. | Immutable owner ceilings and closed learned metrics. | budget/learning suites | `0b987819`, `8c7b3bbd` | fixed locally | pending |
| C-01 | P2 | Claims were not citation-bound. | Relational support records and claim transition enforcement. | research + pgTAP | `8c7b3bbd` | fixed locally | pending |
| C-02 | P2 | Quality/freshness/contradiction checks failed open. | Primary/corroborated source rules, date/freshness and contradiction gates. | research + pgTAP | `0b987819`, `8c7b3bbd` | fixed locally | pending |
| C-03 | P2 | Research URL contract was absent. | SSRF-safe injected transport. | D-36 | `0b987819` | fixed locally | pending |
| C-04 | P2 | Persistent research injection was accepted. | Content remains untrusted evidence and injected claims fail support. | D-01–D-05 | `0b987819` | fixed locally | pending |
| C-05 | P2 | Storage could become an article archive. | Hashes and bounded excerpts only; full articles excluded. | research + pgTAP | `0b987819`, `8c7b3bbd` | fixed locally | pending |
| C-06 | P2 | Model evidence/privacy controls were incomplete. | Hash-based invocation/evidence records and no raw prompt/output requirement. | evaluator + pgTAP | `0b987819`, `8c7b3bbd` | fixed locally | pending |
| C-07 | P2 | Tool/provider scopes were free-form. | Closed providers, operations, environments and resources. | capability suite | `0b987819` | fixed locally | pending |
| C-09 | P2 | Graph digest did not bind content/commit. | Commit/config/file-list/content hashes and graph digest. | graph proof | `b19ee9ed` | fixed locally | pending |
| D-01 | P2 | Authority-bearing webpage text was accepted. | Injection rejection and `toolInvocationAllowed=false`. | D-01 | `0b987819` | fixed locally | pending |
| D-04 | P2 | Git history lacked an untrusted-input contract. | Commit/source content wrapped as untrusted tool data. | D-04 | `0b987819` | fixed locally | pending |
| D-21 | P2 | Conflicting writes lacked a protocol. | Typed expiring resource leases. | D-21 + pgTAP | `0b987819`, `8c7b3bbd` | fixed locally | pending |
| D-32 | P2 | Resolution lacked an immutable event. | Transactional current-state resolution and immutable lifecycle event. | D-32 + pgTAP | `8c7b3bbd` | fixed locally | pending |
| A-SEC-008 | P3 | Admin copy overstated unimplemented safety. | Truthful source-manifest-only undeployed copy. | Admin truth guard | `b19ee9ed` | fixed locally | pending |
| A-SEC-009 | P3 | Actions used mutable tags and advisory state was undocumented. | All actions pinned to SHAs; guard and inherited advisory baseline. | supply-chain guard | `b19ee9ed` | fixed locally | pending |
| COG-B-010 | P3 | Super-admin was omitted and Admin readback was global. | Owner/super-admin/scoped `admin.cognitive.read`; normal-user denial. | Admin + pgTAP | `b19ee9ed`, `8c7b3bbd`, `a869e69f` | fixed locally | pending |
| C-10 | P3 | Admin status was hard-coded as live truth. | Compiled source manifest is explicitly labeled non-live. | Admin truth guard | `b19ee9ed` | fixed locally | pending |

## Corrective exact-head findings

The second retest added these concrete findings. They remain separate from the
original 52-row inventory so the independent review record stays auditable.

| Retest finding | Severity | Exact defect | Corrective implementation | Regression | Status | Independent retest |
|---|---:|---|---|---|---|---|
| A2-EXEC-001 | P1 | Request action, branch, and all paths were not compositionally bound to the capability. | The complete request/capability tuple is validated before execution. | R15–R17 | fixed locally | pending |
| A2-EXEC-002 | P1 | A checked path could be swapped after authorization. | Existing files use no-follow pinned descriptors with device/inode verification; new files use no-follow exclusive creation. | R18 | fixed locally | pending |
| A2-BUDGET-001 | P1 | Zero tool budget could execute when caller usage was zero. | The engine reserves its own minimum call/concurrency and actual byte usage. | R19 | fixed locally | pending |
| A2-POSTFLIGHT-001 | P1 | Postflight revocation left a completed side effect. | Write actions require a rollback coordinator; rejection restores/removes the scoped file and rollback failure quarantines. | R20 | fixed locally | pending |
| A2-EVAL-001 | P1 | Caller-created evidence roots and caller-empty required tests could pass evaluation. | Tests derive from changed paths/platform; the undeployed scaffold has no configured trusted evidence authority and cannot return PASS. | R24 | fixed locally | pending |
| A2-SSRF-001 | P1 | Research accepted an unverified connected peer and incomplete IPv6 reservation rules. | Connected peer must match the pinned public address; non-global and reserved IPv6 is denied. | R13, R20 | fixed locally | pending |
| A2-CANCEL-001 | P1 | Research cancellation waited for the transport timeout. | Parent cancellation aborts promptly and late output is rejected. | R21 | fixed locally | pending |
| A2-MODEL-001 | P1 | Operational model evidence IDs and blockers bypassed sanitization. | Identifier-only evidence references and recursive sanitized blockers are required. | R22 | fixed locally | pending |
| A2-SANITIZE-001 | P1 | Unicode-encoded and split credential-like content bypassed detection. | UTF-8 bounded decoding, aggregate scanning, split-token detection, and private-identifier classification. | R01, R02, R25 | fixed locally | pending |
| A2-DB-001 | P2 | Erasure covered only three tables while other tables could retain user-derived content. | Tables outside the erasure RPC structurally reject `user_derived`; allowed tables use transactional tombstones. | pgTAP erasure | fixed locally | pending |
| A2-DB-002 | P2 | `admin.cognitive.read` was global. | Exact JWT project/task/platform assignment is required with the closed permission. | pgTAP scoped Admin | fixed locally | pending |
| A2-DB-003 | P2 | Service actor identity was caller supplied. | Security-definer RPCs bind claimed actor to authenticated service actor claims. | pgTAP actor mismatch | fixed locally | pending |
| A2-RESEARCH-001 | P2 | Source authority, citation, and retrieval evidence were caller asserted. | Static authority registry, composite FK, closed citations, bound retrieval hashes, and bounded timestamps. | pgTAP provenance variants | fixed locally | pending |
| A2-LEASE-001 | P2 | Leases covered only paths and missed wider resource conflicts. | Writes acquire repository, branch, platform, provider, and path resource leases. | conflict suite | fixed locally | pending |
| A2-STATUS-001 | P3 | Status overstated completed hardening. | After all local hardening gates passed, status became `security_hardened_scaffold_not_deployed`; it remains explicitly off and non-operational. | Admin/status guards | fixed locally | pending |

Prior authored totals were disproved by the fresh retests. Corrected totals remain
open until a new exact-head independent retest verifies the additional
composed-boundary findings. `OWNER_COUNSEL_RETENTION_DECISION_REQUIRED` remains a deliberate deployment
blocker, not a claim of legal compliance.

Corrective enforcement applies across the matrix where the retests found an
original guard to be descriptive rather than authoritative. The authoritative
corrective checkpoint will be the next committed and pushed hardening head; older
commit references identify the first implementation of each control, not the
final independently retestable state.
