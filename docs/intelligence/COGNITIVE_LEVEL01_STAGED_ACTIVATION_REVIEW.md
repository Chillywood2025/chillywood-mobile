# Cognitive Level 0/1 staged-activation exact review

Status: review-only; never merge.

## Exact source

- implementation branch:
  `codex/cognitive-level01-staged-worker-activation`
- implementation commit:
  `e574b629d9f3b01a5c85365cbca8a20de40b8a39`
- implementation tree:
  `c2f681c0df40b1663cf6e9dae59f6c3096f0e7af`
- reviewed Worker source graph SHA-256:
  `0d377e19a200e0c970bef32ca141a588a7f4097d2c21ac69951ea19356edcb87`
- reviewed Worker source graph files: `71`
- base commit:
  `1bb99451ca10716f9988d5258fff09b14495b334`

The reviewed implementation is the exact head of draft implementation PR #44.
This review branch adds only this review record and must never be merged.

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

The implementation does not modify a migration, grant a UI mutation
authority, install a Supabase service-role credential, add a public private
Worker route, enable a schedule, enable user-derived memory, or enable Level 2.

## Automated proof

- GitHub Phase 1 CI run: `30278807328`
- required checks: `13/13` passing
- isolated Cloudflare runtime: `134/134` passing
- pgTAP: `1322/1322` passing
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
