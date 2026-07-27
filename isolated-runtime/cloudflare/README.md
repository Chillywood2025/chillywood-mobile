# Cognitive Level 0/1 isolated Cloudflare runtime

This directory is the provider adapter and deployment manifest for the frozen
operationalization source rooted at
`8660558a9cf360f033246a404dfc5812d522da88`. It does not replace or rewrite the
reviewed Supabase Edge contracts.

## Topology

- One Access-protected gateway has no database binding, provider secret, or
  capability-issuing authority.
- Ten private Workers are reachable only through explicit Cloudflare Service
  Bindings. Their committed templates disable `workers.dev`, Preview URLs, and
  public routes.
- Each active private Worker has one unique cache-disabled Hyperdrive
  configuration, one dedicated Postgres login/NOLOGIN role domain, and one
  unique invocation hash. An inert Worker has none of those runtime bindings.
- Only the model, GitHub, and public-research Workers declare provider secrets.
  The public-research Worker receives one HMAC key for the exact peer-pinned
  transport host and no model, GitHub, LiveKit, or general-purpose network
  credential. The LiveKit
  evidence collector accepts sanitized participant evidence from a separately
  bounded synthetic participant and owns no LiveKit provider credential.
  Public research never uses Cloudflare's public-fetch proxy to claim peer
  pinning. Its exact HMAC adapter calls the separately reviewed Node transport,
  which connects to a DNS-approved address and verifies the socket peer. The
  Worker independently verifies the signed response and transport attestation.
- No Worker consumes a Supabase service-role or secret key.

Cloudflare documents Service Bindings as non-public Worker-to-Worker calls with
no added Service Binding cost. Hyperdrive query caching must be disabled when
each configuration is provisioned because authorization, revocation, emergency
stop, audit, capability, and liveness reads require fresh state.

Primary runtime references:

- [Cloudflare Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- [Protect workers.dev with Cloudflare Access](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Validate Cloudflare Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)
- [Per-Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## Fail-closed request path

1. Cloudflare Access enforces a Service Auth policy before the gateway.
2. The gateway independently verifies `Cf-Access-Jwt-Assertion` against the
   configured issuer and audience.
3. The gateway validates an exact, hash-bound request envelope and dispatches
   through one explicit Service Binding.
4. The gateway validates the exact ten-principal `active`/`inert` matrix. It
   returns `503 principal_inert` without dispatching an inert principal.
5. The private Worker independently validates its explicit deployment state.
   An inert Worker accepts only source/version metadata plus
   `COGNITIVE_DEPLOYMENT_STATE=inert`, returns `principal_inert`, and never
   constructs a database or provider adapter.
6. An active private Worker validates its distinct invocation hash, exact operation
   schema, exact generated environment-key allowlist, source metadata,
   deadline, task/project/platform scope, and payload hash. The gateway applies
   its own exact allowlist covering only reviewed public configuration, source
   metadata, version metadata, and the ten Service Bindings. A deployment
   credential such as `CLOUDFLARE_API_TOKEN` is rejected from every runtime
   environment.
7. The dedicated database role executes
   `cognitive_runtime.runtime_role_preflight` and
   `cognitive_runtime.runtime_revocation_status` before the operation RPC.
8. Domain RPCs remain responsible for evaluator proof, immutable receipts,
   replay denial, approval/capability checks, emergency stop, and settlement.

Only bounded category/status/request hashes are logged. Payloads, tokens,
provider responses, database connection strings, and user data are never
logged.

## Deployment gate

The generated Wrangler files are templates, not deployment authorization. The
deployment input schema requires one explicit record for each of the ten
principals; there is no global activation mode and no default state.
An active record must bind the reviewed source and independent review, exact
login/NOLOGIN identity, one matching cache-disabled Hyperdrive, exact RPC
allowlist, exact names-only internal/provider bindings, exact runtime
configuration, denied `net` access, and principal-scoped rollback evidence. An
inert record must contain null database/runtime/review/rollback/trigger values
and empty internal/provider binding inventories.
`generated/operation-readiness.json` is also a hard deployment gate. An
operation marked `ready: false` has not yet had its reviewed pure
validation/provider sequence extracted from the Deno implementation. The
private Worker rejects that operation before database or provider access; a
review must port and parity-test it before changing the flag. The generated
readiness file, adapter tests, static SQL statement inventory, and exact-head
review are authoritative; this document never turns an incomplete operation
into a deployment-ready operation. In particular, public research activation
remains externally blocked until the reviewed peer-pinned host is deployed,
its exact origin and Worker-only HMAC binding are present, and the deployed
negative/readiness suite passes.

Before upload, the coordinator must:

1. require `cognitive_runtime.runtime_login_provisioning_ready()` to return
   true. Supabase's provider-owned `net` schema currently grants `USAGE` and
   outbound-network functions through `PUBLIC`; PostgreSQL has no per-role
   deny, and the ordinary migration role cannot revoke grants made by
   `supabase_admin`. The owner-only login provisioner therefore stops before
   creating any password-bearing role until the provider closes that inherited
   surface or an equivalent isolated Postgres boundary is selected;
2. set all ten principal states explicitly in an owner-only deployment input;
3. for each active principal only, supply its matching Hyperdrive
   configuration ID and prove that configuration was created with
   `--caching-disabled` and its matching dedicated login;
4. attach each active principal's required internal/provider bindings only to
   that named Worker; attach none to an inert Worker;
5. configure an Access application and Service Auth policy for the gateway
   `workers.dev` endpoint, then replace the public team-domain, audience, and
   exact service-token Client ID placeholders. The gateway independently
   rejects identity-auth JWTs and service-token JWTs whose `common_name` does
   not match that configured Client ID;
6. verify the successor Git commit is supplied as `sourceCommit` and matches
   reviewed version metadata;
7. run the negative isolation suite against deployed Workers.

Worker activation and cron activation are separate. An active Worker has no
cron unless the principal record also contains an exact reviewed trigger
attestation. Partial activation metadata always reports
`NOT_GLOBALLY_READY`; it cannot be interpreted as all-principal readiness.

Public research and non-personal memory switches must remain off while the
pinned host, exact HMAC binding, remote attestation, retention, or evaluator
readiness is absent. A missing or malformed provider origin/HMAC binding,
unsigned response, replay, expiry, cancellation, or attestation mismatch fails
closed with `RESEARCH_PINNED_TRANSPORT_REQUIRED`. No request field can override
that gate.

The templates intentionally provide no gateway route and keep `workers_dev`
disabled. The gateway `workers.dev` endpoint is enabled only after the Access
application and Service Auth policy exist. Private Workers remain unreachable
from the public Internet.

## Rollback order

Rollback is fail-closed and may target one principal without deactivating its
siblings:

1. set the target principal to explicit `inert` while preserving every sibling
   state;
2. redeploy the target without Hyperdrive, runtime/provider bindings, or cron;
3. verify both gateway and private-service invocations return
   `principal_inert`;
4. revoke that principal's invocation/assertion/provider values and database
   login, then terminate its sessions;
5. detach its Hyperdrive only after revocation is verified.

The deployment credential is never installed in a Worker. If rollback stops
partway through, the earlier gateway, secret, and database revocations remain
in force; restoration requires a new reviewed deployment and fresh runtime
credentials.

## Commands

From this directory:

```sh
npm ci
npm run verify
```

`npm run generate` deterministically emits:

- eleven Wrangler templates;
- the names-only secret inventory;
- the cache-disabled Hyperdrive plan;
- the runtime architecture graph.

No command in this directory provisions, deploys, rotates, or deletes remote
resources.
