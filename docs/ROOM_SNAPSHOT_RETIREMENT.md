# Mounted room authority retirement

Room metadata is not a fallback for an unavailable canonical room read. The
mounted owner binds the room, account/session, route, focus and foreground
lifetime. Its first canonical room also binds generation, source, type and host;
a changed binding requires fresh admission rather than reusing prior paid/source
checks.

An initial snapshot may precede membership admission. After a join attempt, a
new canonical snapshot must contain the current active/reconnecting membership
without `leftAt`. A join response or an old roster cannot substitute for it.
Missing, ended, failed, timed-out or revoked snapshots retire that owner, clear
private presentation, and release only resources registered to that owner.
Established owners cannot reactivate; a retry creates a new owner. Initial React
StrictMode effect replay does not reuse an old read or admission proof.

Party Room removes its captured channels/timers and exact-own-viewer discovery
interest, clears room/chat/roster/host state, and unmounts local camera preview.
Late permission, attachment and channel callbacks cannot restore retired state.
Same-topic channel reopening waits for captured asynchronous removal, including
when the route component remounts; an old disconnect cannot retire its replacement.
Opaque viewer hints prompt current canonical reads, with one trailing read for a
burst. Room/membership events and the existing 30-second poll remain fallbacks;
the 15-second membership heartbeat also refreshes. A held canonical read fails
closed after 12 seconds. These are client bounds, not an instantaneous delivery
or network cancellation guarantee.

Shared Player separately binds prepared access and verified joined membership;
playback, comments and LiveKit remain unavailable until both are confirmed.
Its canonical synchronization/membership polling runs every 3 seconds and uses
the same 12-second fail-closed read deadline. Discovery pause alone preserves
authorized Circle playback; loss of current Circle admission retires it.
Retirement clears private roster/chat, host references, local media intent and
LiveKit contracts, and pauses the owned video. Captured camera permission and
seek/play completions cannot enable or pause a newer room or solo lifetime.
Synchronization latches are exact-operation owned. Same-topic social channels
await old removal settlement; Postgres subscription topics are unique per owner.
The party route stays denied rather than silently falling back to solo playback;
ordinary solo playback and existing Premium/paid admission checks are unchanged.

Mounted tests execute the production bootstrap, lifecycle, channels and camera
predicate with transport/native adapters replaced. They prove JavaScript state
retirement and cleanup invocation, not physical camera teardown, native provider
disconnect, remote token revocation or installed-device behavior. Remote media
revocation remains subject to its separate server/provider monitor and needs
provider/device evidence.

Attachment selection is distinct from foreground room/media authority. Once an
explicit native selector starts, its immutable account/session, route, room
generation/source and joined-membership identity can remain pending through the
selector's normal Activity/VC lifecycle. Room channels, timers, camera and private
presentation still retire on background as before. No result or error is applied
in the background. After return, the original intent must pass a fresh canonical
snapshot, the existing paid/Premium/admission reads, and another exact canonical
snapshot before selection can populate the composer. A source/generation change,
leave/rejoin, account/route replacement, missing proof or bounded read timeout
discards it; a new foreground room owner is never substituted as authorization.
This path only selects a file. Explicit Send retains its separate current room,
account/session and captured mutation authority. Mounted lifecycle tests prove
these JavaScript boundaries, not OS dismissal or installed picker behavior.

Selected native-cache files have a separate explicit UI owner. Replacement,
removal, room/account retirement and unmount request cleanup, but an in-flight
send retains its original file until settlement. Actual raw-reader promises keep
their own lease even if a UI-level timeout returns first. This byte lifetime does
not restore retired room, admission or mutation authority.
