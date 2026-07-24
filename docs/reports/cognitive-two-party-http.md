# Cognitive two-party HTTP proof

Branch: `agent/cognitive-http-environment`

Scope:

- disposable local Supabase only;
- real PostgREST and locally served Edge Function requests;
- separate exact Owner, normal authenticated user, scoped operator, super-admin,
  recycled-email caller, worker, evaluator, and anonymous identities;
- local prerequisite fixture seeding through the disposable database container;
- sanitized output limited to PASS/FAIL, HTTP status categories, and fixed error
  identifiers.

Run:

```bash
node scripts/test-cognitive-two-party-http.mjs \
  --supabase-workdir /path/to/isolated/local-supabase-workdir
```

The isolated workdir must contain a generated `supabase/config.toml`, repository
`supabase/migrations` and `supabase/functions` links, and nonconflicting local
ports. The harness links the repository `_lib` and `config` directories when
they are absent. It captures `supabase status` output and generated function
secrets in a mode-700 temporary directory with mode-600 files, then deletes
that directory.

## Local environment result

- Docker: ready.
- Supabase CLI: `2.75.0`.
- Isolated project: ready on nonconflicting ports.
- All local migrations through `20260723203512` applied.
- `supabase db reset` can return a transient 502 while the restarted services
  become healthy; the harness performs a bounded status recovery check.
- No migration file was edited.
- No remote data or function was touched.

## Bounded HTTP result

The best bounded run reached `46 PASS / 2 FAIL / 48 TOTAL`. It proved the real
worker claim, preflight, executing, non-live staging, evaluator handoff,
passed proof, completion, live switch activation, replay denial, revocation,
expiry, renewal, and emergency-stop claim denial over HTTP.

The final diagnostic run reached `36 PASS / 13 FAIL / 49 TOTAL` because random
fixture identifiers can themselves be rejected by the canonical payload
classifier. This makes the harness outcome nondeterministic until fixture
identifiers are made classification-stable.

The suite is not a complete pass and does not cover every requested scenario
as an independent real-request case.

## Exact blockers

1. `cognitive-owner-approval` rejects the required
   `action=record_owner_approval` payload with HTTP 400
   `owner_approval_payload_rejected`, including for the exact Owner.
   Direct classification of `{action: "record_owner_approval"}` returns
   `provider_authority` because the canonical policy treats `owner` as a
   provider-authority term.
2. Canonical classification can reject otherwise synthetic random hashes or
   UUID-derived payloads, producing nondeterministic HTTP 400 results between
   resets.
3. Local fixture seeding is not bootstrap proof. The reviewed worker endpoint
   exposes `claim`, `begin`, `execute_switch`, `complete`, `fail`, and
   `release_or_quarantine`; it exposes no `bootstrap_control_plane` action.
   Owner approval also requires an already-finalized
   `MODEL_INDEPENDENCE_VERIFIED` decision.

Therefore the live Owner → worker → evaluator bootstrap must remain
`BLOCKED_NOT_PROVEN`. Local fixture setup must not be represented as remote or
live bootstrap.
