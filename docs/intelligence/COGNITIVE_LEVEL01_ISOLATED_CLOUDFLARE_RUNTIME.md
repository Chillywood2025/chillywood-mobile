# Cognitive Level 0/1 isolated Cloudflare runtime

Status: source integration and exact-head review in progress; remote deployment
and switch activation are not yet authorized.

The selected runtime is the existing Cloudflare Workers account, using one
Access-protected gateway and ten private Workers. The gateway has no database
or provider credential. Every private Worker is reachable only through an
explicit Service Binding, has its own cache-disabled Hyperdrive configuration,
and connects with its own least-privilege Postgres login/NOLOGIN role domain.
No new Worker receives a Supabase service-role credential.

This topology uses the existing account and current plan. It does not authorize
a plan upgrade. Cloudflare documents that Service Bindings can reach a private
Worker without a public URL and do not add Service Binding charges. The current
Free limits include 100 Workers, 100,000 requests per day, and exactly ten
Hyperdrive configurations; the ten-principal design deliberately consumes no
more than that configuration limit. Hyperdrive caching is disabled because
authorization, revocation, audit, emergency-stop, capability, mutable, and
liveness reads require fresh results.

Primary provider references:

- [Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Hyperdrive limits](https://developers.cloudflare.com/hyperdrive/platform/limits/)
- [Hyperdrive caching](https://developers.cloudflare.com/hyperdrive/reference/faq/)
- [Protecting workers.dev with Access](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

## Deployment credential verification

Only sanitized classifications are retained:

| Credential | Presence | Provider state | Exposure | Scope | Expiry |
| --- | --- | --- | --- | --- | --- |
| inherited deployment credential | PRESENT | ACTIVE | EXPOSED | SCOPE_TOO_BROAD | EXPIRY_REQUIRES_RENEWAL |
| bounded replacement deployment credential | PRESENT | ACTIVE | NOT_EXPOSED | SCOPE_MATCH | EXPIRY_ACCEPTABLE |
| replacement Access API path | PRESENT | INACTIVE | NOT_EXPOSED | SCOPE_MATCH | EXPIRY_ACCEPTABLE |

The bounded replacement expires on 2026-07-31. Seven days is sufficient for
this activation window; it remains renewable and is not converted into a
never-expiring credential. Future deployments do not depend on this token
remaining continuously valid: when another bounded deployment is approved,
reuse it only if it is still `ACTIVE`, `NOT_EXPOSED`, `SCOPE_MATCH`, and
`EXPIRY_ACCEPTABLE`; otherwise issue or renew a least-privilege deployment
credential for that deployment window. Expiration while no deployment is in
progress is an intended fail-closed state, not a runtime outage.

The inherited credential is not being replaced merely because Chi'llywood is
pre-launch. Replacement is required by the Owner's credential policy because
the sanitized verification classified it as `EXPOSED` and
`SCOPE_TOO_BROAD`. The old credential must remain available until the
replacement successfully deploys and verifies the reviewed bounded resources;
only then must the old credential be revoked. Neither deployment credential may
be installed into a cognitive runtime Worker.

The replacement credential is account-bound and limited to Workers Scripts,
Hyperdrive, Access Apps and Policies, and Access Service Tokens. Billing,
membership/administration, and DNS-wide authority were denied by negative
checks. The Access API path currently remains `INACTIVE`; gateway publication
therefore remains fail-closed until Access can be configured and verified
through bounded owner-authenticated tooling.

## Runtime inventory

| Principal | Public | Database role | Provider secret domain |
| --- | --- | --- | --- |
| gateway | Access only | none | none |
| `cognitive_product_baseline_executor` | no | same-name dedicated role | none |
| `cognitive_sentinel_collector` | no | same-name dedicated role | none |
| `cognitive_product_quality_evaluator` | no | same-name dedicated role | none |
| `cognitive_product_quality_triage` | no | same-name dedicated role | none |
| `cognitive_public_research_broker` | no | same-name dedicated role | none |
| `cognitive_research_evaluator` | no | same-name dedicated role | none |
| `cognitive_model_router` | no | same-name dedicated role | approved model only |
| `cognitive_livekit_experience_collector` | no | same-name dedicated role | none; sanitized evidence only |
| `cognitive_github_draft_pr_broker` | no | same-name dedicated role | repository-specific GitHub App only |
| `cognitive_level01_scheduler` | no | same-name dedicated role | none |

The canonical names-only secret inventory and Hyperdrive matrix are generated
at:

- `isolated-runtime/cloudflare/generated/secret-inventory.names-only.json`;
- `isolated-runtime/cloudflare/generated/hyperdrive-plan.template.json`; and
- `isolated-runtime/cloudflare/generated/architecture-graph.json`.

## Network and rollback

Private Workers keep `workers_dev` and Preview URLs disabled and have no public
routes. The gateway is published only after its Access Service Auth policy
exists, and it independently validates the Access JWT audience and issuer. The
research, model, and GitHub Workers have separate allowlisted egress. The
LiveKit collector receives only sanitized output from a separately bounded
synthetic participant and has no provider credential or provider egress; all
other private Workers also have no provider egress.

Rollback is ordered and recoverable:

1. disable Level 0/1 switches and schedule definitions through the governed
   control plane;
2. revoke gateway Access service authentication;
3. revoke per-Worker invocation and service assertions;
4. revoke each runtime login independently;
5. detach the gateway route;
6. delete only the ten isolated Worker services and their ten Hyperdrive
   configurations after evidence capture; and
7. revoke the deployment credential only after replacement or teardown is
   verified.

Database migrations are forward-only and are never rolled back or rewritten.
User-derived memory and Level 2 production repair remain off.
