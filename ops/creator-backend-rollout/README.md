# Creator backend maintenance preparation

These local helpers prepare arguments for the canonical Supabase
`deploy_edge_function` tool. They never deploy, call a provider, alter a database,
load credentials, or change JWT policy. They use the repository's existing
TypeScript development dependency to parse imports.

The fixed allowlist has ten final functions and six maintenance-only writers.
Maintenance-only writers **must restore their captured deployed files**; this
helper will not publish their current repository versions. A deployment inventory
must preserve each existing function's observed `verify_jwt`, version and baseline.
Only the new `creator-event-broadcast` may explicitly have no deployed baseline.

Keep captures and prepared payloads outside Git. An inventory has this shape:

```json
{
  "schemaVersion": 1,
  "project_id": "YOUR_OBSERVED_PROJECT_ID",
  "functions": [
    {
      "name": "stripe-merch-checkout",
      "deployed": true,
      "version": 30,
      "verify_jwt": false,
      "baseline_bundle": "edge-baselines/stripe-merch-checkout.json",
      "baseline_sha256": "SHA256_OF_THE_EXACT_CAPTURE_FILE_BYTES"
    },
    {
      "name": "creator-event-broadcast",
      "deployed": false,
      "version": null,
      "verify_jwt": false
    }
  ]
}
```

`baseline_bundle` accepts the complete decoded `get_edge_function` capture or an
already normalized canonical deploy argument object. Raw capture version, status,
name and JWT metadata must match. An absolute captured entrypoint is normalized
only by matching exactly one file-name suffix. File names, contents, and existing
configuration are otherwise retained. A capture using an import map must retain
its exact `import_map_path`; an ambiguous capture fails preparation.

After these helpers and application changes are committed, supply the full
40-character reviewed commit SHA. All final/bridge source is read from that Git
object, never the mutable checkout. Example (redirect output to the private task
directory; payloads contain complete function source):

```sh
node ops/creator-backend-rollout/prepare-edge.mjs \
  --repo /absolute/repository \
  --source-ref FULL_40_CHARACTER_COMMIT_SHA \
  --inventory /absolute/private-task/inventory.json \
  --mode bridge \
  --function stripe-merch-checkout > /absolute/private-task/bridge.json
```

Use `--mode final` for the ten source rollout functions and `--mode restore` for
captured baselines. Preparation requires an intact baseline even for existing
functions receiving a final rollout. The resulting JSON is the tool argument
object, not an instruction to execute it. Confirm current remote inventory still
matches before every consequential operation.

The source collector follows relative imports, re-exports, literal dynamic
imports, import types and exact local Deno import-map aliases recursively. It
includes parent/function `deno.json` or `deno.jsonc` and local import maps.
Computed imports, unresolved aliases, scoped local mappings, workspaces, symlinks,
missing dependencies and paths escaping `supabase/functions` fail preparation.
Remote dependencies remain runtime imports; this does not fetch or vendor them.
`supabase/config.toml` is not uploaded: JWT comes exclusively from the inventory.

The bridge returns **503 for every method, including OPTIONS**, with CORS headers,
`Cache-Control: no-store`, `Retry-After: 60` and marker
`creator-backend-rollout-v1`. Browser preflight intentionally fails during the
window. No provider delivery is acknowledged, no body is read, and no DB/provider
operation occurs. Preserve the same operation/event identity on retry; a 503
does not establish the outcome of an earlier request.

This is only the Edge boundary. Direct PostgREST clients, cron and external
workers need the separately reviewed SQL cutover boundary. Verify propagation,
then drain more than the documented 400-second hosted worker lifetime and check
old-version executions and active DB transactions. A clock wait alone is not a
drain receipt. Keep live money and payouts off. Use the separately qualified
atomic payload for all 25 migrations; at minimum the final three replay migrations
must never be exposed separately. Verify SQL readback, restore final webhook handlers before
initiators, and restore all six maintenance-only baselines. Provider retries are
finite; retained unfinished receipts still require verified redelivery.

Run only the focused tests:

```sh
node --test ops/creator-backend-rollout/rollout.test.mjs
```
