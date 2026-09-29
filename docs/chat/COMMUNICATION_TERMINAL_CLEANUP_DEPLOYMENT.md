# Communication terminal cleanup delivery

The source correction requires database migration
`20260928164743_communication_terminal_self_leave.sql` **before** publishing a
bundle containing the new membership, admission, media and signaling RPCs. A protected merge
does not deploy that migration or qualify the phones. No production database
mutation, build, or OTA is authorized by the source repair task.

The candidate also requires
`20260929004448_communication_private_state_invalidation.sql` before shipping
the new snapshot listeners. Its [delivery record](COMMUNICATION_PRIVATE_STATE_INVALIDATION.md)
describes empty private room hints and the existing deployed migration-history
parity blocker. Reconcile that history before production deployment planning;
neither migration has been applied by this source task.

This candidate also corrects the pinned WebRTC native sender-replacement
acknowledgment. The Expo plugin changes native inputs on both platforms.
Android 94 and iOS 29 do not contain that native correction. **This candidate
requires new internal binaries and a compatible new runtime generation, not
an OTA onto the old v3 binaries.** Existing native-source digest checks must
reject that mismatch; do not update historical binary receipts to make it pass.

## Contract and compatibility

The migration adds server-owned membership generations, admission identity,
and exact-current-session admission, media-update and self-leave RPCs. Ordinary room RLS, join permissions,
entitlements, private room discovery, and invite terminal transitions stay in
place. The privileged RPC is restricted to the authenticated caller's existing
row and expected generation, and returns only verified LEFT/REMOVED media-off
state. It cannot select a different user. PUBLIC, anonymous, and service-role
execution are revoked; authenticated users cannot rewrite generation values.
It uses an empty search path and locks the room before its membership.

A repeated request for the same modern admission returns its current generation
without reapplying old media preferences. A new admission compares the previously
observed generation and rotates ownership, including an ACTIVE resume after app
restart. A superseded attempt cannot reread a newer generation and silently
overwrite its owner. Media updates, heartbeats and leave require that generation.
Signaling also verifies the sender's generation under the same ownership lock
and stamps it server-side. Receivers reject retired-generation packets, including
packets queued before takeover, and retire only peers belonging to superseded
memberships. A same-generation Presence metadata update preserves its peer.
`joined_at` remains historical and is not an ownership token. The existing room,
identity and ended-room guards remain authoritative; row-level read policies
are not opened to make terminal cleanup succeed.

Previously installed v3 bundles retain the original join signature, explicit
read columns, direct media/heartbeat updates and ordinary self-leave for
legacy-owned rows while the room is readable. They cannot safely resume or
write a modern-owned row without its generation. A rollback must end the active
call through the corrected client first, then use a fresh call/room in the old
bundle. This is deliberately narrower than claiming seamless old-client resume.
Their pre-existing post-terminal readback failure is **not** repaired until the
corrected client loads; the migration alone does not qualify an older client.

The corrected bundle prepares a stable admission attempt, calls
`join_owned_communication_room_session`, and uses generation-bound
`touch_owned_communication_room_session`, `leave_communication_room_session`
and `broadcast_owned_communication_room_signal`. The existing host-only
`room:end` authority remains separate from media signaling.
Publishing it to an unmigrated
database would fail. There is no missing-column fallback, null-generation
success, or broadened read policy to hide a deployment mismatch.

Join/leave callers separately bound the UI wait while retaining actual
transport settlement. A read/display timeout does not cancel server work.
Transport-unavailable outcomes remain ambiguous; an old unresolved admission
must not authorize a same-row replacement. An exact-generation leave can be
retried to confirm LEFT before a replacement join rotates the generation.
Retirement reserves that ownership before awaiting native disconnect or audio
teardown, including across a full component unmount/remount. Gateway failures
and unusable mutation receipts cannot establish that the server canceled work;
an explicit server denial is different from an unknown mutation outcome.

## Required delivery order

1. Complete protected source validation, including the full migrated database
   suite and the actual authenticated local HTTP integration. Verify the exact
   migration/version/source diff and obtain the separate database deployment
   authorization before any production application.
2. Apply both forward migrations through the canonical database tooling. Confirm
   migration history/parity, the column/default, restricted function grants,
   trigger ordering, unchanged row policies, and PostgREST schema availability.
   Use designated test accounts for any authorized functional readback.
3. Confirm legacy-owned old-v3 compatibility and migrated API checks. Under
   separate native-build/delivery authority, generate both native projects,
   verify the version/hash-bound SDK patch and native inputs, select the new
   compatible internal runtime generation, and build through the canonical
   platform tooling. Review exact artifacts and capabilities before delivery.
4. Verify each installed binary, runtime and source identity and rerun the physical matrix.
   In particular: End after accepted invite terminal transition, both endpoint
   cleanup, repeated End, fresh calls, same-room replacement, account switch,
   and delayed cleanup during newer media intent.

If delivery fails, stop publishing the corrected bundle. An authorized client
rollback may use a verified compatible older v3 bundle after active-call cleanup;
it must start a fresh call instead of resuming a modern-owned membership. Keep the additive
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
| `test-chat-message-call-lifecycle-http.mjs` | Actual messaging, call-begin and account-bound client modules against disposable Auth/PostgREST/RLS. Proves persisted messages across terminal call transitions, exact stored expiry, rejected writes and account replacement. It does not invoke production delivery workers. |
| `test-chilly-chat-real-peer-http.mjs` | Two actual legacy hooks use real authenticated SDK channels, owned database admission/signaling, and real Chromium SDP/ICE/RTP. Measures received PCM/video, both endpoints' media controls, actual membership cleanup and a fresh call. Capture is synthetic; server invite setup uses the canonical service transaction. Edge delivery and phones remain outside this gate. |
| Physical device matrix | Native capture release, audio-session teardown, CallKit dismissal and successful next calls on the installed iPhone/Android binaries. Source/SQL tests cannot substitute for this evidence. |

This workspace has no Docker/local Supabase service. Actual full-stack HTTP
and pgTAP execution is required in the Database CI job and must be identified
by exact head in the PR; local module-wiring checks are not backend passes.
The compiled native-method contracts use controlled RTC/bridge edges. They
do not substitute for full native builds or installed-device media proof.
Deployment and physical qualification remain separate, explicit work.
