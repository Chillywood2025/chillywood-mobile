# Cognitive Level 0/1 Runtime Isolation Blocker

Status: source review blocker; no deployment or switch activation authorized.

Exact review source:
`5ef3c876d74158606b47888cdd71620c3ca1b335`

The Level 0/1 collector, triage, research, model, LiveKit, GitHub, and scheduler
principals require credential-enforced separation. Hosting all of them as Edge
Functions in the existing Supabase project does not meet that requirement:

- hosted Edge Functions receive a project-wide Supabase secret/service
  credential that bypasses RLS;
- custom Edge Function secrets are project-scoped rather than protected by a
  per-function secret ACL;
- a single compromised function could therefore read another principal's
  assertion or provider credential and reach existing-product data outside its
  declared operation set.

The reviewed database RPCs still provide valuable defense in depth. They
validate exact task/project/platform/environment scope, service assertions,
capability expiry and revocation, switches, emergency state, evaluator proof,
and immutable audit. Those checks do not turn a shared unrestricted credential
into a least-privilege service identity.

Activation requires an isolated server-side runtime for each credential domain,
or an equivalent provider mechanism that supplies:

1. per-principal secret isolation;
2. a dedicated database role or short-lived database credential whose grants
   are limited to the exact principal RPCs;
3. no automatic access to the existing project's unrestricted service
   credential;
4. separate model and GitHub provider credentials that are unavailable to
   sentinel, research, evaluator, and mobile-client code;
5. revocation, expiry, immutable invocation audit, and emergency-stop
   enforcement.

Acceptable deployment shapes include separate isolated compute/secret domains
or a dedicated broker service that exposes only the bounded reviewed operation.
Adding more secret names to the existing shared Supabase project is not an
isolation fix.

Until an exact runtime is selected, reviewed, and attested:

- do not deploy the new Level 0/1 functions to the shared Supabase Edge
  environment;
- keep all Level 0/1 switches and schedules false;
- keep user-derived memory and Level 2 production repair false;
- do not install model or GitHub provider credentials in that shared
  environment;
- retain source-only tests, local evidence, and review artifacts.

This blocker does not require changing the deployed v1 control plane. It does
not authorize a new provider subscription, a migration rollback, secret
rotation, or a public release.

Primary platform references:

- <https://supabase.com/docs/guides/functions/secrets>
- <https://supabase.com/docs/guides/functions/limits>
- <https://supabase.com/docs/guides/getting-started/api-keys>
