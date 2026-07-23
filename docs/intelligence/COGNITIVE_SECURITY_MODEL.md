# Cognitive Security Model

Status: `SECURITY_HARDENING_IN_PROGRESS`

- No unrestricted root credential and no production model credential.
- Expiring capabilities bind task, branch, path, tool, call count, duration, and cost.
- Web content is untrusted data, never executable instruction.
- Recursive secret/PII redaction occurs before persistence or model routing.
- Direct client writes to cognitive tables are denied; explicit grants and RLS are both required.
- Immutable evidence cannot be updated or deleted, including by the future service writer.
- The executor cannot approve itself; the evaluator cannot edit source.
- Production deployment, store release, OTA, money, rights, auth/RLS, roles, moderation enforcement, and provider products are forbidden.
- Kill switch is currently structural: no deployed function, scheduler, model credential, or linked migration exists.

Future promotion requires threat modeling for prompt injection, supply chain, model/tool isolation, budget exhaustion, data retention, and incident response.

The hardening branch implements source-side controls for those risks, but does not
claim production proof. Capability credentials stay in a broker, tool/provider
results are untrusted envelopes, operational model output is a strict closed
document, and required-test evidence is verified by a distinct read-only
evaluator. All 40 independent attack IDs are required in CI.
