# Registration-only ordering protocol

This source change is based on preference PR593 (`93976ea7`). It is not a
production deployment or a claim that an observed production incident occurred.
The reproduced failure was a deterministic interleaving of actual application
helpers, actual mobile SDK, actual Edge handler and actual SQL in isolation.

## Guarantee and non-guarantees

For one `(platform, install, provider, user, exact session)` registration stream,
all operations capture a server-owned incarnation and revision before permission
prompts or provider token work. The first accepted registration advances that
revision transactionally, including a same-token no-op in the existing ownership
function. A later request carrying the old baseline conflicts instead of
replacing the accepted token. This is **first accepted wins**, not universal
latest-user-intent wins. An earlier action can still win if it arrives first.
No stale provider result refreshes or rebases its captured baseline.

Expo and FCM are independent streams. The existing global push-authority lock
is taken before stream rows, then the existing registration mutation and the
stream/receipt write occur in one transaction. Mutation cannot initialize a
missing stream. Initialization never resets a stream after revocation.

Operation UUID receipts bind every relevant request field through a SHA-256
request digest, without storing the raw provider token or device capability.
Exact replay never reapplies. It reports `registered` only when that receipt's
revision is still current and its exact token is still enabled for the captured
owner/session/install/provider. New stream state returns `conflict`; a retired
registration returns `retired`. Transport or malformed acknowledgements remain
`unknown`, never success. Replays after token retirement do not resurrect it.

This does NOT fence cross-install transfers, session changes, preference/device
coordination, or register-versus-revoke ordering. Cross-runtime first-initialization
of the persisted install ID/capability is also unchanged; this claim requires the
same already-shared install identity. The old generic revoke helpers,
Edge revoke branch, SQL revoke body/grants, default reasons, settings logout and
account-deletion callers, and session cleanup remain byte-identical. In
particular, the existing default `user_request` reason is also used by logout
and account-deletion callers, so changing that path would overlap held work.

Four existing outcomes are deliberately retained and tested:

1. A registration delayed until after revoke can re-enable the same session.
2. A delayed old revoke can disable a newer registration.
3. Replaying a prior successful revoke after re-registration can disable it.
4. Revoke before first registration can return already-detached without a
   tombstone, after which the delayed registration succeeds.

## Source API and rollout boundary

The authenticated `read_my_push_registration_intent` RPC creates/reads the
private stream and returns exact binding, provider, install, incarnation and
string revision. Edge action `registration-intent` exposes this through the
existing device-token endpoint. `register_my_push_token` adds operation UUID,
expected incarnation and string revision to the old registration payload.
The mobile helpers capture these once and send an explicit captured bearer.

The migration REVOKES authenticated/public/anon/service execution of the old
unfenced `wave1_register_push_token` RPC, retaining its unchanged function body
only as an internal security-definer call. Only authenticated callers receive
the two new RPC grants; neither private table is directly exposed. No RLS or
existing token-table privileges are widened.

**This is a coordinated client/Edge/SQL cutover, not backwards compatible
registration.** Applying the SQL while old Edge is live makes old registration
fail. Deploying new Edge without SQL makes snapshots fail closed. Old installed
clients do not send the new protocol and cannot register after cutover. Their
already-registered tokens, status reads and existing revocation paths are not
changed by this protocol. A separate live approval must explicitly cover the
ACL migration, Edge deployment, client delivery and this old-client limitation.
No such production action is authorized by this source change. Compatibility
cannot be restored by leaving the unfenced RPC exposed without invalidating
the guarantee.

## Evidence and limits

- Two independent mobile module/SDK runtimes share persistent install storage.
- Mobile SDK is the existing `2.100.0-chillywood.1`; Edge transport uses the
  official exact pinned `2.110.6` SDK from an isolated integrity-locked npm
  fixture. Root production dependencies are unchanged.
- Real helpers, real Edge code and extracted real SQL cover delayed old token,
  same-token no-op, lost acknowledgement/replay, malformed envelopes, frozen
  bearer, permission/provider delays and the four held revoke outcomes.
- SQL tests cover strict/high-precision revisions, missing snapshots, payload
  binding, rollback/receipt failure, provider independence, cross-install
  retirement readback, exact session expiry/revocation, grants and old-RPC denial.
- Full migration-chain SQL replay includes rollback and byte-identical held
  revoke function/grants plus unchanged existing token-table ACL/RLS policies.
- The native concurrency runner uses only a generated disposable database in an
  existing local Supabase Docker container, observes real backend lock queues,
  and includes a negative control removing the CAS predicate. It rejects remote
  Docker connections. A runner existing in source is not execution evidence.

The controlled auth HTTP, PostgREST, native permission/provider, and Edge runtime
boundaries are doubles. These tests are not installed-device, real provider,
production authentication, production database, build, OTA or release evidence.
