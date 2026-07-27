# Cognitive Level 0/1 staged-activation exact review

Status: review-only; never merge.

## Exact source

- implementation branch:
  `codex/cognitive-level01-staged-worker-activation`
- implementation commit:
  `844056f429e2aa4185399d981780b9473a06443c`
- implementation tree:
  `de3c1c716894ab39dc85ef5e2155471472b9565c`
- reviewed and deployed Worker source commit:
  `6b9d7da6b8bb0d707a92fa19bd0058529e6e0a6a`
- reviewed and deployed Worker source tree:
  `cc040ff917f762d2c3d5e944202a00f7c68734cb`
- reviewed Worker source graph SHA-256:
  `d9a1b788775f358912946920106442036105e4f66b5bf72eb64518b1ee5b9a6f`
- reviewed Worker source graph files: `71`
- base commit:
  `1bb99451ca10716f9988d5258fff09b14495b334`

The reviewed implementation is the exact head of draft implementation PR #44.
This review branch carries that exact implementation plus this review record
and must never be merged.

## Remediated review finding

The first remote prerequisite readback found one P1: the assertion table,
operation allowlist, evaluator-proof constraints, and runtime RPCs accepted
`cognitive_product_quality_evaluator`, but the authenticated Owner registration
RPC had not added that identity to its exact registration allowlist.

Implementation commit `3e6a58973dfb46d1e7db7d1eac2fdf8de94f004c`
closes the finding with new forward-only migration
`20260727152710_cognitive_product_quality_evaluator_owner_registration.sql`.
No historical migration was edited. The existing full Option C persistence
pgTAP now uses the isolated product-quality evaluator identity and passes
`46/46` locally. The current unresolved P1 count is `0`.

A second fail-closed review gap was found before remote deployment: the live
control task had zero decision manifests, while the generic Owner approval RPC
correctly required verified model-independence evidence. Reusing that generic
path would either block provider-independent Option C or falsely claim that a
model council had run.

Implementation commit `c0d6e8f5b403324fff2d12e89d456f9cbe5e4e38`
adds only a dedicated provider-independent Option C Owner receipt and approval
path. It does not amend the generic model gate. The dedicated path is bound to
the exact repository, activation branch, reviewed Worker source-graph hash,
independent-review hash, full-test hash, Option C identifier/name/hash, one
execution, zero provider cost, empty mutation scopes, and the separate
`cognitive_product_quality_evaluator`. Its decision status is explicitly
`PROVIDER_INDEPENDENT_OWNER_SELECTION_REVIEWED`; it never claims
`MODEL_INDEPENDENCE_VERIFIED`. New focused pgTAP passes `22/22`, and the clean
full suite passes `1344/1344`. The current unresolved P1 count remains `0`.

A live pre-claim Worker canary then found a third P1: Hyperdrive documents an
initial connection timeout of up to 15 seconds, but the isolated database port
cancelled its startup at 5 seconds. Direct LOGIN and the exact claim succeeded
inside a rolled-back transaction, while the Worker consistently reached the
five-second cancellation boundary. Implementation commit
`9cbe4b2c3d8ab5a1c18cf9bea99391faa8605da6` aligns only the initial database
connection allowance to 15 seconds; per-operation execution deadlines remain
bounded and unchanged. A dedicated regression assertion and the isolated
runtime suite pass `134/134`.

The original Option C approval version 1 was still unclaimed with no execution
row and no effective baseline. It was not rewritten. Implementation commit
`a54c04518f85f17a9983e0bbe7699463262537e1` adds a forward-only,
authenticated exact-Owner amendment that may supersede that one unclaimed
version with one source-amended version 2. The immutable receipt binds the
exact prior commit, authenticated final commit and tree, the hard-coded repaired
Worker graph, independent review, tests, plan snapshot, and rollback evidence.
It rejects non-Owners, source-graph drift, any prior claim or execution, replay,
and emergency stop. Focused pgTAP passes `13/13`; the clean full suite passes
`1357/1357`. The current unresolved P1 count remains `0`.

The 15-second canary exposed a fourth P1 at the actual Hyperdrive boundary:
the isolated runtime overrode Hyperdrive's dynamic Postgres connection string
with `ssl: "require"`. That caused a second client-side TLS negotiation inside
Cloudflare's Hyperdrive tunnel; the connection never reached the database
claim, while direct LOGIN and the exact claim continued to pass. Implementation
commit `808ec0dba45f8f1e349859e5919c17a4a3236ae0` removes only that override
and leaves origin TLS under the reviewed Hyperdrive configuration. A static
regression proves the Worker does not override the dynamic connection string.

The source change did not rewrite or claim Option C approval version 2.
Implementation commit `6b9d7da6b8bb0d707a92fa19bd0058529e6e0a6a`
adds forward-only migration
`20260727163000_cognitive_option_c_unclaimed_tls_source_revision.sql`.
Its authenticated exact-Owner RPC can create version 3 only while version 2 is
active, unclaimed, and has no execution. The immutable receipt binds both prior
source versions, the exact final commit/tree/Worker graph, review/test/plan and
rollback hashes, and a one-claim non-live execution. Non-Owner, graph-drift,
claimed, executed, replay, mutation, and emergency-stop paths fail closed.
Focused source-revision pgTAP passes `20/20`; the clean full suite passes
`1364/1364`. The current unresolved P1 count remains `0`.

A fifth fail-closed review gap was found before any switch was enabled: the
visual collector correctly required its own switch, while the generic switch
activation path correctly required already-persisted canaries. A simple switch
flip would have broken the reviewed two-party path, and a time-bounded flip
without a table-boundary expiry check could have left a stale enabled flag
operational after authorization expiry.

Implementation commit `78e84e16921cfd486b125a1ade98a4a240db28c5`
adds only forward migration
`20260727170000_cognitive_provider_independent_visual_canary_activation.sql`.
Its authenticated exact-Owner RPC can open only the visual sentinel switch,
for at most 30 minutes, after the completed Option C version 3 chain, one
effective baseline, all four core service identities, active emergency state,
and zero sibling switches or schedules. It binds the immutable receipt to the
reviewed deployed Worker commit, tree, source graph, review, tests, deployment
plan, and rollback evidence. The existing persisted-run trigger is replaced
forward-only so an expired authorization rejects new collection even if the
audit switch row has not yet been finalized; an expired authorization remains
explicitly rollbackable. Retaining the switch requires consumed independent
detection, no-finding, and resolution proofs, triage, a resolved finding, an
emergency pause/resume drill, and zero sibling switches or schedules. The
migration creates no authorization or outcome and enables nothing.

Focused activation pgTAP passes `18/18`; the clean full suite passes
`1382/1382`; the isolated runtime remains `134/134`. The current unresolved P1
count remains `0`.

The canonical deferred-evidence Manifest V2 retains observations for 30 days,
while the live sentinel evaluator correctly limits a fresh evaluation to 24
hours after observation. Importing historical candidates as fresh sentinel
runs would have fabricated recency. Implementation commit
`f45772f9a145c8363659954d337e7eaa46eefb3b` adds forward-only migration
`20260727171500_cognitive_deferred_evidence_v2_import_receipts.sql`.
It represents the 12 exact sanitized candidates under canonical manifest hash
`665c13f3cad6580348a60fb9a68fd07e0988c192383d06e791d2ab68fad19793`
and records no decision by itself. Only the authenticated exact Owner may
append an idempotent decision after the live core outcome passes. Receipts
preserve `original_observed_at` separately from `imported_at`, reject stale
imports, and hard-bind the reviewed result to 5 eligible imports, 2 deferrals,
and 5 rejections. Premium-gated, physically incomplete, provider-blocked,
audit-only, and newer-evidence-contradicted candidates cannot be imported.
Both candidate and decision tables use forced RLS, immutable triggers, and no
service-role access.

Focused evidence pgTAP passes `13/13`; the clean full suite passes
`1395/1395`.

A sixth fail-closed review gap was found during live-canary preflight before an
authorization was opened: visual-canary finalization correctly required a
consumed `run_no_finding` proof, but the triage function correctly accepted
only the prior route-timing no-finding packet. The combination made the
required visual no-finding consumption unreachable.

Implementation commit `547d50cb7f4f0f714806df18a178df9edb30fc5c`
adds only forward migration
`20260727173000_cognitive_visual_no_finding_triage.sql`. It preserves the
existing authoritative route-timing branch and adds a separate visual branch
that accepts only a passing `touch_target` or `visual_layout` packet already
validated by the bounded and detailed visual validators, with installed or
simulator observation and the exact persisted evidence binding. The immutable
no-finding event derives its non-null binding from the reviewed visual mapping;
callers cannot supply it. A database integration regression performs visual
collection, independent proof persistence, triage consumption, immutable-event
readback, and replay denial. The focused file passes `31/31`; the clean full
suite passes `1398/1398`. The current unresolved P1 count remains `0`.

A seventh fail-closed review gap was found by the first live collection before
any sentinel row was stored. The v1 authorization enabled the shared switch,
while the collector and evaluator correctly required an exact Android/iOS run
and the persistence boundary correctly required a switch matching that run's
platform task. The authorization was rolled back with immutable counts of
zero runs, proofs, consumptions, and findings.

Implementation commit `ba43c9c050ccbcf58aaa85854f31459657de00ae`
adds only forward migration
`20260727181000_cognitive_android_visual_canary_scope.sql`. An authenticated
exact-Owner preparation RPC may restore only the zero-run rollback's disabled
shared policy metadata, then invoke the already-reviewed platform-scope
materializer to create exact disabled Android and iOS tasks and their six
disabled switches. The replacement authorization requires exact Android
collector and triage capabilities, leaves the shared and iOS switches off,
and opens only the Android visual switch. Collection expiry, final proof
counts, emergency pause/resume, resolution, and sibling/schedule denial are
all rebound to the exact Android task and platform. The focused activation
files pass `35/35`; the clean full suite passes `1415/1415`. The current
unresolved P1 count remains `0`.

An eighth fail-closed live gap was found after the Android authorization opened
but before any sentinel row was stored. The database rejected the first
post-rotation Worker call with
`product_quality_service_capability_required`. The exact target switch was
immediately finalized off with immutable counts of zero runs, proofs,
consumptions, and finding events. The prior authorization and failed outcome
were retained; no receipt was rewritten.

Implementation commit `844056f429e2aa4185399d981780b9473a06443c`
adds only forward migration
`20260727183000_cognitive_android_visual_canary_zero_run_retry.sql`. Its
authenticated exact-Owner retry RPC restores only the disabled Android visual
switch's policy metadata after proving the latest exact-target v2 outcome is a
rollback with all four evidence counts at zero, the target has no sentinel
runs, every switch and schedule is off, emergency state is active, no
unfinished authorization exists, and fresh unrevoked Android collector and
triage capabilities are present. It never enables a switch, opens an
authorization, fabricates an outcome, changes a prior receipt, or touches a
sibling scope. The retry file passes `14/14`; the three Android activation
files pass `49/49`; the clean full suite passes `1429/1429`. The current
unresolved P1 count remains `0`.

## Static review result

| Lane | P0 | P1 | Result |
| --- | ---: | ---: | --- |
| architecture / credential / network | 0 | 0 | pass |
| database / RLS / concurrency | 0 | 0 | pass |
| sentinel / evaluator / triage | 0 | 0 | pass |
| partial activation / red team | 0 | 0 | pass |

P2: `0`

P3: `0`

The renderer requires ten explicit principal states and has no implicit
activation default. Active records require exact source, login/NOLOGIN
identity, one matching cache-disabled Hyperdrive, net denial, exact RPC and
names-only binding inventories, independent review, and principal-scoped
rollback proof. Inert records reject database, runtime-secret,
provider-secret, cron, and placeholder material. Both the gateway and private
Worker independently reject inert invocation before a database or provider
adapter is constructed.

Provider requirements remain principal-local. A missing provider credential
cannot block the four provider-independent principals or activate a sibling.
Partial deployment reports `NOT_GLOBALLY_READY`; it cannot claim
all-principal readiness. Targeted rollback preserves sibling configuration,
and emergency-stop enforcement remains in the operation RPC path.

The implementation does not modify a historical migration, grant a UI mutation
authority, install a Supabase service-role credential, add a public private
Worker route, enable a schedule, enable user-derived memory, or enable Level 2.

## Automated proof

- prior exact-head GitHub Phase 1 CI run: `30292475331`
- prior exact-head required checks: `13/13` passing
- isolated Cloudflare runtime: `134/134` passing
- provider-independent Option C path pgTAP: `22/22` passing
- unclaimed source-revision pgTAP: `20/20` passing
- provider-independent visual activation pgTAP: `18/18` passing
- canonical deferred-evidence decisions pgTAP: `13/13` passing
- visual no-finding triage integration file: `31/31` passing
- Android-scoped visual activation and zero-run retry files: `49/49` passing
- Android zero-run retry file: `14/14` passing
- full pgTAP: `1429/1429` passing
- Cognitive intelligence contract: passing
- Cognitive architecture guard and proof: passing
- committed-secret scan: no deployment or runtime secret evidence found
- `git diff --check`: passing

The successor implementation and review-only exact-head GitHub CI runs are
recorded on PRs #44 and #45 after this review-record commit; they must be
`13/13` before any retry migration is deployed.

## Live gate

Static review is complete. The following remain required before this review
can record final activation acceptance:

- exact reviewed four-principal deployment;
- own-RPC positive and sibling/direct-table/schema-net negative tests;
- invocation expiry/revocation, emergency-stop, and per-principal rollback;
- authenticated Option C approval and effective-baseline count `1`;
- deferred-evidence reevaluation and eligible import;
- sentinel/evaluator/triage, dedupe, resolution, and replay canaries;
- enabled-switch readback with every provider-dependent switch and all five
  schedules still disabled; and
- remote confirmation that provider-dependent Workers remain inert and inert
  Workers have no Hyperdrive or runtime secret.

No live result is claimed by this initial review record.

## Successor Android predicate-preflight exact-head review

Status: source review passed; remote diagnosis and live acceptance pending.

This successor section preserves every prior review entry. It reviews
implementation commit
`c16708f62a163a29998a607abeb0bc138fe74783`, tree
`a50788175c8187616213c27431fb5ecaf849330c`, and Worker source-graph SHA-256
`ecedc329ad2e0f51e396f6f4531e9b112a6d7471aa0e342acf3e4800f7b8da1c`
across the same 71 committed source-graph files.

Forward-only migration
`20260727192137_cognitive_visual_sentinel_collection_predicate_preflight.sql`
adds one read-only operation:
`cognitive_runtime.preflight_visual_sentinel_collection`. It does not retry a
canary, enable a switch, open an authorization, create or rotate a capability,
or write evidence. The operation is executable only by
`cognitive_sentinel_collector`; runtime entry still requires the exact
`cognitive_sentinel_collector_login` session identity, its one principal
membership, the permanent net-ACL guard, and the new exact operation allowlist
entry.

The wrapper establishes and restores the legacy nested claim exactly as the
write wrapper does. It compares the supplied assertion internally and returns
only `MATCH` or `MISMATCH`; no raw assertion, digest, database value, private
evidence, or payload is returned. Current capability, assertion, sentinel-key,
and capability-scope checks are each bound to the supplied task, project,
platform, and environment. The later scope predicate independently requires
Android production, preventing an iOS or shared capability from masking an
absent, expired, revoked, or mismatched Android capability.

The bounded result distinguishes runtime identity, nested claim, capability
currency, assertion digest, allowed sentinel key, Android capability scope,
task/repository scope, cancellation, quarantine, deadman, emergency state,
route sanitization, four exact hashes, idempotency, status/physical-proof
pairing, observation and evaluation windows, generic metrics, detailed visual
metrics, effective baseline, existing-run conflict, the exact Android visual
switch, and one open unexpired Android authorization. It contains no
application-table `INSERT`, `UPDATE`, or `DELETE`.

The private sentinel Worker adds only the new closed-schema action and one
static 17-argument database statement. The assertion remains sourced from the
sentinel Worker's existing private assertion binding and occupies only the
final bound SQL parameter. The gateway still has no database, provider, or
runtime-secret domain. No sibling Worker gains an operation, secret, database
binding, route, or readiness state.

Local exact-head proof:

- predicate-preflight pgTAP: `24/24`;
- isolated-runtime role manifest pgTAP: `48/48`;
- real TCP password-authenticated disposable LOGIN integration: passing;
- isolated Cloudflare runtime: `136/136`;
- generated-source verification: passing;
- source-graph worktree guard: passing with only untracked `deno.lock`;
- diagnostic installation creates zero sentinel runs, authorizations,
  enabled switches, and enabled schedules; and
- implementation `git diff --check`: passing.

Static successor review result:

| Lane | P0 | P1 | Result |
| --- | ---: | ---: | --- |
| architecture / credential / network | 0 | 0 | pass |
| database / RLS / concurrency | 0 | 0 | pass |
| sentinel / evaluator / triage | 0 | 0 | pass |
| partial activation / red team | 0 | 0 | pass |

The migration and Worker operation remain undeployed at the time of this
section. Therefore this review does not claim an assertion match, an exact
failed predicate, a repaired canary, a live sentinel row, an evidence
decision, or activation acceptance. PR #44 must remain draft until the exact
Worker-path predicate is reproduced twice, only the proved repair is applied,
the full regression and live Android gates pass, and a final live-acceptance
readback is appended. PR #45 remains review-only and must never merge.

## Successor deployment readback and fail-closed invocation hold

Implementation commit
`7d85063dab506ffdc2c55c857c5130849362fb16`, tree
`2090b41cb9c88dd3e29f5881efdc90742896657e`, preserves the exact reviewed
SQL and Worker bytes. It renames the undeployed repository migration file
without changing its SHA-256 so its version matches the migration version
assigned by the Supabase migration API:
`20260727194502_cognitive_visual_sentinel_collection_predicate_preflight.sql`.
This is source/history alignment, not a replacement migration or SQL retry.

Remote deployment readback:

- migration head: `20260727194502`;
- remote/local normalized preflight-definition SHA-256:
  `87692b0caeaac5aae6178ad1c2feb71c61a8688e41091c260948734be8445d48`;
- sentinel principal execute: `true`;
- triage sibling execute: `false`;
- generic `service_role` execute: `false`;
- operation allowed for sentinel: `true`;
- operation allowed for triage sibling: `false`;
- sentinel runs after migration: `0`;
- prior authorizations/outcomes retained: `4/4`;
- enabled switches: `0`;
- enabled schedules: `0`;
- sentinel Worker version:
  `2a185b9d-e726-40c3-8720-abcfaaee4099`;
- gateway Worker version:
  `f7c0a156-8270-40fe-927e-877361e8d1af`; and
- both deployed versions bind source commit
  `7d85063dab506ffdc2c55c857c5130849362fb16`.

The sentinel deployment preserves exactly one existing Hyperdrive, its two
separate secret names, and no provider secret. The gateway preserves all ten
service bindings, the explicit four-active/six-inert principal matrix, and no
database or runtime-secret binding. The exact renderer reported
`READY_STAGED_PARTIAL`; partial activation did not fabricate global readiness.

The existing Access service-token client ID remains unchanged and
policy-bound. Its unavailable raw client secret was rotated through the exact
Access service-token boundary and stored only in the owner-only temporary
credential directory. No Access application or policy scope was broadened.

The Worker-path database preflight has not been called. The prior temporary
caller-side sentinel invocation token was securely deleted, while the Worker
retains only `COGNITIVE_SENTINEL_COLLECTOR_INVOKE_SHA256`; Cloudflare cannot
return its preimage. Rotating this Worker runtime binding before the database
preflight proves the failed predicate would violate the Owner instruction not
to change runtime secrets before diagnosis. Direct database execution is not
substituted for the required Access gateway → service binding → private Worker
path.

Accordingly this is a fail-closed hold, not an assertion-mismatch finding. The
assertion digest remains unclassified, no fresh authorization has been opened,
and no canary evidence row has been written. Continuing requires one narrow
Owner authorization to rotate only the sentinel invocation token/hash so the
already-reviewed diagnostic can be reached; that rotation must not alter the
sentinel assertion, capability, database identity, Hyperdrive, gateway scope,
or any sibling principal.

## Exact generic-manifest successor review

Status: source review passed; operational credential installation and live
Android acceptance remain pending.

This additive section preserves the prior failed-closed history and reviews
implementation commit
`3873b5a84e6de69d0beb820dc6d39642fea4c02d`, tree
`f4760029850d1feeaf8ceb9370bb31ee57b55512`, and the unchanged 71-file
Worker source-graph SHA-256
`7b9b1e56ef8f4eef9bfa652ebfaf46c22a7964153167ee24c9ea4002acf45869`.

The two prior Worker-path results remain immutable:
`failedPredicate=metric_manifest_generic`. The exact submitted construction
proves the JSON-object, total-size, schema, sanitization-version,
observation-kind type, metrics-object, metrics count/size, evidence-array
type/count/format/binding, and visual observation-kind predicates. Therefore
the exact failed generic subpredicate was
`cognitive_json_is_sanitized(metric_manifest)`. No prior result or request was
rewritten.

The failure is classified `CANARY_PAYLOAD_DEFECT`, not
`GENERIC_VALIDATOR_DEFECT`. The prior operator-built packet randomized its
evidence bindings and incorrectly represented the reviewed Build 84 evidence
as simulator-observed, measured-simulator, approved-baseline, provider-healthy
evidence. Those values contradicted the already-reviewed installed traversal
and made the packet non-reconstructible.

The repair is deterministic and source-bound:

- reviewed evidence-manifest SHA-256
  `f7cf764c8d7e5b81189f48f2a097189f417113b56179c8a324380d26b83e8a1e`;
- reviewed Build 84 source commit
  `1335dc18669d8917bb72c14393bf464d98ce902f`;
- Android production, `Home main tab`, `touch_target`, and failed result;
- `installed_ui_observed` plus `measured_installed`;
- `needs_product_baseline_review` with a null comparison hash;
- `providerState=not_applicable` and `contentState=not_applicable`;
- exact 102.86dp by 23.24dp measurement, 420dpi density, accessibility
  name/role presence, actually-interactive state, and no larger interactive
  ancestor;
- objective binding
  `home_main_tab_navigation_control`, its exact mapping hash, component-set
  hash, and versioned non-media exception contract; and
- the exact evidence-manifest hash included in `evidenceHashes`.

Three independent generator runs produce identical 2,184-byte canonical
canary JSON with SHA-256
`212b03706b35be48aacfe80cc8d2795e7f4c581fd88d43c67d775ff067c2bfb9`.
The metric-manifest SHA-256 is
`3175d45f3cc1f9b6f9cc9aa0c2b37352f5c74b880b3c2cf5dfae4c52c022993d`.
The exact repaired manifest passes the deployed production generic, detailed,
and objective touch-target validators through a read-only query.

Forward migration
`20260727211939_cognitive_visual_sentinel_generic_manifest_subpredicate_preflight.sql`
does not edit the prior diagnostic or the generic validator. It adds one
collector-only, read-only operation that returns exactly fourteen PASS/FAIL
values and the first failed subpredicate. It returns no submitted value, hash,
metric content, assertion material, or evidence. The runtime wrapper remains
bound to the password-authenticated sentinel LOGIN identity and one static,
three-argument SQL statement. No collection or triage capability row, database
assertion, Hyperdrive, database role, net ACL, gateway binding, sibling
principal, provider binding, switch, schedule, authorization, or evidence row
is changed.

Regression proof:

- full pgTAP: `1476/1476`;
- exact new regression file: `23/23`;
- isolated Cloudflare runtime: `138/138`;
- password-authenticated disposable LOGIN integration: passing;
- deterministic generator: passing across three independent builds;
- existing product-sentinel contract: passing;
- production generic/detailed/objective read-only evaluation: `PASS/PASS/PASS`;
- generated-source verification: passing;
- source-graph worktree guard: passing with only untracked `deno.lock`; and
- implementation `git diff --check`: passing.

The regression mutations preserve failure for wrong schema and sanitization
versions, absent/uppercase/mismatched evidence hashes, oversize, more than 64
metric keys, secret-like and private-identifier-like fields, wrong observation
kind, malformed metrics, and a contradictory detailed touch-target failure.
Diagnostic execution creates zero evidence, authorizations, switches, or
schedules.

Static successor review result:

| Lane | P0 | P1 | Result |
| --- | ---: | ---: | --- |
| architecture / credential / network | 0 | 0 | pass |
| database / validator / RLS | 0 | 0 | pass |
| sentinel / evaluator / triage | 0 | 0 | pass |
| deterministic evidence / replay | 0 | 0 | pass |

P2: `0`

P3: `0`

This review does not claim a live authorization, sentinel run, evaluator
proof, triage consumption, finding, resolution, emergency-stop result,
rollback result, evidence import, or activation acceptance. PR #44 remains
draft until both PRs have exact-head green CI and every live gate is appended.
PR #45 remains review-only and must never merge.

## Exact JSONB-boundary successor review

Status: exact subpredicate proved and source repair passed; operational
credential installation and live Android acceptance remain pending.

This additive section does not rewrite the preceding review. It supersedes
only the preceding section's aggregate inference that
`cognitive_json_is_sanitized(metric_manifest)` was the exact failed
subpredicate. That inference remains in the immutable review history and is
not used to authorize a retry.

Implementation commit
`e05ff68c426e2ccb1bc268e14e9e5d19ba64efa9`, tree
`5295d907e6806883e1de2dda5626d8e3a129783d`, has the 71-file Worker
source-graph SHA-256
`47779ee113dd79b7678569750aa2f96e4663e2e1ccc5b44262365817ce1611fb`.
It changes only the sentinel adapter's JSONB parameter boundary and its exact
database-port regressions.

The exact canonical manifest object and the exact previously deployed
adapter-shaped value were evaluated independently against the deployed
fourteen-check diagnostic twice. Sanitized readback:

- canonical manifest object: generic `PASS`, detailed Android visual `PASS`;
- previously deployed adapter shape: generic `FAIL`;
- exact failed subpredicate on run 1: `manifest_is_json_object`;
- exact failed subpredicate on run 2: `manifest_is_json_object`;
- result equality across both runs: `true`; and
- diagnostic side effects: zero evidence, authorization, switch, or schedule
  writes.

The defect is classified `CANARY_PAYLOAD_DEFECT`, specifically an isolated
runtime JSONB serialization defect, not `GENERIC_VALIDATOR_DEFECT`.
`postgres.js` learns the `$n::jsonb` type from the static statement and
serializes an object parameter once. The sentinel adapter had called
`JSON.stringify` before passing the value, causing the driver to serialize a
JSON string rather than the reviewed manifest object. The database therefore
correctly failed the first generic subpredicate.

The exact repair removes pre-stringification only at the three sentinel
metric-manifest call sites:

- `preflight_visual_generic_manifest_predicates`;
- `preflight_visual_sentinel_collection`; and
- `collect_sentinel_run`.

All three now pass the same reconstructed metric-manifest object to the static
JSONB statement. The deterministic generator, metric values, evidence binding,
generic validator, detailed Android visual validator, global sanitizer,
database assertion, capabilities, Hyperdrive, LOGIN principal, gateway,
sibling principals, switches, schedules, and prior failed records are
unchanged. No sanitizer exception or validator bypass was added.

Exact-head regression proof:

- PR #44 CI run `30312758298`: `13/13`;
- full pgTAP: `1476/1476`;
- isolated Cloudflare runtime: `138/138`;
- password-authenticated disposable LOGIN integration: `PASS`;
- canonical manifest bytes: `2,184`;
- three independent canonical generator runs equal: `true`;
- canonical canary SHA-256:
  `212b03706b35be48aacfe80cc8d2795e7f4c581fd88d43c67d775ff067c2bfb9`;
- metric-manifest SHA-256:
  `3175d45f3cc1f9b6f9cc9aa0c2b37352f5c74b880b3c2cf5dfae4c52c022993d`;
- implementation `git diff --check`: `PASS`; and
- worktree guard: only untracked and unstaged `deno.lock`.

The repaired source retains the preceding mutation regressions for schema and
sanitization versions, evidence hash presence/format/binding, manifest and
metrics bounds, secret-like and private-identifier-like fields, observation
kind and metrics types, and detailed touch-target contradiction. Existing
sentinel persistence coverage also retains failed-collection zero-write,
successful-collection exactly-one-run, deterministic dedupe, and replay
denial checks.

Static successor review result:

| Lane | P0 | P1 | Result |
| --- | ---: | ---: | --- |
| architecture / credential / network | 0 | 0 | pass |
| database / validator / RLS | 0 | 0 | pass |
| sentinel JSONB boundary | 0 | 0 | pass |
| deterministic evidence / replay | 0 | 0 | pass |

P2: `0`

P3: `0`

This review authorizes no blind retry. A fresh Android authorization may be
opened only after the retained operational invocation credential is installed
in the reviewed caller/Worker boundary and both generic and detailed
preflights return `PASS`. This review does not claim a live run or any later
lifecycle, evidence-import, emergency-stop, rollback, merge, or iOS result.
PR #45 remains review-only and must never merge.
