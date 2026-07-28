# Cognitive Level 0/1 iOS Visual Sentinel Canary Plan

Status: source-only successor preparation; no iOS authorization is open.

Target branch:

`codex/cognitive-level01-ios-sentinel-activation`

The iOS lane uses the already materialized production iOS task governed by the
shared Level 0/1 control task. It does not create a shared visual lane and does
not reuse an Android run, proof, finding, receipt, source-build hash, or physical
observation.

Before an iOS authorization can open, one physical observation from the current
internal TestFlight iPhone must be represented as a canonical sanitized manifest.
The manifest must pass:

1. all fourteen generic metric-manifest predicates;
2. the detailed Option C validator with platform `ios`;
3. exact evidence-manifest binding;
4. the iOS `pt` and 44-point touch-target contract;
5. an active iOS-only collector capability;
6. an active iOS-only triage capability.

The preflight receipt stores only bounded states and hashes. It stores no metric
contents, screenshot, user identifier, device identifier, assertion, invocation
token, or provider credential. The receipt expires after at most fifteen minutes
and can be consumed by at most one iOS authorization.

The authorization gate additionally requires:

- the deployed sentinel Worker source tuple reviewed for the Android repair;
- the exact iOS review contract, regression, deployment-plan, and rollback-plan
  hashes;
- the shared Option C baseline and completed baseline approval provenance;
- active emergency governance;
- no open visual authorization;
- only the finalized Android visual switch may remain enabled;
- the shared visual switch, every provider-dependent switch, and every recurring
  schedule remain disabled.

The live iOS lifecycle is separate: collector, evaluator, triage, no-finding,
deterministic finding and resolution, dedupe, replay denial, emergency stop, and
sentinel-principal rollback must all be proved with iOS evidence before iOS
finalization can retain its switch.

This preparation creates no build, OTA, public release, schedule, capability,
authorization, sentinel run, proof, finding, consumption, or evidence import.
