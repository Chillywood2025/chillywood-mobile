# Cognitive Level 0/1 staged-activation exact review

Status: review-only; never merge.

## Exact source

- implementation branch:
  `codex/cognitive-level01-staged-worker-activation`
- implementation commit:
  `a54c04518f85f17a9983e0bbe7699463262537e1`
- implementation tree:
  `33c38c132d75eebf94eaae64351a6284533a6fb6`
- reviewed Worker source graph SHA-256:
  `b8d974ae532bc7b3a26230048376af19d507fb0fb64069c2660868ff0c547bf9`
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

- exact-head GitHub Phase 1 CI run: `30284030090`
- current exact-head required checks: `13/13` passing
- isolated Cloudflare runtime: `134/134` passing
- provider-independent Option C path pgTAP: `22/22` passing
- unclaimed source-amendment pgTAP: `13/13` passing
- full pgTAP: `1357/1357` passing
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
