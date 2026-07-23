# Cognitive Database, RLS, Migration, and Control-Plane Review

Reviewer lane: **Reviewer B — database, RLS, migration, and control plane**

Reviewed implementation commit: `bd8fd0c709db8ff843b69fa9b9a5039a74d09a94`

Reviewed base commit: `deb8996bd720893c877b3bf03accd54e54802489`

Review context: isolated worktree `/tmp/chillywood-cognitive-review-b`, branch `codex/cognitive-review-b-temp`

Review date: 2026-07-22

Decision: **DATABASE_RLS_CHANGES_REQUIRED**

## Scope, independence, and safety

This pass began at the exact implementation commit above and did not read the conclusions of Reviewers A, C, or D. It attempted to disprove the database and control-plane claims through catalog inspection, local reset/pgTAP, direct role tests, concurrent transactions, representative `EXPLAIN`, source comparison with the existing autonomous approval plane, and sanitized read-only linked-state checks. No implementation source was changed. The only added files are this report and two review-only local reproduction fixtures.

No P0 was found. No production mutation was performed. The cognitive migration and functions remain undeployed; no scheduler or production credential was added or used. Remote checks emitted only sanitized presence results. Review fixtures contain no secrets, private user data, or remote connection material.

## Executive result

The migration is additive, creates exactly 20 tables, enables and forces RLS on all 20, denies `anon`, denies ordinary authenticated writes, restricts authenticated reads to the existing Owner/Admin (`operator`) predicate, and makes seven evidence/event tables append-only even against the service role. The two new functions are security invoker functions with fixed empty search paths and restricted execution grants. Those are material strengths.

The foundation is not structurally ready to merge as its asserted database/control-plane contract. Two P1 findings and seven P2 findings were reproduced. The principal failures are that task/platform isolation cannot be represented across most of the schema, and cognitive approval/execution state is not bound to the existing autonomous approval system or a database-enforced state machine. A service writer can create synthetic approval identifiers, set `preflight_passed`, link an Android run to an iOS plan, mark it completed, and create a completion-supporting evaluation without a run. These rows do not execute anything at the reviewed undeployed state, but they would be unsafe authority inputs for a future executor.

## Reproduction summary

| Check | Result |
|---|---|
| Exact commit and isolated branch | MATCH |
| `supabase db reset` through the cognitive migration | PASS |
| Repository database pgTAP | PASS — 8 files, 329 tests |
| Reviewer B adversarial pgTAP | PASS — 47 assertions (the assertions reproduce both safe and unsafe observed behavior) |
| Seven two-session dedupe races | MATCH — one row survives each unique-key race; second insert fails |
| Cognitive table count | 20 |
| Catalog inventory | 20 tables, 20 policies, 80 indexes, 186 constraints, 7 immutability triggers, 2 functions, 1 enum |
| Base-without-cognitive reset | PASS through `20260719220000`; cognitive tables MISSING |
| Non-cognitive pgTAP with migration absent | PASS — 7 files, 285 tests |
| Linked cognitive migration state | MISSING remotely |
| Linked cognitive/intelligence Edge Function name | MISSING remotely |
| Linked cognitive/intelligence scheduler marker | MISSING remotely |
| Linked production model-key-like secret name | MISSING remotely |
| Linked cognitive tool-credential-like secret name | MISSING remotely |

The local Supabase CLI was `2.75.0`; current Supabase documentation was checked separately. The version gap did not affect the catalog, privilege, transaction, or SQL behaviors reproduced here, but the complete suite should be repeated with the repository's pinned CI version before deployment.

## B1 — Migration inventory

The migration creates one enum (`cognitive_platform`), two security-invoker functions, 20 ordinary tables, 80 indexes (four per table: primary key, unique dedupe key, platform/status/created index, and partial expiry index), 20 SELECT policies, 186 constraints, and seven immutability triggers. It creates no view, materialized view, client RPC, cognitive sequence, scheduler, extension, or default-privilege alteration. All tables are owned by `postgres` in the local catalog.

Common controls for every table:

- Sensitive common columns are `summary` and `evidence_metadata`; every table also has `platform`, free-form `status`, `private_user_data_used`, nullable `retention_until`, nullable `expires_at`, and timestamps.
- `anon` and `public` receive no table DML. `authenticated` receives SELECT only, filtered by one policy calling `public.has_platform_role(ARRAY['owner','operator'])`. `service_role` receives SELECT/INSERT/UPDATE/DELETE initially; UPDATE/DELETE is then revoked on the seven immutable tables.
- RLS and FORCE RLS are enabled on all 20 tables. The service role remains a PostgreSQL `BYPASSRLS` role locally, as is normal for Supabase; its restriction therefore depends on grants and trusted server-side custody, not RLS.
- Retention is metadata only: it is nullable and no deletion/retention job or legal-hold mechanism is created.
- Specialized foreign keys use PostgreSQL's default `NO ACTION` delete behavior. No migration FK uses `ON DELETE CASCADE`.

### Table-by-table matrix

| Table | Purpose and sensitive/special columns | Writer / reader | RLS, policy, grants | Indexes beyond common key indexes | Retention, deletion, classification, dependencies |
|---|---|---|---|---|---|
| `intelligence_tasks` | Root task state | service / Owner+Admin | forced; one role-only SELECT policy | common only | nullable metadata; service mutable/deletable; current state; no parent |
| `research_sources` | Source provenance; URL/reference, publisher, dates, source/citation metadata | service append / Owner+Admin | forced; role-only read; service update/delete revoked | common only | nullable; trigger blocks update/delete; immutable evidence; no task parent |
| `research_claims` | Claim text, confidence, freshness, contradiction, `source_ids uuid[]` | service append / Owner+Admin | forced; role-only read; service update/delete revoked | common only | nullable; immutable evidence; source UUIDs have no FK; no task parent |
| `knowledge_entities` | Learned entity summary/metadata | service / Owner+Admin | forced; role-only read | common only | nullable; mutable/deletable current state; no task parent |
| `knowledge_relationships` | Entity graph edge and type | service / Owner+Admin | forced; role-only read | common only | nullable; mutable; FKs to two entities, no self-edge |
| `architecture_components` | Architecture graph component state | service / Owner+Admin | forced; role-only read | common only | nullable; mutable/deletable current state; no task parent |
| `architecture_dependencies` | Architecture graph edge and type | service / Owner+Admin | forced; role-only read | common only | nullable; mutable; FKs to two components, no self-edge |
| `decision_records` | Decision summary/evidence metadata | service / Owner+Admin | forced; role-only read | common only | nullable; mutable/deletable record; no task parent |
| `hypotheses` | Hypothesis current state | service / Owner+Admin | forced; role-only read | common only | nullable; mutable/deletable; no task parent |
| `solution_candidates` | Candidate current state | service / Owner+Admin | forced; role-only read | common only | nullable; mutable/deletable; no task parent |
| `experiments` | Experiment state; hypothesis FK; activation hard-false | service / Owner+Admin | forced; role-only read | common only | nullable; mutable/deletable; optional hypothesis parent |
| `experiment_results` | Result evidence | service append / Owner+Admin | forced; role-only read; service update/delete revoked | common only | nullable; immutable evidence; no experiment FK and no task parent |
| `execution_plans` | Branch/path/tool allowlists, budgets, rollback, two approval UUIDs | service / Owner+Admin | forced; role-only read | common only | nullable; mutable/deletable current context; no task/approval parent |
| `execution_runs` | Plan execution record; four production-impact flags hard-false | service append / Owner+Admin | forced; role-only read; service update/delete revoked | common only | nullable; immutable evidence; FK to plan, but platform not matched |
| `evaluation_results` | Evaluator flags, blockers, completion assertion | service append / Owner+Admin | forced; role-only read; service update/delete revoked | common only | nullable; immutable evidence; optional run FK; unlinked completion allowed |
| `lessons` | Learning summary/evidence metadata | service / Owner+Admin | forced; role-only read | common only | nullable; mutable/deletable learned state; no field allowlist/task parent |
| `playbooks` | Playbook summary/evidence metadata | service / Owner+Admin | forced; role-only read | common only | nullable; mutable/deletable current state; no task parent |
| `model_invocations` | Model label, token counts, cost, prompt policy version, summary/evidence | service append / Owner+Admin | forced; role-only read; service update/delete revoked | common only | nullable; immutable invocation evidence; no task/evidence FK |
| `tool_invocations` | Tool name, text-array scope, call number, high-risk hard-false | service append / Owner+Admin | forced; role-only read; service update/delete revoked | common only | nullable; immutable invocation evidence; no task/capability/approval/provider FK |
| `intelligence_budgets` | Optional task, ceilings and consumption | service / Owner+Admin | forced; role-only read | common only | nullable; mutable/deletable current state; nullable task FK |

Source: `supabase/migrations/20260723001845_cognitive_intelligence_foundation.sql:5-196`; catalog assertions: `docs/reviews/fixtures/cognitive_database_adversarial_review.sql:22-98`.

## B2 — RLS and grants

- `anon`: no SELECT/INSERT/UPDATE/DELETE grant on any cognitive table.
- ordinary `authenticated`: SELECT grant exists, but reads zero rows without Owner/Admin membership; INSERT is denied with SQLSTATE `42501`; UPDATE/DELETE are likewise ungranted.
- Owner: reads all cognitive rows across all platforms.
- scoped Admin: the existing public-facing Admin role is `operator`; it reads all cognitive rows across all platforms because the policy is role-only, not task/platform scoped.
- `super_admin`: reads zero cognitive rows because it is omitted from the policy, despite being recognized by the existing approval plane.
- `service_role`: can read/insert all tables and update/delete 13 mutable tables; it cannot update/delete the seven immutable tables through grants, and the trigger also blocks a privileged PostgreSQL owner.
- No cognitive view, sequence, or RPC reopens access. Client roles cannot CREATE in `public`. The migration does not alter default privileges.

The RLS predicate calls the pre-existing function with an explicit schema. A hostile `pg_temp.has_platform_role` replacement did not bypass it. That existing helper is SECURITY DEFINER with `search_path = public` and performs exact active-role lookup (`supabase/migrations/202604190004_baseline_current_schema_truth.sql:581-602`). The direct client role tests are in `docs/reviews/fixtures/cognitive_database_adversarial_review.sql:100-147`.

## B3 — Security-definer functions

The cognitive migration introduces no SECURITY DEFINER function. `cognitive_json_is_sanitized(jsonb)` and `reject_cognitive_evidence_mutation()` are security invoker, fix `search_path` to the empty string, use no dynamic SQL, and revoke PUBLIC/anon/authenticated execute before granting service-role execute. Their internal expressions do not resolve user-selected relations or functions. A `pg_temp` function-shadow attempt did not affect the schema-qualified RLS helper. No overloaded cognitive function or user-controlled resolution path was found.

This is a pass for the new functions. It does not cure the data-model/control-plane findings below.

## B4 — Task, tenant, and platform isolation

The database cannot enforce the claimed isolation. Eighteen downstream tables have no `task_id`; the only downstream `task_id` is nullable on `intelligence_budgets`; no cognitive table has a tenant key. All 20 have a platform enum, but neither policies nor relationships require platform equality. An Admin fixture read both iOS and Android tasks, and an Android execution run was accepted against an iOS execution plan. See COG-B-001.

## B5 — Immutable evidence

Direct update/delete is correctly blocked for research sources, research claims, experiment results, execution runs, evaluations, model invocations, and tool invocations. Parent deletion is `NO ACTION` where an FK exists, so the reviewed FKs do not cascade-delete child evidence.

The immutable run does not snapshot or protect its plan. The service writer changed status, branch, allowed paths, and rollback text on the referenced plan after inserting the immutable run. A later reader therefore sees mutable context as if it were the context of immutable execution evidence. There is also no task link for most evidence. See COG-B-003.

## B6 — Dedupe and concurrency

Each `dedupe_key` is globally unique per table. Two concurrent inserts for identical task, source/evidence, claim, hypothesis, run, evaluation/finding, and lesson keys produced one committed row and one unique-constraint failure; no duplicates, partial rows, or deadlocks were observed. However, the keys are not task-scoped, the losing occurrence is discarded, and there is no occurrence counter or conflict-safe reconciliation operation. See COG-B-007.

Reproduction: `docs/reviews/fixtures/run-cognitive-dedupe-races.sh`.

## B7 — State machines

The common `status` constraint checks only string length. There is no allowed-status or transition constraint for tasks, claims, hypotheses, experiments, plans, runs, evaluations, capabilities (which are not modeled), lessons, or playbooks. Local transactions accepted denied-to-executing, direct preflight-passed plan creation, direct completed run creation, and an approved completion-supporting evaluation without an execution run. Expired rows remain pending and exhausted budgets remain writable. See COG-B-002 and COG-B-009.

## B8 — Secret, PII, and prompt storage

The JSONB check blocks a private-key header, six exact sensitive key names, and two live-key prefixes. It does not reject common nested keys such as `api_key`, `access_token`, or `signed_url`; all three sanitized fixtures were accepted. A 1 MiB JSONB value was accepted. Text columns such as claim, publisher, source reference, rollback plan, model label, and tool name do not use the JSON sanitizer. `private_user_data_used = false` is a caller-supplied invariant, not content-derived: private-user-derived fixture text was accepted with the flag false. No prompt/output-specific retention or redaction enforcement exists. See COG-B-004.

## B9 — Retention and erasure

All 20 `retention_until` fields are nullable. No retention worker, deletion state, legal hold, account/user provenance, erasure queue, or archive boundary is defined. Seven tables are permanently update/delete blocked, including source and model/tool evidence, so any private user-derived material accidentally stored there has no designed erasure route. A lawful basis and policy for immutable security evidence versus deleted-user data are owner/counsel decisions; this report makes no legal-compliance conclusion. See COG-B-005.

## B10 — Performance and denial of service

With 5,000 local fixture rows, a representative platform/status/order query used the common composite index. Representative freshness-expiry, `uuid = ANY(source_ids)`, sparse `plan_id`, and `retention_until` queries used sequential scans. Catalog inspection found no leading indexes for specialized FK columns on relationships, architecture dependencies, experiments, runs, evaluations, or budgets. JSONB is unbounded, arrays are unbounded, and there is no per-task fan-out constraint. See COG-B-008.

## B11 — Approval and execution control plane

The existing autonomous control plane has a real approval request keyed by system/action, constrained states and Level 3/4 approval, expiry, write/forbidden scopes, rollback/kill/proof plans, no-self-approval, and append-only events (`supabase/migrations/20260711173119_autonomous_approval_requests.sql:3-112`). Its execution function checks approved state, exact system/action, expiry, emergency state, and a fresh post-approval preflight (`supabase/migrations/20260711185503_autonomous_approval_live_flow.sql:541-616`).

The cognitive plan has two unconstrained UUIDs named as approvals but no FK to that system, no task ID, no approval status/expiry/scope linkage, and no fresh-preflight linkage. Cognitive status values can be written directly. Tool invocations have none of `capability_id`, `task_id`, provider, repository, branch, issue time, nonce, revocation, or approval ID. A cognitive row must not be treated as a substitute for the autonomous approval system. See COG-B-002.

## B12 — Deployment and rollback safety

Read-only linked checks established:

- Remote migration history matches local migrations through `20260719220000`; local migration `20260723001845` has no remote counterpart.
- A cognitive/intelligence Edge Function name is MISSING.
- A cognitive/intelligence scheduler marker is MISSING.
- Production model-key-like and cognitive tool-credential-like secret names are MISSING.

No linked dry run was executed because direct migration-history comparison already established absence and no remote mutation or extra connection risk was needed. No migration/function deployment, scheduler action, credential operation, or production write occurred.

The migration is additive. A disposable reset stopped at `20260719220000`, confirmed cognitive tables MISSING, and passed all seven non-cognitive pgTAP files (285 tests). This includes the existing autonomous/Owner Command database coverage. Static source inspection found no ordinary Owner Command dependency on a cognitive table. Therefore existing behavior survives complete cognitive-schema absence in the exercised local baseline. Partial deployment is not independently safe: the dynamic loop is transactional within the migration, but a future application/executor consuming only some objects has no compatibility gate; deployment must remain blocked pending remediation and explicit owner-approved forward promotion/rollback planning.

## Findings

### COG-B-001 — P1 — Task, tenant, and platform isolation cannot be enforced

- **Reviewer lane:** B
- **Affected file and line:** `supabase/migrations/20260723001845_cognitive_intelligence_foundation.sql:49-76, 94-164`; conflicting application contract at `_lib/cognitivePlatformFoundation.ts:53-68`
- **Affected component:** all cognitive persistence and RLS
- **Violated contract:** one task must not read or mutate another task's data; platform scope must not cross; exact task/platform scope is required.
- **Exact evidence:** 18 downstream tables have no `task_id`; `intelligence_budgets.task_id` is nullable; no table has a tenant key; every read policy checks only Owner/Admin role. An Admin read both iOS and Android rows. An Android run referencing an iOS plan inserted successfully.
- **Reproduction:** run assertions at `docs/reviews/fixtures/cognitive_database_adversarial_review.sql:118-179,200-208` after local reset.
- **Exploit/failure scenario:** a service task or Admin query intended for one task/platform selects, correlates, or writes evidence belonging to another; a capability/approval for iOS is represented as an Android execution record.
- **Impact:** cross-task evidence contamination and cross-platform authority confusion; tenant isolation cannot be added at the policy layer because the key is absent.
- **Likelihood:** high if deployed/consumed; no current production exposure because the migration is undeployed.
- **Recommended remediation:** add non-null task ownership to every task-derived row; define whether a separate tenant/user boundary is required; enforce platform equality in relational constraints/functions; scope readback and service operations to exact task/platform; migrate through explicit, audited functions rather than direct broad DML.
- **Required regression test:** two tasks and every platform with positive same-scope access and negative cross-task/cross-platform read/write/link tests for all row types and actor roles.
- **Merge blocker:** yes
- **Deployment blocker:** yes

### COG-B-002 — P1 — Cognitive state can fabricate approval, preflight, execution, and evaluation outcomes

- **Reviewer lane:** B
- **Affected file and line:** `supabase/migrations/20260723001845_cognitive_intelligence_foundation.sql:53-55,117-164`; authoritative comparison `supabase/migrations/20260711173119_autonomous_approval_requests.sql:3-112` and `supabase/migrations/20260711185503_autonomous_approval_live_flow.sql:566-616`
- **Affected component:** task/plan/run/evaluation/tool control plane
- **Violated contract:** database rows cannot directly approve, pass preflight/evaluation, complete execution, bypass emergency stop, or substitute for the existing owner approval system.
- **Exact evidence:** status is any 2–64 character text. Random unrelated UUIDs satisfy the cognitive no-self check; neither approval UUID is an FK. A plan inserted as `preflight_passed`; an Android run linked to its iOS plan and inserted as `completed`; an evaluation with no run inserted as `approved` with `completion_supported=true`. Tool invocation rows have no capability/approval binding columns.
- **Reproduction:** `docs/reviews/fixtures/cognitive_database_adversarial_review.sql:181-223,317-334`.
- **Exploit/failure scenario:** a compromised or buggy service writer manufactures apparently approved/completed cognitive state; a future executor or Admin UI trusts it without consulting the real approval request, fresh preflight, emergency state, or capability.
- **Impact:** self-asserted authority and false completion become structurally representable. If wired to execution, this becomes an approval bypass.
- **Likelihood:** high once any executor consumes these rows; currently dormant because execution is off and undeployed.
- **Recommended remediation:** make the existing autonomous approval request/event plane the only authority; add exact FKs and task/system/action/platform/scope checks; expose narrowly scoped transition functions that lock rows and recheck approval expiry, fresh preflight, emergency state, budgets, and evaluator result; revoke generic service writes to controlled state.
- **Required regression test:** direct DML and every impossible transition must fail; include stale/revoked/wrong-task/wrong-platform approval, emergency-stop race, missing fresh preflight, unlinked evaluation, and capability replay.
- **Merge blocker:** yes
- **Deployment blocker:** yes

### COG-B-003 — P2 — Immutable execution evidence depends on mutable plan context

- **Reviewer lane:** B
- **Affected file and line:** `supabase/migrations/20260723001845_cognitive_intelligence_foundation.sql:117-143,179-195`
- **Affected component:** execution/evaluation audit evidence
- **Violated contract:** immutable evidence must not be silently altered by current-summary updates.
- **Exact evidence:** `execution_runs` is immutable, but its referenced `execution_plans` row is broadly updateable. After inserting a run, the service writer changed the plan's status, branch, path allowlist, and rollback plan. Mutable rows also have no trigger maintaining `updated_at`.
- **Reproduction:** `docs/reviews/fixtures/cognitive_database_adversarial_review.sql:188-223,348-356`.
- **Exploit/failure scenario:** a run executed under one allowed path/rollback plan later appears to have executed under different context, weakening audit and rollback evidence.
- **Impact:** audit interpretation, evaluator conclusions, and incident reconstruction can be falsified without changing the immutable row.
- **Likelihood:** medium after deployment.
- **Recommended remediation:** version/freeze plans once execution begins or snapshot immutable execution inputs (including approvals, scopes, budgets, graph/policy digests, and rollback) into the run; maintain timestamps; record supersession as a new audited version.
- **Required regression test:** mutation of any execution-bound plan field after run creation must fail or leave the run's immutable snapshot/digest unchanged and independently verifiable.
- **Merge blocker:** no
- **Deployment blocker:** yes

### COG-B-004 — P2 — Secret/PII filtering and payload bounds are incomplete

- **Reviewer lane:** B
- **Affected file and line:** `supabase/migrations/20260723001845_cognitive_intelligence_foundation.sql:7-17,51-62,81-99,117-164`
- **Affected component:** prompts, research, logs, summaries, and metadata storage
- **Violated contract:** no credential, signed URL, private prompt/output, or private-user material may be stored; metadata must be bounded and recursively sanitized.
- **Exact evidence:** JSON keys `api_key`, `access_token`, and `signed_url` returned sanitized=true; a 1 MiB JSONB value inserted; private-user-derived fixture text inserted while `private_user_data_used=false`; large text fields bypass the JSON function.
- **Reproduction:** `docs/reviews/fixtures/cognitive_database_adversarial_review.sql:270-293`.
- **Exploit/failure scenario:** nested or alternatively named credentials and private text enter immutable evidence, where clients with Owner/Admin role can read them and no deletion route exists.
- **Impact:** credential/PII retention and denial-of-service through oversized JSON/text.
- **Likelihood:** medium to high for model/tool/provider text if deployed.
- **Recommended remediation:** perform recursive allowlist validation and normalization before persistence; cover credential aliases/encoded forms without relying only on regex; bound bytes/depth/array length for JSONB and all text; separate hashed/audited metadata from raw private content; make privacy classification server-derived.
- **Required regression test:** nested, case-varied, encoded, aliased credential/PII fixtures plus maximum byte/depth/array tests across every storage-capable column.
- **Merge blocker:** yes
- **Deployment blocker:** yes

### COG-B-005 — P2 — Retention and erasure are metadata-only and conflict with immutable storage

- **Reviewer lane:** B
- **Affected file and line:** `supabase/migrations/20260723001845_cognitive_intelligence_foundation.sql:58-60,179-195`
- **Affected component:** all cognitive storage, especially seven immutable tables
- **Violated contract:** distinguish audit evidence, expiring research, logs, private-user data, legal hold, and account erasure.
- **Exact evidence:** all 20 retention fields are nullable; no enforcement job/state/legal hold/user provenance exists; seven tables reject every update/delete.
- **Reproduction:** catalog assertion `docs/reviews/fixtures/cognitive_database_adversarial_review.sql:336-346`; attempt delete on immutable source at lines 245-268.
- **Exploit/failure scenario:** deleted-user or copyrighted/private content persists indefinitely in immutable evidence, or an ad hoc cleanup destroys required audit context elsewhere.
- **Impact:** unresolvable privacy/retention conflict and operational growth.
- **Likelihood:** medium once real data is accepted.
- **Recommended remediation:** owner/counsel must define retention classes and lawful bases; encode non-null class-specific deadlines, legal hold, subject provenance, audited redaction/tombstone behavior, and bounded deletion jobs while preserving required cryptographic/audit facts.
- **Required regression test:** expiry, legal hold, account erasure, immutable audit tombstone, parent restriction, and failed/partial retention-job cases.
- **Merge blocker:** no
- **Deployment blocker:** yes

### COG-B-006 — P2 — Research provenance references are not relationally valid

- **Reviewer lane:** B
- **Affected file and line:** `supabase/migrations/20260723001845_cognitive_intelligence_foundation.sql:81-99`
- **Affected component:** research claims/evidence provenance
- **Violated contract:** every claim must retain valid source references and evidence/conclusions must remain separable.
- **Exact evidence:** `research_claims.source_ids` is an unconstrained UUID array. A claim referencing a nonexistent UUID inserted successfully; no claim-to-source join table or task/platform match exists.
- **Reproduction:** `docs/reviews/fixtures/cognitive_database_adversarial_review.sql:225-233`.
- **Exploit/failure scenario:** a conclusion is displayed as sourced while every source ID is missing, belongs to another task/platform, or cannot be protected/reconciled relationally.
- **Impact:** unverifiable provenance and cross-task evidence association.
- **Likelihood:** high under ordinary application bugs.
- **Recommended remediation:** normalized immutable claim-source association rows with FKs, exact task/platform constraints, source-role metadata, and no mutation of contradictory evidence.
- **Required regression test:** nonexistent, cross-task, cross-platform, duplicate, removed-parent, and contradiction-preservation cases.
- **Merge blocker:** yes
- **Deployment blocker:** yes

### COG-B-007 — P2 — Global dedupe rejects races but loses occurrence and scope semantics

- **Reviewer lane:** B
- **Affected file and line:** `supabase/migrations/20260723001845_cognitive_intelligence_foundation.sql:51-54`
- **Affected component:** task, research, hypothesis, execution, evaluation, and learning ingestion
- **Violated contract:** deterministic concurrent dedupe must avoid wrong-task merge, lost occurrence count, partial state, and unbounded retry.
- **Exact evidence:** seven two-session races each yielded one row and one unique violation. No `occurrence_count` exists. The key is unique globally per table rather than within an explicit task/platform scope.
- **Reproduction:** `docs/reviews/fixtures/run-cognitive-dedupe-races.sh:15-111`.
- **Exploit/failure scenario:** a legitimate same-key event for another task is rejected or merged by application retry, while repeated evidence occurrences are silently lost.
- **Impact:** incomplete frequency/audit data and wrong-scope reconciliation pressure.
- **Likelihood:** medium under parallel ingestion.
- **Recommended remediation:** define canonical scoped dedupe dimensions; provide atomic `INSERT ... ON CONFLICT` reconciliation that increments occurrence/audit metadata without rewriting immutable facts; cap retries and test lock ordering.
- **Required regression test:** parallel same-task and cross-task cases with exact occurrence count, no deadlock, no partial row, bounded retries, and immutable history.
- **Merge blocker:** no
- **Deployment blocker:** yes

### COG-B-008 — P2 — Specialized query indexes and fan-out/size controls are absent

- **Reviewer lane:** B
- **Affected file and line:** `supabase/migrations/20260723001845_cognitive_intelligence_foundation.sql:53,65-66,94-164`
- **Affected component:** research freshness, graph traversal, plan/run evaluation, retention, and high-volume events
- **Violated contract:** representative cognitive queries must avoid unbounded scans/graphs and denial-of-service growth.
- **Exact evidence:** 5,000-row local `EXPLAIN` used sequential scans for freshness, source-array membership, sparse run-plan lookup, and retention; no leading specialized FK indexes were found; JSONB/arrays and per-task fan-out are unbounded.
- **Reproduction:** catalog index assertion at `docs/reviews/fixtures/cognitive_database_adversarial_review.sql:358-366`; repeat representative `EXPLAIN (ANALYZE, BUFFERS)` after 5,000 fixture rows.
- **Exploit/failure scenario:** event volume or oversized metadata makes freshness, retention, relationship, and audit queries scan growing tables and hold resources.
- **Impact:** degraded Admin/control-plane availability and costly retention/graph operations.
- **Likelihood:** medium; workload dependent.
- **Recommended remediation:** document real query shapes; add justified FK/freshness/retention indexes; normalize source associations; enforce byte/depth/fan-out caps; use advisor results and representative scale/load tests before deployment.
- **Required regression test:** query-plan thresholds and bounded ingestion/fan-out at deployment-scale fixtures, including sparse FK cases.
- **Merge blocker:** no
- **Deployment blocker:** yes

### COG-B-009 — P2 — Budgets and learned policy-like content are broadly mutable

- **Reviewer lane:** B
- **Affected file and line:** `supabase/migrations/20260723001845_cognitive_intelligence_foundation.sql:51-62,158-164`; source policy `_lib/cognitivePlatformFoundation.ts:119-139`
- **Affected component:** budget enforcement and safe learning
- **Violated contract:** a task cannot reset its budget; learning cannot alter approval levels or forbidden scope.
- **Exact evidence:** service DML reset an exhausted budget, raised its caps, and zeroed consumption. A lesson containing `approval_level` and `forbidden_scope` inserted even though the source policy names both forbidden. No database constraint binds lessons to allowed fields or budgets to immutable owner-approved ceilings.
- **Reproduction:** `docs/reviews/fixtures/cognitive_database_adversarial_review.sql:276-280,301-315`.
- **Exploit/failure scenario:** a buggy/compromised writer erases spend/call evidence or persists a malicious lesson that a later router interprets as authority policy.
- **Impact:** cost/loop enforcement and learning authority become unreliable if database state is trusted.
- **Likelihood:** medium after consumers exist; no current executor is active.
- **Recommended remediation:** split immutable budget ceilings/ledger events from derived balance; only atomic controlled functions consume budget; link ceiling changes to fresh owner approval; use typed lesson fields with database allowlists and reject policy/authority keys recursively.
- **Required regression test:** concurrent budget consumption, exhausted/negative/overflow/reset attempts, ceiling-change approval, and nested/encoded forbidden lesson fields.
- **Merge blocker:** yes
- **Deployment blocker:** yes

### COG-B-010 — P3 — Super-admin readback is omitted while Admin readback is global

- **Reviewer lane:** B
- **Affected file and line:** `supabase/migrations/20260723001845_cognitive_intelligence_foundation.sql:69-75`; role definition `supabase/migrations/202605140008_platform_staff_role_management.sql:1-4`
- **Affected component:** cognitive Admin readback
- **Violated contract:** owner/admin readback must be minimal, explicit, and consistent with the owner/super-admin approval plane.
- **Exact evidence:** policies allow `owner` and `operator` only. The `operator` is the public-facing Admin role and reads all platforms; a `super_admin` fixture reads zero rows.
- **Reproduction:** `docs/reviews/fixtures/cognitive_database_adversarial_review.sql:118-147`.
- **Exploit/failure scenario:** a super-admin responsible for approval cannot inspect cognitive evidence, while a less clearly scoped Admin role receives global readback.
- **Impact:** operational inconsistency; safe denial for super-admin but overbroad/unclear Admin scope.
- **Likelihood:** high if the UI is deployed unchanged.
- **Recommended remediation:** owner must decide exact cognitive read roles and platform/task scope; encode that scope explicitly and align it with the established approval role model.
- **Required regression test:** full role matrix for normal user, Owner, scoped Admin, super-admin, moderator, and revoked membership across tasks/platforms.
- **Merge blocker:** no
- **Deployment blocker:** yes

## Finding counts and blockers

| Severity | Count | IDs |
|---|---:|---|
| P0 | 0 | — |
| P1 | 2 | COG-B-001, COG-B-002 |
| P2 | 7 | COG-B-003 through COG-B-009 |
| P3 | 1 | COG-B-010 |

Merge blockers in this lane: COG-B-001, COG-B-002, COG-B-004, COG-B-006, COG-B-009. Every finding except the purely source-review merge choice remains a deployment blocker until remediated and retested; this review does not authorize migration deployment.

Recommended remediation order:

1. Bind all state to exact task/platform/tenant requirements and the existing autonomous approval/capability/emergency control plane.
2. Implement database-enforced state transitions, immutable execution snapshots, and append-only budget ledgers.
3. Normalize provenance and enforce recursive bounded storage/privacy controls.
4. Obtain owner/counsel retention decisions and implement erasure/legal-hold behavior.
5. Add scoped atomic dedupe and workload-derived indexes/fan-out caps.
6. Align the explicit human read-role matrix, then repeat every role, race, failure, absence, and performance test.

## Official references used

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)
- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase database advisors](https://supabase.com/docs/guides/database/database-advisors)
- [PostgreSQL current row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [PostgreSQL current constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [PostgreSQL current `CREATE FUNCTION`](https://www.postgresql.org/docs/current/sql-createfunction.html)

## Reviewer B decision

**DATABASE_RLS_CHANGES_REQUIRED**

This decision is for the exact undeployed source foundation only. It is not approval to merge, deploy the migration, deploy a function, activate a scheduler, add credentials, grant tool authority, or execute production actions.
