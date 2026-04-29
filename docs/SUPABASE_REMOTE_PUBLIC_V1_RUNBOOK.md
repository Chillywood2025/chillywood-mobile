# Supabase Remote Public V1 Runbook

Date: 2026-04-26

Lane: Supabase remote verification

Purpose: prepare and verify Chi'llywood's remote Supabase production readiness for Public v1 without destructive database commands, blind migration pushes, Android runtime proof, or secret exposure.

This runbook records what was actually executed against the remote Supabase project, what was only inspected from local migrations/generated types, and what remains proof-pending before Public v1.

## Guardrails

- Do not run `supabase db reset` against remote.
- Do not run destructive SQL against remote.
- Do not drop, truncate, delete, or overwrite remote data.
- Do not run `supabase db push` or apply migrations until the pending migration list is audited and explicitly safe.
- Do not print or commit service role keys, JWTs, database passwords, anon key values, access tokens, signed URLs, LiveKit secrets, or private credentials.
- Do not commit `supabase/.temp/`, Supabase branch metadata, local DB dumps, or proof artifacts with sensitive values.
- Separate actual remote proof from local migration/schema inspection.
- Do not claim RLS is fully proven from migration alignment alone.

## Current Linked Project Status

| Item | Result |
| --- | --- |
| Supabase CLI version | `2.75.0` |
| Project ref | `bmkkhihfbmsnnmcqkoly` |
| Project name from Supabase CLI | `Chillywood2025's Project` |
| Region from Supabase CLI | West US (Oregon) |
| Repo linked at start of lane | No, `supabase migration list` reported missing project ref |
| Link action in this lane | `supabase link --project-ref bmkkhihfbmsnnmcqkoly` completed without prompting for a password |
| Local metadata created | `supabase/.temp/` exists after link and must remain uncommitted |
| Remote mutation commands run | None |
| Android/runtime proof run | None |

## Commands Run

Commands that completed:

```bash
supabase --version
supabase projects list
supabase link --project-ref bmkkhihfbmsnnmcqkoly
supabase migration list
supabase functions list --project-ref bmkkhihfbmsnnmcqkoly
```

Command that was attempted but blocked:

```bash
supabase db lint --linked --schema public --fail-on none
```

Result: the CLI reached the remote database host but failed authentication for the generated CLI login role. No password was entered and no retry with secrets was attempted. Lint remains Proof Pending until the release/backend owner provides the approved remote database password/session path or runs the check from a configured environment.

## Migration Alignment Status

`supabase migration list` was executed after linking and showed local and remote aligned for every migration currently in `supabase/migrations`:

| Version | Local | Remote | Purpose |
| --- | --- | --- | --- |
| `202604190004` | Present | Present | Baseline current schema truth |
| `202604190005` | Present | Present | Channel audience relationships |
| `202604190006` | Present | Present | Channel audience visibility truth |
| `202604200001` | Present | Present | Creator events |
| `202604200002` | Present | Present | Notifications and event reminders |
| `202604200003` | Present | Present | Channel layout preset |
| `202604200004` | Present | Present | Owner platform role |
| `202604200005` | Present | Present | Platform role roster visibility |
| `202604210001` | Present | Present | User friendships |
| `202604250001` | Present | Present | Creator video upload foundation |
| `202604260001` | Present | Present | Billing entitlement foundation |
| `202604260002` | Present | Present | Creator video moderation foundation |
| `202604260003` | Present | Present | Creator video Watch-Party linking |
| `202604260004` | Present | Present | Tighten Watch-Party room RLS |
| `202604270001` | Present | Present | Open Chicago Streets title |
| `202604280001` | Present | Present | Raise creator-video movie upload limit |

Status: Partial / Proof Pending.

What this proves:

- The remote migration history is aligned with the repo migration history through `202604280001`.
- Linked remote bucket proof shows `creator-videos.file_size_limit = 5368709120` with the expected video MIME allowlist.
- There are no remote-applied migration versions in the displayed history that are absent locally.

What this does not prove:

- It does not by itself prove every remote table/column/policy still exists exactly as intended.
- It does not prove RLS behavior for anon/authenticated/non-owner/operator paths.
- It does not prove Storage API behavior.
- It does not prove Edge Function secret configuration.

## Core Table And Column Checklist

This checklist combines actual remote migration alignment with local migration/generated-type inspection. Items marked Present by migration history are expected remotely because the relevant migration version is applied, but they still need focused read/write/API proof before Public v1 is marked Done.

| Area | Remote status from this lane | Migration owner | App owner | V1 blocker if missing |
| --- | --- | --- | --- | --- |
| `user_profiles` | Present by baseline and later profile/channel migrations | `202604190004`, `202604190006`, `202604200003` | `app/profile/[userId].tsx`, `app/channel-settings.tsx`, `_lib/userData.ts`, `_lib/channelReadModels.ts` | Yes |
| `videos` | Present by baseline and creator media migrations | `202604190004`, `202604250001`, `202604260002` | `_lib/creatorVideos.ts`, `app/profile/[userId].tsx`, `app/channel-settings.tsx`, `app/player/[id].tsx` | Yes |
| `videos.visibility` | Present by applied migration | `202604250001` | `_lib/creatorVideos.ts` | Yes |
| `videos.storage_path`, `thumb_storage_path`, `mime_type`, `file_size_bytes`, `updated_at` | Present by applied migration | `202604250001` | `_lib/creatorVideos.ts` | Yes |
| `videos.moderation_status`, `moderated_at`, `moderated_by`, `moderation_reason` | Present by applied migration | `202604260002` | `_lib/creatorVideos.ts`, `_lib/moderation.ts`, `app/admin.tsx`, `app/player/[id].tsx` | Yes |
| `watch_party_rooms` | Present by baseline | `202604190004` | `_lib/watchParty.ts`, `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx` | Yes |
| `watch_party_rooms.source_type`, `source_id` | Present by applied migration | `202604260003` | `_lib/watchParty.ts`, `_lib/watchPartyContentSources.ts`, `app/player/[id].tsx` | Yes for creator-video Watch-Party |
| `watch_party_room_memberships` | Present by baseline and RLS tightening | `202604190004`, `202604260004` | `_lib/watchParty.ts`, Party/Live routes | Yes |
| `safety_reports` | Present by baseline; creator-video target added | `202604190004`, `202604260002` | `_lib/moderation.ts`, report sheets, `app/admin.tsx` | Yes |
| `user_entitlements` | Present by applied migration | `202604260001` | `_lib/premiumEntitlements.ts`, `_lib/monetization.ts` | Yes for Premium gates |
| `billing_events` | Present by applied migration | `202604260001` | `_lib/premiumEntitlements.ts`, `_lib/monetization.ts`, admin/account surfaces | Yes if billing ships |
| `creator_events` | Present by applied migration | `202604200001` | `_lib/liveEvents.ts`, `app/channel-settings.tsx`, `app/profile/[userId].tsx` | V1 feature-dependent |
| `notifications` | Present by applied migration | `202604200002` | `_lib/notifications.ts` | Non-blocking unless surfaced as v1 proof target |
| `event_reminders` | Present by applied migration | `202604200002` | `_lib/liveEvents.ts`, `_lib/notifications.ts` | Non-blocking unless surfaced as v1 proof target |
| `platform_role_memberships` | Present by baseline and later role visibility migrations | `202604190004`, `202604200004`, `202604200005` | `_lib/moderation.ts`, `app/admin.tsx` | Yes for admin/operator protection |
| `chat_threads`, `chat_thread_members`, `chat_messages` | Present by baseline | `202604190004` plus legacy source history | `_lib/chat.ts`, `app/chat/index.tsx`, `app/chat/[threadId].tsx` | Yes for Chi'lly Chat |
| `app_configurations` | Present by baseline | `202604190004` plus legacy hardening source history | `_lib/appConfig.ts`, `app/admin.tsx` | Yes for admin/app config |
| `creator_permissions` | Present by baseline | `202604190004` plus legacy hardening source history | `_lib/monetization.ts`, `_lib/channelReadModels.ts`, `app/channel-settings.tsx` | V1 feature-dependent |

Unknown / proof-pending:

- A direct remote schema dump/lint was not completed in this lane because linked DB lint failed remote CLI login authentication.
- A live read/write proof with anon/authenticated/owner/non-owner/operator sessions remains required.

## Storage Bucket Checklist

| Area | Expected remote status | Migration owner | App owner | Proof status |
| --- | --- | --- | --- | --- |
| `creator-videos` bucket | Present remotely | `202604250001`, `202604280001` | `_lib/creatorVideos.ts` | Bucket row proof passed |
| Bucket public flag | Private (`public=false`) | `202604250001` | `_lib/creatorVideos.ts` | Bucket row proof passed |
| File size limit | `5368709120` bytes on the bucket; separate project Storage global limit still needs dashboard/runtime proof | `202604280001` | `_lib/creatorVideos.ts` | Bucket row proof passed / Global proof pending |
| Allowed MIME types | `video/mp4`, `video/quicktime`, `video/webm`, `video/x-m4v` | `202604250001` | `_lib/creatorVideos.ts` | Bucket row proof passed |
| Owner insert/update/delete policies | Expected by migration | `202604250001` | `_lib/creatorVideos.ts` | Proof Pending through Storage API |
| Public-or-owner read policy | Expected by migration and moderation tightening | `202604250001`, `202604260002` | `_lib/creatorVideos.ts`, Player/Profile | Proof Pending through Storage API |

Storage commands were not run in this lane because listing the remote bucket could expose object names/user paths. Storage API proof remains a separate bounded proof step using safe test objects/sessions and sanitized artifacts.

## RLS And Security Checklist

| Area | Repo/remote migration intent | What is actually proved now | Still pending |
| --- | --- | --- | --- |
| Creator video owner insert/update/delete | Owner policies in `202604190004`, tightened visibility in `202604250001`, moderation trigger in `202604260002` | Remote migrations aligned; local proof was previously recorded | Live owner/non-owner/API proof |
| Public creator video read | Public reads only public clean/reported videos after moderation migration | Remote migrations aligned; previous remote source validation proof covered public clean creator-video Watch-Party source persistence | Live public/draft/hidden Player/Profile read proof |
| Draft/private creator videos | Drafts should be owner-only by query/RLS | Remote migrations aligned; local proof previously recorded | Live public/non-owner denial proof |
| Hidden/removed/banned videos | Public read/play should be blocked | Remote migrations aligned; previous remote Watch-Party source validation blocked hidden source | Live Player/Profile/storage proof |
| Safety reports | Signed-in reporter insert/select-own plus operator/moderator queue policies | Remote migrations aligned; local proof previously recorded | Live report row proof and admin queue proof |
| Admin/operator policies | `platform_role_memberships`, `has_platform_role`, moderation policies | Remote migrations aligned | Live non-admin denial and admin write proof |
| Premium entitlements | Users can read own entitlements; owner/operator writes only | Remote migrations aligned; local proof previously recorded | Live active/expired/revoked access proof |
| `billing_events` | Users read own; owner/operator writes only | Remote migrations aligned | Live non-owner/non-admin write denial proof |
| Watch-Party room creation | Anonymous insert policy removed by `202604260004`; host insert retained | Remote migration alignment plus previous remote rollback SQL proof | Final live route/access smoke |
| Watch-Party membership | Open room membership allowed; premium/party-pass membership requires entitlement | Remote migration alignment plus previous remote rollback SQL proof | Live signed-out/non-premium/premium route proof |
| Storage objects | Owner path write/delete and public-or-owner read | Remote migration alignment only | Storage API proof with real owner/non-owner sessions |

`supabase db lint --linked --schema public --fail-on none` remains Proof Pending because the remote CLI login role failed password authentication in this local session.

## Edge Function Checklist

| Function | Local owner | Remote status from this lane | Env/secrets needed | Proof pending |
| --- | --- | --- | --- | --- |
| `livekit-token` | `supabase/functions/livekit-token/index.ts`, `supabase/config.toml` | `supabase functions list --project-ref bmkkhihfbmsnnmcqkoly` showed `livekit-token` ACTIVE, version 7, updated 2026-04-18 13:46:46 UTC | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` | Authenticated token request proof, signed-out denial, malformed request denial, role denial, no secret logging |

`supabase/config.toml` sets `verify_jwt = false` for the function because the function validates bearer auth internally. That is acceptable only if the deployed function secrets and auth checks remain intact and are proved.

No billing/entitlement validation Edge Function was found in this lane. Current billing entitlement foundation is table/helper based plus RevenueCat client integration; live store/server validation remains external setup/pending.

## Production Environment Checklist

The release build needs these Supabase-related values intentionally configured through app config/EAS environment or approved runtime config:

| Config | Purpose | Status |
| --- | --- | --- |
| Supabase URL | Client API/storage/auth project endpoint | Repo/app owner exists; release env proof pending |
| Supabase anon key | Public client auth/storage/API access | Repo/app owner exists; do not print value; release env proof pending |
| `creator-videos` bucket | Creator-upload storage | Expected by migration; Storage API proof pending |
| `livekit-token` Edge Function URL | LiveKit participant token endpoint | App config has endpoint owner; deployed function active; request proof pending |
| `app_configurations` | Runtime/admin app flags and copy | Table exists by migration; admin proof pending |
| Platform role/operator allowlist | Admin/operator gating | Table/helper exists; release env and live denial/write proof pending |

Do not commit `.env`, service-role secrets, database passwords, or Edge Function secrets. EAS/release env must supply only the public runtime values the app is supposed to read.

## Manual Supabase Dashboard Actions

1. Confirm Supabase project ref is `bmkkhihfbmsnnmcqkoly`.
2. Confirm the project is the intended production/Public v1 project.
3. Confirm migration history in the Supabase dashboard matches `supabase migration list` through `202604280001`.
4. Confirm no pending migrations exist before any future `db push`.
5. Confirm `creator-videos` bucket exists, is private, has `file_size_limit = 5368709120`, and the Supabase Storage global file-size limit is at least that high.
6. Confirm RLS is enabled on v1 tables:
   - `videos`
   - `safety_reports`
   - `user_entitlements`
   - `billing_events`
   - `watch_party_rooms`
   - `watch_party_room_memberships`
   - `creator_events`
   - `notifications`
   - `event_reminders`
   - `chat_threads`
   - `chat_thread_members`
   - `chat_messages`
   - `app_configurations`
   - `creator_permissions`
   - `platform_role_memberships`
7. Confirm Storage RLS policies exist for `storage.objects` and `creator-videos`.
8. Confirm `livekit-token` Edge Function is deployed and active.
9. Confirm Edge Function secrets exist and are current.
10. Confirm release EAS/app config uses the production Supabase URL and anon key.
11. Run focused live SQL/API proof with approved test users and sanitized artifacts.
12. Capture screenshots/outputs without service keys, JWTs, database passwords, anon key values, signed URLs, LiveKit secrets, or user PII beyond approved test identities.

## Safe Proof Commands For Next Session

Read-only or non-destructive commands:

```bash
supabase --version
supabase projects list
supabase migration list
supabase functions list --project-ref bmkkhihfbmsnnmcqkoly
supabase db lint --linked --schema public --fail-on none
```

Only run the lint command after the remote DB login/password path is configured. Do not paste the password into chat or docs.

Recommended proof artifact location:

```bash
/tmp/chillywood-supabase-remote-proof-YYYYMMDD-HHMMSS
```

Proof should separate:

- setup performed by CLI login role or dashboard owner
- anon user behavior
- authenticated owner behavior
- authenticated non-owner behavior
- operator/admin behavior
- service-role-only backend behavior

## Status Matrix

| Area | Status | Reason | Next action |
| --- | --- | --- | --- |
| Project link | Partial | Link now points to `bmkkhihfbmsnnmcqkoly`, but local `supabase/.temp/` metadata is uncommitted and should stay that way | Leave `.temp` uncommitted; relink if a future clean checkout needs it |
| Migration alignment | Done for migration history / Proof Pending for full schema behavior | `supabase migration list` shows local and remote aligned through `202604280001` | Do not push migrations unless a future pending list is audited |
| Remote schema readiness | Partial | Applied migrations and generated types show required tables/columns, but remote lint/schema dump was blocked by DB login auth | Run linked lint/schema inspection with approved credentials |
| Storage readiness | Partial / Proof Pending | Remote bucket row is proved private with 5 GiB limit and expected MIME allowlist, but project global file-size setting and Storage API owner/non-owner proof are not complete | Prove global file-size limit and Storage API owner/non-owner behavior |
| RLS/security readiness | Proof Pending | Migration intent and prior local/remote focused proof exist; full live RLS proof is still required | Run live anon/owner/non-owner/operator proof |
| Edge Function readiness | Partial / Proof Pending | `livekit-token` is deployed ACTIVE version 7; secrets and token request behavior not proved here | Verify secrets and run token request/denial proof |
| Production env readiness | External Setup Pending | Runtime owners exist; release env values must be configured/proved without printing secrets | Verify EAS/release env and run runtime validation |

## Exact Next Action

Run the next Supabase proof lane only after the backend/release owner provides an approved remote DB login path or runs the database checks from a configured environment:

1. Confirm `supabase migration list` still aligns through the latest local migration.
2. Run `supabase db lint --linked --schema public --fail-on none` without exposing the database password.
3. Verify dashboard bucket settings for `creator-videos`, including `file_size_limit = 5368709120` and matching project Storage global file-size limit.
4. Run focused live API/RLS proof for creator video public/draft/non-owner behavior.
5. Run focused Storage API proof for owner upload/remove and non-owner denial.
6. Run focused safety report/admin moderation proof.
7. Run focused entitlement proof for active/expired/revoked states.
8. Run `livekit-token` authenticated/denial proof.
9. Save sanitized artifacts under `/tmp/chillywood-supabase-remote-proof-*`.
10. Update `CURRENT_STATE.md`, `NEXT_TASK.md`, and readiness docs only after proof.
