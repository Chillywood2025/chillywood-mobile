# Notification deployment history: 2026-10-10

This non-executable archive records the eight migrations applied to project
`bmkkhihfbmsnnmcqkoly` from merged source
`5ebd202bef43c3a0c9d107093a47b8ec9a741be1`, tree
`8d187906afb482d40515266ce3ce97280ee43fe8`.

`manifest.json` maps each canonical source filename/version to its actual
server-assigned version/name. `statements.json` preserves the exact ordered
statement strings returned by migration-history readback. All eight records
contain one statement whose UTF-8 bytes equal the full committed source file.
No SQL was split, trimmed, normalized or replayed to produce this archive.

The successful application receipts and immediate post-readbacks were checked
against committed source; their private evidence hashes are retained in the
manifest. A separate read-only catalog observation at 22:50:14 UTC found 418
history rows. This archive contains only the eight new records, not all 418.
The previous `2026-09-29` archive and active migration filenames are unchanged.

These JSON files are outside `supabase/migrations` and are not executable
migrations. They do not authorize history repair, a second application, worker
activation, deployment or broader schema/data equivalence claims.

`privacy-review.json` records the constrained archive fields.
`security-review.json` records scoped read-only advisor and catalog results.
The advisor reported seven service-only tables without client policies and
three intentionally authenticated view-tracking RPCs. Fresh grants/RLS and
source-body checks support these intended boundaries; no newly actionable
issue was established in this scoped review. Existing unrelated advisor
warnings were not changed. This does not certify the entire database.

The archive paths select Core, Sensitive and Database in the canonical
validation planner (plus Plan and Results). Those checks belong to the
bookkeeping change's actual source head; earlier application evidence is not
relabeled as a new-head validation result.
