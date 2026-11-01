# Atomic call Start and retry source repair — October 31, 2026

## Scope

Direct Chat voice/video Start now prepares an identifier and the existing profile/app capture default without writing a room. `start_chilly_chat_call` validates the current session and direct-thread access, serializes the thread, and either reuses its existing call or creates the open-access candidate and calls the existing invitation admission function in one transaction. A definitive admission rejection rolls back the candidate, its allocation rate event, and the invitation rate event. Provider selection and delivery remain unchanged.

Private request receipts bind the candidate key to actor, exact session, thread, requested media kind, and capture policy. Same-key replay cannot create another call; a terminal replay remains terminal. Receipts cascade with invite/thread retention, have indexed foreign keys, forced RLS, and no client/service-role table grants. The old `begin_chilly_chat_call` remains available for existing clients.

Unknown or malformed replies do not authorize client-side room termination. The client may read the exact candidate's invitation and must still own the original session after that read. It does not fall back to separate room creation or a second admission request. A subsequent explicit successful Start clears the previous throttle error even without Realtime delivery.

## Delivery boundary

**Backend-dependent client change.** Apply the reviewed migration before distributing this client change; missing-function errors fail closed. Do not cherry-pick these client edits into an OTA whose backend lacks the new RPC. No native module changed, but that does not make backend ordering optional. OTA, builds, migrations, and provider changes were not performed.

The companion completed-call credit migration preserves bounded unanswered-call and room-allocation abuse controls. Cancellation does not create acceptance credit, unknown evidence remains charged, and unrelated room/provider limits remain in effect. This is not unlimited call traffic.

## Verification and remaining evidence

- Full-schema PGlite executes actual admission, transitions, same-key replay, different-key reuse without allocation, mode/capture/session conflict rejection, terminal replay, retention cascade, grant denial, and repeated definitive-rejection rollback.
- Actual client helpers and mounted Start tests cover malformed/lost replies, exact-session replacement, missing RPC without fallback, no speculative End, dispatch/readback recovery, and stale throttle error clearing.
- The source witness includes ten mutation controls for atomic allocation, open access, exact authority, and absence of speculative End. It is not behavioral or device proof.
- The local-only native PostgreSQL runner contains six independently blocked backend schedules, including atomic competing starts and rejection rollback. Its fixture preflight passed; **native concurrency requires hosted execution and was not run locally**.
- Existing iOS bridge/foreground/audio-root tests passed 192 cases. Native source-generation checks are not Swift compilation or installed-device proof. The reported iOS video Answer failure has no proven native root cause from these tests; the observed videos had no durable acceptance.
- Archived physical-proof scripts still require older source strings and are not current Required Validation inputs. No historical device evidence was rewritten. The legacy LiveKit migration checker reports four inherited source-marker failures plus the relocated open-access assertion; current open access is verified in the new SQL test and source witness.

No test here proves cellular audio handoff, CallKit/PushKit delivery, actual iOS Answer, microphone/camera hardware, or installed OTA behavior.
