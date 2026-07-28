# Cognitive Level 0/1 staged Worker activation

Status: implementation and live proof in progress.

This successor removes the former global `activationMode` contract. Deployment
now requires ten explicit principal records, each with state `active` or
`inert`; omitted principals and implicit defaults are rejected.

## Initial staged matrix

| Principal | Intended state | Provider dependency |
| --- | --- | --- |
| `cognitive_product_baseline_executor` | active | none |
| `cognitive_sentinel_collector` | active | none |
| `cognitive_product_quality_evaluator` | active | none |
| `cognitive_product_quality_triage` | active | none |
| `cognitive_public_research_broker` | inert | pinned transport/HMAC/Caddy proof absent |
| `cognitive_research_evaluator` | separately reviewed after core | no accepted work before broker |
| `cognitive_model_router` | inert | approved model/key/cost proof absent |
| `cognitive_livekit_experience_collector` | separately reviewed after core | installed Premium/device proof absent |
| `cognitive_github_draft_pr_broker` | inert | GitHub App bindings absent |
| `cognitive_level01_scheduler` | separately reviewed after core | schedules remain disabled |

Provider-dependent absence does not block the four core principals. It keeps
only the affected principal inert.

## Active contract

Every active principal supplies and validates:

- the exact reviewed source commit, tree, and module-graph digest;
- its own independent P0/P1-zero review record;
- its matching LOGIN and NOLOGIN identities;
- one matching cache-disabled Hyperdrive ID and binding;
- the exact RPC allowlist derived from its manifest;
- only its names-only invocation/assertion/provider binding inventory;
- its exact runtime variables;
- denied `net` access;
- principal-scoped rollback evidence that preserves siblings; and
- a separate trigger attestation when and only when a cron is enabled.

The deployment credential is coordinator-only and is rejected from gateway and
private Worker environments. A Supabase service-role or secret key is
forbidden.

## Inert contract

An inert principal has null database, runtime-variable, review, rollback, and
trigger records plus empty internal/provider binding inventories. Its rendered
Worker has no Hyperdrive, secret declaration, provider variable, cron, Preview
URL, public route, or unresolved placeholder.

The gateway may retain the private Service Binding, but validates the exact
principal-state matrix and returns `503 principal_inert` without dispatch.
The private Worker independently accepts only source/version metadata and
`COGNITIVE_DEPLOYMENT_STATE=inert`, then returns `principal_inert` before
database or provider construction.

## Readiness and rollback

Rendered metadata includes exact active/inert lists and counts. Any partial
matrix reports `NOT_GLOBALLY_READY` and `READY_STAGED_PARTIAL`; partial
activation cannot fabricate all-principal readiness.

Rollback changes one principal to explicit `inert`, redeploys it without
runtime bindings or triggers, verifies both fail-closed paths, and then revokes
only that principal's credentials and database login. Sibling configs remain
byte-for-byte unchanged except for the gateway's public state matrix.

Remote deployed migrations remain forward-only and are not modified by this
successor. User-derived memory and Level 2 remain off.
