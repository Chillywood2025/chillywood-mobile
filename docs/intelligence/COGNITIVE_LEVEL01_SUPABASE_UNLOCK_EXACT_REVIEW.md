# Cognitive Level 0/1 Supabase unlock exact review

Review date: 2026-07-27

Implementation branch:
`codex/cognitive-level01-supabase-unlock-activation`

Exact reviewed implementation head:
`d3f3364c2e150a9f747db871fa123ce9cf61844e`

Exact reviewed implementation tree:
`e17d1bc3eec05e59aa87c324a353291c0060d62d`

Review branch:
`codex/cognitive-level01-supabase-unlock-review`

Disposition: review evidence only; never merge this branch.

## Result

- P0: 0
- P1: 0
- P2: 0
- P3: 0
- GitHub CI: 13/13
- Source and forward-migration review: PASS
- Live Level 0/1 activation: BLOCKED
- Implementation merge: BLOCKED

The exact implementation source and forward migrations are approved. Live
activation is not approved: all ten private Workers remain deliberately inert
because the exact reviewed provider configuration is incomplete. No review
lane treated an intentional fail-closed state as permission to bypass the
deployment renderer, approve Option C, import evidence, enable a switch, enable
a schedule, or merge the implementation PR.

## Provider and database readback

- Supabase ticket: `SU-431426`
- `net` schema owner: `supabase_admin`
- `pg_net` owner/version: `supabase_admin` / `0.19.5`
- PostgreSQL version number: `170006`
- normalized ACL SHA-256:
  `864674950bb9fa2a3ab0528f7a8b46cdaa2455f910181602238adbaa2563d4c9`
- `PUBLIC` schema usage: DENIED
- exact direct grants: `supabase_admin`, `supabase_functions_admin`,
  `postgres`, `anon`, `authenticated`, `service_role`
- Cognitive principals with effective `net` access: 0/10
- trusted-function regression: PASS
- ACL drift guard: PASS
- automatic ACL repair attempted: false
- emergency-stop authority preserved: true
- runtime LOGIN contract: 10/10 READY
- direct, cache-disabled Hyperdrive configurations: 10/10 READY
- private Worker Hyperdrive bindings: 0/10
- private Worker secrets: 0
- private Worker `workers.dev` exposure: 0/10
- gateway database bindings: 0
- gateway secrets: 0
- enabled switches: 0/10
- enabled schedules: 0/5
- effective Option C baselines: 0
- persisted sentinel runs: 0
- governed findings: 0

The provider-owned `net` ACL was not modified by this activation work.
Migration `20260727090557` records the sanitized provider attestation and
read-only drift guard. Forward migration `20260727093712` restores immutable
Free-plan v2 retention lineage and moves current Pro-plan persistence to a
distinct v3 domain. It does not activate research, memory, Level 2, a switch,
or a schedule and does not change product-table RLS.

## Remote principal evidence

All ten isolated LOGIN identities passed the exact provisioning readback and
the direct-Postgres preflight isolation harness. Each identity has one separate
credential stored only in its matching Hyperdrive and inherits exactly one
matching NOLOGIN principal, with role administration and role assumption
denied.

For every identity:

- own preflight RPC: PASS
- sibling and unreviewed RPC: DENIED
- protected-table read and direct DML: DENIED
- object creation and role assumption: DENIED
- workflow/release mutation: DENIED
- `net.http_get` and `net.http_post`: DENIED
- same-session expiry: DENIED
- revocation: DENIED
- other nine identities after one-identity revocation: PASS
- exact expiry and membership restoration: PASS

This is not the final exact domain-RPC matrix. That matrix, live cancellation,
replay, budget/lease, emergency-stop, and rollback canaries require the
reviewed private Worker revisions and remain BLOCKED.

## Independent lanes

1. Architecture, credentials, network and authority:
   P0=0, P1=0, P2=0, P3=0, PASS.
   The ACL guard is read-only and fail-closed. Direct-origin validation rejects
   poolers and other projects. Gateway and Worker contracts forbid database
   credentials in the gateway, service-role credentials in isolated Workers,
   sibling Hyperdrive bindings, public private-Worker routes, and incomplete
   provider configuration.
2. Database, RLS, migration and concurrency:
   P0=0, P1=0, P2=0, P3=0, PASS.
   Immutable retention v2 lineage and distinct Pro v3 lineage match the fixed
   digests. The forward migrations add no product-table grant or RLS weakening.
   The isolation harness validates exact role state and restores expiry and
   membership on failure, revocation, or cancellation.
3. Research, model, memory and retention:
   P0=0, P1=0, P2=0, P3=0, PASS.
   Research requires the exact current pinned transport release, Caddy route,
   and peer-pinning attestation. A one-provider model remains advisory-only and
   quorum-ineligible. User-derived memory and Level 2 remain fail-closed.
4. Baseline, sentinels, LiveKit, GitHub and scheduler:
   P0=0, P1=0, P2=0, P3=0, PASS.
   Baseline, independent evaluation, triage, evidence identity, Premium,
   draft-only GitHub, manual-dispatch, quiet-no-work, budget, dedupe,
   cancellation, and emergency gates remain enforced. Source correctness does
   not substitute for missing live canaries.

## Validation

- GitHub CI: 13/13
- clean local pgTAP: 38 files / 1322 tests
- unlock migration pgTAP: 43/43
- isolated runtime: 128/128
- all-platform contract: 93 assertions
- ACL drift concurrency: PASS
- retention v3 concurrency: 3/3
- remote principal preflight/isolation: 10/10
- deferred evidence identity: 22/22
- research authority parity: 30/30
- relevant Edge functions: 66/66
- budget/cancellation: 4/4
- conflict/rollback source tests: 2/2
- `git diff --check`: PASS

## Remaining live blockers

- The exact active Worker renderer requires reviewed model, GitHub App,
  research transport, and LiveKit readiness that is not available.
- All ten private Workers therefore remain unbound, secret-free, non-public,
  and inert.
- Authenticated Owner-to-worker-to-independent-evaluator Option C approval is
  not available; effective baseline count remains zero.
- All 12 canonical Manifest V2 entries remain `not_imported`: five wait for
  isolated intake, three require reevaluation, three are audit-only, and one is
  ineligible.
- The three research canaries remain blocked by the missing current pinned
  release, exact Caddy route, and peer-pinning attestation.
- Installed LiveKit evidence remains blocked by the existing Premium
  entitlement and requires a distinct-participant reevaluation.
- A current exact-head repository GitHub App canary remains blocked by missing
  Worker provider credentials. Existing provider canaries remain draft and
  unmerged.
- Exact manual dispatch for all five schedule definitions is unavailable until
  the matching Worker and switch prerequisites pass.
- Live emergency-stop and rollback drills cannot be credited before the exact
  domain path exists.

The operating state remains:

- `OWNER_ASSISTED_ACTIVE`
- `ISOLATED_AUTONOMOUS_PENDING`

No implementation or review PR may merge while these live gates remain
BLOCKED. No mobile build, OTA, or public release is part of this review.
