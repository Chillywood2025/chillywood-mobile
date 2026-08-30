# Chi'lly Chat complete-system closure ledger

Updated: 2026-08-30 (America/Chicago)
Closure method: recursive grouped closure; a merge is not physical proof.

## Durable recovery checkpoint

- Protected `main`: `2650e56b64d56051271cdbf6a545bb330676b35a`; tree `e98268c31d64744eee88cb62c3330fa1d80fbb13`; parents `39920e38b4074a4d9a83a335391647fe168e7ed6` and `2e261a8d4e3f9845d4ebe9801ba2931e71f989e7`.
- Latest merged repair: PR #313, head `2e261a8d4e3f9845d4ebe9801ba2931e71f989e7`, normal two-parent merge `2650e56b64d56051271cdbf6a545bb330676b35a`, merged `2026-08-30T10:30:40Z`.
- PR #313 used the Owner-authorized assurance-only temporary PR bypass on active ruleset `18940814`. Writable ruleset hash was `8edf290e70141cfe0b3a371f958e8add21f997de1c87e99cbe2c927b9a90904a` before and after; the temporary Owner User PR-only actor was removed immediately after the exact-head merge.
- Exact #313 internal-v2 OTAs: Android group `020d4dc9-5c0d-43f6-a675-f88fee3d228e`, update `01a05248-c2c1-700d-a601-807acc0c6b48`; iOS group `1e855671-efcb-4811-9298-602527e1f0a3`, update `01a0524d-1b00-71da-b968-8fe4392fa2d1`. Attached Android build 91 and iPhone build 13 both consumed their exact update.
- Post-#313 physical messaging is complete: A→B and B→A Realtime, preview, unread increment, read clearing, thread selection, and Android keyboard visibility/multiline/send/scroll/background-resume were all proved on the attached devices.
- First post-#313 voice run: invite `c51c4fb9-e2d9-4b80-a73b-266287ced455`, room `P2Y7HN`, accepted `2026-08-30T11:08:51.853915Z`, legacy WebRTC. Both devices reached two-participant `Connected`; Android initialized remote audio playout. Both remained muted, and Android unmute exposed a permission-activity pause/resume followed by replacement peer creation and failure to retain the new microphone track. Normal termination at `11:13:33.04986Z` ended invite/room and left both memberships. This blocker reopened the grouped media-lifecycle graph.

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

## Remaining physical closure matrix

Post-#313 messaging, unread/read, and Android keyboard are physically proved but must be rerun from the beginning after the next grouped OTA. Required call proof remains: legacy voice usable two-way audio and controls; second clean voice; legacy video usable two-way render and controls; reverse direction; background/reconnect/cleanup/next call; Android foreground/warm/cold/decline/replay/stale entry; available iOS foreground/CallKit/termination/duplicate/stale entry; LiveKit canary path if dedicated accounts/devices are available. Any new blocker reopens the complete grouped failure graph.
