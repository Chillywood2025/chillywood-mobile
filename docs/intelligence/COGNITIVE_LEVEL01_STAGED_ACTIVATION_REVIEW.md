# Cognitive Level 0/1 staged-activation exact review

Status: review-only; never merge.

## Exact source

- implementation branch:
  `codex/cognitive-level01-staged-worker-activation`
- implementation commit:
  `ba43c9c0abdc569ba67bf18ab70fdf72c27e4893`
- implementation tree:
  `50e2444c920107855d1140eeb3e10dcc0133a151`
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
This review branch adds only this review record and must never be merged.

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

Implementation commit `ba43c9c0abdc569ba67bf18ab70fdf72c27e4893`
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

- exact-head GitHub Phase 1 CI run: `30289726019`
- current exact-head required checks: `13/13` passing
- isolated Cloudflare runtime: `134/134` passing
- provider-independent Option C path pgTAP: `22/22` passing
- unclaimed source-revision pgTAP: `20/20` passing
- provider-independent visual activation pgTAP: `18/18` passing
- canonical deferred-evidence decisions pgTAP: `13/13` passing
- visual no-finding triage integration file: `31/31` passing
- Android-scoped visual activation files: `35/35` passing
- full pgTAP: `1415/1415` passing
- Cognitive intelligence contract: passing
- Cognitive architecture guard and proof: passing
- committed-secret scan: no deployment or runtime secret evidence found
- `git diff --check`: passing

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
