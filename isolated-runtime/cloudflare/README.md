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
- Each private Worker has one unique cache-disabled Hyperdrive configuration,
  one dedicated Postgres login/NOLOGIN role domain, and one unique invocation
  hash.
- Only the model and GitHub Workers declare provider secrets. The LiveKit
  evidence collector accepts sanitized participant evidence from a separately
  bounded synthetic participant and owns no LiveKit provider credential.
  Public research has allowlisted public network egress but no provider
  credential. Its isolated adapter performs a public-DNS preflight followed by
  Cloudflare's public-fetch proxy; the preflight addresses are evidence, not a
  claim that the proxy connection is DNS-pinned to those exact addresses.
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
4. The private Worker validates its distinct invocation hash, exact operation
   schema, secret domain, source metadata, deadline, task/project/platform
   scope, and payload hash.
5. The dedicated database role executes
   `cognitive_runtime.runtime_role_preflight` and
   `cognitive_runtime.runtime_revocation_status` before the operation RPC.
6. Domain RPCs remain responsible for evaluator proof, immutable receipts,
   replay denial, approval/capability checks, emergency stop, and settlement.

Only bounded category/status/request hashes are logged. Payloads, tokens,
provider responses, database connection strings, and user data are never
logged.

## Deployment gate

The generated Wrangler files are templates, not deployment authorization.
`generated/operation-readiness.json` is also a hard deployment gate. An
operation marked `ready: false` has not yet had its reviewed pure
validation/provider sequence extracted from the Deno implementation. The
private Worker rejects that operation before database or provider access; a
review must port and parity-test it before changing the flag. The generated
readiness file, adapter tests, static SQL statement inventory, and exact-head
review are authoritative; this document never turns an incomplete operation
into a deployment-ready operation.

Before upload, the coordinator must:

1. require `cognitive_runtime.runtime_login_provisioning_ready()` to return
   true. Supabase's provider-owned `net` schema currently grants `USAGE` and
   outbound-network functions through `PUBLIC`; PostgreSQL has no per-role
   deny, and the ordinary migration role cannot revoke grants made by
   `supabase_admin`. The owner-only login provisioner therefore stops before
   creating any password-bearing role until the provider closes that inherited
   surface or an equivalent isolated Postgres boundary is selected;
2. replace every Hyperdrive configuration ID using an owner-only deployment
   input;
3. prove every Hyperdrive configuration was created with
   `--caching-disabled` and its matching dedicated login;
4. create and attach each required secret to only its named Worker;
5. configure an Access application and Service Auth policy for the gateway
   `workers.dev` endpoint, then replace the public team-domain, audience, and
   exact service-token Client ID placeholders. The gateway independently
   rejects identity-auth JWTs and service-token JWTs whose `common_name` does
   not match that configured Client ID;
6. verify the successor Git commit is supplied as `sourceCommit` and matches
   reviewed version metadata;
7. run the negative isolation suite against deployed Workers.

The templates intentionally provide no gateway route and keep `workers_dev`
disabled. The gateway `workers.dev` endpoint is enabled only after the Access
application and Service Auth policy exist. Private Workers remain unreachable
from the public Internet.

## Rollback order

Rollback is fail-closed and proceeds in this order:

1. disable the gateway route and its Access Service Auth policy;
2. revoke each private Worker's invocation and provider secrets;
3. run the owner-only database revocation action, which sets every runtime
   login to `NOLOGIN`, removes principal membership, resets role
   configuration, and terminates existing sessions;
4. detach and delete the per-principal Hyperdrive configurations after
   database revocation is verified;
5. retire the private Worker versions, then retire the gateway version.

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
