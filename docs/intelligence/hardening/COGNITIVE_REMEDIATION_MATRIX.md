# Cognitive remediation matrix

Review source: PR #15 at `ff6b2588e2dcc4fa8e76c8f8f6dac47f64cb0667`

Implementation base: `bd8fd0c709db8ff843b69fa9b9a5039a74d09a94`

Hardening state: `security_hardening_in_progress`

The matrix retains every independent-review finding. “Fixed locally” means its
source change and regression test pass on the hardening branch; it is not a
deployment claim. Every completed automated independent retest found remaining
P1s and therefore did not close any row. The current corrective working tree
adds composed enforcement plus 47 independent-variant regressions. The
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
| A2-STATUS-001 | P3 | Status overstated completed hardening. | Status remained `security_hardening_in_progress` while gates were open; after all authored gates passed it advanced to the narrow `security_hardened_scaffold_not_deployed` state. | Admin/status guards | fixed locally | pending |

Prior authored totals were disproved by the fresh retests. Corrected totals remain
open until a new exact-head independent retest verifies the additional
composed-boundary findings. `OWNER_COUNSEL_RETENTION_DECISION_REQUIRED` remains a deliberate deployment
blocker, not a claim of legal compliance.

## Latest exact-head retest findings

The latest isolated architecture, database, and research passes reviewed
`87e3a980e6e16bc4dea0aacb7cfdd50d4ced0796`. They found no P0, but they found
eight P1 defects and thirteen technical P2 gaps. The following rows preserve
those findings separately so the remediation is independently retestable.

| Retest finding | Severity | Exact defect | Corrective implementation | Regression | Status | Independent retest |
|---|---:|---|---|---|---|---|
| A3-EXEC-001 | P1 | New-file parent replacement created a path outside the repository and rollback falsely reported success. | Autonomous new-file execution now fails closed until a reviewed descriptor-relative `openat` adapter exists; it performs no pathname-based write. | R-33 | fixed locally | pending |
| A3-CAP-001 | P1 | Capability records, used call IDs, and lifecycle events were publicly mutable. | Capability state, replay set, and events use private fields; only immutable snapshots are exposed. | R-31 | fixed locally | pending |
| A3-BUDGET-001 | P1 | A caller-supplied object could authorize an arbitrary budget reservation. | Only an engine-branded, exact-prototype, frozen budget authority is accepted; subclass and plain-object forgeries are rejected. | R-32, R-38 | fixed locally | pending |
| A3-SANITIZE-001 | P1 | Base64url and cross-field split secrets bypassed recursive sanitization. | Bounded base64url/percent decoding and aggregate whole-document scanning reject split secret material. | R-26, R-27 | fixed locally | pending |
| B3-TRUST-001 | P1 | `service_role` retained direct DML authority over the research-authority trust anchor. | Final grants explicitly revoke insert, update, and delete on `cognitive_research_authorities`; updates require a future reviewed migration. | pgTAP trust-anchor DML denial | fixed locally | pending |
| B3-EVAL-001 | P1 | The evaluator actor could call the general state-transition RPC and mutate hypotheses. | `independent_evaluation_judge` is excluded from the general transition actor set and remains evidence-read-only. | pgTAP evaluator transition denial | fixed locally | pending |
| C3-MODEL-001 | P1 | Token-shaped operational evidence IDs passed the strict model parser. | Every evidence ID is recursively sanitized and secret/private-identifier shaped IDs are rejected. | R-26 | fixed locally | pending |
| C3-URL-001 | P1 | Percent-encoded credential-bearing research URL queries passed validation. | URL validation scans bounded decoded candidates and rejects credential-bearing URLs before transport. | R-27 | fixed locally | pending |
| A3-RESEARCH-001 | P2 | A caller could fabricate research authority and evidence hashes. | One canonical 27-row authority registry generates matching TypeScript and SQL data; service RPCs compute URL/content hashes. | authority guard; R-29; pgTAP broker ingestion | fixed locally | pending |
| A3-SANITIZE-002 | P2 | Object-key bytes did not count toward the total sanitizer budget. | Key bytes count toward the bounded aggregate payload size. | R-34 | fixed locally | pending |
| A3-EVAL-001 | P2 | Required-test selection trusted caller-supplied changed paths. | The trusted evidence ledger records a commit/diff-bound changed-path manifest; evaluator test derivation reads only that record. | evaluator suite | fixed locally | pending |
| A3-SSRF-001 | P2 | Injected transports could self-attest a public connected peer. | Only branded reviewed mock transports or the pinned HTTPS transport are accepted; the production contract pins DNS and verifies the socket peer. | R-35 | fixed locally | pending |
| A3-CANCEL-001 | P2 | DNS resolution did not receive parent cancellation. | An internal abort controller propagates cancellation into DNS and rejects late resolution. | R-36 | fixed locally | pending |
| B3-ERASURE-001 | P2 | Task rows allowed raw `user_derived` data outside erasure coverage. | Intelligence task rows structurally reject `user_derived`; allowed personal-data tables retain transactional tombstone behavior. | pgTAP task data-class denial | fixed locally | pending |
| B3-FRESHNESS-001 | P2 | Ancient sources and caller-declared century-long freshness were accepted. | Source/claim checks enforce retrieval recency and category-specific TTL ceilings. | pgTAP ancient/overlong freshness denial | fixed locally | pending |
| B3-SNAPSHOT-001 | P2 | Immutable plan snapshots lacked data class, retention, and legal-hold fields. | Snapshots require non-personal class, bounded retention, and explicit legal-hold state. | pgTAP snapshot retention contract | fixed locally | pending |
| C3-HTTP-001 | P2 | A terminal HTTP 500 body could be accepted as research evidence. | Non-2xx terminal responses fail closed. | R-28 | fixed locally | pending |
| C3-SIZE-001 | P2 | Research size limits trusted caller-reported byte counts. | The broker verifies actual UTF-8 body bytes against the reported count and the decompressed cap. | R-28 | fixed locally | pending |
| C3-HASH-001 | P2 | Research URL/content hashes were caller assertions. | Source creation computes hashes in the runtime and service-owned SQL RPC; mismatches fail. | R-29; pgTAP broker ingestion | fixed locally | pending |
| C3-REGISTRY-001 | P2 | TypeScript and SQL research-authority registries could drift. | A required guard compares both generated marker blocks with the canonical registry. | `guard:cognitive-research-authorities` | fixed locally | pending |
| C3-SCOPE-001 | P2 | A provider request for wider scope was rejected without an owner-review finding. | Tool envelopes emit a sanitized `provider_scope_expansion_request`, require owner review, and discard the payload. | R-30 | fixed locally | pending |
| A3-STATUS-001 | P3 | The prior status still overstated the independently blocked scaffold. | Status remained `security_hardening_in_progress` through corrective work; the final label grants no operational authority and an exact-head retest remains a merge gate. | Admin/status guards | fixed locally | pending |

Corrective enforcement applies across the matrix where the retests found an
original guard to be descriptive rather than authoritative. The authoritative
corrective checkpoint will be the next committed and pushed hardening head; older
commit references identify the first implementation of each control, not the
final independently retestable state.

## Fourth exact-head retest findings

The fourth isolated retest reviewed
`b990b9e7cd020e6e4a02b9ba2b7fabb61228ba1d`. The database lane found no
P0/P1/P2 and one harness P3. Architecture/security and research/provider found
seven distinct P1 classes and six P2/P3 gaps after overlap was normalized.

| Retest finding | Severity | Exact defect | Corrective implementation | Regression | Status | Independent retest |
|---|---:|---|---|---|---|---|
| A4-CAP-001 / C4-CAP-001 | P1 | `executeAuthorizedAction` accepted an injected ledger-shaped authority and capability proof verification could be caller-defined. | Production execution has no configured capability adapter; the only adapter is branded for a disposable non-Git temporary root, rejects plain objects, and the typed ledger computes proof hashes internally. | R-39, R-40 | fixed locally | pending |
| A4-CANCEL-001 | P1 | A non-cooperative invocation retained leases/descriptors and blocked cancellation until its promise resolved. | Execution races the parent signal, closes pinned descriptors, revokes the capability, releases budget/leases, quarantines rollback state, and ignores late results. | D-39, R-41 | fixed locally | pending |
| A4-SANITIZE-001 / C4-SAN-001 | P1 | SQL accepted percent-encoded and unpadded base64url secret-shaped values. | The SQL sanitizer performs bounded percent and base64url decoding and rejects AWS-shaped identifiers before persistence. | pgTAP encoded-secret assertions | fixed locally | pending |
| C4-URL-001 | P1 | Fetch sent encoded credential-bearing URLs even though the standalone policy rejected them. | Credential URL decoding/checking is in the exact DNS/fetch path before DNS or transport. | R-43 | fixed locally | pending |
| C4-HASH-001 | P1 | Tool-result hashes were caller assertions in TypeScript and SQL postflight. | TypeScript and SQL compute hashes inside their trusted boundary from the retained/sanitized envelope; no hash callback/parameter remains. | R-44 + pgTAP postflight hash | fixed locally | pending |
| C4-ID-001 | P1 | Strict model and research identifier channels accepted credential-shaped identifiers. | Evidence/source IDs pass closed identifier plus recursive secret/injection checks; citation metadata is sanitized with the source. | R-45, R-46 + pgTAP | fixed locally | pending |
| C4-MODEL-001 | P2 | Strict JSON accepted duplicate keys and therefore cross-parser ambiguity. | A bounded pre-parse duplicate-object-key scanner rejects the whole document. | R-45 | fixed locally | pending |
| C4-SCOPE-001 | P2 | “Switch the integration to the owner role” did not create an escalation finding. | Provider scope detection covers owner/super-admin/role-change language and still discards the payload. | R-47 | fixed locally | pending |
| C4-TRANSPORT-001 | P2 | Any caller could brand an arbitrary research handler as reviewed. | The arbitrary mock factory is permanently disabled; CI uses a closed deterministic data-only fixture transport and production uses the pinned HTTPS adapter. | R-42 | fixed locally | pending |
| C4-CITATION-001 | P2 | Citation metadata bypassed research sanitization. | Citation metadata is included in the bounded recursive source sanitizer. | R-46 | fixed locally | pending |
| C4-DRIFT-001 | P2 | Research authority accepted non-443 sources while runtime/SQL rejected them. | TypeScript authority/canonical-reference checks now share the HTTPS/443 boundary. | R-46 | fixed locally | pending |
| B4-HARNESS-001 | P3 | The concurrency harness selected all Supabase containers globally and failed when another project was active. | It selects one explicit/current-worktree project container by exact validated name. | two-session finding race | fixed locally | pending |
| A4-STATUS-001 | P3 | Final hardening status was restored before a fresh passing review. | Status returned to `security_hardening_in_progress` until every authored gate passed; the final label remains subject to exact-head independent retest. | status/Admin guards | fixed locally | pending |

## Fifth exact-head retest findings

The fifth isolated retest reviewed
`2c8be0edd3f4aee2bd3cb9c3b3fbec24894bb8d1`. The database lane independently
passed with no technical finding, 150/150 focused pgTAP assertions, 435/435 full
database assertions, and a successful two-session recurrence race. The
architecture/security and research/provider lanes found nine P1 defects, seven
P2 gaps, and one P3 status defect. Hardening returned immediately to
`security_hardening_in_progress`.

| Retest finding | Severity | Exact defect | Corrective implementation | Regression | Status | Independent retest |
|---|---:|---|---|---|---|---|
| A5-CAP-001 | P1 | A caller-defined class with the expected constructor name could register as the isolated capability authority; a caller-supplied proof boolean could also authorize standalone use. | Remove caller-mintable execution authority and caller proof assertions; the undeployed executor remains structurally fail-closed. | fifth-head authority forgery probes | fixed locally | pending |
| A5-EXEC-001 | P1 | `git commit -m` could include unrelated content already present in the Git index. | No Git side-effect adapter is available while undeployed; scoped Git actions remain validated plans only. | pre-staged workflow fixture | fixed locally | pending |
| A5-BUDGET-001 | P1 | Public construction reset per-action and per-plan budget occurrence controls. | Remove caller-mintable composed execution authority and test budget behavior through one engine-owned pure coordinator. | repeated-authority fixture | fixed locally | pending |
| A5-TOOL-001 | P1 | Composed execution returned raw tool/provider output instead of an untrusted envelope. | No composed tool execution is available while undeployed; standalone result retention always uses an internally hashed untrusted envelope. | provider scope-expansion fixture | fixed locally | pending |
| A5-CANCEL-001 | P1 | A non-cooperative callback retained a writable descriptor and mutated a file after cancellation returned. | Do not invoke caller callbacks or expose pinned descriptors; pure cancellation tests require late results to be ignored. | late-side-effect fixture | fixed locally | pending |
| A5-SANITIZE-001 | P1 | SQL missed a token-shaped identifier and embedded base64url secret material. | Expand bounded recursive SQL token/embedded encoding detection and reject secret-shaped audit identifiers. | pgTAP encoded identifier/body fixtures | fixed locally | pending |
| C5-URL-001 | P1 | The exact fetch path accepted a double-encoded credential value and an AWS-shaped query value before DNS. | Apply bounded whole-URL decoding and secret detection before DNS/transport. | pre-DNS credential URL fixtures | fixed locally | pending |
| C5-ID-001 | P1 | Tool/call/source audit identifiers accepted GitHub/AWS token-shaped values. | Apply closed identifier syntax plus secret/injection rejection in TypeScript and SQL. | audit identifier fixtures | fixed locally | pending |
| C5-EXEC-001 | P1 | Adding `.git` after isolated-adapter registration bypassed the non-Git-root gate. | Eliminate the caller-registered execution adapter and keep the scaffold executor fail-closed. | post-registration Git-root fixture | fixed locally | pending |
| A5-LEASE-001 | P2 | A caller-supplied lease registry could bypass conflict control. | No caller-supplied registry participates in side-effect execution; pure lease coordinators remain independently testable. | lease-forgery fixture | fixed locally | pending |
| A5-TRANSPORT-001 | P2 | A caller could brand arbitrary fixture content under an official authority URL. | Deterministic research fixtures are selected from a closed built-in fixture registry; callers cannot supply official content. | fabricated-official-source fixture | fixed locally | pending |
| A5-EVIDENCE-001 | P2 | Trusted evidence construction accepted caller verifier/hash functions. | Keep evaluator evidence authority unconfigured and remove caller-mintable verifier/hash roots. | evidence-root forgery fixture | fixed locally | pending |
| C5-SOURCE-001 | P2 | Duplicate source IDs could transfer registered authority to a different source through `Map` collapse. | Reject duplicate source IDs before authority lookup. | duplicate-authority fixture | fixed locally | pending |
| C5-CITATION-001 | P2 | Prototype-backed inherited citation values bypassed own-property sanitization. | Reject non-plain objects and require own bounded citation properties. | prototype-backed citation fixture | fixed locally | pending |
| C5-FRESHNESS-001 | P2 | A supported claim could outlive the freshness deadline of its supporting source. | Bound claim freshness to every support source in TypeScript and relational SQL. | source/claim deadline fixtures | fixed locally | pending |
| C5-SCOPE-001 | P2 | Provider owner/admin escalation detection depended on verb-before-role phrasing. | Detect bounded role/credential escalation language in either order and continue to discard the payload. | phrase-order fixtures | fixed locally | pending |
| A5-STATUS-001 | P3 | The final hardening label was restored despite independent P1 blockers. | Use `security_hardening_in_progress` until a new exact-head four-lane retest returns zero P0/P1. | status/Admin guards | fixed locally | pending |

## Sixth exact-head retest findings

The sixth isolated retest reviewed
`09845ff5d757673c9174ecab2481823824ba93d0`. All original PR #15 P1
findings remained closed, but the database lane found two new persistence P1s.
The architecture and research lanes also found three P2 and three P3 gaps. The
scaffold remains `security_hardening_in_progress` while this corrective set is
retested.

| Retest finding | Severity | Exact defect | Corrective implementation | Regression | Status | Independent retest |
|---|---:|---|---|---|---|---|
| DB6-SAN-001 | P1 | Triple-nested unpadded base64url credential-shaped text passed SQL sanitization and persisted as research evidence. | Decode a bounded frontier across six layers and reject still-encoded input at the boundary; research persistence additionally fails closed while broker receipt authority is absent. | pgTAP triple-nested base64url fixture | fixed locally | pending |
| DB6-FIND-001 | P1 | Finding type and target scope accepted secret-shaped and encoded-secret values. | Add table and RPC secret/private-identifier rejection for both fields. | pgTAP secret type/target/private target denials | fixed locally | pending |
| DB6-RET-001 | P2 | Current findings had no retention, legal-hold, or erasure path. | Add bounded retention/data classification/legal-hold/erasure state plus controlled transactional erasure and immutable tombstone/lifecycle events. | pgTAP finding erasure/tombstone fixtures | fixed locally | pending |
| A6/C6-RESEARCH-001 | P2 | Caller-written official/news metadata and caller-computable hashes could mark research supported. | TypeScript always returns broker-authority-unconfigured; SQL ingestion always rejects until a non-caller-mintable service-owned receipt authority is separately reviewed. | R-55, R-56; pgTAP broker-authority-unavailable | fixed locally | pending |
| A6-GRAPH-001 | P2 | Graph evidence used ambient index/worktree bytes while claiming the exact HEAD commit. | Enumerate the exact commit tree and batch-read immutable commit blobs; ignore alternate indexes and working-tree bytes. | R-59 alternate empty-index equivalence | fixed locally | pending |
| C6-SCOPE-001 | P3 | Common provider escalation phrases were not classified. | Expand grammar-independent owner/admin/credential escalation detection while retaining no payload. | R-57 | fixed locally | pending |
| C6-ID-001 | P3 | Model evidence and research source IDs inconsistently accepted dotted secret-shaped values. | Use the closed security-identifier validator for every operational ID. | R-58 | fixed locally | pending |
| A6-STATUS-001 | P3 | Admin copy said “Security-hardened” while canonical status remained in progress. | Admin and intelligence documents now state security hardening is in progress until a fresh exact-head retest passes. | Admin truth guard | fixed locally | pending |

## Seventh exact-head retest findings

The seventh isolated retest reviewed
`ac488bd5302671326ffbe1873f7eb67680e8a6d0`. It confirmed the original
review findings remained closed, but independently found six overlapping P1
classes, three P2 gaps, and one P3 wording gap. The scaffold remains
`security_hardening_in_progress`; no finding is independently closed by the
authoring pass.

| Retest finding | Severity | Exact defect | Corrective implementation | Regression | Status | Independent retest |
|---|---:|---|---|---|---|---|
| A7-SAN-001 / B7-SAN-001 | P1 | Four-layer TypeScript encoding and whitespace-folded SQL base64 could preserve credential-shaped values. | Inspect a six-layer bounded decoding frontier, join folded base64 groups, and fail closed when encoded content remains at the bound. | R-60; pgTAP folded/deep encoding | fixed locally | pending |
| A7-URL-001 / C7-URL-001 | P1 | The exact research fetch accepted deeply percent-, base64url-, or hex-encoded credential query values. | Decode bounded percent/base64url/hex candidates inside the exact pre-DNS path; reject unresolved encoding at the bound. | R-61, R-63 | fixed locally | pending |
| B7-PERCENT-001 | P1 | Double-percent encoded credential material passed SQL classification and the real finding RPC. | Continue the SQL percent frontier even without a base64 candidate and reject residual encoding at the boundary. | pgTAP nested percent classifier/RPC | fixed locally | pending |
| C7-ID-001 | P1 | Operational identifiers accepted dotted and encoded secret-shaped values. | Apply the same recursive secret classifier to tool, call, task, source, capability, model-evidence, and research identifiers; add SQL dotted/hex detection. | R-64; pgTAP dotted/hex classifier/RPC | fixed locally | pending |
| A7-GRAPH-001 | P2 | Hostile `GIT_DIR`/Git configuration could redirect graph evidence away from the reviewed repository. | Use the fixed system Git binary with every ambient `GIT_*` variable removed and read only exact-commit tree/blob bytes. | R-59 | fixed locally | pending |
| C7-TOOL-001 | P2 | Tool-result truncation was caller-declared, allowing retained truncated content to be labeled complete. | Compute truncation from sanitizer boundaries, bind it into the hash, and reject boundary-truncated operational data. | R-65 | fixed locally | pending |
| A7/C7-SCOPE-001 | P2/P3 | Root, full-control, unrestricted-account, and god-mode provider language did not always create an owner-review finding. | Treat explicit privileged-account language as scope expansion regardless of sentence grammar and discard the payload. | R-62, R-66 | fixed locally | pending |

## Eighth exact-head retest findings

The eighth isolated retest reviewed
`565096d76d212511f0e38afcd54a27451e2d3605`. All three lanes found zero P0,
but the combined result remained blocked by six P1 classes, three P2 gaps, and
two P3 wording/attestation gaps after overlap was normalized.

| Retest finding | Severity | Exact defect | Corrective implementation | Regression | Status | Independent retest |
|---|---:|---|---|---|---|---|
| A8-SHORT-ENC-001 | P1 | Credential strings shorter than the 16-character base64 candidate floor survived one-to-seven encoding layers. | Lower the reviewed UTF-8 candidate floor to eight characters and reject any still-recursive value or over-cap frontier. | R-67 | fixed locally | pending |
| A8-ID-001 | P1 | `authorization.*`, `cookie.*`, `private_key.*`, `token.*`, and `bearer.*` operational IDs were accepted. | Expand closed secret-label separators and apply recursive secret/private classification to every operational ID. | R-64, R-69 | fixed locally | pending |
| A8-URL-001 | P1 | `access[token]`, dotted authorization parameters, short encodings, and 140-decoy frontier saturation reached DNS. | Recognize bracket/dotted labels, decode short candidates, and reject a frontier exceeding the reviewed cap before DNS. | R-68 | fixed locally | pending |
| B8-FOLD-001 | P1 | Legal arbitrary whitespace folding and percent-wrapped folded base64 bypassed SQL classification and the finding RPC. | Scan a bounded whitespace-free candidate view at every decoding layer and fail closed when candidate counts exceed the cap. | pgTAP folded separator/width/depth matrix and RPC denial | fixed locally | pending |
| B8-PRIVATE-001 | P1 | Encoded email/IP/phone and split/nested private JSON persisted through current-state paths. | Re-scan every decoded SQL/TypeScript candidate for private identifiers; reject aggregate reconstructed private data and encoded operational IDs. | R-69; pgTAP encoded/split private matrix | fixed locally | pending |
| C8-PERCENT-001 | P1 | A coincidental base64 candidate replaced the active SQL percent frontier, allowing layer-nine input to persist. | Preserve percent and base64/hex branches together and reject either branch at the depth boundary. | pgTAP percent layers 1–12 and finding RPC | fixed locally | pending |
| A8-GRAPH-001 | P2 | A hostile `.git` pointer could make a local graph proof attest an unreviewed commit. | Require an externally supplied exact commit and compare it with repository HEAD; CI binds the value to trusted `github.sha`. | expected-commit mismatch regression; architecture guard/proof | fixed locally | pending |
| C8-SCOPE-001 | P2/P3 | Sudo, break-glass, hyphen/underscore god-mode, and encoded provider escalation language were retained. | Run escalation detection over bounded decoded candidates and recognize explicit emergency/privileged identity language. | R-70 | fixed locally | pending |
| B8-TYPED-DATA-001 | P3 | Stricter generic decoding initially rejected independently constrained SHA-256 and typed task UUID fields. | Keep generic metadata fail-closed while handling hashes/UUIDs only in exact typed constraints with independent format validation. | full pgTAP budget/rollback lifecycle | fixed locally | pending |
