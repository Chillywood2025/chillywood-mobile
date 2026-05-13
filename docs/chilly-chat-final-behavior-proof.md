# Chi'lly Chat Final Behavior Proof

Date: May 13, 2026

## Scope
- Canonical routes: `/chat` and `/chat/[threadId]`.
- Compatibility routes: `/communication` and `/communication/[roomId]`.
- Physical Android devices used:
  - `R3CXA0DS5JV` signed in as backed proof user `proof-r3`.
  - `R5CR120QCBF` signed in as backed proof user `chillywood92`.
- Backed direct thread: `3b16dd77-d44b-4a09-81ec-d912dad910fb`.

## Passed
- Signed-in inbox: both devices opened `/chat`; R5 showed safe empty inbox before the proof thread existed, then showed `1 thread` after restart/reload.
- Direct thread send/read: R3 sent `Chat-proof-20260513-R3-to-R5.` through the app UI; R5 saw the persisted inbox row and opened the thread to read it. R5 sent `Chat-proof-20260513-R5-to-R3`; R3 saw it after route reload. Ordering/timestamps were sane for the run.
- Post-migration realtime UI: after remote migration `202605130003_chat_realtime_publication.sql` was applied, R5 sent `RealtimeProof20260513R5toR3B.` from the physical thread UI while R3 was already open on the same backed thread. R3 updated through the live UI without a manual DB refresh, the inbox/thread latest preview showed the new message, restart/reload still showed it, read state remained safe, and the backed marker row count was exactly one. A third backed non-member still saw zero thread/message rows, and the realtime publication scope remained limited to `chat_threads`, `chat_thread_members`, and `chat_messages`.
- Private read block: a third backed test user had zero rows for this private thread and zero rows for its messages through RLS.
- Attachment/privacy: R3 created a real chat attachment message with private `social-attachments` storage object. R5 read the attachment row, created a short-lived signed URL, fetched it with HTTP 200, and the body matched. The signed URL itself was not printed or committed. The third backed non-member and anon user both returned zero attachment rows and could not create a signed URL. Too-large attachment metadata and missing-object signing failed safely.
- Signed-out physical-device handoff: R3 was fully signed out with app data cleared, then opened `/chat`, `/chat/[threadId]`, `/chat/[threadId]?openCall=1`, `/communication/L2WFJ5`, and an invalid private-style thread deep link. Each route showed the existing safe Sign In handoff or safe unavailable state with no message content, attachment content, raw storage URL, call token, server URL, LiveKit metadata, or private thread metadata. After signing in from a protected deep link, the app landed on `This Chi'lly Chat thread could not be found.` with Back only for the invalid thread.
- Regular call: R3 started an in-thread voice call, room `HKPGJ4`; R5 saw the active call after inbox/thread reload, joined from the thread, and WebRTC reached connected state. Logs showed active mic tracks plus inbound and outbound audio bytes. R5 leave and R3 host end-call worked, and the thread returned to no active call.
- Video call: R5 started in-thread video room `L2WFJ5`; R3 saw the inbox/thread handoff and joined from `/chat/[threadId]`. WebRTC offer/answer completed, both devices reached connected state, and stats showed inbound/outbound audio and video bytes plus decoded/encoded frames on both sides. R5 host controls exposed `Camera On`, `Mic On`, and `End Call`; camera toggled to `Camera Off`/`Cam Off`, mic toggled to `Mic Muted`/`You - muted`, host end-call marked the room ended, and both devices returned to normal direct-thread state with `No Active Call` after cleanup/restart proof.
- LiveKit safety: deployed `livekit-token` now requires chat-thread membership for `chat-call` rooms before role checks. Invalid `chat-call` token request returned `404 room_not_found` with no participant token or server URL. Router proof script now explicitly covers `chat_call` assignment/reuse/draining behavior.

## Blockers
- None for the Chi'lly Chat final behavior proof lane.

## Safety Notes
- No raw LiveKit participant token, LiveKit API secret, service-role key, attachment signed URL, storage secret, or call token was printed into docs or committed.
- No Watch-Party Live UI, Live Stage UI, Player UI, Creator Media, billing/finance, or D7F spectator HLS path was changed.
- `artifacts/` and `supabase/.temp/` remain untracked and must not be staged.

## Lane Status
Chat final behavior proof is closed.

Exact next blocker: none for Chat. The known unrelated launch blocker remains RevenueCat/Google Play Android billing setup when running broader runtime validation.
