# Communication terminal cleanup delivery

The source correction requires database migration
`20260928164743_communication_terminal_self_leave.sql` **before** publishing a
bundle containing the new membership selection and leave RPC. A protected merge
does not deploy that migration or qualify the phones. No production database
mutation, build, or OTA is authorized by the source repair task.

## Contract and compatibility

The migration adds a server-generated `membership_generation` and an
exact-current-session self-leave RPC. Ordinary room RLS, join permissions,
entitlements, private room discovery, and invite terminal transitions stay in
place. The privileged RPC is restricted to the authenticated caller's existing
row and expected generation, and returns only verified LEFT/REMOVED media-off
state. It cannot select a different user. PUBLIC, anonymous, and service-role
execution are revoked; authenticated users cannot rewrite generation values.
It uses an empty search path and locks the room before its membership.

A duplicate ACTIVE join retains its generation. A permitted LEFT-to-ACTIVE
admission rotates it. The rotation trigger runs after the existing membership
and ended-room guards, so a suppressed stale reactivation cannot invalidate a
terminal generation. `joined_at` remains historical and is not an ownership
token. Local PostgreSQL tests explicitly exercise RLS with FORCE RLS as well;
the migration does not change either production RLS flag or any row policy.

Previously installed v3 bundles can keep using the original join signature,
explicit read columns, direct media/heartbeat updates, and ordinary self-leave
while the room is readable. These operations are covered against the additive
schema. Their pre-existing post-terminal readback failure is **not** repaired
until the corrected client loads. They do not receive the new generation-bound
late-cleanup protection merely because the migration is installed.

The corrected bundle explicitly selects `membership_generation` and calls
`leave_communication_room_session(text, uuid)`. Publishing it to an unmigrated
database would fail. There is no missing-column fallback, null-generation
success, or broadened read policy to hide a deployment mismatch.

Join/leave callers separately bound the UI wait while retaining actual
transport settlement. A read/display timeout does not cancel server work.
Transport-unavailable outcomes remain ambiguous; an old unresolved admission
must not authorize a same-row replacement. An exact-generation leave can be
retried to confirm LEFT before a replacement join rotates the generation.

## Required delivery order

1. Complete protected source validation, including the full migrated database
   suite and the actual authenticated local HTTP integration. Verify the exact
   migration/version/source diff and obtain the separate database deployment
   authorization before any production application.
2. Apply the forward migration through the canonical database tooling. Confirm
   migration history/parity, the column/default, restricted function grants,
   trigger ordering, unchanged row policies, and PostgREST schema availability.
   Use designated test accounts for any authorized functional readback.
3. Confirm old-v3 compatibility and migrated API checks before authorizing the
   corrected source for compatible internal delivery. Publish through the
   existing platform-specific release tooling only after separate approval.
4. Verify each installed update/source identity and rerun the physical matrix.
   In particular: End after accepted invite terminal transition, both endpoint
   cleanup, repeated End, fresh calls, same-room replacement, account switch,
   and delayed cleanup during newer media intent.

If delivery fails, stop publishing the corrected bundle. An authorized client
rollback may use a verified compatible older v3 bundle; keep the additive
migration in place. Do not remove the column/RPC while any installed corrected
client may use them. Database corrections remain forward-only. Older client
rollback does not establish that its known physical defects are resolved.

## Proof boundaries

| Proof | Scope |
| --- | --- |
| `test-communication-terminal-postgres.mjs` | Actual checked-in authority, join, identity, terminal trigger and migration SQL in disposable PostgreSQL; demonstrates the former zero-row cleanup failure, exact terminal confirmation, stale generation rejection, ACLs and old-client compatibility. |
| `communication_terminal_self_leave_test.sql` | Focused pgTAP checks on the complete migrated local database: grants, RLS, old-client requests, rotation, revoked session, terminal visibility and immutable generation. |
| `test-communication-terminal-http.mjs` | Actual application communication/authority/mutation modules and frozen-JWT HTTP transport against local Auth/PostgREST and the complete migration stack. Covers both terminal endpoints, idempotent retry, concurrent old-leave/rejoin, outsider, missing identity and revoked-session rejection. It refuses non-loopback API origins. |
| `account-bound-room-settlement.test.mjs` | Actual mutation and deadline modules plus actual transport with a controlled response; proves join/leave retain late results, other RPC deadlines remain bounded, and account replacement or transport failure cannot manufacture cleanup success. |
| Physical device matrix | Native capture release, audio-session teardown, CallKit dismissal and successful next calls on the installed iPhone/Android binaries. Source/SQL tests cannot substitute for this evidence. |

At source preparation, local SQL and API/settlement tests pass. This workspace
has no Docker/local Supabase service, so the full-stack HTTP and pgTAP runs are
left to the required Database CI job; they are not reported as local passes.
Deployment and physical qualification remain separate, explicit work.
