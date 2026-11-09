# Added-catalog collation correction

## Incident and scope

The approved one-shot writer reached PostgreSQL and passed its baseline precheck,
then raised `refund_deploy_postcheck_failed`. The entire transaction rolled back:
DDL and receipt did not remain, and full readback matched the prior 589 state.
Both attempt budgets remain consumed. This source correction does not reset them
or authorize another deployment or any of the three separate Edge updates.

## Source-derived proof

The expected added-catalog digest was derived from the immutable migration in native
PostgreSQL 17.6 with C collation. All 19 added catalog rows, including function bodies,
ACLs and column properties, are preserved in the regression fixture. Its canonical
array hashes to the existing expected value:
`10bffb46a67a595be1e04869b5a73b438a1b33b158d1c59ad8e5a5774e9a7054`.

The target uses ICU default collation. Sorting these exact SOURCE LITERALS on the
target through a read-only query, without installing objects or reading target table
contents, returned default digest
`ff63511b00b65336220effd3aaafc9a2f55022730840823766def31cb4481cb5`
and C digest equal to the existing expected 10bff value. Only the `lease` and
`lease_until` column rows exchange positions. Independent local ICU 76 sorting matched.
This is evidence about target sorting of source rows, NOT a captured target added
catalog: those objects remain absent after rollback. No observed hash is promoted.

## Narrow correction

Only the ADDED catalog aggregate orders `item::text COLLATE "C"`. Existing catalog,
data, original/prior history, social catalog, field coverage, expected hashes, DDL,
ACLs, 45s writer statement limit, lock order and all pre/postchecks remain unchanged.
The proof source lock is explicitly refreshed for the reviewed runner edit; generated
baseline qualifier remains byte-identical 559f444c2d03fed61b494b94ed2f2c19333faf620ec9f04c5ae4c61892c4edaa.

The portable test uses actual PostgreSQL JSONB serialization and C sorting, plus a
Node ICU ordering mutant. It does not claim PGlite itself is running with ICU default.
The separate native ICU real-writer regression below verifies successful postcheck
and rollback with the corrected SQL under the target-like default. Other managed
metadata effects must remain guarded; the collation fix does not normalize away
ACL, function, schema or data drift.

## Completed validation

A separately built official PostgreSQL 17.6 with ICU 76 was initialized fresh with
ICU `en-US` default (actual `pg_database.datlocprovider=i`, `datlocale=en-US`).
The source schema and 612 source receipt bodies were replayed; synthetic holds and
baseline hashes were confined to this disposable fixture and never promoted.
With public default grants matching captured metadata and six exact managed event
trigger bodies installed:

- Old writer failed its postcheck and rolled back to identical pre-state.
- Corrected writer completed its postcheck; explicit rollback restored identical state.
- A deliberately wrong added hash still failed and rolled back completely.
- Corrected writer committed, and real bounded readback classified it as applied,
  with count 612→613 and unchanged source-derived added digest 10bff.

The six managed trigger bodies preserve their code/security-definer/search-path
clauses, but use local postgres function/event ownership. The two Brand guards embed
target-specific OIDs and were analyzed rather than silently rewritten or cloned.
Thus these tests do not claim full managed ownership/ACL parity. Actual failed target
execution reached the postcheck, independently showing those guards did not reject it.
Machine-readable evidence: `docs/audits/refund-added-collation-native-20261109.json`.

The selected sequential source suite passed 25/25, including the complete local
schema replay. Native C regression also passed three complete writer rollback trials
and single-write lost-response reconciliation. No target write or retry was performed
for this correction. Existing consumed attempt budgets remain untouched.
