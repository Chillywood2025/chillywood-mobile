# Username Handle System

Status: implemented and remote-applied on June 2, 2026 in migration `20260602032030_modern_username_handle_system.sql`.

## Product Rules

- Public identity is display name plus handle: `Creator Name` and `@creatorname`.
- `user_profiles.username` stores the canonical username without `@`.
- Display name remains separate and is not unique.
- Emails are private account identifiers and are not public usernames.

## Validation

Allowed usernames:

- lowercase letters
- numbers
- underscore
- dot
- 3 to 24 characters
- starts and ends with a letter or number
- no spaces, slash, `@`, emoji, invisible characters, leading/trailing dot/underscore, consecutive dots, consecutive underscores, `._`, or `_.`

The backend canonicalizes to lowercase and enforces the same rules through `user_profiles_username_format_check` plus the `enforce_user_profile_username_before` trigger.

## Reserved Names

`username_reserved_names` stores protected names. Normal users cannot claim reserved handles. The seeded reserved set includes:

`admin`, `administrator`, `owner`, `system`, `support`, `help`, `legal`, `dmca`, `privacy`, `copyright`, `security`, `api`, `root`, `moderator`, `mod`, `staff`, `official`, `verified`, `chillywood`, `chiwood`, `rachi`, `rachi_official`, `chillywood.rachi`, `money`, `payments`, `premium`, `live`, `watchparty`, `watch_party`, `platform`, and `studio`.

Owner/operator accounts can manage reserved names through table policy. Admin forced username changes use `admin_force_update_username(...)` and write `username_change_audit`.

## Backend Enforcement

- `user_profiles_username_unique_ci_idx` enforces case-insensitive uniqueness.
- `check_username_availability(username)` returns only public-safe availability states.
- `update_my_username(username)` lets an authenticated user update only their own username.
- `admin_force_update_username(target_user_id, username, reason)` is owner/operator-gated and audited.
- `username_change_audit` records canonical backfill, user changes, and admin forced changes.
- Existing `user_profiles` RLS remains: users can update only their own profile; owner/operator/moderator read policy is unchanged.

## Migration And Backfill

Starting live audit before constraints:

- total profiles: `28`
- null/blank usernames: `0`
- case-insensitive duplicate groups: `2`
- profiles in duplicate groups: `8`
- invalid proposed-format usernames: `13`
- reserved exact conflicts: `0`
- Rachi official profile row: not present in `user_profiles`; public search still injects explicit official Rachi safely

Backfill plan applied:

- preserve a legacy username only when it is already valid, not reserved, not blocked, and first in a case-insensitive duplicate group
- otherwise replace with deterministic `user<md5 user id prefix>` handle
- then add format check, trigger, and case-insensitive unique index

Post-migration proof:

- total profiles: `28`
- blank usernames: `0`
- invalid usernames: `0`
- duplicate username groups ignoring case: `0`
- reserved conflicts: `0`
- reserved names seeded: `31`
- unique case-insensitive index present: `true`
- format constraint present: `true`

## App Behavior

Signup now asks for display name and username before account creation. Username availability is debounced and shows `Available`, `Already taken`, `This username is reserved`, `Too short`, `Invalid characters`, or `Not allowed`.

Settings > Account has a compact username editor with current `@username`, live availability, and one Save Username action. It maps backend errors to product copy and does not expose raw constraint/RLS errors.

Existing `/profile/[userId]` and `/channel/[userId]` routes remain user-id based and unchanged. Username-based routing is deferred.

Profile, Platform, posts, Explore People, Chi'lly Circle, and Chi'lly Chat now prefer backed `@username` display where available. Chi'lly Chat inbox and thread headers are enriched from `user_profiles` usernames.

## Search

Public Explore People search:

- searches username and display name
- blocks email-shaped queries
- returns no email fields
- hides owner/admin/operator/security/system/proof/service accounts
- allows explicit public Rachi as `Rachi`, `@chillywood.rachi`, `Official Chi'llwood`

Admin search:

- remains `/admin` only
- searches user id, username, display name, and admin-only email where already allowed
- displays username in user detail rows
- masks email identity
- audits search queries/result opens through the existing Admin Search audit path

## Rachi Protection

Rachi's official public handle remains `@chillywood.rachi`.

Normal users cannot claim:

- `rachi`
- `rachi_official`
- `chillywood.rachi`
- other brand/support/legal/admin reserved handles

Public search continues to return explicit official Rachi even when no `platform_rachi_official` profile row exists.

## Proof

Backend proof completed on linked Supabase project:

- duplicate case-insensitive username insert rejected
- reserved username insert rejected
- invalid username insert rejected
- authenticated RLS claim updating another user's username updated `0` rows inside rollback transaction
- email-shaped public People search returned `0`
- Rachi public search returned one official result with `username='chillywood.rachi'`
- admin/proof-like public search returned `0`

Validation commands run:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:profile-production-policy`
- `npm run guard:public-user-search-policy`
- `npm run guard:admin-search-policy`
- `npm run guard:rachi-official-policy`
- `npm run guard:navigation-terminology-policy`
- `npm run guard:critical-ux-polish-policy`
- `npm run guard:money-center-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `supabase migration list`
- `supabase db lint --linked --schema public --fail-on error`
- `supabase db push --dry-run`
- `supabase gen types typescript --linked`
- `git diff --check`

Android proof:

- Follow-up proof path: `/tmp/chillywood-username-android-runtime-proof-20260601/`.
- Local attached-device proof path: `/tmp/chillywood-username-local-device-proof-20260601/`.
- Current-source `./gradlew assembleRelease` succeeded and produced APK SHA-256 `ed6fbe0f079d9bce11b1374d9a6cce4528551d2e790bee7681ae8d5a816e2c2a`.
- Initial in-place install failed with `INSTALL_FAILED_UPDATE_INCOMPATIBLE` because the local APK signature did not match the Play-installed app.
- After owner direction to use the attached device locally, Play v13 was uninstalled and the local release APK installed successfully on `R5CR120QCBF` as versionCode `8`, versionName `1.0.0`.
- The local signed-out app launches and signup username UI is captured: initial `Too short`, invalid `bad/name` -> `Use letters, numbers, underscores, or dots`, reserved `admin` -> `This username is reserved`, available `cwlocal231039` -> `Available`, and taken `test` -> `Already taken`.
- No account was created and `cwlocal231039` was not claimed.
- Signed-in proof on `R5CR120QCBF` was completed after fixing local login automation with the password field Done action and ignored local credentials. Settings captured current `@chillywood92`, invalid `bad/name` clean copy, reserved `admin` clean copy, and restored current draft; no username change was saved. Profile captured display name plus `@chillywood92` with no public email/raw id. Platform opened from Profile with no email, but the captured Platform views did not visibly render `@chillywood92`, so Platform handle visibility remains a runtime proof gap if product expects it there. Explore captured username search for the signed-in proof handle returning `0` public people because owner/admin/proof accounts are hidden, email-shaped search returning `0`, and Rachi returning Official Chi'llwood `@chillywood.rachi`. Admin captured the owner-only Users read model and a user drilldown with a `USERNAME` field plus masked email; a temporary upgraded proof role was restored to revoked operator immediately after screenshot. Chi'lly Chat handle display remains blocked by no safe existing chat thread fixture.
- `eas.json` workspace truth: no current uncommitted diff. The recent `closed` EAS submit profile targeting Play `alpha` with `releaseStatus:"draft"` is already committed in `950b49b` as intentional Play release-lane setup and was not edited for username proof.

Follow-up backend re-proof:

- total profiles: `28`
- blank usernames: `0`
- invalid usernames: `0`
- duplicate username groups ignoring case: `0`
- reserved conflicts: `0`
- duplicate case-insensitive username insert rejected
- reserved username insert rejected
- invalid username insert rejected
- authenticated normal-user update of another profile updated `0` rows inside rollback
- email-shaped public People search returned `0`
- Rachi public search returned one official result with `username='chillywood.rachi'`
- admin-like public search returned `0`

Follow-up validation:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:profile-production-policy`
- `npm run guard:public-user-search-policy`
- `npm run guard:admin-search-policy`
- `npm run guard:rachi-official-policy`
- `npm run guard:navigation-terminology-policy`
- `npm run guard:critical-ux-polish-policy`
- `npm run guard:money-center-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `supabase migration list`
- `supabase db lint --linked --schema public --fail-on error`
- `supabase db push --dry-run`
- `git diff --check`
- `git diff --cached --check`

## Remaining Limitations

- Username-based Profile/Platform routes are deferred to avoid breaking existing public routes.
- Username change frequency limiting and old-handle grace holds are documented follow-ups.
- Owner/Admin reserved-name management UI is deferred; backend table/RPC controls and audit are in place.
- Suggestions are client-side from display name and still require availability checks before use.
