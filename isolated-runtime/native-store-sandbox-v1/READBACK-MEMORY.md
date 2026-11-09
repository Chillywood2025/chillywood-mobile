# Native readback digest memory

The three readback digests use ordered canonical item text rather than building
an aggregate JSONB array solely to serialize it. SQL NULL explicitly becomes
`null`, separator is comma-space, empty input is `[]`, and original C-collated
ordering remains. This is not a generic SQL rewrite. Hash inputs are unchanged.
Atomic snapshot JSONB and multiset comparisons are unchanged.

Offline PG17.6 measurements against source-generated/synthetic fixture, based on
source 3d337b9a (before this optimization), not hosted data or a hosted baseline:
28,580 native catalog rows; 2,100 functions; 835 relations; 11,256,528 canonical row
bytes; 5,111,613 function definition bytes; 612 receipts / 10,977,282 canonical bytes.
Original source fixture was confirmed quiescent by its owner and copied to an
independently owned local cluster; original never modified.

Three independent backend process high-water RSS measurements (MiB): original
whole native readback 218.96–219.16, equivalent text 175.86–175.94. Actual implemented
readback returned exactly identical complete output and measured 175.93 MiB.
All cases JIT off, work_mem 4 MB, no parallel, 30s statement timeout. RSS includes shared
resident pages; not incremental private memory or a hosted cgroup measurement.
Fixture has synthetic roles/holds/dependency types; no target qualification.

Separate original delta snapshot 207.23–207.27MiB; retained before/after JSONB
with bidirectional EXCEPT ALL 273.82–273.86MiB. The latter excludes 40-module DDL,
new rows, normalization and ACL checks: NOT a full installer upper bound.

Existing mandatory managed-native proof runs actual PostgreSQL NULL/scalar/array/
object/Unicode/numeric/empty/order-equivalence and NULL-omission negative cases,
plus complete original/optimized readbacks in one readonly repeatable-read
transaction. Source-binding tests still reject tracked mutation/wrong head.

Reduced readback peak (~20%) does not establish hosted headroom, exclude an OOM,
resolve atomic snapshot retention, or authorize execution. Keep capacity hold.
