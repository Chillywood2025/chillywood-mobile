# Supabase originals: verified R2 migration boundary

Status: source-only copy/receipt candidate; no provider read,
copy, deletion, credential creation, metadata cutover or activation performed.

## Bounded protocol

1. Resolve one explicitly selected video or social attachment, preserving its ID,
   owner, creation time and attachment parent. Freeze the exact source row and
   unambiguous old locator. Inventory every alias/secondary reference; do not
   silently exclude them or treat a prefix as an object list.
2. Read the existing private Supabase object through a short-lived same-project
   signed URL. Stream SHA-256 and byte count, with a 512 MiB operation ceiling.
   Partial/encoded responses fail closed. Require explicit source Content-Length,
   verify it against streamed bytes, and bound each provider request to 120 seconds.
   Larger originals need a reviewed resumable/multipart path and remain uncovered.
   No signed URL or credential is logged.
3. PUT once to a fresh private R2 key under
   `originals/supabase-migration/{receipt}/{table}/{id}` with signed
   `If-None-Match: *`. Existing targets are conflicts, not reusable proof. Stream
   an independent complete target GET and require identical SHA-256 and size.
4. Persist an immutable receipt only while the exact source snapshot still
   matches. The database records trusted worker assertions; it cannot independently
   verify provider bytes. A copy receipt grants no scan, playback, enrollment or
   cutover authority. Failed/uncertain receipts do not trigger a blind retry or
   automatic object deletion. Reconcile exact pending targets separately.
5. A later reviewed cutover must lock the source, compare the frozen snapshot,
   close writer/alias races, and record transactional before/after receipts.
   Existing scan triggers reset scan state when the locator changes. They MUST
   run, not be bypassed or supplied copied old clean results. The source path must
   support fresh scan completion and failure rollback before this step is usable.
   Current preflight therefore reports cutoverAllowed=false.
6. Preserve the old Supabase object and tracked aliases through the rollback
   window. Rollback compares the exact current migrated incarnation; do not
   overwrite intervening user edits. Rollback also respects scanner triggers.
   Neither direction deletes the alternate object automatically. Verified R2
   originals can later enter separately reviewed legacy provenance enrollment;
   they are never fabricated as new upload reservations.

## Approval and operational dependencies

Source work is independent of provider approval. Live rollout requires the exact
reviewed SQL/function deployment, then bounded access to the named source objects
and fresh R2 destinations. Existing service identity/R2 configuration may suffice
if verified; do not invent a need for new credentials or configure them without
separate action-time confirmation. Metadata cutover, aliases and rollback must be
explicit in the approved batch. Old-provider purge, cache invalidation, retention
activation and irreversible cleanup remain separate consequential operations.

The held scanner remediation stays untouched. The 23 originals cannot be declared
migrated merely because copying passes. Secondary/HLS and brand lifecycle work is
tracked in `retention-secondary-brand-lifecycle-design.md`; moving original bytes
does not cover those categories.
