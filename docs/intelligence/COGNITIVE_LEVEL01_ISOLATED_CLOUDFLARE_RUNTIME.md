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
Hyperdrive configurations. The Free execution ceiling is 10 ms CPU per HTTP
invocation. Hyperdrive additionally allows 100,000 database statements per day
and approximately 20 origin connections per configuration. The ten-principal
design deliberately consumes no more than the configuration limit, but Service
Binding fan-out, CPU time, statement count, and origin-pool occupancy must be
measured during canaries. Schedule activation remains blocked if a canary
approaches a limit or would produce repeated quota failures. Hyperdrive caching
is disabled because authorization, revocation, audit, emergency-stop,
capability, mutable, and liveness reads require fresh results.

Primary provider references:

- [Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Hyperdrive limits](https://developers.cloudflare.com/hyperdrive/platform/limits/)
- [Hyperdrive pricing and daily query quota](https://developers.cloudflare.com/hyperdrive/platform/pricing/)
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
`SCOPE_TOO_BROAD`. The bounded replacement has already been provider-verified
as `ACTIVE`, `NOT_EXPOSED`, `SCOPE_MATCH`, and `EXPIRY_ACCEPTABLE`.
Provider-confirmed revocation of the inherited credential is therefore a hard
predeployment gate: no Level 0/1 Cloudflare resource may be deployed while the
inherited credential remains active. The inherited raw value is not retrieved
or printed during confirmation. Neither deployment credential may be installed
into a cognitive runtime Worker.

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
model and GitHub Workers have separate allowlisted egress. Public research
remains fail-closed with `RESEARCH_PINNED_TRANSPORT_REQUIRED`: the existing DNS
preflight plus public-fetch proxy cannot attest that the connected peer is
pinned to the approved public addresses. Its mediated transport is available
only through an explicit source-level test/future-transport injection and
cannot be enabled by a request or environment variable. The LiveKit collector
receives only sanitized output from a separately bounded synthetic participant
and has no provider credential or provider egress; all other private Workers
also have no provider egress.

The gateway and every private Worker reject any environment key outside their
exact generated allowlist. This includes a synthetic
`CLOUDFLARE_API_TOKEN`, arbitrary bindings, sibling Service Bindings,
Hyperdrive bindings, provider secrets, and database credentials. The
deployment token exists only in the bounded owner-controlled deployment
environment.

Rollback is ordered and recoverable:

1. disable Level 0/1 switches and schedule definitions through the governed
   control plane;
2. revoke gateway Access service authentication;
3. revoke per-Worker invocation and service assertions;
4. revoke each runtime login independently;
5. detach the gateway route;
6. delete only the ten isolated Worker services and their ten Hyperdrive
   configurations after evidence capture; and
7. allow the bounded replacement deployment credential to expire after
   replacement or teardown is verified, or revoke it earlier when no approved
   deployment remains.

Database migrations are forward-only and are never rolled back or rewritten.
User-derived memory and Level 2 production repair remain off.
