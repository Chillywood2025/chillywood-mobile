# Scheduled event broadcast producer

This is source implementation and local evidence for the paid virtual-event lane. It is not provider activation, a deployment, installed-device qualification, or proof that a production show can run today. Existing D7D proof paths are unchanged.

## Source journey and authority

1. `prepare_creator_event_broadcast` in migration `20261026172448` verifies the current creator session, event ownership and state, existing finite host Premium, and account/legal authority. It creates or recovers one exact private, locked Live Stage host room and an unapproved, nonplayable event broadcast binding. Preparation does not create a media URL, ticket grant, provider job, or operator approval. A private trigger prevents broadening the room or replacing its bound identity.
2. `_lib/creatorEventBroadcast.ts` calls that RPC with current-account checks before and after asynchronous work. `read_creator_event_for_host_room` derives an event from the exact owned room on the server; caller-supplied event IDs cannot establish host authority. An ordinary host room returns an explicit null event. The event host controls use this mapping to keep the camera and event controls in the same Live Stage route.
3. `creator-event-broadcast/index.ts` accepts only action and event ID. It verifies the current authenticated session, then uses service-only source-authority RPCs. It accepts no caller-provided provider ID, output URL, approval, or routing override. The service-authenticated worker action invokes only due cleanup.
4. The producer requires a finite trusted platform qualification, an active worker lease, the existing live cost guard, exact assigned LiveKit server/room, and an actual unmuted publishing host participant bound to the original session. A database claim records one unresolved durable attempt, pinned routing, exact private output prefix, and finite stop deadline before a provider start. Missing output configuration fails before that claim.
5. The actual transport calls LiveKit `StartEgress`, `ListEgress`, and `StopEgress` using the existing credentials and assigned server contract. It consumes only the modern `StartEgress` response identity and rejects legacy D7D receipts, mismatched rooms, prefixes, or provider IDs. A lost response remains uncertain; recovery queries the original attempt and never blindly sends another start.
6. An actual ACTIVE provider receipt is insufficient by itself. The same private playlist and a referenced segment must reject anonymous retrieval and succeed through signed retrieval. The producer rechecks creator/session/host/cost authority after provider IO, and receipt SQL rechecks the bound source and deadline before projecting playable readiness. Account loss or a publicly readable origin triggers exact-attempt cleanup. No raw HLS URL or spectator room token is returned by this endpoint.
7. The durable deadline worker claims due jobs independently of the creator's current session. A missing provider list result is not proof that a job stopped. Unknown cleanup keeps its durable reconciliation state and does not renew the healthy worker lease. A successful scan, including an empty queue, may renew that finite lease. No schedule was deployed.
8. Actual provider COMPLETE plus a private final `index.m3u8` with ENDLIST can supply replay evidence. Migration `20261026173441` projects a ticketed event replay only for explicitly configured or fulfilled immutable replay terms; none/unknown, canceled/no-show, expired terms and revoked approval remain closed. The library source room is the actual prepared host-room ID. Each buyer's gateway still checks that buyer's immutable entitlement. No replay duration is invented.
9. Recovery migration `20261026184512` permits another attempt for the same live-only show only after the prior attempt has a bound terminal provider receipt and completed cleanup job. It retains the prior attempts/receipts, serializes recovery under the event lock, and gives the replacement a new broadcast and output identity in the same host room. The original stop deadline, event schedule/replay terms, current host/session, worker lease and same finite approval remain mandatory. Unknown outcomes never qualify. Existing playback constraints and permission boundaries remain unchanged.

## Files and local evidence

| Boundary | Source | Evidence |
| --- | --- | --- |
| Exact preparation and host-room mapping | migration `20261026172448`; `_lib/creatorEventBroadcast.ts` | Recovery full-schema preparation test passed 43 assertions, including the host-room mapping. Client mapping/session tests pass. |
| Finite qualification, claim, receipts, due cleanup and replay | migrations `20261026173441` and `20261026184512` | Recovery passed 33 embedded SQL assertions and 33 native PostgreSQL assertions, including concurrent retry admission and its negative control. Source hashes match the retained evidence. No approval rows are seeded. |
| Creator preparation and producer UI | `components/monetization/event-broadcast-preparation.tsx`; `_lib/creatorEventBroadcastProducer.ts` | Mounted preparation tests cover exact host navigation, duplicate calls, old-event completion and stale-account navigation. The separate host-controls suite owns the camera-route integration. |
| Real producer orchestration | `supabase/functions/_shared/creator-event-broadcast-producer.ts` | Production state-machine tests cover authority loss, timeout followed by actual-attempt recovery, absent/mismatched receipts, no second start, terminal stop proof and public-origin cleanup. Provider IO is synthetic. |
| LiveKit/S3 protocol | `supabase/functions/_shared/creator-event-broadcast-transport.ts` | Production transport tests assert modern Twirp request shape, pinned routing, exact response binding, anonymous403 plus signed200, missing-object denial, unsafe playlist rejection and private final-index requirements. No provider was contacted. |
| RPC/worker/HTTP | `supabase/functions/_shared/creator-event-broadcast-runtime.ts`; `supabase/functions/creator-event-broadcast/index.ts` | Actual Edge-handler tests reject caller routing fields, ordinary-user worker dispatch and stale authenticated actors. Runtime tests require activation acknowledgement, fail on cost-query errors, and withhold worker health after uncertain cleanup. Deno check passed with `--node-modules-dir=none --no-lock`. |

The final bounded preparation client, mounted preparation, producer client, producer/transport and runtime/HTTP run passed **25/25 tests** on October26. It includes natural provider completion through refresh, which performs the same private final-index verification as the cleanup worker; ProtoJSON defaults; and confirmed terminal history after the camera disconnects. Its durable output is `/tmp/creator-event-broadcast-source-tests.log`. The prior full-schema preparation output is `/tmp/creator-event-broadcast-preparation-sql.log`; Deno output is `/tmp/creator-event-broadcast-deno-check.log`. Focused ESLint and `git diff --check` passed. These logs are execution evidence, not committed provider receipts. Final repository checks and exact-head CI remain the parent task's responsibility after source freeze.

Recovery follow-up on October26 adds `event-broadcast-producer-postgres.test.mjs`
and `test-creator-event-broadcast-native-postgres.mjs`. The native PostgreSQL17.6
run passed33 actual SQL assertions plus a two-session retry race (one authorized
dispatch), original-deadline preservation, and a duplicate-attempt negative
control that removes the partial unique index inside a rolled-back transaction.
The SQL assertions cover current session, approval/worker absence, lost-response
uncertainty, terminal proof, retained history, unchanged schedule, revoked
qualification, expired original deadline, old callbacks, and current/historical
purchased replay promises. The complete migration-chain PGlite test also passed
all33 assertions (169s). The producer/transport/runtime source suite passed17/17.
Provider transport and trusted approval inputs remain synthetic. Logs are retained
in the recovery session's `recovery-evidence/broadcast-producer-native.log`,
`broadcast-producer-sql-verified.log`, and `broadcast-producer-source-final.log`; full-repository validation and CI remain
separate. Two earlier SQL attempts failed on invalid fixture UUIDs; the fixture
now creates real UUID4 event identities. No production media constraint was
weakened to accommodate the fixture.

## Official integration contract checked

- [LiveKit Egress API](https://docs.livekit.io/reference/other/egress/api/) documents `StartEgress`, room-record authorization, response/status operations, and the current self-hosted version requirement. The adapter intentionally uses the modern API; it does not silently fall back to an older Egress call. Provider version compatibility still needs actual deployment qualification.
- [LiveKit protocol schema](https://raw.githubusercontent.com/livekit/protocol/main/protobufs/livekit_egress.proto) defines the `egress` request identity, segmented output fields and pagination used by the parser. Only exact room/output identity can reconcile the durable attempt.
- [ProtoJSON presence rules](https://protobuf.dev/programming-guides/json/#presence-and-default-values) allow default enum values and empty repeated fields to be omitted. The parser handles omitted STARTING/empty items without treating an empty list as proof that an existing provider attempt stopped.
- [LiveKit Egress deployment](https://docs.livekit.io/transport/media/ingress-egress/egress/) describes Egress as a separately deployed self-hosted component. Source code does not establish that a compatible worker exists.
- [Amazon S3 GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html) explains object retrieval and permission-dependent error behavior. Anonymous403 alone cannot prove an object exists privately; the adapter also requires a successful signed read of that same object. Anonymous404 never qualifies.

## Remaining qualification and decisions

- The owner decision between creator self-start after finite platform qualification and manual approval for each show remains separate from the engineering transport. SQL supports finite creator-scoped or event-scoped qualifications without selecting that product policy or seeding permission.
- Existing output credentials, a genuinely private origin, modern LiveKit Egress, the actual server routing, timed-stop worker invocation and worker health must be qualified in the authorized environment. No credentials, provider settings, scheduler, approvals or deployment were changed here.
- Production ACTIVE/COMPLETE receipts, private-object denial, actual camera-track/session binding, provider cleanup after network failure, and iOS/Android installed-device behavior remain unavailable physical/provider evidence. Local synthetic tests do not replace them.
- An attempt whose provider outcome cannot be determined remains durably uncertain and blocks a blind replacement. The source does not fabricate successful cleanup or offer an unqualified reset. Operational reconciliation is required for that case.
- Confirmed-terminal recovery is limited to live-only shows. If the current event or stored ticket terms promise replay, the current single-recording resolver cannot combine recordings from multiple attempts. Recovery therefore requires platform assistance to preserve the purchased replay; it cannot silently return only the later fragment. Attempts created before the original-terms snapshot exists also remain ineligible for automatic replacement. Multipart replay remains a source limitation, separate from provider/device qualification.
- This new producer is for paid ticketed creator events. Existing unrelated public/Circle media and D7D qualification remain separate. Physical seating and auction implementation are outside this implementation.
