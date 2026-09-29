# Chat deployment: immutable history reconciliation

Production project: `bmkkhihfbmsnnmcqkoly`. Read-only observation: 2026-09-29.
Canonical comparison source: `b0540375873655416c39b6e8bf503fc0607b403b` (PR #536).

This records **408 deployed migration rows and all 9,529 ordered statement
strings**, including the exact historical bodies that differ from today's source.
The archive is outside the active migration chain. No deployed SQL file or
remote history row was rewritten. This record does not establish whole-database
schema/data equivalence and does not authorize production mutation.

## What was reconciled

`manifest.json` binds every version, name, ordered statement hash, joined-body
hash, canonical source path and source hash. `statements.json.gz` contains exact
stored statement strings, including boundaries, whitespace and order. Compression
is deterministic. The offline verifier checks all 9,529 statement hashes.

- 33 rows match complete canonical file bytes.
- 15 single-statement rows differ only in trailing whitespace; exact deployed
  strings are preserved, not normalized away.
- 334 rows match the exact Supabase CLI ordered statement representation.
- 26 rows have separately classified historical body/order differences below.
- 17 remote timestamps differ from their canonical source filename timestamps.
  Sixteen alias bodies match raw source bytes; the seventeenth differs only by a
  trailing newline. The manifest maps each alias explicitly.
- The refund closure has two history records, `20260831105733` and
  `20260831130000`, mapping to the same canonical file. This proves two records,
  not two successful executions. Both records are retained.

The CLI comparison used Supabase CLI **2.109.1**'s exact
`apps/cli/src/legacy/shared/legacy-sql-split.ts` implementation, SHA-256
`0ca38a4bbe76b5a751c87cc94ac15792a18bfdc04618e62585eb8dae7088db1b`.
No ad-hoc semicolon splitting or broad whitespace normalization establishes
parity. The archive has also been reviewed for private material; see
`privacy-review.json`. Actor metadata, credentials and user rows are excluded.

## Historical differences and current scope

| Versions / subject | Reconciliation and limitation |
| --- | --- |
| `202604190004` baseline | All 395 unique statements are byte-identical as a multiset; 31 positions differ. Source commit `9361240c` reordered constraints for local startup. Ordered history differs; this is not proof of equivalent replay/current schema. |
| Ten branding-only migrations | 26 spelling replacements across 11 statements, source commit `df731e08`. These are observable display/data values, not byte parity. See `nonfunctional-classification.json` for exact versions. |
| `20260827011240` | Only a 255-character source comment header and trailing newline; remaining body exact. |
| `202605140001/2/3` DMCA | Later parity-proven `202605140004` and `202605220002` supersede the functional differences. Current function bodies match. |
| `202605260011` official video | Later parity-proven policy hardening is installed; current policy and RLS verified. Fixture corrective DML exists; current fixture rows were not queried and title spelling is not proved converged. |
| `202605290002` public search | Later migration fixes the projection. Current remaining difference is three brand literals; authorization predicates match. |
| `20260530191115` malware scan | Superseded by parity-proven `20260530193203`; current enqueue body matches. |
| `20260604015548/015818` event-pass revoke | Superseded by `20260604015941`; current safe metadata implementation matches. |
| `20260611231512` paid seats | **Current functional divergence remains.** Projector lacks canonical capacity early-return branch. Its separate parity-proven oversell guard is installed, enabled and body-matched; this is not evidence of an unguarded seat cap. Separate forward money-domain review required. |
| `20260624231731` purge | Superseded by parity-proven `20260624232323/232653`; current body matches. |
| `20260628211710` chat grants | Superseded by parity-proven `202608250001`; current body and authenticated-only execution match. |
| `20260728004158/04416/05610` sentinel | SQL-token equivalent after comments/whitespace; current functions, restricted grants and final trigger verified. Exact historical bytes remain different and are retained. |

The paid-seat projector must not be silently corrected or an old migration
replayed in this deployment. A separate forward correction needs intended-behavior
review and purchase/renewal/refund regression coverage. Cosmetic fixture/search
differences also remain explicitly recorded.

All 14 checked Chat predecessors and authorization dependencies match latest
canonical bodies from deployed parity-proven migrations, including both replaced
public functions and paid-room read authority. Function identities and execution
privileges were inspected for all 14; defaults, returns, owner and full ACLs were
also captured for the two replaced public functions. These two Chat migrations do not
overwrite an unidentified production-only predecessor change. Catalog evidence is
in `catalog-review.json`; historical convergence is not whole-app qualification.

## Exact proposed deployment

Only these two existing, reviewed source files may be pending:

| Version | File | SHA-256 |
| --- | --- | --- |
| `20260928164743` | `communication_terminal_self_leave.sql` | `15ec276cab2c6d3cec66953473e60c69fcd8e2e6d40fc3d082c13f3e4b80a513` |
| `20260929004448` | `communication_private_state_invalidation.sql` | `26358f49a2e2c850590acde4fa31dddd7de6823aa7a2be722a43def280552c7d` |

The first adds membership ownership generations and fenced admission/media/leave
RPCs. The second emits empty private `state:update` hints after room/membership
changes; clients reread authorized truth. Neither table is added to public CDC.
The first migration can rewrite/lock memberships because its new UUID default
is volatile; the second adds transaction-bound Realtime triggers.

At 04:49 UTC, memberships occupied 532,480 total bytes (891 estimated rows),
rooms 466,944 total bytes (1,209 estimated rows), no target lock waiter or
transaction older than 60 seconds was observed, both tables had RLS enabled,
FORCE RLS disabled, and neither granted table-wide UPDATE to authenticated.
Neither pending history record nor the checked new ownership columns/functions/
triggers was present. A subsequent complete inventory checked all ten actual new
function names, four trigger names, both columns and both pending versions; all
were absent. It supplements the first query, which included one mistaken function
name and omitted four actual new names. A 05:03 UTC readback confirmed
`realtime.send(jsonb,text,text,boolean)` and message partition bounds covering
September 26 through October 3, including the current UTC day. These are
time-specific observations, **not a deployment-time capacity/lock guarantee**.

## Operator sequence

1. Start from the final protected, CI-passing source containing this record.
   Preserve source SHA/tree and the exact two SQL hashes. PR #536's source CI
   `36506985905` passed 94 database files / 3,473 pgTAP assertions plus terminal
   HTTP, lifecycle/media and concurrency checks. Run any required database lane
   at the final frozen head; do not treat that earlier head as fresh-head proof.
2. Verify and optionally create a NEW isolated directory outside the checkout:

   ```sh
   node supabase/deployed-history/2026-09-29/verify-and-materialize.mjs
   node supabase/deployed-history/2026-09-29/verify-and-materialize.mjs --materialize /absolute/new/chat-deployment
   ```

   This only writes local files: 408 historical versions plus exactly two
   pending files, minimal config and disabled seeding. Historical SQL files are
   CLI-compatible reconstructions from stored statement arrays, not recovered
   original-file bytes. They MUST NOT be executed or used as a fresh schema
   bootstrap. The canonical source chain stays unchanged.
3. Obtain action-specific owner approval for this project and these two hashes,
   using the repository's production boundary. Source approval is not deployment
   authority. Use the operator's existing authorized credentials; never expose
   passwords/tokens in evidence or commits. No production action occurred while
   preparing this record.
4. Refresh remote version/name/body/ordered-statement fingerprints and require
   equality to the 408-row archive. Recheck target catalog, all new object names,
   grants, RLS/policies, trigger ordering, `realtime.send`, current-day Realtime
   partition bounds, table sizes and
   active locks/transactions. Stop for concurrent migrations, partial objects,
   unexpected differences or inability to inspect. Do not invoke admission RPCs
   as a read-only check: they acquire row locks.
5. Use **Supabase CLI 2.109.1** with the verified production connection and the
   isolated directory. Verify project identity independently. Configure bounded
   lock and statement budgets in the actual runner/connection and verify them
   locally across the CLI's `RESET ALL` behavior; a preceding unrelated `SET`
   does not suffice. Review recovery and available capacity before scheduling.
6. Run canonical `supabase db push --dry-run` with that explicit connection.
   Its output MUST list only `20260928164743` and `20260929004448` in order.
   Dry-run checks versions, not body parity, so step 4 is mandatory. Never use
   `migration repair`, `--include-all`, `db pull`, seeds, role inclusion, or replay
   aliases to make history appear aligned. The MCP apply tool does not accept an
   explicit version and is not a substitute for this exact-version plan.
7. After the approved dry-run and fresh preflight, run canonical `supabase db
   push` with the same pinned runner/connection/directory and bounded timeouts.
   Each file and its history insertion are transactional, but the pair is NOT
   one transaction: the first can commit before the second fails. On failure,
   stop distribution and reconcile actual history/catalog before retrying.
   Verify the original archive plus any newly committed pending record, then
   review a remaining-file-only plan;
   never blindly replay, mark applied, or destructively down-migrate ownership.
8. Read back both exact version/name/ordered-body records and catalog definitions,
   owners, ACLs, column privileges, triggers, RLS/policies and absence from CDC.
   Verify expected private hint behavior through the authorized two-device test
   accounts, then native/in-app Answer, bidirectional media, controls, durable End
   and a fresh call. SQL metadata alone cannot prove Realtime delivery.
9. If either migration/postcheck fails, retain previous internal app distribution,
   preserve failure evidence, and prepare a reviewed forward fix. Do not publish
   an OTA or roll back to a native-incompatible cohort. Report partial application
   explicitly; do not claim both files deployed from a successful first step.
   Preserve the modern-owned-call rollback restriction in
   `docs/chat/CHILLY_CHAT_LIFECYCLE_VALIDATION.md`: an older bundle starts a fresh
   call and must not resume another bundle's owned membership generation.

This scoped record is not a new admission gate or global source-work requirement.
