# Cognitive Level 0/1 iOS Sentinel Activation Review

Review-only branch: `codex/cognitive-level01-ios-sentinel-activation-review`

Implementation base:

`2ab610ca44ded5c8761f39c3050e24c05937c49c`

This file is additive review evidence. This branch must remain draft and must
never merge.

## Initial source review

- P0: 0
- P1: 0
- implementation migration: forward-only
- focused iOS pgTAP: 27/27
- full pgTAP: 1517/1517
- isolated runtime: 138/138
- password-authenticated isolated LOGIN integration: PASS
- Android canonical manifest: three runs produce identical canonical bytes
- deferred evidence identity: 22/22

The implementation creates only the iOS authorization boundary. Applying the
migration creates zero iOS preflight receipts, capabilities, authorizations,
enabled switches, schedules, sentinel runs, evaluator proofs, triage
consumptions, findings, or evidence imports.

The preflight is platform-exact and requires:

- the materialized iOS production task;
- one current iOS collector capability;
- one current iOS triage capability;
- a physical iOS observation;
- all fourteen generic metric-manifest predicates to pass;
- the detailed Option C validator to pass with platform `ios`;
- exact evidence-manifest and source-build hashes;
- an unexpired hashes-only receipt;
- exact reviewed Worker, test, plan, and rollback hashes.

The existing finalized Android visual switch is the only enabled sibling
allowed by the iOS path. Android rows cannot satisfy iOS preflight,
authorization, run, proof, triage, finding, or finalization predicates. Shared
visual and provider-dependent switches remain forbidden, and schedules remain
forbidden.

The sentinel assertion is unchanged. The generic sanitizer and metric-manifest
validator are unchanged. No Hyperdrive identity, database principal, user
authorization/RLS, role, money, payout, moderation, ranking, build, OTA, or
release surface is changed.

## Live review gates still pending

The implementation PR must remain draft until a current internal TestFlight
iPhone supplies separate physical evidence. A live iOS authorization must not
open until fresh iOS-only collector and triage capabilities exist and that exact
manifest passes both preflight layers. The iOS lifecycle, replay denial,
emergency stop, and sentinel-principal rollback remain pending.

## Successor source review — 2026-07-27

The initial source-only record above is retained unchanged. A subsequent exact
database review found one pre-deployment P1: the inherited global
`assertion_hash` uniqueness constraint prevented fresh iOS-scoped collector and
triage capabilities from binding the already-reviewed, unchanged Worker
assertions. The original capability-count gate also did not independently prove
that both required service identities were present.

The implementation corrected only that proved contract defect:

- implementation head: `361718ea38191222ba0aa9c3961562f0eff3edc8`;
- migration SHA-256:
  `1ca45bb6f3b0fc8e7622634ea6c64d6eb730b41d935065076c406007718edffe`;
- focused test SHA-256:
  `b57ebda756515a7e813879af6e1f9c9d9c2a9d4bc03d5a8f04c9c2824e8f90b6`;
- assertion uniqueness is now exact-task/project/platform/environment scoped;
- both preflight and authorization require two current rows and two distinct
  service identities;
- the sentinel and triage assertions remain unchanged;
- Android capabilities and live state remain unchanged;
- the generic sanitizer and metric-manifest validators remain unchanged.

Exact-source validation after the correction:

- P0: 0;
- open P1: 0;
- full pgTAP: 1520/1520;
- iOS-focused pgTAP: 30/30;
- isolated runtime: 138/138;
- password-authenticated isolated LOGIN integration: PASS;
- Expo Doctor: 18/18;
- architecture graph: deterministic 3/3.

Production deployment and every physical/live gate remain pending. This review
branch remains draft, additive, review-only, and forbidden from merge.
