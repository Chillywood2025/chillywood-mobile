# Seeded Proof Harness

## Purpose

This file defines the reusable proof-only account and fixture plan for the sequential production proof waves in `NEXT_TASK.md`.

The harness exists so future lanes use stable proof identities instead of random manual accounts. It is a tracking and safety contract first: proof users, role labels, temporary grants, proof IDs, expiration rules, artifact locations, and cleanup rules must be explicit before later waves mutate data or run installed-device proof.

Current proof run:

- `proof_run_id`: `wave0-seeded-proof-harness-20260624`
- Scope: Wave 0 only
- Mutation status: no auth users, grants, payments, LiveKit rooms, push tokens, or production records were created by this Wave 0 pass
- Credential status: local credential presence can be checked from ignored local environment files only; credentials are not stored in this repo

## Safety Rules

- Do not use real user data.
- Do not commit credentials, passwords, Supabase service-role keys, provider keys, push tokens, LiveKit tokens, JWTs, signed URLs, or raw storage paths.
- Do not print token-like values in proof reports or artifacts.
- Do not add a Premium bypass in app code.
- Do not weaken RLS, auth, LiveKit authority, Premium gates, or route ownership.
- Do not enable live money, payouts, cash-out, withdrawals, payable balances, or production buy buttons.
- Do not create permanent elevated permissions unless a separate approved fixture convention exists.
- Temporary grants must carry `proof_run_id`, reason, expiration, and cleanup instructions.
- Use one physical Android device where available; use backend/API/headless proof where multi-device proof is impossible.
- BrowserStack remains deferred unless the owner explicitly approves it.

## Credential Handling

Credentials must live only in ignored local storage such as `.env.*.local`, macOS Keychain, or an approved secret manager.

Allowed in repo and artifacts:

- proof labels
- masked user id suffixes when needed
- local environment variable names
- proof run ids
- grant types
- expiration dates
- cleanup commands with placeholders

Not allowed in repo or artifacts:

- passwords
- email inbox passwords
- Supabase service-role keys
- JWTs or refresh tokens
- push tokens
- LiveKit participant tokens
- LiveKit API keys/secrets
- provider credentials
- raw HLS URLs or signed storage URLs

## Seeded User Labels

The labels below are the canonical Wave 0 proof pack. "Identified" means a local ignored env key set is present for a matching fixture account. "Planned" means later waves still need a safe mutation path or credentials before using that role.

| Label | Purpose | Local fixture mapping | Current status | Credential handling |
| --- | --- | --- | --- | --- |
| `proof_host_001` | Live Stage / Watch-Party host and room owner proof | `CHILLYWOOD_E2E_OWNER_*` | Identified | Email, user id, and password keys are present in ignored local env |
| `proof_creator_001` | Creator upload, Platform Studio, Content Library, replay proof | `CHILLYWOOD_E2E_CREATOR_ID`, owner login keys | Partially identified | Creator id key exists; login should use owner fixture unless a separate creator credential is added locally |
| `proof_free_viewer_001` | Standard signed-in free viewer proof | `CHILLYWOOD_E2E_VIEWER_*` | Identified | Email, user id, and password keys are present in ignored local env |
| `proof_premium_viewer_001` | Premium-gated access proof | `CHILLYWOOD_E2E_VIEWER_08_*` plus temporary Premium grant | Planned | Login keys are present; Premium grant must be temporary and expiring |
| `proof_blocked_001` | Blocked relationship proof | `CHILLYWOOD_E2E_BLOCKED_*` | Partially identified | Email and user id keys are present; password key is not currently declared |
| `proof_circle_member_001` | Active Chi'lly Circle member proof | `CHILLYWOOD_E2E_CIRCLE_MEMBER_*` | Partially identified | Email and user id keys are present; password key is not currently declared |
| `proof_circle_non_member_001` | Non-member / public relationship proof | `CHILLYWOOD_E2E_PUBLIC_VIEWER_*` or `CHILLYWOOD_E2E_FOLLOWER_ONLY_*` | Partially identified | Email and user id keys are present; password key is not currently declared |
| `proof_call_caller_001` | Chi'lly Chat caller proof | `CHILLYWOOD_E2E_VIEWER_02_*` | Identified | Email, user id, and password keys are present in ignored local env |
| `proof_call_recipient_001` | Chi'lly Chat recipient proof | `CHILLYWOOD_E2E_VIEWER_03_*` | Identified | Email, user id, and password keys are present in ignored local env |
| `proof_busy_call_user_001` | Busy call state proof | `CHILLYWOOD_E2E_VIEWER_04_*` | Identified | Email, user id, and password keys are present in ignored local env |
| `proof_paid_video_buyer_001` | Paid creator video buyer proof | `CHILLYWOOD_E2E_VIEWER_05_*` | Identified | Email, user id, and password keys are present in ignored local env |
| `proof_ticket_buyer_001` | Watch-Party room access buyer proof | `CHILLYWOOD_E2E_VIEWER_06_*` | Identified | Email, user id, and password keys are present in ignored local env |
| `proof_event_pass_buyer_001` | Event Pass buyer proof | `CHILLYWOOD_E2E_VIEWER_07_*` | Identified | Email, user id, and password keys are present in ignored local env |
| `proof_subscriber_001` | Creator subscriber proof | `CHILLYWOOD_E2E_SUBSCRIBER_*` plus temporary subscriber/access fixture | Partially identified | Email and user id keys are present; password key is not currently declared |
| `proof_vip_001` | VIP pass proof | `CHILLYWOOD_E2E_VIP_*` plus temporary VIP/access fixture | Partially identified | Email and user id keys are present; password key is not currently declared |
| `proof_deleted_pending_001` | Account deletion/restore proof | None yet | Planned | Must be created as disposable proof-only user before Wave 5 |
| `proof_admin_operator_001` | Optional operator/admin proof | None committed; only if safe operator path exists | Planned optional | Must use existing backend-authorized operator path with expiring role; never app-code bypass |

## Role Matrix

| Role or relationship | Seed label | Source of truth | Required expiration | Cleanup owner |
| --- | --- | --- | --- | --- |
| Host / room owner | `proof_host_001` | Existing room ownership and membership rows created during proof | End proof room after each lane | Lane runner |
| Creator / Platform owner | `proof_creator_001` | Existing creator/platform owner rows or created proof content rows | Proof content should be deleted or left clearly proof-labeled if retained | Lane runner |
| Free viewer | `proof_free_viewer_001` | Auth/profile rows only | None unless a temp grant is added | Lane runner |
| Premium viewer | `proof_premium_viewer_001` | Existing entitlement/test-grant mechanism only | Max 7 days unless lane says shorter | Lane runner |
| Blocked viewer | `proof_blocked_001` | Existing block relationship helper/table | Remove proof block after lane unless reused by next immediate lane | Lane runner |
| Chi'lly Circle member | `proof_circle_member_001` | Existing active Chi'lly Circle membership source | Remove or expire if lane creates it; retain only if already a durable proof fixture | Lane runner |
| Chi'lly Circle non-member | `proof_circle_non_member_001` | Absence of active Circle membership | No grant should exist | Lane runner |
| Call caller/recipient/busy user | `proof_call_caller_001`, `proof_call_recipient_001`, `proof_busy_call_user_001` | Existing chat thread/call invite rows created during proof | End/cancel/miss calls and clean proof invites where safe | Lane runner |
| Paid video buyer | `proof_paid_video_buyer_001` | Existing paid access resolver/provider proof path | Access grants must be exact-target and expiring when manually seeded | Lane runner |
| Room access buyer | `proof_ticket_buyer_001` | Existing Watch-Party room access resolver/provider proof path | Exact-target only; never global room authority | Lane runner |
| Event Pass buyer | `proof_event_pass_buyer_001` | Existing event pass resolver/provider proof path | Exact event only | Lane runner |
| Subscriber | `proof_subscriber_001` | Existing subscriber/access resolver | Expiring proof grant if manually seeded | Lane runner |
| VIP | `proof_vip_001` | Existing VIP resolver | Expiring proof grant if manually seeded | Lane runner |
| Deleted pending | `proof_deleted_pending_001` | Account deletion/restore source of truth | Created only for deletion lane; no reuse after restore/delete proof | Wave 5 runner |
| Operator/admin | `proof_admin_operator_001` | Existing platform role membership/admin permission source | Expiring proof role; revoke immediately after proof | Owner/operator lane runner |

## Temporary Grants Matrix

Every temporary grant must include:

- `proof_run_id`
- grant type
- target user id
- target scope id when applicable
- `expires_at`
- reason
- cleanup or revocation path

| Grant type | Allowed purpose | Safe default expiration | Required cleanup |
| --- | --- | --- | --- |
| `premium_test_grant` | Premium gate proof only | 24 hours, max 7 days | Revoke or let expire; verify Premium inactive afterward when relevant |
| `creator_tool_grant` | Creator-tool proof where Premium/creator access is required | 24 hours | Revoke; verify no permanent creator privilege was created |
| `circle_membership_fixture` | Circle member access proof | End of lane unless durable proof fixture is approved | Remove/expire membership or document durable fixture owner |
| `blocked_relationship_fixture` | Block denial proof | End of lane | Remove if it blocks later lanes unexpectedly |
| `paid_video_access_fixture` | Exact paid-video access proof | End of lane or exact product access expiration | Revoke exact-target access; do not grant broad paid access |
| `room_pass_fixture` | Exact room access proof | End of lane | Revoke exact room grant; no LiveKit authority grant |
| `event_pass_fixture` | Exact event access proof | End of lane | Revoke exact event grant |
| `subscriber_fixture` | Subscriber-only content proof | End of lane | Revoke exact creator subscription fixture |
| `vip_fixture` | VIP-only content proof | End of lane | Revoke exact creator VIP fixture |
| `operator_role_fixture` | Admin/support/operator proof | Shortest practical duration, usually same session | Revoke immediately and verify non-admin denial |

No grant in this table can create live money, payable balances, payouts, production purchases, LiveKit publish authority, host/co-host authority, or a Premium app-code bypass.

## Fixture Data Required For Later Waves

Later waves should create only the fixture rows they need and record ids in their proof artifacts:

- Android build metadata: package id, versionCode, installer, commit, runtime/EAS update group if applicable
- Auth/deep-link fixtures: public route id, private route id, reset-password test inbox
- Creator media fixtures: draft video, Circle-private video, public video, clean upload, scan-pending upload, blocked/malware upload where safe
- VOD/rendition fixtures: Free-allowed rendition, Premium rendition, missing rendition
- Comment/attachment fixtures: safe small file, blocked large file, unsupported file, hidden/reported attachment
- Room fixtures: Live Stage room, Watch-Party Live room, Party Room, blocked member, 5th speaker denial case
- Notification fixtures: chat message, voice/video call invite, missed call, followed creator live, Circle live, event soon, replay ready
- Account lifecycle fixtures: deletion-pending user, restore-window user, disabled/deleted user
- Admin/support fixtures: report, failed upload, notification attempt, failed LiveKit/token issue, failed provider/access issue
- Provider/access fixtures: only use sandbox/provider-backed rows where the lane explicitly approves it

## Cleanup Process

1. Record the `proof_run_id`, account labels, row ids, and artifact path before proof starts.
2. Apply only the temporary grants required by the current wave.
3. Run proof with token and credential redaction enabled.
4. Revoke temporary grants immediately after proof unless they are intentionally reused by the next wave and have an expiration.
5. End proof rooms and calls.
6. Delete or mark proof-only media/content according to that lane's cleanup policy.
7. Disable fake/invalid push tokens created for proof.
8. Confirm no service-role keys, passwords, push tokens, LiveKit tokens, raw HLS URLs, or signed storage URLs were committed.
9. Update the current wave status in `NEXT_TASK.md`.
10. Commit only the intended tracked files.

## Rerun Instructions

Safe no-secret harness check:

```sh
node scripts/proof-seeded-harness.mjs
```

The script checks that this document and `NEXT_TASK.md` contain the required labels and reports local env key presence as booleans only. It does not print env values and does not mutate Supabase.

Future mutation-capable seeding must be run only from an approved operator shell with secrets supplied by ignored local env or a secret manager. Commands must be documented by the wave that uses them, with secret values redacted.

## What Was Actually Created In Wave 0

Created in repo:

- this seeded proof harness document
- a no-secret local verifier script
- a Wave 0 status update in `NEXT_TASK.md`

Identified from ignored local env key names:

- owner/host proof account key set
- free viewer proof account key set
- viewer 02 through viewer 09 proof account key sets
- blocked, Circle member, follower-only, public viewer, subscriber, VIP fixture ids/emails
- creator id

Not created by this Wave 0 pass:

- new Supabase auth users
- new profile rows
- new Premium grants
- new Circle memberships
- new blocked relationships
- new paid access grants
- new subscriber/VIP grants
- new admin/operator roles
- new proof media
- new push tokens
- new LiveKit rooms

## Blockers And Planned Items

- `proof_deleted_pending_001` does not have a current identified local fixture and must be created as disposable test-only account before Wave 5.
- Several relationship/access labels are identified by email/user id key names but do not currently have password key names in the local proof env. They are usable for backend/API proof where service-role/operator access is explicitly approved, but installed Android login needs local credentials.
- Premium, subscriber, VIP, paid-video buyer, room-pass buyer, and event-pass buyer roles require future wave-specific exact-target grants or sandbox/provider proof. Wave 0 does not create them.
- Optional `proof_admin_operator_001` remains planned only. It must use an existing backend-authorized operator path with immediate revocation and cannot be added as an app-code bypass.
- No service-role/operator mutation was performed in Wave 0, so the harness is documented and partially identified, not fully seeded end to end.

## Later Wave Consumption Rules

- Use the labels in this file in proof reports instead of raw emails or user ids.
- Before a wave starts, verify the needed label has a login credential or backend/API fixture path.
- If a label lacks credentials, mark that proof row pending or create a disposable proof account through an approved operator path.
- Use exact-target grants only. Do not grant broad Premium, buyer, subscriber, VIP, room, event, or admin access.
- Record every created row id in the wave artifact.
- Clean up or document retention before committing the wave.
