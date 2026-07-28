# Chi'lly Chat LiveKit media migration review

Review-only branch. Never merge this branch or its pull request.

Implementation reviewed: `afa7fe79263941024392922e779f5d45f29f6b3b`

Status: source and local validation review complete; hosted and installed-device
gates remain open. This is not an activation or release approval.

## Lane 1 — call lifecycle and product behavior

Result: P0=0, P1=0 for the reviewed source.

- The Chat screen retains the existing invite, ringing, transition,
  notification, native action, thread history, and terminal cleanup paths.
- Media remains disabled until `shouldActivateAcceptedChatCallMedia` allows the
  accepted invite.
- `useChatCallMediaSession` replaces only the previous media-hook call site.
- The provider is fixed by invite ID and the database makes its provider column
  immutable after insert.
- Gate tests prove that disabled media enables neither transport and each
  provider enables only its own transport.
- Legacy direct WebRTC remains present as a stamped rollback path; there is no
  catch/fallback path from LiveKit to legacy during an active call.
- Duplicate invite and room behavior remains owned by the unchanged atomic
  `begin_chilly_chat_call` path.

Open proof gates: both directions of installed voice/video, decline, cancel,
timeout/missed, busy, stale-notification cleanup, and native presentation.

## Lane 2 — LiveKit token and membership authority

Result: P0=0, P1=0 for the reviewed source.

- The Edge Function authenticates through the existing user JWT path.
- The imported, executable Chat Call policy checks the exact accepted/unended
  invite, thread, communication room, active thread linkage, call type,
  immutable LiveKit provider, exact two direct-thread members, fresh active
  room membership, and absence of a third active participant.
- Client-supplied role is not trusted. The successful policy derives
  `speaker` and all four required grants.
- Ringing, declined, canceled, missed/timed-out, busy, ended, wrong-thread,
  wrong-room, wrong-call-type, legacy-provider, missing-membership,
  mismatched-thread-member, third-participant, and non-participant cases are
  denied by the 17-case authority suite.
- No Premium check, Owner/Admin bypass, or client service-role path was added.
- Exact token claims are decoded and checked on-device before room connection.

Open proof gates: hosted function deployment/readback, successful and denied
hosted token fixtures, and exact `livekit_token_request_audit` readback.

## Lane 3 — Android/iOS native boundary and audio

Result: P0=0, P1=0 for the reviewed JavaScript/TypeScript source.

- No native dependency, config plugin, entitlement, permission, background
  mode, privacy manifest, Android manifest, ProGuard/R8, Pod, or native module
  source changed in this implementation.
- The repository's installed LiveKit client and native audio module are reused.
- Existing iOS native audio-route calls remain in place; LiveKit routing is
  coordinated rather than replacing CallKit routing.
- Native answer readiness remains tied to the call media state becoming live
  after accepted membership, token validation, room connection, and requested
  local publication.
- Background voice policy and foreground video restoration are explicit in the
  LiveKit provider.

Open proof gates: independent Android build 84 and iOS build 8 native-boundary
classification, CallKit/PushKit and Android native answer on installed builds,
audio activation/deactivation, and background/foreground evidence.

## Lane 4 — telemetry, privacy, rollback, and regression

Result: P0=0, P1=0 for the reviewed source.

- Stages are emitted only by the LiveKit provider and include exact runtime,
  build, platform, channel, and update diagnostics.
- Raw room, invite, and thread identifiers are deleted before persistence; the
  collector stores hashes and a sanitized correlation hash.
- Post-request stages require a recent successful exact-room Chat Call token
  audit with join, publish, and subscribe authority.
- `token_requested` remains observational and cannot prove LiveKit success.
- Missing LiveKit provider/SDK binding or token corroboration is classified
  `non_livekit_chat_call_evidence_rejected`; direct WebRTC evidence is not
  accepted as LiveKit proof.
- Telemetry contains no token, SDP, ICE candidate, IP address, email, device
  identifier, or media field.
- Rollout defaults to legacy, canary disabled, emergency stop on, with no
  public setting and no mid-call provider change.

Open proof gates: hosted collector readback, installed first-audio/video/UI
events, bounded failure fixture, recovery, emergency stop, and principal
rollback.

## Reproduced validation

- lint: 0 errors
- TypeScript: pass
- inherited Android/iOS guards: pass
- Edge Function Deno typecheck: pass
- provider/token authority: 21/21
- rollout pgTAP: 15/15
- full clean pgTAP: 1571/1571
- migration source proof: pass
- secret boundary: pass
- `deno.lock`: untracked and unstaged

## Merge posture

The implementation PR must remain draft until hosted, OTA/binary, installed
two-device, four-lane final review, and CI 13/13 gates close. This review-only
PR must be closed unmerged after its additive evidence has been consumed.
