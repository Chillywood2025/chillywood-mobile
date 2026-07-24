# Cognitive Model Router Runtime

Status: source implemented; not deployed or activated by this branch.

`cognitive-model-router` is an internal, server-side, advisory-only Edge Function.
It accepts a strict bounded packet of already-sanitized evidence, verifies the
packet's canonical SHA-256 hash, and submits it to one fixed configured OpenAI
Responses API model. The provider credential stays in the Edge Function secret
store and is never returned, logged, persisted, or sent to the mobile client.

The broker requires both the platform-verified bearer path and a dedicated hashed
invocation proof. It rejects browser preflight and all methods other than `POST`.
It has no database client, service-role credential, tool definitions, capability
issuer, approval operation, evaluator operation, or mutation operation.

Provider requests use:

- `store: false`;
- no tools and no prior-response linkage;
- a strict JSON Schema output;
- caller caps no greater than 1,200 output tokens, 45 seconds, and USD 1;
- server-configured input/output rates for conservative preflight and exact
  usage-based postflight cost checks.

The returned result contains only the bounded advisory, usage/cost, safe model
metadata, and SHA-256 hashes suitable for later independent attestation. It never
writes an attestation itself. The provider identity hash is derived from the
provider family, not the model family, so two OpenAI model families cannot be
miscounted as two providers. Every result is explicitly:

- `authority=advisory_only`;
- `quorumEligible=false`;
- `correlationClass=same_family_isolated_advisory`;
- `independenceStatus=MODEL_INDEPENDENCE_PROVIDER_REQUIRED`;
- `evaluatorProofPresent=false`.

Cross-provider quorum, when available, must be established by distinct executions
and the existing independent attestation/evaluation control plane. Repeated calls
to this broker cannot satisfy quorum.

Required server-only configuration names:

- `COGNITIVE_MODEL_ROUTER_INVOKE_SHA256`;
- `COGNITIVE_MODEL_PROVIDER=openai`;
- `COGNITIVE_MODEL_FAMILY`;
- `COGNITIVE_MODEL_NAME`;
- `COGNITIVE_MODEL_OPENAI_API_KEY` (or an existing `OPENAI_API_KEY`);
- `COGNITIVE_MODEL_INPUT_USD_PER_MILLION`;
- `COGNITIVE_MODEL_OUTPUT_USD_PER_MILLION`.

No credential value belongs in source, test output, deployment evidence, or the
mobile application. Deployment, secret configuration, activation, live canaries,
and independent evaluation require a separate exact-source reviewed operation.
