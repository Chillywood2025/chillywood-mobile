# Chi'lly Chat complete-system closure ledger

Updated: 2026-08-30 (America/Chicago)
Closure method: recursive grouped closure; a merge is not physical proof.

## Durable recovery checkpoint

- Protected `main`: `f3bc447dea6d5681ce632abfd07dc425fd1a46f3`; tree `88516bcc21e1f8af9cf593343abe748a5f6fa204`; parents `9965b107920619ecfa616bf69a2dfd6d5d9b71b9` and `1840f7156446ffa58060fae82fbcd3e48fc0b721`.
- Latest merged repair: PR #315, head `1840f7156446ffa58060fae82fbcd3e48fc0b721`, normal two-parent merge `f3bc447dea6d5681ce632abfd07dc425fd1a46f3`.
- PR #315 used the Owner-authorized assurance-only temporary PR bypass on active ruleset `18940814`. Writable ruleset hash was `8edf290e70141cfe0b3a371f958e8add21f997de1c87e99cbe2c927b9a90904a` before and after; temporary Owner user actor `210200794` produced bypass-state hash `8033733a5057046b5cd031e9606d0c25a11cd05596176c7a26cb16de5a2b2abe` and was removed immediately after the exact-head merge. Final active ruleset contains only Integration actor `4707730`.
- Exact #315 internal-v2 OTAs: Android group `2bbf0eaf-57ca-46d7-b3bd-c3b190be380a`, update `01a05360-5870-7135-bc66-ab69109e0e97`, runtime `1.0.0-android-production-v2`; iOS group `7e9dccd7-d448-4491-963f-77830749af43`, update `01a05364-9097-7d77-a88d-1ce0cb1754ad`, runtime `1.0.0-ios-production-v2`. Both updates bind commit `f3bc447dea6d5681ce632abfd07dc425fd1a46f3`; attached Android build 91 and iPhone build 13 consumed the exact updates.
- Post-#315 physical messaging for the interrupted pass: Android→iOS multiline `A2B_315_line1\nline2_20260830T1108Z`; iOS→Android multiline `B2A_315_line1\nline2_20260830T1109Z`; exact Realtime rendering; preview/unread/read proof with `UNREAD_315_20260830T1110Z`; Android keyboard visibility, multiline, send, and scroll. The full matrix must restart after the next grouped OTA.
- A first invite `8267aa77-1569-48b1-8b8a-bd402a6335e1`, room `369GQQ`, expired before acceptance while evidence was being collected; production correctly marked it missed and left no memberships. This is tester delay, `NOT_A_DEFECT`.
- Accepted blocker run: invite `04c90c77-de19-439a-85c4-eabaf074e458`, room `L46HPX`, accepted `2026-08-30T16:12:27.328555Z`, legacy WebRTC. Both devices reached two-member `Connected`; Android membership PATCH and `media:update` RPC returned 200, WebRTC offer/answer/ICE and remote-track callbacks completed, but a concurrent same-room snapshot replacement caused Android to reject its successful initial media promotion and compensate to muted. Android displayed `Call media could not be synchronized. The call remains muted.` Normal termination at `2026-08-30T16:15:00.312501Z` ended invite/room, left both memberships, cleared the thread projection, and returned both UIs to no active call.

## Standing material cross-feature audit boundary

Every recursive failure-graph pass includes shared or cross-feature code when it can materially affect Chi'lly Chat through authentication/session authority, navigation, Realtime, notifications, native lifecycle, media, provider routing, room namespace, or cleanup. Defects without a material path into the required Chi'lly Chat messaging/call closure remain out of scope and are not repaired under this task.

## Cumulative defects

### CC-306-ROOM-ID — accepted room identifier rejected by client provenance

- Discovery source: physical foreground accepted-call and iOS CallKit handoff evidence; PR #306.
- Exact failure/layer/severity: valid production alphanumeric communication room codes were treated as UUID-only by client/native provenance; integration-seam blocker.
- Upstream dependencies: exact authenticated user, thread, invite, native claim. Downstream consequences: accepted route/media descriptor and cleanup could not bind the room.
- Root cause/group: incompatible identifier contracts; `ROOM_IDENTITY_CONTRACT`.
- Platforms/providers: Android and iOS; legacy WebRTC and LiveKit shared handoff.
- Affected files: `_lib/communicationRoomIdentifier.*`, communication/native transition policy, chat route, native provenance tests.
- Repair/regression proof: PR #306 introduced the bounded room-name contract while retaining UUID identity contracts; focused malformed/cross-binding/replay/both-provider tests.
- Database/OTA/native requirement: no DB or native-build change; OTA required and cumulatively published.
- Physical state/disposition: later production accepted calls used non-UUID room codes, but complete call behavior remains in the cumulative physical run; `PHYSICALLY_PROVEN` for the identifier handoff.

### CC-307-STALE-REUSE — stale accepted room won same-thread reuse

- Discovery source: physical ordinary legacy voice-call start; PR #307.
- Exact failure/layer/severity: a persisted accepted invite with an active-status room older than the 15-minute join window was reused; database temporal-authority blocker.
- Upstream dependencies: thread projection, invite lifecycle, room activity. Downstream consequences: obsolete panel, no new invite, media join rejection, false cross-thread busy.
- Root cause/group: status-only liveness disagreed with downstream activity-window authority; `TEMPORAL_CALL_AUTHORITY`.
- Platforms/providers: both platforms and both providers through shared call begin/cleanup.
- Affected files: migration `20260830043000_chilly_chat_stale_accepted_room_reuse_closure.sql`, call-begin pgTAP.
- Repair/regression proof: accepted reuse/busy/cleanup now require an active room within 15 minutes and stale accepted invites transition terminal; focused pgTAP and source/provider guards.
- Database/OTA/native requirement: production migration required and present; no OTA or native build for this repair alone.
- Physical state/disposition: later calls created and accepted fresh rooms, but the explicit stale-room replacement scenario has not been rerun on both devices; `REPAIRED_UNPROVEN`.

### CC-308-PREACCEPT-RLS — callee room read required membership before acceptance

- Discovery source: physical in-app Answer failure and production RLS analysis; PR #308.
- Exact failure/layer/severity: client required a pre-accept room snapshot that callee RLS intentionally hid until membership; sequencing blocker.
- Upstream dependencies: fresh exact ringing invite and authenticated callee. Downstream consequences: authoritative accept transition was never attempted.
- Root cause/group: circular authorization sequence; `RLS_SEQUENCE`.
- Platforms/providers: both platforms/providers through the shared accept handoff.
- Affected files: `app/chat/[threadId].tsx`, call semantics, accept-liveness pgTAP.
- Repair/regression proof: removed only the impossible pre-accept read while retaining Edge/database/session authority; exact RLS regression.
- Database/OTA/native requirement: no DB/native change; OTA required and cumulatively published.
- Physical state/disposition: subsequent exact invites reached durable accepted state; `PHYSICALLY_PROVEN` for acceptance sequencing.

### CC-309-FIRST-MEMBERSHIP — transient identity read suppressed first join

- Discovery source: accepted Android call with room/membership reads but no join RPC; PR #309.
- Exact failure/layer/severity: legacy media startup performed independent auth reads; a transient empty/guest result returned before membership dispatch and unreadable snapshot was misclassified as room-ended; identity/lifecycle blocker.
- Upstream dependencies: mounted authenticated subject, accepted invite, active room. Downstream consequences: neither peer joined usable media.
- Root cause/group: redundant identity lookup plus incorrect negative read classification; `SESSION_TO_MEMBERSHIP_HANDOFF`.
- Platforms/providers: Android-observed; shared legacy/LiveKit identity code audited.
- Affected files: communication library, both provider hooks, chat surface, routing/semantics tests.
- Repair/regression proof: authenticated identity requirement, bounded retry, unreadable-snapshot error classification.
- Database/OTA/native requirement: no DB/native change; OTA required and cumulatively published.
- Physical state/disposition: later work found an additional redundant lookup and RPC binding fault, so this repair is preserved but not claimed independently complete; `REPAIRED_UNPROVEN`.

### CC-310-MOUNTED-SUBJECT — mounted SessionProvider identity was discarded before RPC

- Discovery source: accepted invite with zero membership RPC traffic; PR #310.
- Exact failure/layer/severity: media startup discarded the exact mounted subject and a second client auth read could suppress server-authorized join/end dispatch; session integration blocker.
- Upstream dependencies: mounted SessionProvider and accepted call provenance. Downstream consequences: membership/provider startup and terminal cleanup could be skipped.
- Root cause/group: redundant identity relookup at producer→consumer seam; `SESSION_TO_MEMBERSHIP_HANDOFF`.
- Platforms/providers: both platforms; legacy and LiveKit; Watch Party fallback preserved.
- Affected files: chat/communication libraries, provider abstraction and hooks, semantics proof.
- Repair/regression proof: exact mounted user propagation, UUID bound, RPC-return subject correlation, host cleanup correlation.
- Database/OTA/native requirement: no DB/native change; OTA required and cumulatively published.
- Physical state/disposition: post-#312 production has both exact memberships, but complete media proof is pending; `PHYSICALLY_PROVEN` for membership identity propagation.

### CC-311-RPC-RECEIVER — detached Supabase RPC methods failed before network dispatch

- Discovery source: accepted call `2697d4ba-f853-4764-8deb-39c4eef73e4b`, room `RQJ4GD`, zero join RPC requests; PR #311.
- Exact failure/layer/severity: detached `SupabaseClient.rpc` lost its receiver and threw locally in membership, signaling, and stale cleanup paths; SDK integration blocker.
- Upstream dependencies: valid mounted identity and call binding. Downstream consequences: no membership, signaling, or cleanup request reached production.
- Root cause/group: receiver-dependent SDK method invocation; `SDK_RECEIVER_BINDING`.
- Platforms/providers: both platforms; legacy signaling plus shared membership/cleanup; LiveKit membership path protected.
- Affected files: `_lib/chat.ts`, `_lib/communication.ts`, end-to-end guards and call semantics.
- Repair/regression proof: bound RPC receiver and mutant/source guards rejecting detached calls.
- Database/OTA/native requirement: no DB/native change; OTA required and cumulatively published.
- Physical state/disposition: post-#312 production recorded both exact memberships and terminal cleanup; signaling/media remains separately unproven; `PHYSICALLY_PROVEN` for RPC dispatch and membership/cleanup effects.

### CC-312-RECOVERY — accepted legacy session did not rebuild after lifecycle failure

- Discovery source: physical integration-seam graph after PR #311; PR #312.
- Exact failure/layer/severity: foreground, Realtime terminal/error, or peer failure could leave the exact accepted legacy session unrecovered; media lifecycle blocker.
- Upstream dependencies: accepted invite, exact room, generation, mounted subject/token. Downstream consequences: stalled signaling/media after foreground or transport failure.
- Root cause/group: missing generation-bound recovery orchestration; `MEDIA_SESSION_RECOVERY`.
- Platforms/providers: Android/iOS legacy WebRTC; LiveKit behavior preserved and regression-tested.
- Affected files: provider abstraction, legacy hook, communication/media policy, chat semantics.
- Repair/regression proof: generation-deduplicated, chat-only, terminal-safe recovery with bounded trigger delays and executable trigger/negative cases.
- Database/OTA/native requirement: no DB/native change; OTA required and published to both internal-v2 branches.
- Physical state/disposition: no durable post-merge foreground/Realtime/peer-failure recovery event has been proven; `REPAIRED_UNPROVEN`.

### CC-312-TOKEN-SEQUENCE — mounted token and membership update handoffs could be suppressed

- Discovery source: grouped upstream/downstream audit for PR #312.
- Exact failure/layer/severity: mounted token was not carried consistently through call begin, transition, and Realtime; membership update retained a circular room-read-before-update sequence; session/RLS integration blocker.
- Upstream dependencies: exact SessionProvider identity/token, accepted invite. Downstream consequences: authorized begin/transition/Realtime/membership work could be stopped client-side.
- Root cause/group: redundant auth lookup and circular authorization; `SESSION_AND_RLS_HANDOFF`.
- Platforms/providers: both platforms; shared communication layer, legacy and LiveKit; Watch Party fallback/namespace preserved.
- Affected files: chat/call/communication libraries and provider hooks.
- Repair/regression proof: mounted token propagation, direct membership update ordering, receiver-safe calls, semantic/provider/Watch Party guards.
- Database/OTA/native requirement: no DB/native change; OTA required and published.
- Physical state/disposition: post-OTA accepted call created both memberships, but Realtime/media and restart variants remain unproven; `REPAIRED_UNPROVEN`.

### CC-313-RECONCILIATION-AUTHORITY — accepted call erased after ringing deadline or ignored keep-active result

- Discovery source: post-restart broad temporal/integration audit plus production invite `f21d8c95-94f8-4759-8004-4087cd7e79fd`, which remained accepted for minutes after its 45-second ringing deadline.
- Exact failure/layer/severity: client reconciliation treated `expires_at` as accepted-call expiry, discarded `active_invite`/`room_still_active` RPC results, and omitted the observed room from two compare-and-clear calls; temporal/projection blocker.
- Upstream dependencies: accepted invite, active-room heartbeat, thread projection. Downstream consequences: foreground/thread reload could erase a valid call badge/panel, teardown or remount media, and race a newer room.
- Root cause/group: ringing and accepted liveness contracts conflated; server cleanup result was not consumed; `ACCEPTED_LIVENESS_RECONCILIATION`.
- Platforms/providers: both platforms and both providers through shared thread projection; legacy physical evidence exposed the reachable timing.
- Affected files: `_lib/chat.ts`, communication call policy/declarations, chat screen reconciliation, call semantics/room guards, room-authority pgTAP.
- Repair/regression proof: accepted liveness now follows room activity regardless of ringing deadline; read failures defer; local projection changes only after authoritative confirmation; exact room is passed at both reconciliation seams; executable after-deadline/active-result cases and pgTAP fixture parity.
- Database/OTA/native requirement: no new migration or native build; OTA required after merge.
- Physical state/disposition: PR #313 merged and both devices consumed its exact OTA. Messaging/keyboard and accepted-room reconciliation were physically exercised; the first complete voice pass exposed the separate media-lifecycle group below. Accepted liveness reconciliation is `PHYSICALLY_PROVEN`; full call closure remains open under the later entries.

### CC-314-PERMISSION-LIFECYCLE — native permission UI was treated as call background/reconnect

- Discovery source: post-#313 Android physical voice/unmute, invite `c51c4fb9-e2d9-4b80-a73b-266287ced455`, room `P2Y7HN`; Android device log at `2026-08-30T11:10:30Z`.
- Exact failure/layer/severity: `Audio.requestPermissionsAsync()` launched a system activity even with granted `RECORD_AUDIO`; React Native emitted pause/resume, the hook marked the live room reconnecting, queued a fail-closed mute, and foreground recovery replaced the peer while unmute still owned the old generation. Media lifecycle blocker.
- Upstream dependencies: accepted exact room, mounted identity/token, live Realtime channel, OS permission state. Downstream consequences: fresh track attached to stale peer authority, both UI/durable membership remained muted, no two-way microphone capture.
- Root cause/group: redundant permission request plus failure to distinguish app-owned permission UI from genuine call background; `MEDIA_PERMISSION_LIFECYCLE_ATOMICITY`.
- Platforms/providers: Android-observed and cross-platform legacy WebRTC; same-class LiveKit audit proved its serialized committed-session reconciliation does not use this legacy permission path.
- Affected files: `hooks/use-communication-room-session.ts`, mounted exact-hook regression.
- Repair/regression proof: re-read current permission before requesting; suppress only app-state transitions while an app-owned media permission request is in flight; reconcile the actual state afterward; executable prompt background/active case preserves generation/channel/peer and completes one exact mic transaction.
- Database/OTA/native requirement: no migration/native build; one grouped OTA required after merge.
- Physical state/disposition: grouped repair implemented and executable regression green; exact post-OTA two-device proof pending; `REPAIRED_UNPROVEN`.

### CC-314-MEDIA-TRUTH — membership advertised requested media before native track proof

- Discovery source: upstream producer→consumer audit after the physical mute failure.
- Exact failure/layer/severity: first membership join wrote requested camera/microphone flags before permission and `getUserMedia` proved usable tracks; a non-null stream could also retain requested UI state when the requested track was absent; initial promotion discarded the durable membership/Realtime result and could leave capture/UI enabled after an unproved commit. Media truth/integration blocker.
- Upstream dependencies: initial call preferences and membership admission. Downstream consequences: remote presence and durable rows could claim media that could not be published; later heartbeats converged only part of the split state.
- Root cause/group: requested intent was used as observed capture truth; `MEDIA_PERMISSION_LIFECYCLE_ATOMICITY`.
- Platforms/providers: both legacy platforms; LiveKit independently derives initial membership from actual publication results and remains unchanged.
- Affected files: legacy communication hook and mounted integration harness.
- Repair/regression proof: admission is now false/false; promotion occurs only after native track and Realtime proof; missing requested tracks force matching local state false; a failed promotion disables both track kinds and restores muted durable membership; mounted initialization proves both successful promotion and fail-closed compensation.
- Database/OTA/native requirement: no migration/native build; grouped OTA required.
- Physical state/disposition: `REPAIRED_UNPROVEN`.

### CC-314-NEGOTIATION — recovery and media attachment could create duplicate or skipped offers

- Discovery source: Android failure log showed two `createOffer` calls on replacement peer 7 within 33 ms and `mediaStreamAddTrack() could not find track`; downstream camera/source audit.
- Exact failure/layer/severity: concurrent sync paths had no per-peer offer guard shared by both offer producers; strict microphone negotiation could still collide with generic sync/recovery offers. Conversely, the shared offer helper skipped all connected peers, so a newly attached camera sender could never be renegotiated after connection. Signaling/media blocker.
- Upstream dependencies: presence sync, lifecycle restart, missing-track attachment. Downstream consequences: unstable local descriptions, stale-track attachment, or camera enabled locally/durably without remote subscription.
- Root cause/group: missing per-peer negotiation serialization and conflation of initial offer with forced media renegotiation; `MEDIA_PERMISSION_LIFECYCLE_ATOMICITY`.
- Platforms/providers: legacy WebRTC both platforms; LiveKit negotiation remains provider-owned and unchanged; Watch Party namespace unchanged.
- Affected files: legacy communication hook and mounted signaling/media tests.
- Repair/regression proof: every generic, forced-camera, and strict-microphone offer enters one generation-cleared per-peer queue; normal concurrent offer requests deduplicate; forced media renegotiation bypasses initial-offer connected/debounce guards; mounted tests prove strict mic waits behind an existing peer offer and a connected peer receives exactly one required camera renegotiation before commit.
- Database/OTA/native requirement: no migration/native build; grouped OTA required.
- Physical state/disposition: `REPAIRED_UNPROVEN`.

### CC-314-CAMERA-ATOMICITY — legacy camera control returned success without convergence

- Discovery source: different-class adjacent media-control audit after microphone failure.
- Exact failure/layer/severity: camera control ignored membership/presence/broadcast outcomes, and `toggleCamera` discarded the boolean result; thread UI therefore could clear an error after an unproved camera transition. Media-control blocker for required video proof.
- Upstream dependencies: usable camera track and current call authority. Downstream consequences: UI/native/durable/remote media split, false control success, missing remote video.
- Root cause/group: camera path lacked the strict transaction/compensation boundary already used for microphone; `MEDIA_PERMISSION_LIFECYCLE_ATOMICITY`.
- Platforms/providers: legacy WebRTC both platforms; LiveKit retains its existing strict camera transaction.
- Affected files: legacy communication hook and mounted camera transaction cases.
- Repair/regression proof: exact session authority, durable readback, presence, and broadcast are now required before camera success; failure restores local intent/durable/broadcast state and is operationally reported; toggle returns the real result.
- Database/OTA/native requirement: no migration/native build; grouped OTA required.
- Physical state/disposition: `REPAIRED_UNPROVEN`.

### CC-315-MEDIA-PROJECTION — stale client Presence overrode committed media truth

- Discovery source: post-#314 physical two-device voice run, invite `6312d671-68ba-4805-adb8-9236f989c5d9`, room `RQ52S6`; production memberships and iOS native logs at `2026-08-30T15:09:26Z` through `15:13:54Z`.
- Exact failure/layer/severity: iOS had a usable local audio engine, successful offer/answer renegotiation, and durable `mic_enabled=true`, while both the iOS self tile and Android remote tile remained muted. This was a media-state rendering and producer→consumer integration blocker, not a capture or membership failure.
- Upstream dependencies: exact accepted room, current generation, proved native tracks, durable membership media flags, Realtime Presence and server-relayed media broadcasts. Downstream consequences: false muted UI for locally live capture, remote controls appeared ineffective, and the same precedence fault applied to camera projection and reconnect/initial promotion.
- Root cause/group: participant rendering preferred stale client-authored Presence over current durable membership, self rendering repeated that stale participant value, and inbound `media:update` mutated the same Presence cache instead of refreshing authoritative membership; initial promotion did not relay a media update. `DURABLE_MEDIA_PROJECTION_AND_OBSERVABILITY`.
- Platforms/providers: physically exposed iOS→Android on legacy WebRTC; same-class audit covers either direction and mic/camera. LiveKit owns provider media projection independently and remains executable-regression protected; shared room/Watch Party namespaces are unchanged.
- Affected files: `hooks/use-communication-room-session.ts`, `tests/assurance/android-chat-call-mic-control.test.mjs`, this cumulative ledger.
- Repair/regression proof: durable membership now precedes Presence for remote media and participant identity, committed local state owns self projection, every proved initial media promotion sends the server-authenticated `media:update`, and inbound media updates refresh the exact room snapshot rather than becoming a second client-authored truth source. Mounted exact-hook cases prove stale local Presence cannot override committed mic/camera and stale remote Presence is replaced by refreshed durable membership. Adjacent ICE, Realtime subscription, reconnect, cleanup, negotiation, membership, Presence, and broadcast failures retain operational evidence.
- Database/OTA/native requirement: no migration and no native build; one grouped internal-v2 OTA required after exact merge.
- Physical state/disposition: grouped repair implemented and executable regressions green; exact post-OTA full two-device proof pending; `REPAIRED_UNPROVEN`.

### CC-316-MEDIA-AUTHORITY-RACE — same-room snapshot object churn revoked a successful media promotion

- Discovery source: post-#315 accepted two-device voice run `04c90c77-de19-439a-85c4-eabaf074e458` / `L46HPX`; Android device logs and production API timing at `2026-08-30T16:12:30Z`.
- Exact failure/layer/severity: membership PATCH, Presence track, and authenticated `media:update` RPC succeeded, but `updatePresence` required the captured room object to remain pointer-identical across awaits. A concurrent authoritative snapshot replaced that object for the same room and generation; the client misclassified the successful promotion as stale, disabled local media, and wrote muted compensation. Media authority/integration blocker.
- Upstream dependencies: exact mounted user/token, accepted room, current Realtime channel, native tracks, durable membership, server signaling. Downstream consequences: false initial-sync failure, locally muted media despite successful producer operations, unusable voice/video start, misleading remote projection.
- Root cause/group: mutable snapshot object identity was used as session authority instead of generation + exact channel + normalized room ID + exact user ID + active lifecycle; `LEGACY_TEMPORAL_AUTHORITY_AND_OPERATIONAL_TRUTH`.
- Platforms/providers: physically Android on legacy WebRTC; same-class client logic is cross-platform. LiveKit uses committed generation/session keys and provider `Room` identity and is not changed to legacy authority semantics.
- Affected files: `hooks/use-communication-room-session.ts`, mounted exact-hook regression.
- Repair/regression proof: initial media presence now uses stable exact session authority and accepts a newly allocated snapshot for the same active room while continuing to reject a changed generation/channel/room/user. Mounted regression reproduces room-object replacement during the awaited `media:update` and proves mic/camera stay locally and durably enabled without a false promotion error.
- Database/OTA/native requirement: no migration/native build; grouped internal-v2 OTA required after exact merge.
- Physical state/disposition: repair implemented, executable regression green, post-OTA device proof pending; `REPAIRED_UNPROVEN`.

### CC-316-SNAPSHOT-ORDER — overlapping room reads could regress mounted state

- Discovery source: same-class/different-class temporal audit after `CC-316-MEDIA-AUTHORITY-RACE`.
- Exact failure/layer/severity: membership, room, heartbeat, warmup, and `media:update` events could issue overlapping snapshot reads with no ordering owner; a slower older response could overwrite a newer room/membership projection. Temporal projection blocker affecting controls, participants, cleanup, and next-call state.
- Upstream dependencies: concurrent Postgres changes, server-relayed media updates, and heartbeats. Downstream consequences: stale participants/media, terminal-state regression, cleanup disagreement, or a current transaction being evaluated against obsolete state.
- Root cause/group: response completion order was treated as authority; `LEGACY_TEMPORAL_AUTHORITY_AND_OPERATIONAL_TRUTH`.
- Platforms/providers: legacy WebRTC both platforms; shared communication reads also feed LiveKit, whose existing committed-session guards remain protected.
- Affected files: legacy session hook and mounted snapshot regression.
- Repair/regression proof: every snapshot request receives a monotonic serial; only the newest request in the current generation may project into refs/React state, while an older valid response can still return to its direct caller. An executable overlapping-read barrier proves the older response cannot replace the newer `updatedAt` state.
- Database/OTA/native requirement: no migration/native build; grouped OTA required.
- Physical state/disposition: `REPAIRED_UNPROVEN`.

### CC-316-OPERATIONAL-TRUTH — communication failures were indistinguishable from absent state

- Discovery source: required error-handling and adjacent shared-provider audit after the physical blocker.
- Exact failure/layer/severity: communication room/membership reads, membership join/update, and signaling RPCs collapsed SDK/database errors into `null`, empty arrays, or `false`; state-channel terminal status, heartbeat/warmup reads, and LiveKit shared membership reads also suppressed the only operational evidence. Observability and fail-closed recovery blocker because unavailable authority could be misclassified as room absence, membership denial, or ordinary negative signaling.
- Upstream dependencies: Supabase client receiver, PostgREST/RPC, Realtime state channel. Downstream consequences: misleading room-unavailable/muted behavior, missing bounded restart, hidden legacy offer/media failures, and hidden LiveKit membership reconciliation failures.
- Root cause/group: broad error suppression erased the first failed operation; `LEGACY_TEMPORAL_AUTHORITY_AND_OPERATIONAL_TRUTH`.
- Platforms/providers: both platforms; shared communication layer, legacy WebRTC, and LiveKit observability. Watch Party retains its retry/fallback behavior and room namespace.
- Affected files: `_lib/communication.ts`, both provider hooks, executable operation-error and mounted state-channel regressions.
- Repair/regression proof: valid absence remains `null`/empty, while SDK/RPC/query errors and malformed signal acknowledgements throw sanitized operational errors; call/provider callers report them and remain fail closed. The room-state channel now reports terminal statuses and requests the existing generation-deduplicated legacy restart. Executable fakes preserve receiver semantics and prove RPC/query failure, invalid response, state-channel failure, and bounded recovery behavior.
- Database/OTA/native requirement: no migration/native build; grouped OTA required.
- Physical state/disposition: `REPAIRED_UNPROVEN`.

### CC-316-SAME-SESSION-CLEANUP — snapshot replacement could leave retired refs or skip foreground readback

- Discovery source: same-class lifecycle audit of every room/identity pointer comparison.
- Exact failure/layer/severity: effect cleanup cleared refs only if captured objects were still pointer-identical, although snapshot refresh legitimately replaces room/membership objects inside the same generation; foreground restore likewise skipped readback when the exact room/user objects were reallocated. Lifecycle/cleanup blocker.
- Upstream dependencies: same accepted session, snapshot refresh, app background/foreground, effect retirement. Downstream consequences: stale refs after retirement, incorrect next-session inputs, or skipped authoritative foreground projection.
- Root cause/group: object identity substituted for stable session identity; `LEGACY_TEMPORAL_AUTHORITY_AND_OPERATIONAL_TRUTH`.
- Platforms/providers: both legacy platforms. Shared native entry/provider selection remain unchanged.
- Affected files: legacy communication hook and existing stale-generation cleanup/foreground mounted cases.
- Repair/regression proof: foreground continuation compares generation + normalized room ID + user ID; synchronous cleanup clears all projections when it owns the retiring generation, while the existing replacement-generation negative control proves stale cleanup cannot clear replacement session resources.
- Database/OTA/native requirement: no migration/native build; grouped OTA required.
- Physical state/disposition: `REPAIRED_UNPROVEN`.

### CC-317-PENDING-OFFER-MEDIA-CONTROL — recovered media controls raced an unanswered legacy offer

- Discovery source: post-#316 physical two-device voice run, invite `d874b667-f897-47a6-a51d-4a5f1cc87e05`, room `V4LUKN`; iPhone recovered-call UI, Android remote projection, production membership/API state at `2026-08-30T17:08:16Z` through `17:12:14Z`.
- Exact failure/layer/severity: after exact accepted-room recovery, iOS displayed an enabled Unmute control and accepted the physical tap, but remained `You · muted`; Android remained `Connected · muted` and the exact iOS membership remained `mic_enabled=false`. The generic initial-offer queue released after sending the offer rather than after receiving its answer. A following strict mic transaction could therefore encounter `have-local-offer`, fail preparation, and converge muted. The same unanswered-offer window allowed first camera attachment to add a sender and resend an SDP created before that sender existed. Signaling/media-control blocker.
- Upstream dependencies: exact mounted identity/token, accepted invite/room/provider, current generation/channel, recovered peer, Realtime offer/answer delivery, native media permission and capture.
- Downstream consequences: one physical unmute intent is lost during recovery; camera may be locally/durably advertised without a negotiated remote sender; control failure can be hidden behind the fullscreen call surface; an in-app or trusted CallKit mute action can diverge from native control state without evidence; required warm/reconnect voice and video proof cannot complete.
- Root cause/group: per-peer serialization owned only offer dispatch and not the pending offer/answer stability boundary; executable mocks answered initial offers synchronously and erased the device timing interval; `LEGACY_PENDING_NEGOTIATION_AND_CONTROL_READINESS`.
- Platforms/providers: physically iOS on legacy WebRTC, structurally both legacy platforms and both mic/camera controls. LiveKit uses its committed provider `Room` transaction and is audited as unaffected; Watch Party provider/namespace paths remain out of the legacy hook.
- Affected files: legacy communication hook, mounted exact-hook timing harness/regressions, Chat call control error seam, this cumulative ledger.
- Repair/regression proof: the grouped repair makes exact generation/channel/room/user plus stable per-peer signaling a prerequisite for mic/camera transaction success, while ordinary multi-participant initial offers remain nonblocking. Forced camera and strict mic operations wait through a bounded pending answer, create their own post-attachment offer, and commit only after exact answer/durable/Presence/broadcast proof. Executable mounted cases reproduce delayed initial answers for both controls, timeout, stale replacement, and all prior 43 first-track cases. In-app and trusted native microphone failures now remain visible inside the mounted call surface without replaying a native claim or ending the call.
- Database/OTA/native requirement: no database or native source requirement currently identified; JavaScript OTA required after grouped merge.
- Physical state/disposition: grouped repair and executable regression proof are complete; exact merged/OTA two-device proof pending; `REPAIRED_UNPROVEN`.

## Remaining physical closure matrix

Post-#315 messaging, unread/read, and Android keyboard are physically proved for the interrupted pass but must be rerun from the beginning after the next grouped OTA. Required call proof remains: legacy voice usable two-way audio and controls; second clean voice; legacy video usable two-way render and controls; reverse direction; background/reconnect/cleanup/next call; Android foreground/warm/cold/decline/replay/stale entry; available iOS foreground/CallKit/termination/duplicate/stale entry; LiveKit canary path if dedicated accounts/devices are available; Watch Party namespace isolation. Any new blocker reopens the complete grouped and materially connected cross-feature failure graph.

## Final cumulative disposition — supersedes checkpoint statuses

The exact PR #318 internal-v2 updates were consumed by both attached devices,
and the complete physical matrix was restarted from the beginning and passed.
Messaging in both directions, Realtime, preview/unread/read clearing, Android
multiline keyboard/background-resume, ordinary and repeat voice, reverse
direction, warm iOS CallKit answer, Android cold answer, video in both local and
remote render directions, camera and microphone controls, recovery,
background/resume, decline, stale replay denial, termination, cleanup, and a
fresh final call all passed. Production ended with zero active blocking invites,
rooms, or memberships and a null thread active-room projection.

Accordingly, every cumulative required-flow defect in this ledger repaired by
PRs #306 through #318 is now `PHYSICALLY_PROVEN`, including entries whose
historical checkpoint text says `REPAIRED_UNPROVEN`. That historical wording is
retained as time-ordered evidence, but it is not current disposition. Current
required-flow totals are:

- `BLOCKING_OPEN`: 0
- `REPAIRED_UNPROVEN`: 0
- `PHYSICALLY_PROVEN`: all repaired required-flow entries
- `NONBLOCKING_DEBT`: the bounded Diagnostics initialization presentation race
  and one recovered external `livekit-registry` ingress 503

Exact final identifiers, source/merge/ruleset/OTA provenance, the complete
device matrix, and provider/database terminal readback are recorded in
`docs/release/CHILLY_CHAT_RECURSIVE_GROUPED_CLOSURE_LEDGER_2026-08-30.md`.
