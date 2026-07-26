# Cognitive Canary Activation Report

Status: not activated.

All cognitive switches remain off. No migration or function is deployed, no
scheduler exists, and no model or draft-PR credential is configured by this branch.

The source now rejects owner/request payloads that try to self-attest research,
deliberation, or credential readiness. A future canary must reference existing
trusted transport, execution-receipt, evaluator, and provider-readback records.
Until those producers and credentials exist, the truthful blockers are:

- `MODEL_PROVIDER_CREDENTIAL_REQUIRED` for model-backed deliberation;
- `GITHUB_DRAFT_PR_CREDENTIAL_REQUIRED` for draft-PR execution;
- trusted research transport/runner deployment required;
- bounded Level 0/1 scheduler worker deployment required.

The deployment branch will record each switch transition, migration/function
version, sanitized research and deliberation canary, owner-approved draft-PR
receipt/evaluation, schedule activation, blockers, and rollback. Level 2 production
repair and user-derived memory remain off.
