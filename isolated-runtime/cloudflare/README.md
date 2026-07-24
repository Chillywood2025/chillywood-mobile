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
- Only the model, LiveKit, and GitHub Workers declare provider secrets. Public
  research has allowlisted public network egress but no provider credential.
- No Worker consumes a Supabase service-role or secret key.

Cloudflare documents Service Bindings as non-public Worker-to-Worker calls with
no added Service Binding cost. Hyperdrive query caching must be disabled when
each configuration is provisioned because authorization, revocation, emergency
stop, audit, capability, and liveness reads require fresh state.

Primary runtime references:

- [Cloudflare Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
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
review must port and parity-test it before changing the flag. The initial
adapter set contains complete static SQL mappings for the baseline executor,
sentinel collector, and product-quality triage. It intentionally does not
claim the evaluator, research, model, LiveKit, GitHub, or scheduler provider
sequences are deployment-ready.

Before upload, the coordinator must:

1. replace every Hyperdrive configuration ID using an owner-only deployment
   input;
2. prove every Hyperdrive configuration was created with
   `--caching-disabled` and its matching dedicated login;
3. create and attach each required secret to only its named Worker;
4. configure an Access application and Service Auth policy, then replace the
   public team-domain and audience placeholders;
5. verify the successor Git commit is supplied as `sourceCommit` and matches
   reviewed version metadata;
6. run the negative isolation suite against deployed Workers.

The templates intentionally provide no gateway route. The gateway route is
attached only after the Access application and policy exist.

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
