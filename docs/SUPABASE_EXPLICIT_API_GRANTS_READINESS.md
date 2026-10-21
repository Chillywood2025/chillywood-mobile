# Explicit Data API grants: October 30 readiness

## Scope and evidence

Supabase's [official announcement](https://github.com/orgs/supabase/discussions/45329)
changes defaults for newly created public tables on existing projects on
October 30, 2026. Existing object grants remain intact. A fresh schema replay,
including a reset or a newly provisioned environment, must not depend on those
historical defaults. Grants and RLS are separate controls; see
[Securing your API](https://supabase.com/docs/guides/api/securing-your-api).

The October 21 source audit replayed the complete migration chain in disposable
PGlite with implicit public table and sequence grants disabled. It reproduced
missing service-role privileges for 30 tables used by current Edge functions.
The read-only production catalog check confirmed that all 30 already have their
required service_role privileges. This is a fresh-bootstrap defect, not
evidence of a current outage or an October 30 revocation of existing access.

## Forward-only source repair

`20261021152932_explicit_service_api_grants.sql` adds only the named operations
consumed by existing server code. The independently checked inventory in
`tests/fixtures/explicit-api-service-grants.json` ties every table and operation
to actual TypeScript consumers. No historical migration is edited.

- No blanket table/sequence grants, restored defaults, PUBLIC, anon or
  authenticated grants, function grants, RLS changes, or private-table exposure.
- Insert targets have no serial/identity sequences, so none are granted.
- Payout/provider tables describe existing server persistence requirements,
  not authority to transact, change providers, activate a worker, or alter a
  rollout. DMCA DELETE grants support the existing scoped canary-cleanup path
  in `admin-owner-controls`; no canary or deletion is run by this work.
- Existing production privileges are not narrowed by this additive migration.
  Tightening historical unused defaults is a separate security review.
- Deployment is a separate, explicitly authorized action. This work does not
  deploy a migration, change a provider, start a build, or publish an OTA.

## Regression coverage

Run `node --test tests/supabase-explicit-api-grants.test.mjs tests/client-api-grant-consumers.test.mjs`.

The suite replays the full chain without legacy defaults, proves each missing
operation receives SQLSTATE 42501 before the repair, and checks successful
SELECT/planning of the exact table operation afterward. Writes are EXPLAIN-only:
no provider work, production rows, or business operations are executed.

It compares every effective table privilege and RLS/FORCE RLS flag across all
public/private tables for all three API roles. Only the reviewed service-role
DML cells may change. It also checks rollback, idempotence, source-bound grant
minimality, all October-created public/private boundaries, future table and
sequence denial, and explicitly classified new public tables. Private
inspection/retention/canary data stays inaccessible, including to service_role.

The client audit additionally covers 134 tables referenced by literal/imported
table constants and the closed finance, usage, money-audit, and DMCA read
wrappers. Requested authenticated table and column privileges are identical
with and without legacy defaults. Five write surfaces deliberately use
column-level grants instead of table-wide INSERT/UPDATE; they are not widened.
Anonymous reads that lose an unused legacy table grant have RLS enabled and
no SELECT policy for anon, PUBLIC, or an inherited role. They were not public
readable surfaces, so this repair adds no anonymous grants. This is ACL
readiness coverage, not a claim that every client payload or UI flow is valid.

`tests/client-api-grant-consumers.test.mjs` binds that inventory to actual client
AST calls in TypeScript and JavaScript client files. It resolves lexical/imported
constants and the eight reviewed finite wrappers, including their array/object
source lists. New tables, per-file operations, unresolved dynamic selectors,
mutated source lists, and escaping wrappers fail with source locations, without
hashing unrelated file contents. Adversarial controls
exercise new literal/imported tables, writes, and wrapper sources. The inventory
excludes declared-but-unused table constants; adding a real call requires review.

The focused pgTAP suite is
`supabase/tests/explicit_service_api_grants_test.sql`; full integration remains
`supabase db reset` followed by `supabase test db` under Required Validation.
PGlite's managed auth/storage schema fixtures, cron/net substitutes, and two
empty-data recovery skips are not a Supabase service, provider, HTTP, or
multi-session concurrency proof. Function default privileges are deliberately
unchanged in this table/sequence fixture. This repair contains no data writes,
triggers, or transaction/locking algorithm changes.

## Future migrations

Create intended per-role grants in the same migration as each table, enable
appropriate RLS, and keep internal tables denied. Add new public tables to the
explicit regression classification with their justified roles/operations.
Never use a failed permission check as a reason to expose all tables or private
inspection records. A deployment rollback, if ever needed, must be a separately
reviewed forward migration using the exact pre-deployment ACL snapshot; blindly
revoking these grants on an existing project could remove longstanding access.
