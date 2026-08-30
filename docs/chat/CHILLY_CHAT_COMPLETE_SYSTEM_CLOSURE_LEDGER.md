# Chi'lly Chat complete-system closure ledger

Updated: 2026-08-30 (America/Chicago)
Closure method: recursive grouped closure; a merge is not physical proof.

## Durable recovery checkpoint

- Protected `main`: `39920e38b4074a4d9a83a335391647fe168e7ed6`; tree `e40b5354ca17bde3e6d46715996eebeab9e59b3e`; parents `5d7fa933b1d49a90884319d3dbcd0e5122f033a8` and `a1b9aab563e103fc8325e87e82dd1a0479dcea99`.
- Latest repair: PR #312, head `a1b9aab563e103fc8325e87e82dd1a0479dcea99`, normal two-parent merge `39920e38b4074a4d9a83a335391647fe168e7ed6`, merged `2026-08-30T07:33:43Z`.
- Exact #312 OTA was published to Android group `7675fed3-9d76-416a-af28-e41dc1736b5c` and iOS group `a08236fb-93cf-4471-af82-c1e9d46e77d8` at about `2026-08-30T07:36:10Z`.
- Attached iPhone build 13 durably consumed iOS update `01a05198-e825-78a4-88ad-96b8bab25edd`: two successful launches, zero failed launches. Android consumption is not yet durably proven because no Android device is attached and no post-merge installed-update diagnostic identifies it.
- Post-OTA production evidence: two persisted messages at `07:43:05Z` and `07:45:21Z`; legacy voice invite `f21d8c95-94f8-4759-8004-4087cd7e79fd`, room `ZYBGGS`, created `07:46:35Z`, accepted `07:46:56Z`, ended `07:50:08Z`; both exact memberships joined and later left. This proves physical testing began and reached accepted membership/terminal cleanup. It does not prove usable two-device audio/video, keyboard, warm/cold entry, or reconnect.

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
- Physical state/disposition: grouped source repair complete locally and focused proofs pass; pre-merge/full physical proof pending; `REPAIRED_UNPROVEN`.

## Remaining physical closure matrix

Messaging persistence and one accepted/ended voice lifecycle have durable post-#312 evidence. The following remain mandatory from the beginning on exact installed updates: two-way Realtime/preview/unread/read clearing; Android keyboard; legacy voice usable two-way audio and controls; legacy video usable two-way render and controls; background/reconnect/cleanup/next call; Android foreground/warm/cold/decline/replay/stale entry; available iOS foreground/CallKit/termination/duplicate/stale entry; LiveKit canary path if dedicated accounts/devices are available. Any new blocker reopens the complete grouped failure graph.
