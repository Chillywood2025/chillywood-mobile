# Owner Security mutation repair — 2026-10-20

## Failure and scope

The old `admin-owner-controls` handler tries to mark stale permission grants
expired before dispatching every action. When a stale row is updated, the
`platform_staff_normalize_permission_key` CHECK helper requires EXECUTE
permission that the service role intentionally lacks, producing SQLSTATE
`42501`. A valid read or unrelated action can consequently fail before its own
handler runs. Single/bulk temporary-grant revocation and canary
role/grant setup or cleanup also use direct service-role writes; their separate
mutation and audit requests do not form an atomic transaction.

Removing the automatic sweep does not extend authority. Permission resolution
already rejects a grant at its server expiry time even if its stored status
still says `active`. Stored cleanup status and usable permission are separate
facts. No broad helper EXECUTE grant, RLS exception, or general staff mutation
permission is part of this repair.

A separate regression in the `202608250004` function replacements reopened a
null-actor path in the canonical grant, revoke, and permission-set replacement APIs. An exact
current nonstaff session, or an Owner session without accepted legal terms, can
have no effective actor role. The old `NOT session_ok OR actor_role <> 'owner'`
predicate then evaluates to NULL and skips the PL/pgSQL denial. Forward migration
`20261020152030_staff_permission_null_actor_closure.sql` changes only those three
guards to `session_ok IS NOT TRUE OR actor_role IS DISTINCT FROM 'owner'`.
Signatures, execute ACLs, exact-target checks, audit behavior and the rest of
those API bodies remain unchanged. This narrow denial repair does not establish
concurrency hardening for those older APIs.

## Candidate source contract

- `owner_security_revoke_grants` performs single exact-ID or complete bulk
  start-time-scope revocation, required functional audit, and a durable receipt
  in one database transaction. Current exact Owner/session authority, trusted
  device, linked security context, reason and confirmation remain required.
  Bulk scope is not the panel's display window. An empty successful scope is
  distinct from a missing or malformed receipt.
- An operation identity binds a retry to its original request. A timeout or
  missing response is an unknown outcome, not proof of rollback; refresh or
  reconcile that operation before attempting another. The Edge adapter must
  validate the authoritative result before showing success.
- `begin_admin_canary_run`, `register_admin_canary_user`, and
  `provision_admin_canary_fixture` bind synthetic identities and authority to a
  persisted run manifest. The database fixes the role/permission set and the
  15-minute lifetime. A caller cannot supply arbitrary staff identities,
  permission keys or a longer expiry. Ordinary staff-grant APIs keep
  their existing contract apart from the null-actor denial repair above.
- `cleanup_admin_canary_run` atomically revokes only manifest-recorded role and
  grant IDs. Exact synthetic Auth-account deletion is a separate external
  boundary: permission cleanup does not prove account deletion. A failed,
  interrupted or lost-response cleanup must remain visibly incomplete.
- Canary admission remains Owner, or an exact current Admin/internal
  `operator` or Moderator with `audit_review` or `security_review`.
  `admin.audit.view` alone is not canary execution permission.

`read_admin_canary_manifest` is the recovery/readiness source. A stopped run,
unavailable manifest, missing receipt, authority cleanup failure, or unconfirmed
Auth deletion must not become a passing canary result or a zero-count cleanup
claim. The finite expiry limits effective authority; it does not prove that
stored role/grant rows or Auth accounts were cleaned up. Unknown historical
proof accounts are not adopted by email prefix or erased by a broad sweep.

After an app reload or session change, refresh Canary history to discover the
current actor's pending runs. The **Recover cleanup** action submits the exact
recorded run ID. An open run before its deadline remains in progress; recovery
after its deadline or closure does not rerun checks or turn an interrupted run
into a passing result. The app refreshes authoritative history after recovery
and keeps an incomplete run visible. New runs remain blocked until pending
cleanup is resolved. Unsupported UUID versions or variants are rejected before
a manifest can be persisted.

Bulk revocation captures its exact row selection before waiting for the request
lock. A later grant commit cannot join that selection, even if its transaction
timestamps precede the request. Subsequent row changes require a retry rather
than silently revoking a renewed or replaced grant.

## Client compatibility and deployment hold

The new UUID contract applies to exactly three Edge actions:
`revoke_temporary_owner_grant`, `revoke_all_temporary_owner_grants`, and
`canary_run` (including exact-run recovery). A valid authorized older request
without `requestId` receives `400 request_id_required` before grant or canary
authority mutation. Request-context capture and trusted-device telemetry can
occur before that rejection. The server must not manufacture an operation ID
to make an older mutation client appear compatible.

This matrix follows the source request and receipt contracts. It is not a
completed deployment-matrix qualification.

| Database / Edge / client combination | Supported conclusion |
| --- | --- |
| New database, old Edge | The old direct-write failures remain. Migrations alone do not repair the handlers. |
| Old database, new Edge | Required RPCs are missing. Affected mutations and Canary history cannot complete. |
| New database and Edge, old client | The three mutation actions above reject missing UUIDs. Old Canary UI has no exact-run recovery control. |
| New client, old Edge | Unsafe mixed contract: the old handler may execute, then the new client rejects its incompatible receipt. Do not release the client first. |
| Matching new database, Edge and client | Intended compatible contract. Require successful exact-head integration checks and separately approved installed-client qualification before production use. |

`canary_list` needs no UUID, but the repaired Edge uses the new
`list_admin_canary_pending_runs` RPC. Ordinary staff permission APIs and
templates gain no UUID argument. The three canonical staff APIs keep their
signatures and ACLs while denying NULL or non-current Owner authority.
Device trust/revoke, First Owner, Break Glass, legal actions and other read
panels are outside the new UUID requirement; their existing checks still apply.

Every client bundle containing the pre-repair request helper, including the
PR578 source, sends the older request shapes. No current installed-version
inventory was established during this source repair. Repository release/config
records are historical or planned, and a native version number alone cannot
identify the running JavaScript after an OTA update. Before rollout, record the
affected admin devices' binary/build, running update ID, runtime/channel and
source binding. Do not infer that a historical v80 or runtime record is what
is installed now.

Grant revocation IDs are currently cached only in the app process and exact
account/session. Identical ambiguous retries in that process reuse the receipt;
this does not establish receipt recovery after an app restart or session
change. After a lost response plus restart, inspect authoritative grant/receipt
state before authorizing a fresh bulk action. Canary recovery is separate:
its persisted manifest and pending-run UI support eligible same-actor sessions.

The source suite contains 95 receipt/recovery tests and a 58-case real
PostgreSQL/Auth/PostgREST harness. Test definitions, executed exact-head results,
deployed RPC/Edge readback and installed-client evidence are separate proof.
The harness uses actual production handlers and SDK/database calls, but it is
not an installed mobile release, live provider canary or production cleanup.

## Rollout and evidence

This is source repair, not a production cleanup receipt. Do not deploy the old
`admin-owner-controls` implementation while the CHECK-helper ACL remains closed.
Do not reopen that ACL to make its direct writes work.

After exact-head review and Required Validation, separately authorize and apply
the forward database migrations, verify their function/ACL/receipt contract, and
deploy the matching repaired Edge handler. Hold the three affected admin
mutations unused/unavailable during the mixed-version window and verify client
uptake before resuming them. Inventory interrupted legacy runs separately;
the new manifest protocol does not authorize adopting or deleting their
unregistered accounts or grants. Deploy any changed app code only
under its own app/OTA/release authorization. A database deployment alone does
not replace the old Edge behavior; an Edge deployment before its required RPCs
exist must fail closed.

The repaired revoke/canary requests require a stable operation UUID. Older
clients without that field are rejected before mutation; there is no fallback
to the broken direct-write path. Qualify the matching app/client rollout and
the pending-run recovery display before claiming that these actions work for
installed clients.

Before authorizing a production canary or grant mutation, qualify the complete
path with approved synthetic accounts: current/stale session and trust,
single/bulk rollback, audit failure, concurrent authority changes, idempotent
retry, stopped-run recovery and exact cleanup. Verify the manifest and Auth
deletion outcomes separately. Existing production rows, grants and stopped
runs have not been modified by this source change. Prior device or canary
reports are historical evidence, not proof that this repair is deployed.
