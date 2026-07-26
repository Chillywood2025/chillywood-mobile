# Cognitive Model Router Runtime

Status: legacy Supabase Edge adapter and isolated Cloudflare adapter implemented;
neither is deployed or activated by this branch.

`cognitive-model-router` is an internal, server-side, advisory-only Edge Function.
It accepts a strict bounded packet of already-sanitized evidence, verifies the
packet's canonical SHA-256 hash, and submits it to one fixed configured OpenAI
Responses API model. The provider credential stays in the Edge Function secret
store and is never returned, logged, persisted, or sent to the mobile client.

The broker requires the platform-verified bearer path, a dedicated hashed
invocation proof, and a database capability registered by the exact Owner. It
rejects browser preflight and all methods other than `POST`. It has no tool
definitions, capability issuer, approval operation, evaluator operation, or
product mutation operation.

The capability is bound to one already claimed, live two-party execution and to
the exact task, project, platform, environment, council role, prerequisite
Level 0/1 switch, provider family, model family, model name, intelligence budget,
expiry, call ceiling, token ceiling, and cost ceiling. The model router cannot
register or revoke its own capability. Owner revocation locks the same capability
row used by preflight, so revocation and a new reservation have one database
winner.

When only one provider family is configured, an exact Owner may authorize one
`model_advisory` execution through a dedicated immutable decision record. That
record remains `MODEL_INDEPENDENCE_PROVIDER_REQUIRED`, advisory-only,
quorum-ineligible, single-execution, and independently evaluated. It cannot
satisfy a collective-governance or non-advisory independence gate; every other
operation retains the existing verified-independence requirement.

Provider requests use:

- `store: false`;
- no tools and no prior-response linkage;
- a strict JSON Schema output;
- caller caps no greater than 1,200 output tokens, 45 seconds, and USD 1;
- server-configured input/output rates for conservative preflight and exact
  usage-based postflight cost checks.

Before a provider call, the router atomically reserves one call plus a
conservative token/cost maximum against both the capability and its
`intelligence_budgets` row. Current task, emergency stop, approval execution,
capability expiry/revocation, prerequisite switch, concurrency, and exact scope
are checked under database row locks. A capability/assessment/idempotency replay
is denied. The provider is never called when reservation fails.

The Edge runtime computes SHA-256 over the actual configured API key and sends
only that fingerprint to reservation. Under the same capability/attestation row
locks, the database requires it to match the current accepted credential
attestation and stores the fingerprint in immutable proof and preflight rows.
Credential rotation or a runtime/attestation mismatch fails before provider
transport. Raw provider credential material never crosses this boundary.

After a provider call, the router atomically replaces the reservation with actual
bounded usage and writes an immutable sanitized result audit. A completed result
is accepted only if task, emergency, execution, capability, switch, and exact
model scope are still live. Provider failures use the reserved usage
conservatively when exact usage is unavailable, so retries cannot bypass
cumulative ceilings. Cleanup settlement may run after revocation or emergency
stop, but it cannot create a completed result. The Edge response is withheld if
settlement fails.

Preflight and result audits contain hashes and bounded operational metrics only:
no evidence body, model output, raw provider response identifier, raw credential,
token, or private identifier is stored. The returned result contains only the
bounded advisory, usage/cost, safe model metadata, and SHA-256 hashes suitable
for later independent attestation. It never writes an attestation itself. The
provider
identity hash is derived from the provider family, not the model family, so two
OpenAI model families cannot be miscounted as two providers. Every result is
explicitly:

- `authority=advisory_only`;
- `quorumEligible=false`;
- `correlationClass=same_family_isolated_advisory`;
- `independenceStatus=MODEL_INDEPENDENCE_PROVIDER_REQUIRED`;
- `evaluatorProofPresent=false`.

Cross-provider quorum, when available, must be established by distinct executions
and the existing independent attestation/evaluation control plane. Repeated calls
to this broker cannot satisfy quorum.

Required model-specific server-only configuration names:

- `COGNITIVE_MODEL_ROUTER_INVOKE_SHA256`;
- `COGNITIVE_MODEL_PROVIDER=openai`;
- `COGNITIVE_MODEL_FAMILY`;
- `COGNITIVE_MODEL_NAME`;
- `COGNITIVE_MODEL_OPENAI_API_KEY` (no generic credential fallback);
- `COGNITIVE_MODEL_INPUT_USD_PER_MILLION`;
- `COGNITIVE_MODEL_OUTPUT_USD_PER_MILLION`.
- `COGNITIVE_MODEL_ROUTER_SERVICE_ASSERTION`.

The legacy Supabase Edge adapter additionally requires `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` inside that existing Edge environment. The isolated
Cloudflare activation path explicitly forbids both shared Supabase credentials;
it uses only the model router's dedicated Postgres LOGIN/Hyperdrive binding and
its own Worker-specific secrets.

No credential value belongs in source, test output, deployment evidence, or the
mobile application. Deployment, secret configuration, activation, live canaries,
and independent evaluation require a separate exact-source reviewed operation.
The router remains advisory-only and quorum-ineligible even after activation.
