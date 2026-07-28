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

## Live iOS activation review — 2026-07-27

The source-only and successor source reviews above remain immutable. The
implementation source was frozen at
`361718ea38191222ba0aa9c3961562f0eff3edc8`.

Deployment and capability readback:

- migration SHA-256:
  `1ca45bb6f3b0fc8e7622634ea6c64d6eb730b41d935065076c406007718edffe`;
- remote migration: `20260728013000` present and source-aligned;
- collector capability:
  `baf330b2-5b87-40be-ba39-4ac6b60449e4`;
- collector fingerprint:
  `db0dcedb4f15aaf909ad58ea3eec7ec5d90dd051f35fe03f52ca96acb78d535f`;
- triage capability:
  `7339edb0-3c0a-4d5b-b08f-fcb338c99334`;
- triage fingerprint:
  `94db4da8950f6c716d7a57cf93c35e6d4e113867a7dad2f201488b845a311d87`;
- retained collector, evaluator, and triage invocation credentials:
  `PRESENT/MATCH`;
- no assertion or invocation credential was rotated.

The physical observation used the approved USB-connected internal TestFlight
iPhone. Device identifiers, tester identity, raw screenshot contents, and raw
device output are excluded from this record. Sanitized identity:

- bundle: `com.chillywood.mobile`;
- app version/build: `1.0.0` / `8`;
- runtime/channel: `1.0.0-iosqa1` / `ios-qa`;
- distribution: `internal_testflight`;
- update: `019f9c13-9f6d-7c52-9cee-71265b8fd565`;
- update source commit:
  `f73aa431fc1fd3e43c3ff8e0a9cd890aa41ac9df`;
- source-build hash:
  `b51969f446fd49bef18d306f158b09e8d8a52e76049388426edcb6e0a9187198`;
- selected surface: `Home main tab`;
- installed target: `107 x 48 pt`;
- iOS minimum: `44 pt`;
- physical proof: `verified_physical`.

Raw physical frames and structure derivations remain outside Git in the
owner-only evidence directory. Only sanitized hashes are recorded:

- initial screenshot:
  `bfd0584f4e3bd5b3e4cc7655114cf77ba145dd0ec086176fa8fe0f11a81b658f`;
- initial structure:
  `ecab8fbb351cd3576385b1abdf0a1e1536323a3cf1ea7ee6b92d9ffdddec72a6`;
- final screenshot:
  `26a8b7e2d96e07795e22eb142ab80b96c134b90def2513dcafdcc0027124c5fc`;
- final structure:
  `ef05db0d1d85d8b626305910c542477c0b716ba2d2ccf1b267da63363349d780`.

The passed, deterministic fixture, and resolution manifests were each
canonicalized independently three times with byte-identical results:

- physical no-finding manifest:
  `b10cd8569f6a7b28aa5867e91e1a93546ce85771639ed2ddcb70d026f0eadc41`;
- test-only fixture manifest:
  `968612ac4cfb9129693083f7d24ced15b52beddb47565da994104284bf1118f0`;
- physical resolution manifest:
  `9198fab8c3c995eddadd8c8f0fb30a1a2efe543deeb28100f37924da6a246990`;
- all fourteen generic predicates: PASS;
- detailed Option C iOS validator: PASS.

The preserved
`cognitive_runtime.preflight_visual_sentinel_collection` diagnostic from
`20260727194502` is explicitly Android-scoped and therefore reports
`collector_android_scope` for an iOS input. It was not treated as the iOS
authorization gate, was not changed, and created no evidence. The reviewed iOS
gate is the immutable PASS/PASS receipt plus the exact iOS switch and
authorization trigger added by `20260728013000`.

Immutable preflight and authorization:

- preflight receipt:
  `50a4a19c-5842-4ebf-8061-708925a7dc45`;
- receipt hash:
  `b4f30eb86de82bc2f39396ecb91577a5e54f0c51ba64cb792b28258306f4d005`;
- authorization:
  `6a719f8e-2ac4-434d-b0a1-7923a28d3b40`;
- authorization hash:
  `7c91942cb222b3cda62b324c8ff8c8923e2ed8a3a06eb5d77e1efb83e1c8e05a`.

Live lifecycle:

- physical no-finding run:
  `a52d8597-f629-470a-a830-8ebd2fe53362`;
- physical no-finding proof:
  `e380af5d-08fc-44b3-bafd-15fd2a228c6e`;
- no-finding consumption:
  `5dc0ba27-d81b-49c8-b8ef-667656830b6e`;
- no-finding event:
  `fa62e730-3d42-496f-885b-057cc154ed5f`;
- deterministic test-only finding run:
  `60ed6188-3f99-42eb-911a-e232bb50bc86`;
- finding proof:
  `2273c4e4-6f31-42b7-bffc-6ccab1fd9de9`;
- finding consumption:
  `ecb95e75-2ec3-41b7-81c1-1e529df36a67`;
- finding:
  `96e2e6e4-fc8e-4f0b-a108-b6ffe81444ad`;
- detected event:
  `cc1ad855-7daa-4dd5-8ff3-0a051285383b`;
- physical resolution run:
  `e3d9325b-6b7f-4b3f-9af9-228db551e88c`;
- resolution proof:
  `a792303e-81e1-42f6-8da8-435f6a381cfb`;
- resolution consumption:
  `e91588ef-6e70-44a6-be0a-d8444742e20d`;
- resolved event:
  `8e972055-4c97-4942-bff3-0e43f58eaef8`;
- collection dedupe: PASS, identical run ID;
- proof replay: DENIED, HTTP 409;
- final exact counts: 3 runs, 3 proofs, 3 consumptions, 2 finding
  events, 1 resolved finding, 0 open findings.

The 43-pt finding input was a deterministic threshold fixture. It was marked
test-only and `notARealApplicationDefect`; no application UI was changed and no
real defect was fabricated.

Emergency-stop and rollback:

- emergency pause: PASS;
- mutation while stopped: DENIED, HTTP 409;
- exact Owner resume: PASS;
- sentinel LOGIN membership revocation: PASS;
- sentinel operation while revoked: DENIED, HTTP 409;
- evaluator and triage memberships: unchanged;
- Android switch and capabilities: unchanged;
- sentinel LOGIN membership restoration: PASS;
- restored sentinel path: PASS;
- emergency receipt:
  `8eba4f1cb5b4af4ddca59a3bdc5f99f3f422a24fcc7bdb6a238c2d49f05507a9`;
- rollback receipt:
  `5a40773b0c4ff037c1504570e1f19116fed2add513d30447f0d566be6517a404`;
- canary receipt:
  `696789d0248d65588e5daf1dc5b2bea0e8696a1865a3f09b1c057acadae72ff0`.

Finalization:

- outcome:
  `5f622c85-c848-418c-a985-c5aecc8abfc1`;
- outcome hash:
  `c3486136b39b0b03c667ade4bdf868b82e2879b532d55c384e5ae61bc77609fe`;
- iOS visual switch: enabled,
  `provider-independent-ios-visual-live-v1`;
- Android visual switch: enabled and unchanged,
  `provider-independent-visual-live-v2`;
- shared visual, iOS installed-journey, iOS LiveKit, and all
  provider-dependent switches: OFF;
- recurring schedules: 0/5;
- emergency state: active;
- PUBLIC `net` usage: denied;
- open iOS visual authorizations: 0.

Independent review lanes:

1. architecture, credential, network, and platform separation: PASS;
2. database, RLS, migration, capability, and concurrency: PASS;
3. sentinel, evaluator, triage, lifecycle, and receipts: PASS;
4. physical iOS evidence, Android non-regression, emergency stop, and
   rollback: PASS.

Final review result:

- P0: 0;
- P1: 0;
- full pgTAP: 1520/1520;
- iOS-focused pgTAP: 30/30;
- isolated runtime: 138/138;
- password-authenticated LOGIN integration: PASS;
- PR #46 CI: 13/13;
- source-only PR #47 CI before this additive evidence: 13/13.

PR #47 remains review-only, draft, unmerged, and forbidden from merge.
