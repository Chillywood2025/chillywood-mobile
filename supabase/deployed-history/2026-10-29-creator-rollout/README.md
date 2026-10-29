# Creator backend deployment history

This archive retains the actual canonical Supabase migration record applied to
project `bmkkhihfbmsnnmcqkoly` on2026-10-29. Version `20261029091757`, named
`creator_backend_atomic_rollout`, contains one exact576507-byte statement string.
Its SHA256 is `cb7c21435e3eee37dd1d03144a9b05b34ba0cb518e35067dc44905ed517af8ca`.

The statement equals the reviewed `prepareMigration` output byte-for-byte. It
combines25 source components with the transformations and initial lock scope in
`ops/creator-backend-rollout/database-manifest.json`. The original25 files remain
inputs for a fresh source-built database. **They are already represented by this
deployed identity and must not be applied again to production.** This explicit
component mapping replaces any assumption that unmatched original filenames are
pending production work. Do not use a blanket database push or migration-history
repair to reconcile the different identities.

The canonical tool generated the version and recorded the statement; no manual
history insertion, renaming or repair occurred. All473 prior version/name/body
fingerprints remained unchanged, and the history count became474. The archive
contains SQL source only, without production rows, secrets or provider payloads.
`manifest.json` binds the compressed and decoded archive hashes, actual deployed
identity, exact statement hash and all25 source component hashes.

Readback matched all105 expected function identities, bodies, owner/security
attributes and ACLs. All25 production events have replay observation anchors,
the pending-observation queue is empty, the fact foreign key targets the private
anchor table, and the commit trigger is enabled and initially deferred. All
three private observation tables retain RLS and FORCE RLS. Live money and payouts
remain off. See the rollout audit for Edge restoration and qualification scope.
