# Profile/feed backend deployment — 2026-10-28

The four approved backend migrations are installed and verified. Client OTA is
**unpublished**. This is not physical-device or million-concurrent-user proof.

## Source and installed identity

PR #627 source `e87ced1c3e1dd2bdf79a15a1792f42525bf4bfc9` passed all 12 CI jobs
and exact-head Required Validation; merged main is
`5b11822de9a3ea4f5ca4d99c6f06e7ec39b41ad4`.
The connector assigned installed timestamps. This reconciliation renames files
only: SQL bodies are byte-identical, with no duplicate candidate files and no
remote history rewrite. All 468 preexisting migration-history rows are unchanged.

| Migration name | Candidate version | Installed version | SHA-256 of exact installed payload |
| --- | --- | --- | --- |
| profile_relationship_feed_cursor | 20261027210217 | 20261028005149 | `3841645f4ef65c6393cc85b77e4b23a56d4b90ecaea436f585ec3de00878920b` |
| profile_public_read_role_isolation | 20261027211112 | 20261028005306 | `456d9898f05e109f98e0f23e877f659cd2086ad397e8753575c05e76cae4b357` |
| profile_engagement_sharded_counters | 20261027214412 | 20261028005432 | `0aac25388cd402fea09c83c801c8710e76850e8e502c4ed09b87ba11c55981e0` |
| profile_feed_guarded_candidate_fastpath | 20261027221629 | 20261028005725 | `e5439086a1269eec3065f7b6bdee8d73d80fc92d975c97c2b1e487a323552284` |

Each installed entry contains one statement holding the exact submitted file.
The [transaction-guard evidence mapping](evidence/profile-migration-transaction-guards-20261027.json)
resolves installed filenames and preserves `candidateFile` aliases. Original
benchmark files, measured hashes, engines, timings and atomicity observations
retain their original identities. Runtime-equivalence hashes link the earlier
pre-wrapper measurements to guarded payloads; this rename does not rerun or
relabel those measurements.

Reconciliation checks: four exact-byte comparisons against merged source; five
payload/provenance tests; four catalog/mutation inventory tests; native canonical
replay of 470 migrations with 21 guarded-candidate, 57 counter and 107 feed
checks; four native atomic rollback/unblocked-retry/settings-restoration cases;
and 16 native concurrency/accounting cases on minimal source fixtures.
These are fresh correctness/path regressions, not repeated scale
benchmarks. Original performance evidence remains unchanged.

## Verified live outcome

- Full scoped catalog equals the native exact-tree expectation: zero differences
  across 14 functions, 9 relations, 111 columns, 43 constraints, 29 policies,
  46 explicit triggers and 37 replay indexes, plus exactly two unchanged
  preexisting Brand indexes. This is scoped equality, not a global audit.
- All five new public indexes are valid and ready; no invalid new indexes.
- Private counters have FORCE RLS and no direct schema/table access for anon,
  authenticated or service_role. Candidate helper EXECUTE is authenticated-only
  apart from its owner; anon/service_role denied. Anonymous role isolation and
  unchanged authenticated policy expressions match source.
- Exact source-to-shard counter parity assertions completed in a bounded,
  read-only transaction. All five privileged OID-based ACL checks passed.
- Anonymous and authenticated empty-public-RPC assertion scripts completed in
  read-only transactions with local roles and rollback. These are successful
  assertions, not returned result-row claims or real-user impersonation.
- Live PostgREST anonymous HTTP checks used an existing enabled publishable key:
  empty `read_profile_post_engagement_batch` returned HTTP 200 with zero rows;
  `read_profile_relationship_feed_page` correctly denied anonymous access with
  HTTP 401 / code `42501`. This verifies schema/read transport and anonymous
  denial, not authenticated personas or devices. No keys were created or stored
  in this record, and no user rows, fake-user JWTs or provider changes were used.
- Final session settings were restored (statement timeout 2 minutes, lock timeout
  zero); no idle open transactions. No production test users/posts were created.

Private row data, complete catalog snapshots and raw provider evidence remain
outside the repository. No provider configuration, credentials, public release,
money activation or load test was part of this deployment.

## Advisor delta

Before/after comparisons exclude only observation timestamps. Expected additions:

- One [anonymous SECURITY DEFINER notice](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
  for `read_authorized_profile_post_counts`; two
  [authenticated SECURITY DEFINER notices](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
  for that endpoint and `read_authorized_profile_feed_candidates`. These are
  intentional source-authorized read endpoints with independently checked ACLs.
- One [RLS-without-policy notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
  for `profile_engagement_private.post_counts`: intentional deny-all direct
  access, with authorized aggregate endpoints instead.
- Five [unused-index notices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)
  for the new public indexes; the new client is not yet published.

No new [mutable-search-path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
or [duplicate-index](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index)
notices appeared. Existing global warnings persist; the project is not claimed
warning-free. URLs above are the advisor-provided remediation links.

## Remaining qualification and limits

- Internal OTA is unpublished; Expo device-login approval remains unanswered.
  Physical Android/iOS smoke tests have not run.
- Own-feed freshness uses a 120–180-second active-screen fallback and coalesced
  notification hints, not complete instant push. Visitor heads refresh manually,
  on focus or foreground. Visible engagement counts refresh; comment text uses
  explicit refresh preserving drafts and paging.
- Native fixtures and CI do not establish million-concurrent-user capacity.
  True push needs separately qualified invalidation/outbox, authorization,
  coalescing and provider delivery; production load budgets remain unqualified.
- Candidate output is capped at 51, but actor JSON parsing, deduplication and
  per-actor scans are not bounded by that output limit. Direct actor filters
  retain canonical read authority; this is nonblocking work-budget hardening,
  not a demonstrated new rights bypass or denial-of-service primitive. Existing
  tests cover 65 arbitrary actors and a 1,059-actor graph, not an oversized-input
  boundary. Any bailout requires a supported-degree policy and boundary/oracle
  tests rather than an arbitrary cap.
- Migration-local 5-second lock and 60-second statement limits bound individual
  lock waits and statements during deployment, not total transaction lifetime;
  they are **not** verified RPC runtime limits.
- Unrelated historical timestamp aliases remain untouched. Only these four
  deployed identities are reconciled here.
